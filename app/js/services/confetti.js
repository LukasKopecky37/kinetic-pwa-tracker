/**
 * Confetti — celebración de PR. Diseño "festival side-burst":
 *
 *   - Dos fuentes simultáneas, una desde el borde IZQUIERDO y otra desde el
 *     borde DERECHO de la pantalla, no un burst puntual.
 *   - Trayectoria: hacia ARRIBA y HACIA EL CENTRO, con gravedad que las hace
 *     caer en arco — sensación de "telón de confeti" entrando por los lados.
 *   - Duración 2.4 s (en el rango 2-3 s pedido por el spec).
 *   - 100 partículas total (50 por lado), tamaños variables 4-9 px, rotación
 *     individual + drag aerodinámico → no son "puntitos" planos.
 *   - `pointer-events: none` → la app sigue siendo navegable mientras dura
 *     la celebración (no bloquea taps del usuario).
 *   - Respeta `prefers-reduced-motion`: si está activo, no dispara nada.
 *
 * Los parámetros `originX, originY` se aceptan por compatibilidad con
 * llamadas antiguas (eran un point burst) pero ya NO se usan — el nuevo
 * patrón es siempre side-burst porque comunica mejor "celebración global".
 */

const COLORS = [
  '#ff7a2f',  // accent app
  '#ffb86b',  // accent-2
  '#22c55e',  // success green
  '#fbbf24',  // amber
  '#60a5fa',  // sky blue
  '#f472b6',  // pink
  '#e9edf3',  // off-white
];
const PARTICLES_PER_SIDE = 50;        // 100 total entre los dos lados
const DURATION_MS        = 2400;      // 2.4 s · en el rango 2-3 s del spec
const FADE_START         = 0.65;      // empieza a desvanecer al 65% (~1.56s)

let active = 0;
const MAX_ACTIVE = 2;                 // evita acumular en PRs encadenados

export function fireConfetti(_originX, _originY) {
  if (active >= MAX_ACTIVE) return;
  // Respeto a usuarios con sensibilidad al movimiento.
  if (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  active++;
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:9999';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = window.innerWidth  * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = window.innerWidth;
  const H = window.innerHeight;

  /* === Generación de partículas ===
     Para cada lado spawneamos PARTICLES_PER_SIDE desde una franja vertical
     de ~60% del alto, centrada en el medio. Velocidad inicial: vector
     inclinado hacia ARRIBA y HACIA EL CENTRO con jitter → telón sutil.
     vy negativo = sube. La gravedad las arrastra abajo después del peak. */
  const particles = [];
  for (let side = 0; side < 2; side++) {
    const fromLeft = side === 0;
    const originXSide = fromLeft ? -10 : W + 10;
    for (let i = 0; i < PARTICLES_PER_SIDE; i++) {
      // Spawn vertical: entre 30% y 90% de la altura (visualmente centrado)
      const y0 = H * (0.30 + Math.random() * 0.60);
      // Velocidad: hacia el centro + arriba con jitter
      const speed = 7 + Math.random() * 5;     // 7-12 px/frame
      const angleBase = fromLeft
        ? -Math.PI / 4                          // -45° (arriba-derecha)
        : -3 * Math.PI / 4;                     // -135° (arriba-izquierda)
      const angle = angleBase + (Math.random() - 0.5) * (Math.PI / 5);
      particles.push({
        x: originXSide,
        y: y0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        g:  0.30,
        drag: 0.987,
        size: 4 + Math.random() * 5,            // 4-9 px
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.35,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: Math.random() < 0.55 ? 'rect' : 'circle',
      });
    }
  }

  const start = performance.now();

  function frame(now) {
    const t = (now - start) / DURATION_MS;
    if (t >= 1) {
      canvas.remove();
      active = Math.max(0, active - 1);
      return;
    }
    ctx.clearRect(0, 0, W, H);

    // Alpha: 1.0 durante FADE_START, luego easing cuadrático a 0.
    const fadeT = Math.max(0, (t - FADE_START) / (1 - FADE_START));
    const alpha = 1 - fadeT * fadeT;

    for (const p of particles) {
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === 'rect') {
        // Rectángulo alargado → simula papel/serpentina
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.65);
      } else {
        // Círculo pequeño → simula confeti redondo
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
