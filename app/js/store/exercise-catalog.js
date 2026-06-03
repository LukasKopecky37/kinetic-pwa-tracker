/**
 * Catálogo de ejercicios esenciales (español).
 *
 * Datos estáticos de solo lectura. NO es la biblioteca del usuario: es el
 * catálogo desde el que el usuario elige para añadir ejercicios a sus rutinas.
 * Cuando elige uno, se "materializa" en `data.exercises` vía
 * `Store.addExerciseFromCatalog(id)` (dedupe por id estable del catálogo).
 *
 * Esquema del catálogo (tal cual llega):
 *   { id, nombre, grupo_muscular, equipamiento,
 *     series_recomendas, repeticiones_recomendadas }
 *
 * OJO con `grupo_muscular`: usa nombres finos (Cuádriceps, Isquiotibiales,
 * Core, Gemelos…) que NO son la taxonomía `GROUPS` de la app, de la que
 * dependen el mapa muscular (MUSCLE_MAP) y la analítica de volumen. Por eso
 * `catalogToExercise()` normaliza a un `group` canónico y guarda el músculo
 * fino aparte en `muscle` (solo para mostrar/filtrar). `equipment` también
 * se guarda como campo extra; ni analítica ni migraciones lo tocan.
 */

export const EXERCISE_CATALOG = [
  { id:'sentadilla_con_barra', nombre:'Sentadilla con barra', grupo_muscular:'Cuádriceps', equipamiento:'Barra', series_recomendas:'3-5', repeticiones_recomendadas:'5-10' },
  { id:'sentadilla_frontal', nombre:'Sentadilla frontal', grupo_muscular:'Cuádriceps', equipamiento:'Barra', series_recomendas:'3-4', repeticiones_recomendadas:'5-8' },
  { id:'sentadilla_goblet', nombre:'Sentadilla goblet', grupo_muscular:'Cuádriceps', equipamiento:'Mancuernas', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'prensa_de_piernas', nombre:'Prensa de piernas', grupo_muscular:'Cuádriceps', equipamiento:'Máquina', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'zancadas_con_mancuernas', nombre:'Zancadas con mancuernas', grupo_muscular:'Cuádriceps', equipamiento:'Mancuernas', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'sentadilla_bulgara', nombre:'Sentadilla búlgara', grupo_muscular:'Cuádriceps', equipamiento:'Mancuernas', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'peso_muerto_rumano', nombre:'Peso muerto rumano', grupo_muscular:'Isquiotibiales', equipamiento:'Barra', series_recomendas:'3-4', repeticiones_recomendadas:'6-10' },
  { id:'curl_de_piernas_tumbado', nombre:'Curl de piernas tumbado', grupo_muscular:'Isquiotibiales', equipamiento:'Máquina', series_recomendas:'3-4', repeticiones_recomendadas:'10-15' },
  { id:'curl_de_piernas_sentado', nombre:'Curl de piernas sentado', grupo_muscular:'Isquiotibiales', equipamiento:'Máquina', series_recomendas:'3-4', repeticiones_recomendadas:'10-15' },
  { id:'hip_thrust_con_barra', nombre:'Hip thrust con barra', grupo_muscular:'Glúteos', equipamiento:'Barra', series_recomendas:'3-5', repeticiones_recomendadas:'6-12' },
  { id:'puente_de_gluteos', nombre:'Puente de glúteos', grupo_muscular:'Glúteos', equipamiento:'Peso corporal', series_recomendas:'3-4', repeticiones_recomendadas:'12-20' },
  { id:'patada_de_gluteo_en_polea', nombre:'Patada de glúteo en polea', grupo_muscular:'Glúteos', equipamiento:'Polea', series_recomendas:'3-4', repeticiones_recomendadas:'12-15' },
  { id:'abduccion_de_cadera_en_maquina', nombre:'Abducción de cadera en máquina', grupo_muscular:'Glúteos', equipamiento:'Máquina', series_recomendas:'3-4', repeticiones_recomendadas:'12-20' },
  { id:'peso_muerto_convencional', nombre:'Peso muerto convencional', grupo_muscular:'Espalda', equipamiento:'Barra', series_recomendas:'3-5', repeticiones_recomendadas:'3-6' },
  { id:'jalon_al_pecho', nombre:'Jalón al pecho', grupo_muscular:'Espalda', equipamiento:'Polea', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'dominadas', nombre:'Dominadas', grupo_muscular:'Espalda', equipamiento:'Peso corporal', series_recomendas:'3-4', repeticiones_recomendadas:'6-12' },
  { id:'remo_con_barra', nombre:'Remo con barra', grupo_muscular:'Espalda', equipamiento:'Barra', series_recomendas:'3-4', repeticiones_recomendadas:'6-10' },
  { id:'remo_con_mancuerna', nombre:'Remo con mancuerna', grupo_muscular:'Espalda', equipamiento:'Mancuernas', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'remo_sentado_en_polea', nombre:'Remo sentado en polea', grupo_muscular:'Espalda', equipamiento:'Polea', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'press_de_banca', nombre:'Press de banca', grupo_muscular:'Pecho', equipamiento:'Barra', series_recomendas:'3-5', repeticiones_recomendadas:'5-10' },
  { id:'press_inclinado_con_mancuernas', nombre:'Press inclinado con mancuernas', grupo_muscular:'Pecho', equipamiento:'Mancuernas', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'press_en_maquina', nombre:'Press en máquina', grupo_muscular:'Pecho', equipamiento:'Máquina', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'aperturas_en_polea', nombre:'Aperturas en polea', grupo_muscular:'Pecho', equipamiento:'Polea', series_recomendas:'3-4', repeticiones_recomendadas:'10-15' },
  { id:'flexiones', nombre:'Flexiones', grupo_muscular:'Pecho', equipamiento:'Peso corporal', series_recomendas:'3-4', repeticiones_recomendadas:'10-20' },
  { id:'press_militar_con_barra', nombre:'Press militar con barra', grupo_muscular:'Hombros', equipamiento:'Barra', series_recomendas:'3-4', repeticiones_recomendadas:'5-10' },
  { id:'press_de_hombros_con_mancuernas', nombre:'Press de hombros con mancuernas', grupo_muscular:'Hombros', equipamiento:'Mancuernas', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'elevaciones_laterales', nombre:'Elevaciones laterales', grupo_muscular:'Hombros', equipamiento:'Mancuernas', series_recomendas:'3-4', repeticiones_recomendadas:'12-20' },
  { id:'elevaciones_frontales', nombre:'Elevaciones frontales', grupo_muscular:'Hombros', equipamiento:'Mancuernas', series_recomendas:'3-4', repeticiones_recomendadas:'10-15' },
  { id:'face_pull', nombre:'Face pull', grupo_muscular:'Hombros', equipamiento:'Polea', series_recomendas:'3-4', repeticiones_recomendadas:'12-15' },
  { id:'curl_de_biceps_con_barra', nombre:'Curl de bíceps con barra', grupo_muscular:'Bíceps', equipamiento:'Barra', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'curl_de_biceps_con_mancuernas', nombre:'Curl de bíceps con mancuernas', grupo_muscular:'Bíceps', equipamiento:'Mancuernas', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'curl_martillo', nombre:'Curl martillo', grupo_muscular:'Bíceps', equipamiento:'Mancuernas', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'curl_en_polea', nombre:'Curl en polea', grupo_muscular:'Bíceps', equipamiento:'Polea', series_recomendas:'3-4', repeticiones_recomendadas:'10-15' },
  { id:'fondos_en_barras', nombre:'Fondos en barras', grupo_muscular:'Tríceps', equipamiento:'Peso corporal', series_recomendas:'3-4', repeticiones_recomendadas:'6-12' },
  { id:'press_cerrado', nombre:'Press cerrado', grupo_muscular:'Tríceps', equipamiento:'Barra', series_recomendas:'3-4', repeticiones_recomendadas:'6-10' },
  { id:'extension_de_triceps_en_polea', nombre:'Extensión de tríceps en polea', grupo_muscular:'Tríceps', equipamiento:'Polea', series_recomendas:'3-4', repeticiones_recomendadas:'10-15' },
  { id:'extension_de_triceps_por_encima_de_la_cabeza_con_mancuerna', nombre:'Extensión de tríceps por encima de la cabeza con mancuerna', grupo_muscular:'Tríceps', equipamiento:'Mancuernas', series_recomendas:'3-4', repeticiones_recomendadas:'10-15' },
  { id:'plancha', nombre:'Plancha', grupo_muscular:'Core', equipamiento:'Peso corporal', series_recomendas:'3-4', repeticiones_recomendadas:'30-60 s' },
  { id:'crunch_abdominal', nombre:'Crunch abdominal', grupo_muscular:'Core', equipamiento:'Peso corporal', series_recomendas:'3-4', repeticiones_recomendadas:'15-25' },
  { id:'elevacion_de_piernas_colgado', nombre:'Elevación de piernas colgado', grupo_muscular:'Core', equipamiento:'Peso corporal', series_recomendas:'3-4', repeticiones_recomendadas:'8-15' },
  { id:'ab_wheel_rollout', nombre:'Ab wheel rollout', grupo_muscular:'Core', equipamiento:'Peso corporal', series_recomendas:'3-4', repeticiones_recomendadas:'8-12' },
  { id:'bird_dog', nombre:'Bird dog', grupo_muscular:'Core', equipamiento:'Peso corporal', series_recomendas:'3-4', repeticiones_recomendadas:'10-15' },
  { id:'elevacion_de_gemelos_de_pie', nombre:'Elevación de gemelos de pie', grupo_muscular:'Gemelos', equipamiento:'Máquina', series_recomendas:'3-5', repeticiones_recomendadas:'12-20' },
  { id:'elevacion_de_gemelos_sentado', nombre:'Elevación de gemelos sentado', grupo_muscular:'Gemelos', equipamiento:'Máquina', series_recomendas:'3-5', repeticiones_recomendadas:'12-20' },
  { id:'elevacion_de_gemelos_con_mancuernas', nombre:'Elevación de gemelos con mancuernas', grupo_muscular:'Gemelos', equipamiento:'Mancuernas', series_recomendas:'3-4', repeticiones_recomendadas:'15-25' },
  { id:'salto_de_gemelos', nombre:'Salto de gemelos', grupo_muscular:'Gemelos', equipamiento:'Peso corporal', series_recomendas:'3-4', repeticiones_recomendadas:'15-25' },
];

