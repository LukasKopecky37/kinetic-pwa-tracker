/**
 * Carga muscular (Muscle Heatmap) — analítica PURA (sin DOM ni Store).
 *
 * Fuente biomecánica: `EXERCISE_MUSCLES` (id → primarios/secundarios), un
 * mapa aditivo derivado del JSON de biomecánica. NO toca exercise-catalog.js
 * ni `data.exercises` (eso rompería el picker/filtros y los datos reales del
 * usuario). El heatmap solo LEE por `exerciseId`; si un ejercicio no está en
 * el mapa (p.ej. uno personalizado), se usa un fallback por grupo.
 *
 * Coeficientes (requisito): por cada SERIE completada de un ejercicio,
 *   - músculo primario   → +1.0
 *   - músculo secundario  → +0.5
 *
 * El SVG del muñeco usa regiones gruesas (chest, lats, quads…). Los músculos
 * finos ("Hombro Anterior", "Dorsales", "Lumbar"…) se colapsan a esas
 * regiones vía `MUSCLE_TO_REGION` para pintar el mapa; el valor fino se
 * conserva para la leyenda/top textual.
 */

import { sessionSetCount } from './volume.js';

/* ── Biomecánica por ejercicio (p = primarios, s = secundarios) ──────────── */
export const EXERCISE_MUSCLES = {
  sentadilla_con_barra:            { p:['Cuádriceps','Glúteos'], s:['Lumbar','Isquiotibiales','Abdominales'] },
  sentadilla_frontal:              { p:['Cuádriceps','Glúteos'], s:['Abdominales','Lumbar','Isquiotibiales'] },
  prensa_de_piernas:               { p:['Cuádriceps','Glúteos'], s:['Isquiotibiales','Gemelos'] },
  sentadilla_bulgara:              { p:['Cuádriceps','Glúteos'], s:['Isquiotibiales','Abdominales'] },
  zancadas_con_mancuernas:         { p:['Cuádriceps','Glúteos'], s:['Isquiotibiales','Abdominales','Oblicuos'] },
  peso_muerto_rumano:              { p:['Isquiotibiales','Glúteos'], s:['Lumbar','Antebrazos'] },
  peso_muerto_convencional:        { p:['Glúteos','Isquiotibiales','Lumbar'], s:['Espalda Alta','Antebrazos','Abdominales'] },
  hip_thrust_con_barra:            { p:['Glúteos'], s:['Isquiotibiales','Abdominales','Lumbar'] },
  curl_de_piernas_tumbado:         { p:['Isquiotibiales'], s:['Gemelos','Glúteos'] },
  curl_de_piernas_sentado:         { p:['Isquiotibiales'], s:['Gemelos','Glúteos'] },
  elevacion_de_cadera_en_maquina:  { p:['Glúteos'], s:['Isquiotibiales','Abdominales'] },
  abduccion_de_cadera_en_maquina:  { p:['Glúteos'], s:['Hombro Lateral'] },
  press_de_banca:                  { p:['Pecho'], s:['Hombro Anterior','Tríceps'] },
  press_inclinado_con_mancuernas:  { p:['Pecho','Hombro Anterior'], s:['Tríceps'] },
  press_inclinado_con_barra:       { p:['Pecho','Hombro Anterior'], s:['Tríceps'] },
  aperturas_en_polea:              { p:['Pecho'], s:['Hombro Anterior','Tríceps'] },
  flexiones:                       { p:['Pecho'], s:['Hombro Anterior','Tríceps','Abdominales'] },
  fondos_en_barras:                { p:['Pecho','Tríceps'], s:['Hombro Anterior','Abdominales'] },
  press_militar_con_barra:         { p:['Hombro Anterior','Hombro Lateral'], s:['Tríceps','Espalda Alta','Abdominales'] },
  press_de_hombros_con_mancuernas: { p:['Hombro Anterior','Hombro Lateral'], s:['Tríceps','Espalda Alta','Abdominales'] },
  elevaciones_laterales:           { p:['Hombro Lateral'], s:['Hombro Anterior','Espalda Alta'] },
  face_pull:                       { p:['Hombro Posterior','Espalda Alta'], s:['Bíceps','Antebrazos'] },
  remo_alto_con_polea:             { p:['Espalda Alta','Hombro Posterior'], s:['Bíceps','Antebrazos'] },
  curl_de_biceps_con_barra:        { p:['Bíceps'], s:['Antebrazos'] },
  curl_de_biceps_con_mancuernas:   { p:['Bíceps'], s:['Antebrazos'] },
  curl_martillo:                   { p:['Bíceps','Antebrazos'], s:[] },
  curl_en_polea:                   { p:['Bíceps'], s:['Antebrazos'] },
  jalon_al_pecho:                  { p:['Dorsales'], s:['Bíceps','Espalda Alta','Hombro Posterior','Antebrazos'] },
  dominadas:                       { p:['Dorsales'], s:['Bíceps','Espalda Alta','Hombro Posterior','Antebrazos','Abdominales'] },
  remo_con_barra:                  { p:['Dorsales','Espalda Alta'], s:['Bíceps','Hombro Posterior','Lumbar','Antebrazos'] },
  remo_con_mancuerna:              { p:['Dorsales','Espalda Alta'], s:['Bíceps','Hombro Posterior','Abdominales','Antebrazos'] },
  remo_sentado_en_polea:           { p:['Dorsales','Espalda Alta'], s:['Bíceps','Hombro Posterior','Abdominales','Antebrazos'] },
  pullover_en_polea:               { p:['Dorsales'], s:['Pecho','Tríceps','Abdominales'] },
  encogimientos_con_barra:         { p:['Espalda Alta'], s:['Antebrazos','Hombro Posterior'] },
  peso_muerto_rack_pull:           { p:['Espalda Alta','Lumbar','Glúteos'], s:['Isquiotibiales','Antebrazos'] },
  plancha:                         { p:['Abdominales'], s:['Oblicuos','Lumbar','Glúteos'] },
  crunch_abdominal:                { p:['Abdominales'], s:[] },
  elevacion_de_piernas_colgado:    { p:['Abdominales'], s:['Oblicuos','Antebrazos','Flexores de cadera'] },
  ab_wheel_rollout:                { p:['Abdominales'], s:['Lumbar','Oblicuos','Hombro Anterior'] },
  pallof_press:                    { p:['Oblicuos'], s:['Abdominales','Glúteos','Hombro Anterior'] },
  elevacion_de_gemelos_de_pie:     { p:['Gemelos'], s:['Isquiotibiales'] },
  elevacion_de_gemelos_sentado:    { p:['Gemelos'], s:[] },
  elevacion_de_gemelos_con_mancuernas: { p:['Gemelos'], s:['Isquiotibiales'] },
  saltos_en_punta:                 { p:['Gemelos'], s:['Cuádriceps','Glúteos'] },
};

