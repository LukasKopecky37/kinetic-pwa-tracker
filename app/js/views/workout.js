/**
 * Vistas de Workout — flujo "iniciar / entrenar / terminar / resumir".
 *
 * Exporta tres entradas:
 *   - `promptStartWorkout(routineId)`  → modal pre-workout (readiness)
 *   - `openWorkoutSummary(workoutId)`  → modal de resumen post-workout
 *   - `confirmFinishWorkout(workoutId)`→ confirma, cierra y abre summary
 *
 * El "estado activo" lo controla el Store (`Store.activeWorkout()`).
 * Esta vista solo dibuja modales y delega.
 */

import { $, $$, h, mount } from '../utils/dom.js';
import { todayISO } from '../utils/date.js';
import { escapeH } from '../utils/format.js';
import { Store } from '../store/store.js';
import { openModal, closeModal } from '../services/modal.js';
import { toast } from '../services/toast.js';
import { ReadinessSliders } from '../components/ReadinessSliders.js';
import { StatsCard } from '../components/StatsCard.js';
import { muscleSVG } from '../components/muscle-map.js';
import { summarizeWorkout, fmtDuration } from '../analytics/workout-summary.js';
import { metTargetStrict, bumpKgFor } from '../analytics/progression.js';
import { fireConfetti } from '../services/confetti.js';
import { vibrate } from '../services/haptics.js';
import { App } from '../app.js';

/* ============================================================================
   PRE-WORKOUT
   ============================================================================ */

/**
 * Modal previo a empezar: pregunta cómo te encuentras (opcional) y arranca.
 * Si no hay rutina (workout libre) se permite igual.
 */
export function promptStartWorkout(routineId) {
  let readinessValues = {};
  const slidersHost = h('div', { class: 'slidersHost' });

  // Crear sliders y conectar onChange
  const sliders = ReadinessSliders({
    value: {},
    onChange: (v) => { readinessValues = v; },
  });
  slidersHost.appendChild(sliders);

  openModal('');
  const body = h('div', { class: 'modal-body' },
    h('p', { style: { fontSize: '13px', color: 'var(--muted)', marginTop: '0' } },
      'Antes de empezar, ¿cómo te encuentras? (opcional)'),
    slidersHost,
  );
  mount($('#modal'), [
    h('div', { class: 'modal-head' },
      h('h3', null, 'Iniciar entrenamiento'),
      h('button', { class: 'x', onClick: closeModal }, '×'),
    ),
    body,
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn secondary', onClick: closeModal }, 'Cancelar'),
      h('button', { class: 'btn', onClick: () => {
        const readiness = Object.keys(readinessValues).length ? readinessValues : null;
        Store.startWorkout({ routineId, date: todayISO(), readiness });
        closeModal();
        toast(`Entrenamiento iniciado`, 'pr');
        App.refreshAll();
        // Fase I (#9): entrar directo al player a pantalla completa.
        import('./active-workout.js').then(m => m.openActiveWorkout());
      }}, 'Empezar'),
    ),
  ]);
}

/* ============================================================================
   FINISH WORKOUT
   ============================================================================ */

/**
 * Confirma terminar el workout activo y abre la pantalla de resumen.
 * Si no hay nada registrado, igualmente lo cierra (con menos fanfarria).
 */
export function confirmFinishWorkout(workoutId) {
  const w = Store.workoutById(workoutId);
  if (!w) return;
  const finished = Store.finishWorkout(w.id);
  App.refreshAll();
  // Háptica de victoria al terminar
  vibrate([20, 40, 20, 40, 120]);
  openWorkoutSummary(finished.id);
}

/** Cancela definitivamente el workout activo (con confirmación). */
export function confirmCancelWorkout(workoutId) {
  if (!confirm('¿Cancelar el entrenamiento? Las sesiones registradas se conservan, pero pierden el enlace al workout.')) return;
  Store.cancelWorkout(workoutId);
  App.refreshAll();
  toast('Entrenamiento cancelado');
}

/* ============================================================================
   WORKOUT SUMMARY
   ============================================================================ */

/**
 * Mensaje de celebración random para el hero del resumen.
 *
 * Pesos: BRUTAL es la firma del usuario, ~65% de las veces. Los otros tres
 * rotan para que la experiencia no sea monótona pero conserve identidad.
 *   - BRUTAL                 65 / 100
 *   - IMPARABLE              15 / 100
 *   - ZANDADO                10 / 100
 *   - ENTRENAMIENTO COMPLET  10 / 100
 */
const CHEER_MESSAGES = [
  { text: '¡BRUTAL!',                  weight: 65 },
  { text: '¡IMPARABLE!',               weight: 15 },
  { text: '¡ZANDADO!',                 weight: 10 },
  { text: '¡ENTRENAMIENTO COMPLETADO!', weight: 10 },
];

function pickCheerMessage() {
  const total = CHEER_MESSAGES.reduce((s, m) => s + m.weight, 0);
  let r = Math.random() * total;
  for (const m of CHEER_MESSAGES) {
    r -= m.weight;
    if (r <= 0) return m.text;
  }
  return CHEER_MESSAGES[0].text;   // fallback (no debería caer aquí nunca)
}

