/**
 * Importador del histórico real (CSV exportado a mano por el usuario).
 *
 * REALIDAD DE ESTE PROYECTO (no es lo que el planteamiento asumía):
 *  - No hay tablas Dexie `sesiones`/`historial`. La persistencia es UN blob
 *    JSON (`Store.data`) en una tabla `state`. Aquí construimos sesiones en
 *    el esquema v6 y las fusionamos en `Store.data.sessions` + `Store.save()`.
 *  - No existe un mapeo fiable nombre→id del catálogo. Para NO mezclar tu
 *    historial en el ejercicio equivocado, el ejercicio se resuelve así:
 *      1) si ya hay uno en tu biblioteca con ese mismo nombre → se reutiliza
 *      2) si no → se crea con un id `snake_case` ESTABLE derivado del nombre
 *    (sin pérdida de datos; puedes renombrar/fusionar luego en la UI).
 *  - Los datos son irregulares: lo que no se pueda parsear con confianza se
 *    SALTA y se reporta (nunca se inventa).
 *
 * Idempotente: ids deterministas + dedupe por (fecha+ejercicio). Reejecutar
 * no duplica.
 *
 * Formato CSV:
 *   - Delimitador `;` (respeta comillas dobles: una celda entre "" puede
 *     contener `;` interno → multi-peso).
 *   - 1ª celda: nombre + config `N - X/Y` (se recorta la config).
 *   - Celdas de fecha: `D.M - PESO - r / r / r / r`.
 *   - Cambio de peso en una fecha: `;` interno (celda citada) o coma+espacio
 *     `35 - 7, 27,5 - 12 / 12` (la coma decimal `27,5` se protege antes).
 *   - Fechas `D.M` SIN año: meses 11–12 → año-1; 1–10 → año (Nov→May).
 */

import { Store } from './store.js';

