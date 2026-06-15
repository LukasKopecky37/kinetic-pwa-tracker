/**
 * Datos por defecto y seed inicial.
 *
 * v6 (Fase H+): cada `session` lleva un array `sets[]`.
 *
 * Comportamiento del seed:
 *   - `seedData()` — primer arranque (y "Restablecer todo"): un mesociclo
 *     vacío, SIN rutinas y SIN biblioteca. El usuario construye su rutina
 *     real desde cero y elige ejercicios del catálogo (exercise-catalog.js).
 *   - `seedData(oldSessions)` — viene una migración con sesiones viejas; las
 *     conservamos y las convertimos al formato nuevo.
 *   - `generateDemoSessions(mesoId)` — exportada para que el botón
 *     "Cargar datos de demo" de Ajustes pueda inyectar el set de prueba
 *     histórico cuando el usuario lo pida. `DEMO_LIBRARY` son los ejercicios
 *     que ese histórico de demo necesita (los inyecta `loadDemoData`).
 */

// Biblioteca que SOLO usa el botón "Cargar datos de demo" (no se siembra
// en un arranque limpio). loadDemoData() la fusiona si falta.
export const DEMO_LIBRARY = [
  { id:'press-banca',     name:'Press de banca',           group:'Pecho',    compound:true  },
  { id:'press-incl',      name:'Prensa inclinada',         group:'Pecho',    compound:true  },
  { id:'fly-pecho',       name:'Fly de pecho',             group:'Pecho',    compound:false },
  { id:'pressdown',       name:'Pressdown de cuerda',      group:'Tríceps',  compound:false },
  { id:'sentadilla',      name:'Sentadilla',               group:'Piernas',  compound:true  },
  { id:'prensa-atletica', name:'Prensa atlética',          group:'Piernas',  compound:true  },
  { id:'curl-piernas',    name:'Curl de piernas',          group:'Piernas',  compound:false },
  { id:'hip-thrust',      name:'Hip thrust',               group:'Glúteos',  compound:true  },
  { id:'gemelos',         name:'Extensión de gemelos',     group:'Piernas',  compound:false },
  { id:'tiron-lat',       name:'Tirón de Lat Inclinado',   group:'Espalda',  compound:true  },
  { id:'remo-cable',      name:'Remo con cable',           group:'Espalda',  compound:true  },
  { id:'pull-ups',        name:'Pull ups (asistido)',      group:'Espalda',  compound:true  },
  { id:'curl-biceps',     name:'Curl de bíceps',           group:'Bíceps',   compound:false },
  { id:'press-hombros',   name:'Press de hombros sentado', group:'Hombros',  compound:true  },
  { id:'elev-lateral',    name:'Elevación lateral',        group:'Hombros',  compound:false },
  { id:'deltoides',       name:'Deltoides trasero',        group:'Hombros',  compound:false },
  { id:'peso-muerto',     name:'Peso muerto',              group:'Espalda',  compound:true  },
];

const homogeneous = (weight, repsArr) =>
  repsArr.filter(r => r != null).map(r => ({ weight, reps: r }));

const pyramid = (...entries) =>
  entries.map(([w, r, rpe]) => ({ weight: w, reps: r, ...(rpe ? { rpe } : {}) }));

/**
 * Genera sesiones de demo para inyectar en un mesociclo a petición del usuario.
 * Útil para "Cargar datos de demo" en Ajustes y para tests.
 *
 * @param {string} mesoId
 * @returns {Array<object>}
 */