/**
 * Normaliza el `grupo_muscular` fino del catálogo a la taxonomía `GROUPS`
 * canónica de la app (constants.js / MUSCLE_MAP). Lo que no esté aquí cae
 * en 'Otro'.
 */
export const GROUP_NORMALIZE = {
  'Cuádriceps':    'Piernas',
  'Isquiotibiales':'Piernas',
  'Gemelos':       'Piernas',
  'Glúteos':       'Glúteos',
  'Espalda':       'Espalda',
  'Pecho':         'Pecho',
  'Hombros':       'Hombros',
  'Bíceps':        'Bíceps',
  'Tríceps':       'Tríceps',
  'Core':          'Abdominales',
};

/** Heurística simple para el flag cosmético `compound` (multi-articular). */
const COMPOUND_RE = /sentadilla|peso muerto|press|remo|dominad|fondo|hip thrust|zancad|prensa|jal[oó]n/i;

/** Primer entero de un rango ("3-5" → 3, "3-4" → 3). */
function firstInt(range, fallback) {
  const m = String(range || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : fallback;
}

/**
 * Convierte un item del catálogo al ejercicio que guarda la app.
 * Pura: no toca el Store.
 *
 * @param {object} c  item de EXERCISE_CATALOG
 * @returns {{id,name,group,compound,muscle,equipment,defaultSets,defaultRepRange}}
 */
export function catalogToExercise(c) {
  return {
    id: c.id,
    name: c.nombre,
    group: GROUP_NORMALIZE[c.grupo_muscular] || 'Otro',
    compound: COMPOUND_RE.test(c.nombre),
    muscle: c.grupo_muscular,            // músculo fino, solo para mostrar/filtrar
    equipment: c.equipamiento,
    defaultSets: firstInt(c.series_recomendas, 3),
    defaultRepRange: c.repeticiones_recomendadas || '8-12',
  };
}

/** Listas distintas para los chips de filtro (en orden de aparición). */
export const CATALOG_MUSCLES = [...new Set(EXERCISE_CATALOG.map(c => c.grupo_muscular))];
export const CATALOG_EQUIPMENT = [...new Set(EXERCISE_CATALOG.map(c => c.equipamiento))];