/* ── slug snake_case estable (sin acentos) ──────────────────────────────── */
export function slugify(name) {
  return String(name).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/* ── Inferencia de grupo (para que volumen/heatmap tengan sentido) ──────── */
const GROUP_RULES = [
  [/hip\s*thrust|gl[uú]te/i,                                  'Glúteos'],
  [/sentadilla|prensa\s*atl|extensi[oó]n\s*de\s*piernas|curl\s*de\s*piernas|gemelo|zancad/i, 'Piernas'],
  [/tir[oó]n\s*de\s*lat|jal[oó]n|remo|pull\s*up|dominad|tir[oó]n\s*de\s*mancuerna/i, 'Espalda'],
  [/peso\s*muerto|levantamiento\s*de\s*peso/i,                 'Espalda'],
  [/pressdown|extensi[oó]n\s*de\s*tr[ií]ceps|tr[ií]ceps/i,     'Tríceps'],
  [/curl|b[ií]ceps/i,                                          'Bíceps'],
  [/hombro|deltoid|elevaci[oó]n\s*lateral|press\s*de\s*hombros|prens\s*de\s*hombros|press\s*militar/i, 'Hombros'],
  [/banca|pecho|fly|chest|mariposa|press\s*inclinad|prensa\s*inclinad|apertura|fondo|flexion/i, 'Pecho'],
  [/abdominal|plancha|crunch|oblicuo/i,                        'Abdominales'],
];
function guessGroup(name) {
  for (const [re, g] of GROUP_RULES) if (re.test(name)) return g;
  return 'Otro';
}

/* ── Split de una línea CSV por `;` respetando comillas dobles ──────────── */
function splitCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else if (c === '"') {
      q = true;
    } else if (c === ';') {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/* ── Reps: "12 / 12 / 10 - 12" → [12,12,10,12] (tolera `-` perdidos) ─────── */
function parseReps(str) {
  return String(str)
    .replace(/\s-\s/g, ' / ')          // drop-sets raros: trata `-` como `/`
    .split('/')
    .map(t => parseInt(t.trim(), 10))
    // >50 reps no existe en estos datos: suele ser un cambio de peso que se
    // coló como rep (p.ej. `52,5 - 8 / 50 - 11`). Lo descartamos.
    .filter(n => Number.isFinite(n) && n > 0 && n <= 50);
}

/**
 * Parsea el texto bruto del CSV. PURO: no toca el Store.
 *
 * @param {string} csvText
 * @param {{year?:number}} [opts]  año de referencia (def: año actual). Meses
 *        11–12 caen en year-1 (la temporada cruza Nov→May).
 * @returns {{rows:Array<{name:string,group:string,dates:Array<{iso:string,sets:Array<{weight:number,reps:number}>}>}>, skipped:Array<{name:string,raw:string,reason:string}>}}
 */
export function parseHistoryCSV(csvText, opts = {}) {
  const year = opts.year || new Date().getFullYear();
  const lines = String(csvText).split(/\r?\n/);
  const rows = [];
  const skipped = [];
  const seenNames = new Map(); // nombre normalizado → veces (para desambiguar duplicados)

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    let name = (cells[0] || '').trim();
    // Cabecera u líneas sin nombre real
    if (!name || /^ej[eé]?[rc]|fecha\s*-\s*peso/i.test(name)) continue;
    // Recorta la config de planificación final: "  4 - 8/12"
    name = name.replace(/\s+\d+\s*-\s*\d+\s*\/\s*\d+\s*$/, '')
               .replace(/\s{2,}/g, ' ').trim();
    if (!name) continue;

    // Nombres duplicados (p.ej. "Curl de bíceps" sale 2 veces) → sufijo para
    // no fusionar dos ejercicios distintos ni perder series.
    const key = name.toLowerCase();
    const n = (seenNames.get(key) || 0) + 1;
    seenNames.set(key, n);
    const finalName = n > 1 ? `${name} (${n})` : name;

    const dates = [];
    for (let ci = 1; ci < cells.length; ci++) {
      const raw = (cells[ci] || '').trim();
      if (!raw) continue;

      // Sub-bloques por `;` interno (celda citada con cambio de peso)
      const subs = raw.split(';').map(s => s.trim()).filter(Boolean);
      const head = subs[0];

      const m = head.match(/^(\d{1,2})\.(\d{1,2})\s*-\s*(.+)$/);
      if (!m) { skipped.push({ name: finalName, raw, reason: 'sin fecha' }); continue; }

      const day = parseInt(m[1], 10);
      const mon = parseInt(m[2], 10);
      if (!(mon >= 1 && mon <= 12 && day >= 1 && day <= 31)) {
        skipped.push({ name: finalName, raw, reason: 'fecha inválida' }); continue;
      }
      const yr = mon >= 11 ? year - 1 : year;
      const iso = `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Bloques peso→reps. Protegemos la coma decimal (27,5) antes de usar
      // la coma como separador de bloque (`7, 27.5`).
      const blocks = [];
      let lastW = 0;
      const blockStrings = [
        m[3].replace(/(\d),(\d)/g, '$1.$2'),                 // 1er sub-bloque (tras fecha)
        ...subs.slice(1).map(s => s.replace(/(\d),(\d)/g, '$1.$2')),
      ];
      blockStrings.forEach((bs) => {
        // dentro de un bloque puede haber `, ` que separa nuevos pesos
        bs.split(',').forEach((chunk) => {
          chunk = chunk.trim();
          if (!chunk) return;
          const wm = chunk.match(/^([\d.]+)\s*-\s*(.+)$/);
          if (wm && /\d/.test(wm[2])) {
            // "PESO - reps"
            lastW = parseFloat(wm[1]);
            parseReps(wm[2]).forEach(r => blocks.push({ weight: lastW, reps: r }));
          } else {
            // sin peso explícito → peso corporal / continúa peso anterior
            parseReps(chunk).forEach(r => blocks.push({ weight: lastW, reps: r }));
          }
        });
      });

      if (blocks.length === 0) {
        skipped.push({ name: finalName, raw, reason: 'sin reps válidas' }); continue;
      }
      dates.push({ iso, sets: blocks });
    }

    if (dates.length) rows.push({ name: finalName, group: guessGroup(finalName), dates });
  }

  return { rows, skipped };
}

/**
 * Aplica el histórico parseado al Store (idempotente).
 *
 * @param {string} csvText
 * @param {{year?:number}} [opts]
 * @returns {{exercisesCreated:number, exercisesReused:number, workouts:number, sessions:number, sets:number, range:[string,string]|null, skipped:Array}}
 */
export function seedHistoricalData(csvText, opts = {}) {
  const { rows, skipped } = parseHistoryCSV(csvText, opts);
  const data = Store.data;
  const mesoId = data.currentMesoId;

  // Índice de ejercicios existentes por nombre (case-insensitive) y por id.
  const byName = new Map(data.exercises.map(e => [e.name.toLowerCase(), e]));
  const byId = new Set(data.exercises.map(e => e.id));

  let exCreated = 0, exReused = 0, wCreated = 0, sCreated = 0, setCount = 0;
  const allISO = [];

  // Agrupamos por fecha para crear 1 workout por fecha.
  const sessionsByDate = new Map(); // iso → [{exerciseId, sets}]

  for (const row of rows) {
    let ex = byName.get(row.name.toLowerCase());
    if (ex) {
      exReused++;
    } else {
      const base = slugify(row.name) || 'ej';
      let uid = base, k = 2;
      while (byId.has(uid)) { uid = `${base}_${k++}`; }
      ex = { id: uid, name: row.name, group: row.group, compound: false };
      data.exercises.push(ex);
      byId.add(uid);
      byName.set(row.name.toLowerCase(), ex);
      exCreated++;
    }

    for (const d of row.dates) {
      allISO.push(d.iso);
      const arr = sessionsByDate.get(d.iso) || sessionsByDate.set(d.iso, []).get(d.iso);
      arr.push({ exerciseId: ex.id, sets: d.sets });
    }
  }

  const existingSession = new Set(
    data.sessions.map(s => s.date + '|' + s.exerciseId),
  );

  for (const [iso, list] of sessionsByDate) {
    // Workout por fecha (id determinista → idempotente)
    const wid = `wimp-${iso}`;
    if (!data.workouts.some(w => w.id === wid)) {
      data.workouts.push({
        id: wid, mesoId, routineId: null, date: iso,
        startAt: `${iso}T18:00:00.000Z`, endAt: `${iso}T19:00:00.000Z`,
        readiness: null, source: 'csv-import',
      });
      wCreated++;
    }
    let order = data.sessions.filter(s => s.date === iso).length;
    for (const it of list) {
      const dk = iso + '|' + it.exerciseId;
      if (existingSession.has(dk)) continue;     // ya importado: no duplica
      existingSession.add(dk);
      order++;
      data.sessions.push({
        id: `simp-${iso}-${it.exerciseId}`,
        date: iso, exerciseId: it.exerciseId, mesoId,
        workoutId: wid, order,
        notes: 'importado del histórico',
        sets: it.sets.map(s => ({ weight: s.weight, reps: s.reps })),
      });
      sCreated++;
      setCount += it.sets.length;
    }
  }

  Store.save();

  allISO.sort();
  return {
    exercisesCreated: exCreated,
    exercisesReused: exReused,
    workouts: wCreated,
    sessions: sCreated,
    sets: setCount,
    range: allISO.length ? [allISO[0], allISO[allISO.length - 1]] : null,
    skipped,
  };
}