export function generateDemoSessions(mesoId) {
  const base = new Date('2026-02-23');
  const fakes = [
    ['press-banca', [
      homogeneous(20, [12,12,12,12]),
      homogeneous(25, [12,12,12,10]),
      homogeneous(30, [12,12,10,10]),
      homogeneous(35, [12,12,10,8]),
      homogeneous(40, [12,11,9,8]),
      homogeneous(45, [12,12,10,8]),
      homogeneous(50, [12,10,9,8]),
      homogeneous(55, [10,10,8,8]),
      homogeneous(60, [10,9,8,7]),
      homogeneous(62, [12,12,10,9]),
      pyramid([60,10,7], [65,8,8], [70,6,9], [72.5,5,9.5]),
    ], 1],
    ['sentadilla', [
      homogeneous(40, [10,10,10,10]),
      homogeneous(50, [10,10,10,10]),
      homogeneous(60, [10,10,10,10]),
      homogeneous(70, [10,10,10,10]),
      homogeneous(80, [10,10,10,10]),
      homogeneous(90, [10,10,10,9]),
      homogeneous(100,[10,10,10,8]),
      homogeneous(110,[10,10,9,8]),
      homogeneous(120,[10,10,8,8]),
      homogeneous(130,[10,9,8,7]),
      pyramid([100,10,7], [120,8,8], [135,6,9], [140,5,9.5]),
    ], 1],
    ['hip-thrust', [
      homogeneous(50, [15,15,12]),
      homogeneous(60, [15,15,12]),
      homogeneous(70, [15,15,15]),
      homogeneous(80, [15,15,15]),
      homogeneous(90, [15,15,12]),
      homogeneous(100,[15,15,12]),
      homogeneous(110,[15,12,12]),
      homogeneous(120,[15,12,12]),
      homogeneous(130,[15,15,12]),
      homogeneous(140,[15,15,12]),
    ], 4],
    ['tiron-lat', [
      homogeneous(35, [12,12,10,8]),
      homogeneous(40, [12,10,10,8]),
      homogeneous(45, [12,10,9,8]),
      homogeneous(50, [12,10,8,8]),
      homogeneous(55, [12,11,9,8]),
      homogeneous(52, [10,9,8,6]),
      homogeneous(55, [12,12,10,8]),
      homogeneous(60, [12,11,10,8]),
    ], 1],
    ['curl-biceps', [
      homogeneous(10,  [12,12,12]),
      homogeneous(12.5,[12,12,12]),
      homogeneous(15,  [12,12,10]),
      homogeneous(17.5,[12,11,10]),
      homogeneous(20,  [12,10,9]),
      homogeneous(21,  [12,11,10]),
      homogeneous(22.5,[11,10,9]),
    ], 4],
    ['elev-lateral', [
      homogeneous(6, [15,15,12]),
      homogeneous(8, [15,15,12]),
      homogeneous(10,[15,12,12]),
      homogeneous(12,[15,12,10]),
      homogeneous(14,[15,12,10]),
      homogeneous(15,[15,12,10]),
    ], 2],
    ['remo-cable', [
      homogeneous(40,[12,12,10,10]),
      homogeneous(45,[12,12,10,9]),
      homogeneous(50,[12,11,10,9]),
      homogeneous(55,[12,11,9,8]),
      homogeneous(55,[12,12,10,9]),
      homogeneous(60,[12,11,10,8]),
      homogeneous(62,[10,10,9,8]),
    ], 2],
    ['pressdown', [
      homogeneous(20,[15,15,12]),
      homogeneous(22,[15,12,12]),
      homogeneous(25,[15,12,10]),
      homogeneous(27,[15,12,10]),
      homogeneous(30,[12,12,10]),
    ], 4],
  ];

  const out = [];
  let id = 1;
  fakes.forEach(([exId, weeks, defOrder]) => {
    weeks.forEach((sets, weekIdx) => {
      const d = new Date(base);
      d.setDate(d.getDate() + weekIdx * 7);
      out.push({
        id: id++,
        date: d.toISOString().slice(0, 10),
        exerciseId: exId,
        mesoId,
        sets,
        order: defOrder,
        notes: '',
      });
    });
  });
  return out;
}

/**
 * Estado inicial. Por defecto: biblioteca + 4 días por defecto + 0 sesiones.
 * Si llega `oldSessions` (de una migración) las conservamos.
 *
 * @param {Array<object>=} oldSessions  sesiones que vienen de localStorage v2/v3
 * @returns {object} `data` para el Store
 */
export function seedData(oldSessions) {
  const meso = {
    id: 'meso-1',
    name: 'Mi rutina',
    subtitle: 'rutina activa',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
  };

  // Arranque limpio: sin rutinas ni biblioteca. El usuario crea su rutina
  // real (Home → "+ Crear primer día") y elige ejercicios del catálogo.
  const exercises = [];
  const routines  = [];

  let sessions = [];
  if (oldSessions && oldSessions.length) {
    sessions = oldSessions.map(s => migrateOldSession(s, meso.id));
  }

  return {
    version: 6,
    mesos: [meso],
    currentMesoId: meso.id,
    exercises,
    routines,
    sessions,
    workouts: [],
    activeWorkoutId: null,
    /* Antropometría — historial de mediciones corporales (Fase J·1). */
    bodyMeasurements: [],
    settings: { lastRoutineId: null, defaultRest: 120 },
  };
}

/**
 * Migra una sesión v5 (con weight + reps[]) al formato v6 (sets[]).
 * Idempotente: si ya está en v6 devuelve la misma.
 */
export function migrateOldSession(s, fallbackMesoId) {
  if (Array.isArray(s.sets)) return s;
  const reps = Array.isArray(s.reps) ? s.reps.filter(r => r != null && r !== '') : [];
  const sets = reps.map((r, i) => {
    const set = { weight: s.weight, reps: r };
    if (s.rpe != null && i === reps.length - 1) set.rpe = s.rpe;
    return set;
  });
  return {
    id: s.id,
    date: s.date,
    exerciseId: s.exerciseId,
    mesoId: s.mesoId || fallbackMesoId,
    workoutId: s.workoutId,
    order: s.order ?? null,
    notes: s.notes || '',
    sets,
  };
}
