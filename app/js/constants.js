/**
 * Constantes globales del dominio.
 * Cualquier "valor mágico" estático del producto vive aquí.
 */

export const ROMAN = [
  'I','II','III','IV','V','VI','VII','VIII','IX','X',
  'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'
];

export const DAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
export const DAY_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

export const GROUPS = [
  'Pecho','Espalda','Hombros','Piernas','Glúteos',
  'Bíceps','Tríceps','Abdominales','Cardio','Otro'
];

/**
 * Mapeo grupo muscular → regiones del SVG anatómico.
 * Cambiar aquí afecta automáticamente al diagrama y al cálculo
 * de "músculos activos por sesión".
 */
export const MUSCLE_MAP = {
  'Pecho':       ['chest'],
  'Espalda':     ['lats','upper-back','lower-back'],
  'Hombros':     ['shoulder','rear-delt'],
  'Bíceps':      ['biceps'],
  'Tríceps':     ['triceps'],
  'Piernas':     ['quads','hamstrings','calves'],
  'Glúteos':     ['glutes'],
  'Abdominales': ['abs'],
};
