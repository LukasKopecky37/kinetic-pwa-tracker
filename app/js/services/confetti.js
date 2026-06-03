/**
 * Confetti — pequeña explosión de partículas en canvas al conseguir un PR.
 *
 * Se monta un canvas fijo a pantalla completa, lanza ~60 partículas con
 * gravedad, las dibuja en cada frame, y se autodestruye al cabo de ~1.5 s.
 * No bloquea interacción (pointer-events:none).
 *
 * Respeta prefers-reduced-motion: si está activo, no hace nada.
 */

const COLORS = ['#ff7a2f', '#ffb86b', '#22c55e', '#fbbf24', '#e9edf3'];
const PARTICLES = 70;
const DURATION_MS = 1600;

let active = 0;
const MAX_ACTIVE = 2; // evita acumular si el usuario consigue PRs en cascada

export function fireConfetti(originX, originY) {
  if (active >= MAX_ACTIVE) return;
  if (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  active++;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:90';
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const cx = originX ?? window.innerWidth / 2;
  const cy = originY ?? window.innerHeight / 3;

  const particles = Array.from({ length: PARTICLES }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 8;
    return {
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,           // ligero impulso hacia arriba
      g:  0.28,
      drag: 0.985,
      size: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });

  const start = performance.now();

  function frame(now) {
    const t = (now - start) / DURATION_MS;
    if (t >= 1) {
      canvas.remove();
      active = Math.max(0, active - 1);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const alpha = 1 - t * t;       // fade-out cuadrático

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
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