/* Orden estable para la leyenda/result completo (incluye ceros). */
export const ALL_MUSCLES = [
  'Pecho', 'Hombro Anterior', 'Hombro Lateral', 'Hombro Posterior',
  'Espalda Alta', 'Dorsales', 'Bíceps', 'Tríceps', 'Antebrazos',
  'Abdominales', 'Oblicuos', 'Lumbar', 'Glúteos', 'Cuádriceps',
  'Isquiotibiales', 'Gemelos', 'Flexores de cadera',
];

/* Músculo fino → región(es) del SVG (muscle-map.js). El muñeco es más
 * grueso que la BD, así que varios músculos finos comparten región. */
export const MUSCLE_TO_REGION = {
  'Pecho':              ['chest'],
  'Hombro Anterior':    ['shoulder'],
  'Hombro Lateral':     ['shoulder'],
  'Hombro Posterior':   ['rear-delt'],
  'Tríceps':            ['triceps'],
  'Bíceps':             ['biceps'],
  'Antebrazos':         ['biceps'],      // el SVG no tiene antebrazo
  'Espalda Alta':       ['upper-back'],
  'Dorsales':           ['lats'],
  'Lumbar':             ['lower-back'],
  'Cuádriceps':         ['quads'],
  'Isquiotibiales':     ['hamstrings'],
  'Glúteos':            ['glutes'],
  'Gemelos':            ['calves'],
  'Abdominales':        ['abs'],
  'Oblicuos':           ['abs'],         // sin región propia
  'Flexores de cadera': ['quads'],       // aproximación visual
};

