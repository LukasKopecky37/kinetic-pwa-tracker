/**
 * MuscleMap — diagrama anatómico SVG con dos vistas (frontal + posterior).
 *
 * `muscleSVG(activeRegions)` devuelve el HTML como string para inyectar.
 * `activeRegions` es un array de claves: 'chest', 'shoulder', 'biceps',
 * 'triceps', 'abs', 'quads', 'calves', 'lats', 'upper-back', 'lower-back',
 * 'rear-delt', 'glutes', 'hamstrings'.
 *
 * Las regiones que coinciden reciben la clase `.on` (color acento).
 *
 * `updateMuscleHeatmap(root, regionNorm)` pinta el SVG ya inyectado como
 * mapa de calor: cada elemento `[data-region]` se colorea según su carga
 * normalizada (0..1) con la rampa premium de `loadColor`.
 */

import { loadColor } from '../analytics/muscle-load.js';

/**
 * @param {string[]} active  regiones a resaltar
 * @returns {string}  fragmento SVG
 */
export function muscleSVG(active) {
  // Emite class (.on para el día) + data-region (clave del SVG) para que el
  // heatmap pueda targetear cada región. data-region = la 1ª región dada.
  const tag = (...regions) =>
    `class="muscle ${regions.some((r) => active.includes(r)) ? 'on' : ''}" data-region="${regions[0]}"`;

  return `
  <svg viewBox="0 0 230 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <!-- ====== VISTA FRONTAL (x: 5..110) ====== -->
    <g>
      <!-- silueta -->
      <path class="silhouette" d="
        M 55 8 Q 70 8 70 22 Q 70 33 64 38
        L 80 42 Q 92 46 95 60 L 95 95 Q 92 102 88 105
        L 88 145 Q 92 165 90 200 L 76 205 L 72 165 L 65 165 L 62 200 L 48 200 L 45 165 L 38 165 L 34 205 L 20 200 Q 18 165 22 145
        L 22 105 Q 18 102 15 95 L 15 60 Q 18 46 30 42 L 46 38 Q 40 33 40 22 Q 40 8 55 8 Z"/>
      <!-- chest -->
      <ellipse ${tag('chest')} cx="46" cy="58" rx="11" ry="9"/>
      <ellipse ${tag('chest')} cx="64" cy="58" rx="11" ry="9"/>
      <!-- shoulders front -->
      <ellipse ${tag('shoulder')} cx="27" cy="50" rx="8" ry="7"/>
      <ellipse ${tag('shoulder')} cx="83" cy="50" rx="8" ry="7"/>
      <!-- biceps -->
      <ellipse ${tag('biceps')} cx="22" cy="78" rx="6" ry="13"/>
      <ellipse ${tag('biceps')} cx="88" cy="78" rx="6" ry="13"/>
      <!-- abs -->
      <rect ${tag('abs')} x="44" y="74" width="22" height="30" rx="3"/>
      <!-- quads -->
      <ellipse ${tag('quads')} cx="40" cy="135" rx="10" ry="20"/>
      <ellipse ${tag('quads')} cx="70" cy="135" rx="10" ry="20"/>
      <!-- calves (visible side) -->
      <ellipse ${tag('calves')} cx="40" cy="180" rx="7" ry="13"/>
      <ellipse ${tag('calves')} cx="70" cy="180" rx="7" ry="13"/>
    </g>
    <!-- ====== VISTA POSTERIOR (x: 125..230) ====== -->
    <g transform="translate(120 0)">
      <path class="silhouette" d="
        M 55 8 Q 70 8 70 22 Q 70 33 64 38
        L 80 42 Q 92 46 95 60 L 95 95 Q 92 102 88 105
        L 88 145 Q 92 165 90 200 L 76 205 L 72 165 L 65 165 L 62 200 L 48 200 L 45 165 L 38 165 L 34 205 L 20 200 Q 18 165 22 145
        L 22 105 Q 18 102 15 95 L 15 60 Q 18 46 30 42 L 46 38 Q 40 33 40 22 Q 40 8 55 8 Z"/>
      <!-- traps + upper back -->
      <path ${tag('upper-back')} d="M 35 42 L 75 42 L 70 60 L 40 60 Z"/>
      <!-- rear delts -->
      <ellipse ${tag('rear-delt','shoulder')} cx="27" cy="50" rx="8" ry="7"/>
      <ellipse ${tag('rear-delt','shoulder')} cx="83" cy="50" rx="8" ry="7"/>
      <!-- lats -->
      <path ${tag('lats')} d="M 32 60 Q 27 80 30 100 L 45 100 L 45 60 Z"/>
      <path ${tag('lats')} d="M 78 60 Q 83 80 80 100 L 65 100 L 65 60 Z"/>
      <!-- lower back -->
      <rect ${tag('lower-back')} x="44" y="100" width="22" height="22" rx="2"/>
      <!-- triceps -->
      <ellipse ${tag('triceps')} cx="22" cy="78" rx="6" ry="13"/>
      <ellipse ${tag('triceps')} cx="88" cy="78" rx="6" ry="13"/>
      <!-- glutes -->
      <ellipse ${tag('glutes')} cx="44" cy="128" rx="10" ry="9"/>
      <ellipse ${tag('glutes')} cx="66" cy="128" rx="10" ry="9"/>
      <!-- hamstrings -->
      <ellipse ${tag('hamstrings')} cx="40" cy="155" rx="9" ry="16"/>
      <ellipse ${tag('hamstrings')} cx="70" cy="155" rx="9" ry="16"/>
      <!-- calves -->
      <ellipse ${tag('calves')} cx="40" cy="185" rx="7" ry="12"/>
      <ellipse ${tag('calves')} cx="70" cy="185" rx="7" ry="12"/>
    </g>
  </svg>`;
}

/**
 * Pinta como heatmap un SVG ya montado (el de `muscleSVG`).
 *
 * @param {ParentNode} root        contenedor o el propio <svg> inyectado
 * @param {Object<string,number>} regionNorm  intensidad 0..1 por región
 *        (clave = data-region). Usa `regionIntensities()` de muscle-load.js.
 */
export function updateMuscleHeatmap(root, regionNorm) {
  if (!root) return;
  root.querySelectorAll('[data-region]').forEach(el => {
    const t = regionNorm[el.dataset.region] || 0;
    el.classList.add('heat');
    el.style.fill = loadColor(t);
    // incluso a 0 se ve la silueta tenue; sube con la carga
    el.style.opacity = (0.30 + 0.70 * t).toFixed(3);
  });
}