export function openWorkoutSummary(workoutId) {
  const w = Store.workoutById(workoutId);
  if (!w) return;

  const linkedSessions = Store.sessionsOfWorkout(w.id);
  const summary = summarizeWorkout(
    w,
    linkedSessions,
    Store.data.sessions,
    (id) => Store.exerciseById(id),
  );

  const heroSub = w.routineId
    ? (Store.routineById(w.routineId)?.name || '—')
    : 'Entrenamiento libre';

  const prBanner = summary.prCount > 0
    ? h('div', { class: 'summary-pr' },
        h('small', null, `${summary.prCount} récord${summary.prCount > 1 ? 's' : ''} conseguido${summary.prCount > 1 ? 's' : ''}`),
        '🏆 ¡Brutal!',
      )
    : null;

  /* Ejercicios que cumplieron el objetivo al 100% → ganan +kg la próxima.
   * Evalúa cada sesión contra el item de la rutina (sets + repRange). */
  const routine = w.routineId ? Store.routineById(w.routineId) : null;
  const bumps = [];
  if (routine) {
    for (const sess of linkedSessions) {
      const item = routine.items.find(it => it.exerciseId === sess.exerciseId);
      if (!item) continue;
      const ex = Store.exerciseById(sess.exerciseId);
      // Pasamos `ex` para que el evaluador honre progressionType (assisted
      // invierte la dirección) y la regla AND estricta de unilateral.
      const range = ex?.targetRepRange
        && Number.isFinite(ex.targetRepRange.min)
        && Number.isFinite(ex.targetRepRange.max)
        ? `${ex.targetRepRange.min}-${ex.targetRepRange.max}`
        : item.repRange;
      if (!metTargetStrict(sess, range, item.sets, ex)) continue;
      if (ex) bumps.push({ name: ex.name, kg: bumpKgFor(ex) });
    }
  }
  const bumpBlock = bumps.length
    ? h('div', { class: 'summary-bump' },
        h('div', { class: 'sb-head' },
          h('span', { class: 'sb-eyebrow' }, 'Próximo entreno · sube peso'),
          h('span', { class: 'sb-icon' }, '🔥'),
        ),
        h('div', { class: 'sb-title' },
          '¡Gran progreso! Cumpliste el objetivo en:'),
        h('ul', { class: 'sb-list' },
          ...bumps.map(b => h('li', null,
            h('span', { class: 'sb-name' }, b.name),
            h('span', { class: 'sb-kg' }, `+${b.kg} kg`),
          )),
        ),
      )
    : null;

  const muscleBlock = summary.muscleRegions.length
    ? h('div', { class: 'muscle-wrap', style: { marginTop: '6px' } },
        h('div', { class: 'muscle-svg', html: muscleSVG(summary.muscleRegions) }),
        h('div', { class: 'muscle-legend' },
          h('h4', null, 'Trabajaste'),
          h('div', { class: 'muscle-tags' },
            ...summary.muscleGroups.map(g => h('span', { class: 'm-tag' }, g)),
          ),
        ),
      )
    : null;

  const exList = summary.perExercise.length
    ? h('div', null,
        h('h4', null, 'Por ejercicio'),
        ...summary.perExercise.map(item => {
          // v6: las reps viven en sets[]; el modal antes leía session.reps/
          // session.weight (pre-v6) y mostraba "undefined". Lo derivamos.
          const sets = (item.session.sets || []).filter(s => !s.warmup && s.reps);
          const repsStr = sets.map(s => s.reps).join('·') || '—';
          const topW = item.topSet ? item.topSet.weight : 0;
          return h('div', { class: 'summary-ex-row' },
            h('div', null,
              h('div', { class: 'sx-name' },
                item.ex.name,
                item.isPR ? h('span', { class: 'pr-flag' }, 'PR') : null,
              ),
              h('div', { class: 'sx-detail' },
                repsStr, ` · ${item.volume} kg·rep`),
            ),
            h('div', { class: 'sx-weight' }, `${topW} kg`),
          );
        }),
      )
    : h('div', { class: 'empty', style: { padding: '20px' } },
        'No registraste ninguna serie en este entrenamiento.');

  /* Hero del cheer: "¡BRUTAL!" o variación random. Entrada animada via
     CSS (cheer-pop .55s con overshoot) sincronizada con el confeti. */
  const cheerText = pickCheerMessage();
  const cheerLong = cheerText.length > 12;
  const cheerEl = h('div', {
    class: 'summary-cheer' + (cheerLong ? ' long' : ''),
    'aria-label': 'Entrenamiento completado',
  }, cheerText);

  openModal('');
  mount($('#modal'), [
    h('div', { class: 'modal-head' },
      h('h3', null, 'Resumen'),
      h('button', { class: 'x', onClick: closeModal }, '×'),
    ),
    h('div', { class: 'modal-body' },
      h('div', { class: 'summary-hero' },
        cheerEl,
        h('div', { class: 'duration' }, fmtDuration(summary.durationSec)),
        h('div', { class: 'sub' }, heroSub),
      ),
      h('div', { class: 'summary-stats' },
        StatsCard({ label: 'Volumen', value: summary.totalVolume, unit: 'kg·rep' }),
        StatsCard({ label: 'Sets',    value: summary.totalSets }),
        StatsCard({ label: 'Reps',    value: summary.totalReps }),
        StatsCard({ label: 'PRs',     value: summary.prCount }),
      ),
      prBanner,
      bumpBlock,
      muscleBlock,
      exList,
    ),
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn', onClick: closeModal }, 'Cerrar'),
    ),
  ]);

  /* Confeti SIEMPRE al cerrar un workout. Antes solo se disparaba si había
     PRs, pero el cierre del entrenamiento ya es per se el momento de
     recompensa visual máxima. La función fireConfetti() ahora usa el
     patrón "festival side-burst" (2.4s desde los laterales, ver
     services/confetti.js). El delay de 280ms da tiempo a que el modal
     entre y el cheer empiece su animación pop. */
  setTimeout(() => fireConfetti(), 280);
}