/* Fallback para ejercicios sin biomecánica (personalizados): del grupo
 * canónico / músculo grueso del catálogo a un músculo fino representativo. */
const GROUP_FALLBACK = {
  'Pecho':'Pecho', 'Espalda':'Dorsales', 'Hombros':'Hombro Lateral',
  'Bíceps':'Bíceps', 'Tríceps':'Tríceps', 'Piernas':'Cuádriceps',
  'Cuádriceps':'Cuádriceps', 'Isquiotibiales':'Isquiotibiales',
  'Gemelos':'Gemelos', 'Glúteos':'Glúteos', 'Abdominales':'Abdominales',
  'Core':'Abdominales',
};

function fallbackFor(ex) {
  if (!ex) return { p: [], s: [] };
  const key = GROUP_FALLBACK[ex.muscle] || GROUP_FALLBACK[ex.group];
  return key ? { p: [key], s: [] } : { p: [], s: [] };
}

/* nombre → minúsculas, sin acentos, sin sufijo " (2)", espacios colapsados */
export function foldName(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Mapa NOMBRE (del CSV histórico) → id de EXERCISE_MUSCLES, para que los
 * ejercicios importados hagan match EXACTO con la biomecánica y no caigan al
 * fallback (causa del bug "glúteos al máximo / pecho off"). Lo que no esté
 * aquí ni en EXERCISE_MUSCLES usa el fallback por grupo (nunca Glúteos por
 * defecto) y se reporta como huérfano por consola. */
export const NAME_BIOMECH = {
  'tiron de lat inclinado':       'jalon_al_pecho',
  'press de banca':               'press_de_banca',
  'remo con cable':               'remo_sentado_en_polea',
  'remo con cable en polea':      'remo_sentado_en_polea',
  'chest (mariposa)':             'aperturas_en_polea',
  'curl de biceps':               'curl_de_biceps_con_barra',
  'sentadilla':                   'sentadilla_con_barra',
  'press de hombros sentado':     'press_de_hombros_con_mancuernas',
  'prens de hombros':             'press_de_hombros_con_mancuernas',
  'hip thrust':                   'hip_thrust_con_barra',
  'elevacion lateral':            'elevaciones_laterales',
  'elevacion lateral de hombros': 'elevaciones_laterales',
  'pull ups (descenso asistido)': 'dominadas',
  'prensa inclinada':             'press_inclinado_con_barra',
  'fly de pecho':                 'aperturas_en_polea',
  'tiron de mancuernas':          'remo_con_mancuerna',
  'levantamiento de peso muerto': 'peso_muerto_convencional',
  'prensa atletica':              'prensa_de_piernas',
  'curl de piernas':              'curl_de_piernas_tumbado',
  'extension de gemelos':         'elevacion_de_gemelos_de_pie',
};

/** Resuelve la biomecánica de una sesión. Orden: id exacto del catálogo →
 * alias por nombre → fallback por grupo. Nunca inventa Glúteos. */
function resolveBiomech(exId, ex) {
  if (EXERCISE_MUSCLES[exId]) return EXERCISE_MUSCLES[exId];
  if (ex) {
    const aliasId = NAME_BIOMECH[foldName(ex.name)];
    if (aliasId && EXERCISE_MUSCLES[aliasId]) return EXERCISE_MUSCLES[aliasId];
  }
  return fallbackFor(ex);
}

/* ── 1. Cálculo de carga ─────────────────────────────────────────────────── */
/**
 * Recorre las sesiones (por defecto, últimos `daysBack` días) y acumula
 * puntos por músculo: series completadas × (1.0 primario | 0.5 secundario).
 *
 * @param {Array<object>} sessions  sesiones (cada una con sets[])
 * @param {(id:string)=>object|undefined} byId  lookup de ejercicio
 * @param {{daysBack?:number}} [opts]
 * @returns {Object<string,number>}  { "Pecho": 12, "Tríceps": 6, … } (con 0s)
 */
export function calculateMuscleVolume(sessions, byId, opts = {}) {
  const daysBack = opts.daysBack ?? 7;
  const cut = new Date();
  cut.setDate(cut.getDate() - daysBack);
  const cutISO = cut.toISOString().slice(0, 10);

  const out = {};
  ALL_MUSCLES.forEach(m => { out[m] = 0; });
  const orphans = new Set();

  for (const s of (sessions || [])) {
    if (s.date < cutISO) continue;
    const n = sessionSetCount(s);
    if (!n) continue;
    const ex = byId && byId(s.exerciseId);
    const bm = resolveBiomech(s.exerciseId, ex);
    const hasAny = (bm.p && bm.p.length) || (bm.s && bm.s.length);
    if (!hasAny) { orphans.add(ex ? ex.name : s.exerciseId); continue; }
    (bm.p || []).forEach(m => { out[m] = (out[m] || 0) + n * 1.0; });
    (bm.s || []).forEach(m => { out[m] = (out[m] || 0) + n * 0.5; });
  }

  if (orphans.size && opts.debug !== false) {
    console.warn('[heatmap] ejercicios SIN biomecánica (revisar NAME_BIOMECH):',
      [...orphans]);
  }
  return out;
}

/* ── 2. Normalización 0..1 respecto al músculo más entrenado ─────────────── */
/**
 * @param {Object<string,number>} volume
 * @returns {{norm:Object<string,number>, max:number}}
 */
export function normalizeMuscleVolume(volume) {
  const vals = Object.values(volume);
  const max = vals.length ? Math.max(...vals) : 0;
  const norm = {};
  for (const k in volume) norm[k] = max > 0 ? volume[k] / max : 0;
  return { norm, max };
}

/**
 * Colapsa los músculos finos normalizados a intensidad por región del SVG.
 * Cada región toma el MÁXIMO de los músculos finos que la alimentan (evita
 * doble conteo: p.ej. 'shoulder' = max(Hombro Anterior, Hombro Lateral)).
 * @param {Object<string,number>} norm  0..1 por músculo fino
 * @returns {Object<string,number>}  0..1 por región del SVG
 */
export function regionIntensities(norm) {
  const reg = {};
  for (const m in norm) {
    const v = norm[m];
    if (v <= 0) continue;
    for (const r of (MUSCLE_TO_REGION[m] || [])) {
      reg[r] = Math.max(reg[r] || 0, v);
    }
  }
  return reg;
}

/* ── 3. Rampa de color premium (dim → naranja corporativo → brillante) ───── */
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const hex = (r, g, b) =>
  '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

/** t∈[0,1] → color. 0 = base oscura, 0.5 = acento, 1 = activación brillante. */
export function loadColor(t) {
  const x = Math.max(0, Math.min(1, t));
  // paradas: #242a36 (dim) → #ff7a2f (acento) → #ffd24a (brillo)
  const A = [36, 42, 54], B = [255, 122, 47], C = [255, 210, 74];
  if (x <= 0.5) {
    const k = x / 0.5;
    return hex(lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k));
  }
  const k = (x - 0.5) / 0.5;
  return hex(lerp(B[0], C[0], k), lerp(B[1], C[1], k), lerp(B[2], C[2], k));
}
