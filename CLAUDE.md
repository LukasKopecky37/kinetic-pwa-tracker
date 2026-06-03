# Rutina — Project context for new conversations

This file is the handover document. **Any new Claude (CLI or Cowork) should
read this first** before touching the code. It captures architecture, decisions,
and pending work so you don't have to re-explain anything.

---

## What this app is

A premium-feel iOS-style PWA for strength training. Built collaboratively
from an Apple Numbers spreadsheet ("RUTINA II — 24 semanas") into a full
modular vanilla-JS application. Designed for the user (Lukas) to use in the
gym from his iPhone, with offline support and PWA installable.

**Visual identity**: dark iOS-like, glassmorphism, orange accent (#ff7a2f),
minimalist premium. Inspired by Strong / Hevy / Whoop / Apple Fitness, but
more minimalist.

**Run locally**: `./start.command` (Ruby preferred, Python fallback).
**Deploy**: drag folder to https://app.netlify.com/drop.
**Mobile**: open Netlify URL → Safari Share → Add to home screen.

---

## Tech stack

- Vanilla JS with native ES modules (no framework, no bundler).
- IndexedDB via Dexie (loaded from CDN) + localStorage sync mirror.
- Chart.js (CDN) for line/bar graphs.
- PWA: `manifest.json` + `sw.js` with precache (56+ assets).
- Single shell HTML (`index.html`), modules under `/js`, styles under `/styles`.
- Mobile-first, iOS Safari primary target.
- No build step. No npm. No package.json.

Why this stack: maximum portability, zero dependencies to break, the user
can read/edit any file directly. Modular ES means each concern lives in
its own ~50-300 line file.

---

## File layout

```
/
├── index.html              shell (~130 lines, loads modules)
├── manifest.json           PWA manifest
├── sw.js                   service worker (precache 56 assets)
├── icon.svg                app icon (mancuerna naranja)
├── start.command           local dev launcher (Ruby/Python fallback)
├── styles/                 6 files, ~900 lines total
│   ├── tokens.css          CSS variables (the single source of design tokens)
│   ├── base.css            reset, body, header, brand
│   ├── layout.css          main, bottom tabs
│   ├── components.css      cards, chips, modal, sets-list, etc.
│   ├── views.css           home sections, routine view, settings, heatmap
│   ├── animations.css      view transitions, confetti, streak banner
│   └── active.css          full-screen active-workout player (Fase I)
└── js/                     46 files, ~5300 lines total
    ├── main.js             entry, registers service worker
    ├── app.js              orchestrator (tab nav, home↔routine, header)
    ├── constants.js        ROMAN, DAY_NAMES, GROUPS, MUSCLE_MAP
    ├── utils/
    │   ├── dom.js          $, $$, h(tag,props,...children), mount()
    │   ├── date.js         todayISO, fmtDate, daysSince
    │   ├── format.js       fmtRepsCompact, fmtTopSet, fmtMMSS, escapeH
    │   └── roman.js
    ├── store/              persistence + CRUD + event bus
    │   ├── store.js        Store facade (~400 lines)
    │   ├── seed.js         seedData() + generateDemoSessions() + migrateOldSession()
    │   ├── exercise-catalog.js  static ES catalog (45 exercises) + group
    │   │                   normalization + catalogToExercise() (Fase I+)
    │   ├── migrations.js   v2/v3/v4/v5→v6 chain, async load
    │   ├── db.js           Dexie wrapper (IndexedDB)
    │   └── events.js       on/off/emit
    ├── analytics/          PURE functions, no DOM/Store access
    │   ├── one-rm.js       estimate1RM (Epley), bestEstimated1RM
    │   ├── volume.js       sessionVolume, sessionSetCount, weeklySetsByGroup, adherenceMatrix
    │   ├── prs.js          topWeight, topSet, isPR
    │   ├── progression.js  suggestNextWeight, averagePosition, parseRepRange
    │   ├── stagnation.js   isStalled, findStalledExercises
    │   ├── streak.js       streakDays, weeklyConsistency
    │   ├── muscles.js      activeMuscles
    │   ├── workout-summary.js  summarizeWorkout, fmtDuration
    │   └── insights.js     generateInsights (8 rules)
    ├── components/         UI primitives, h() based, return HTMLElement
    │   ├── HistoryChip.js
    │   ├── StatsCard.js
    │   ├── RoutineButton.js
    │   ├── InsightCard.js
    │   ├── ReadinessSliders.js
    │   └── muscle-map.js   SVG anatomy diagram (front + back)
    ├── services/           side effects (DOM, audio, vibration, network)
    │   ├── modal.js        openModal(html), closeModal(), bindModalDismiss()
    │   ├── toast.js        toast(msg, kind)
    │   ├── audio.js        beepEndOfRest()
    │   ├── haptics.js      vibrate(pattern)
    │   ├── rest-timer.js   RestTimer (singleton)
    │   ├── plate-calc.js   compute(weight, barWeight), PLATE_CLASS
    │   ├── backup.js       exportJSON, importJSON
    │   ├── confetti.js     fireConfetti(x, y) — canvas particle burst
    │   └── pwa.js          registerServiceWorker
    ├── charts/             Chart.js wrappers
    │   ├── theme.js        CHART colors (deliberately not coupled to CSS vars)
    │   ├── progress.js     renderProgressChart
    │   └── volume.js       renderVolumeChart
    └── views/              high-level compositions, mounted in tabs
        ├── home.js         hero + days section + other routines section
        ├── routine.js      day workout view, set-by-set form
        ├── history.js      chips per exercise + edit session modal
        ├── progress.js     stats + chart + suggestion box
        ├── analysis.js     insights + volume + heatmap + stalled list
        ├── settings.js     mesos, routines, library, rest, data sections
        ├── workout.js      readiness modal + start/finish + summary
        └── active-workout.js  full-screen player: carousel + per-set ✓ + timer (Fase I)
```

---

## Data model (v6)

```js
data = {
  version: 6,
  mesos: [
    { id, name, subtitle, startDate, endDate }
  ],
  currentMesoId,
  exercises: [                         // global library
    { id, name, group, compound,
      muscle?, equipment? }            // optional, set when materialized from
                                       // the catalog (granular muscle + gear).
                                       // `group` stays canonical (GROUPS) so
                                       // MUSCLE_MAP / volume analytics work.
  ],
  routines: [                          // "days" of a mesociclo (lunes/martes/etc)
    {
      id, mesoId, name, group,
      days: [1..6,0],                  // dayOfWeek (0=domingo, 1=lunes, ...)
      items: [
        {
          exerciseId, sets, repRange, rest,
          days: [n]                    // subset of routine.days (multi-day support)
        }
      ]
    }
  ],
  sessions: [                          // one entry per exercise per training day
    {
      id, date, exerciseId, mesoId,
      workoutId?,                      // link to parent Workout if any
      sets: [                          // v6: array of independent sets
        { weight, reps, rpe?, warmup? }
      ],
      order,                           // execution order on that date (I, II, ...)
      notes
    }
  ],
  workouts: [                          // a complete training session container
    {
      id, mesoId, routineId, date,
      startAt, endAt,
      readiness: { energy, sleep, motivation, fatigue, stress } | null
    }
  ],
  activeWorkoutId,                     // id of in-progress workout, if any
  settings: { lastRoutineId, defaultRest }
}
```

### Key mental model

The terminology in the UI vs. the code differs deliberately:

| User says        | Code calls it |
|------------------|---------------|
| "rutina" (program) | `mesociclo` (data.mesos[]) |
| "día" (workout)  | `routine` (data.routines[]) |
| "ejercicio"      | `item` inside a routine, references a library `exercise` |
| "serie"          | a set inside session.sets[] |
| "sesión"         | a `session` (one exercise registered on a date) |
| "entrenamiento"  | a `workout` (groups multiple sessions of the same day) |

Hierarchy decision (no migration): the app is intentionally **2 visible
levels** — "Rutina" (the container, = `mesociclo`/`data.mesos[]`, e.g.
"Hipertrofia 4 días") and "Día" (= `routine`/`data.routines[]`, e.g.
"Día 1: Push"). One Rutina per "plan"; Mesociclo and Rutina are the SAME
concept (the user explicitly chose to fuse them rather than add a real 3rd
DB level). The UI now says "Rutina"/"Día" consistently — the word
"mesociclo" must NOT appear in the UI anymore (only in code/comments).
`#mesoPill` + Settings → "Rutina (plan)" edit the Rutina; Settings → "Días"
manages the días. Home is a **drill-down dashboard** with module state
`openMesoId` in home.js (exports `homeShowRutinas()` / `homeOpenRutina(id)`):
  - Level 1 (`openMesoId === null`): slim smart "Hoy" banner (CTA to the
    active plan's due/next day) + grid of big `.rutina-card` (one per
    `meso`, "Rutina" + name + stats + active badge) + "+ Nueva rutina".
  - Level 2 (`openMesoId === id`): `.rutina-detail-head` (‹ back / name /
    ✎ edit) + numbered Día cards (`.routine-grid`) + "+ Nuevo día".
  - Tapping a Day → `Store.setCurrentMeso(mesoId)` then `App.showRoutine`
    (the player flow). Filtering is by `mesoId` (= the "rutinaId"; there is
    NO separate rutinaId field). `#quickEdit` now routes to Level 1.
  `renderHome()` keeps the level on refresh (back from a Day returns to its
  Rutina's day list). See home.js.
- Settings refinements: `renderMesoSection` hides the "Cambiar de rutina"
  list + delete unless `mesos.length > 1` (single-rutina view = just
  RUTINA ACTIVA + ACCIONES + Volver). `openRoutineEditor` (the **Día**
  editor) is 2-step: module flag `_reMetaOpen` collapses Nombre/Grupos/Días
  into a `.re-summary` card ("✎ Editar datos" expands) so the screen
  focuses on exercise management; "Guardar y continuar" commits + collapses.
  Picker: "+ Crear ejercicio personalizado" is the FIRST element (top);
  `openExerciseEditor(exId, onClose, onCreate)` — `onCreate(newEx)` fires
  only on successful create and the picker uses it to auto-add the new
  exercise into the día (zero extra clicks) and return to the editor.
- Muscle heatmap (Análisis tab): `js/analytics/muscle-load.js` is the pure
  biomechanics layer — `EXERCISE_MUSCLES` (id → primarios/secundarios, an
  ADDITIVE map; does NOT mutate exercise-catalog.js or stored exercises),
  `calculateMuscleVolume(sessions, byId, {daysBack=7})` (completed sets ×
  1.0 primary / 0.5 secondary → `{muscle: pts}`), `normalizeMuscleVolume`,
  `regionIntensities` (fine muscle → coarse SVG region via
  `MUSCLE_TO_REGION`, since the SVG is coarser than the muscle DB),
  `loadColor(t)` ramp. `muscle-map.js` now emits `data-region` on every
  muscle element (the old SVG only had it in comments — the user's
  "data-muscle matches DB strings" assumption was false) + exports
  `updateMuscleHeatmap(root, regionNorm)`. Rendered as the `.mh-card` in
  analysis.js (SVG + gradient legend + textual top-6). The per-day
  `#muscleMap` is unchanged (it's "what you train today", a different thing).
- CSV history importer: `js/store/import-history.js` —
  `parseHistoryCSV(text,{year})` (pure: `;`-delimited, quote-aware,
  protects decimal commas before splitting multi-weight blocks, drop-set
  `-`→`/`, reps capped ≤50, dates `D.M` with months 11–12 → year-1) and
  `seedHistoricalData(text,{year})` (idempotent: deterministic
  `wimp-<date>` / `simp-<date>-<exId>` ids + dedupe by date|exerciseId;
  merges v6 sessions/workouts into `Store.data`). Exercises are resolved by
  case-insensitive NAME (reuse) else created with a stable `slugify` id +
  inferred group — NOT mapped to catalog ids (no reliable mapping; that
  would corrupt analytics). Duplicate CSV names get a "(n)" suffix.
  Unparseable cells are skipped & reported, never invented. Wired in
  Settings → Datos → "Importar mi histórico (CSV)" (backup-first nudge,
  confirm, summary alert).
- Análisis refactor (minimalista): insights engine + stalled list REMOVED
  from the view (kept in code, just not rendered). Top of `#tab-analisis`
  is now `#anKpis`: 3 subtle KPI cards (Top progresión = max +Δ est-1RM in
  30 d via `bestEstimated1RM`; Consistencia = distinct training dates this
  month; Enfoque = `FOCUS_MUSCLES` group with least 30-day muscle volume).
  Adherence grid retitled "Frecuencia de entrenamiento" + `.hm-legend`.
  Muscle-heatmap window widened 7→30 d. **Heatmap mapping bug fixed**:
  `muscle-load.js` adds `foldName()` + `NAME_BIOMECH` (CSV display-name →
  EXERCISE_MUSCLES id) + `resolveBiomech()` (id → name-alias → group
  fallback, NEVER a Glúteos default) and `console.warn`s orphan exercises.
  All 25 imported CSV exercises now resolve (0 orphans; bench→Pecho).
- Pre-gym hardening audit (closed): (1) **PWA no longer cache-traps** —
  sw.js: HTML/nav = network-first, JS/CSS = stale-while-revalidate, `sw.js`
  itself never intercepted; pwa.js toasts "nueva versión — recarga" on
  update. (2) **No blank-seed-over-data** — `loadStateAsync` returns
  `{data,safeToSave}`; `Store.load` only `save()`s when not a fallback seed
  after a read error (protects imported history from iOS IDB eviction).
  (3) **Session ids monotonic** (`_sessionSeq`, no same-ms collision) +
  `clearTimeout(persistT)` in toggleDone/removeRow (no stale debounced
  persist). (4) **RestTimer is wall-clock** (`endAt` timestamp; survives
  screen-lock between sets; `_finishTO` cleared = no ghost timer) +
  visibilitychange re-tick. (5) **"Cambiar ej." is transient** — module
  `extraItems` (cleared on finish/cancel/new workout); the routine TEMPLATE
  is never polluted. (6) Meso guards in `homeOpenRutina`/`promptNewDay`.

### Migration history

The schema went through 6 versions. `migrations.js` handles v2/v3/v4/v5→v6
on load, idempotently. The biggest jump was v5→v6 where `session.weight` +
`session.reps[]` became `session.sets[]` (each set with its own
weight/reps/rpe/warmup). See `migrateOldSession()` in seed.js.

---

## Phases completed

The work was done in phases, each verified with ad-hoc node tests
(124+ passing assertions total). Phases:

- **A** — Modular folder structure (1 monolithic HTML → 50 modular files)
- **B** — Pure analytics extracted from Store (delegate pattern)
- **C** — `h()` helper + UI components (HistoryChip, StatsCard, RoutineButton)
- **D** — Event bus on Store (on/off/emit) + IndexedDB via Dexie
- **E** — Workout model (start/finish/readiness/summary) with summarize analytics
- **F** — Insights engine (8 rules) + PWA real (service worker, manifest, icon)
- **G** — Animations (view transitions, fade, streak banner), confetti at PRs, hápticas
- **H** — v5→v6 migration to `sets[]` model; refactor all analytics; set-by-set form
  in routine view; bigger reorder arrows; home in sections; default day fix;
  empty seed by default with demo opt-in
- **I** — Active workout dedicated view (`views/active-workout.js` + `styles/active.css`):
  full-screen player, swipe carousel between exercises, per-set ✓ check with
  incremental persist, big rest timer (RestTimer subscriber mirror), next-exercise
  preview, auto-enter on "Iniciar" (#9), re-open from header chip / on reload

---

## User's open backlog (9-item review)

| # | Topic | Status | Notes |
|---|-------|--------|-------|
| 1 | Series with different weights | **Done (Fase H)** | sets[] model |
| 2 | Readiness → insights/correlations | Pending | needs `readiness-correlations.js` and 4 new insight rules |
| 3 | Calendar with DailyScore | Pending | composite score formula proposed; replace heatmap |
| 4 | Active workout dedicated view | **Done (Fase I)** | full-screen player: swipe carousel, per-set ✓ check, big timer, next preview |
| 5 | Day assignment UX (editor sections) | Partial | default fixed (item.days = [first routine day]); section-by-day editor still flat |
| 6 | Home redesign (priority bands) | **Done** | hero + days + other routines sections |
| 7 | Day chips responsive | **Done** | grid 7-col |
| 8 | Exercise order without duplicates | **Done** | auto-assigned by position; stepper removed from card |
| 9 | Auto-enter active workout | **Done (Fase I)** | "Iniciar" → readiness → player; chip / reload re-opens it |

Remaining work maps to Fase J (#2 readiness correlations, #3 daily-score
calendar, polish) plus #5 (per-day editor sections, still flat).

---

## Conventions

- **Modules**: static imports for the dependency graph. Dynamic `import()`
  is used in two places to break a home↔settings circular dep — those are
  the only acceptable cases.
- **`h()` over innerHTML**: new components and migrated views use `h()`.
  Some modals still use innerHTML (settings editor, history edit modal,
  readiness, plate calc, rest editor). Those should be migrated component
  by component when touched.
- **Pure analytics**: functions in `/js/analytics/` take `(sessions, byId)`-style
  params, never touch `Store` directly. This makes them testable in Node and
  reusable from any future view.
- **Store events emitted on every mutation**: views currently still call
  `App.refreshAll()` explicitly. The auto-wire `Store.on('change', refresh)`
  was deliberately deferred to avoid double repaints during mutations that
  emit multiple events (e.g., `addSession` after `removeSessionFor`).
- **All user-provided strings escape via `escapeH()`** before going into
  innerHTML templates.
- **Tests**: ad-hoc Node scripts piped to stdout. No formal runner. See
  any of the `tmp/test-*.mjs` patterns in the chat history for reference.

---

## How to run

```bash
# Local dev
./start.command       # opens Safari on http://localhost:8080

# Deploy
# Drag the GYM folder to https://app.netlify.com/drop

# Quick file-level checks
node --check js/main.js        # syntax check
grep -rn "TODO" js/            # outstanding markers
```

---

## How to continue in a new conversation

### Option A: Claude Code (recommended for this scale)

Install once: see https://docs.claude.com/en/docs/claude-code
Then:

```bash
cd ~/Documents/Claude/Projects/GYM
claude
```

First message in the new chat:

> Read CLAUDE.md to see the full project state, architecture and pending
> work. Then continue with [whatever is next]. The user's preferred
> language is Spanish.

### Option B: New Cowork conversation

Open a fresh Cowork session and start with:

> I have a project at ~/Documents/Claude/Projects/GYM. Please read
> CLAUDE.md in that folder first to understand the architecture and
> pending work, then we continue. Respond in Spanish.

Either way, this document plus the chat-derived test patterns let you
pick up the work without losing context.

---

## Last user-visible state at handover

- Clean-slate seed: `seedData()` now creates ONE mesociclo and NOTHING else
  — 0 routines, 0 library exercises, 0 sessions. User builds their real
  routine from scratch (Home → "+ Crear primer día") and adds exercises from
  the catalog. "Restablecer todo a estado inicial" yields this same blank
  state. (Old defaults were `DEFAULT_LIBRARY`/`DEFAULT_ROUTINES`, now removed.)
- Demo data still works: `DEMO_LIBRARY` (the old 16-exercise list) lives in
  seed.js and `Store.loadDemoData()` merges any missing demo exercises before
  injecting the demo session history, so the chart-preview button is intact.
- Demo data available via Settings → Datos → "Cargar datos de demo".
- Home shows current rutina's days clearly separated from other rutinas.
- Two distinct buttons: "+ Nuevo día" and "+ Nueva rutina".
- Reorder arrows in the routine editor are 32×28 px, hover state, drag-friendly.
- "✎ editar" link in routine head goes straight to the editor.
- Routine editor → "+ Añadir ejercicio" opens the catalog picker: search by
  name (accent-insensitive), single-select chips to filter by `grupo_muscular`
  and `equipamiento`. Picking one materializes it into the library (dedupe by
  stable catalog id, group normalized to GROUPS) and adds it to the routine
  with the catalog's recommended sets/reps. Custom (non-catalog) library
  exercises still appear in the list too.
- "▶ Iniciar entrenamiento" → readiness modal → enters the full-screen
  active-workout player (Fase I). Swipe (or chevrons/dots) between exercises,
  tap ✓ to log each set (auto-saves + auto-starts big rest timer), "Cancelar"
  / "Terminar" in the top bar, "⌄" minimizes back to the app (workout keeps
  running; the pulsing "entrenando" header chip re-opens it; a mid-workout
  reload also re-opens it).
- Active-workout player polish (Fase I+): set rows redesigned (single aligned
  column header, no overlapping floating labels, circular ✓ action button with
  `.is-completed` pop animation that disables that row's inputs); KG autofill
  (typing weight on a set with no history propagates to later untouched sets);
  footer "⇄ Cambiar ej." opens an in-overlay sheet to jump to another routine
  exercise or insert one from the catalog on the fly (`rebuildPages()`).
  `resetWorkoutSession()` (RestTimer.stop + closeActiveWorkout) kills the
  "ghost timer" bug on finish/cancel; minimize (⌄) still keeps rest running.
- `Store.itemsForDate()`: if the viewed date's weekday is NOT one of the
  routine's `days`, it returns ALL the routine's items (no per-item sub-day
  filtering). Rationale: opening "Lunes" on a Sunday to train anyway must
  still show the workout. Per-item day filtering only applies when the date
  actually falls on one of the routine's assigned weekdays. This drives the
  routine view, the muscle map, and the active-workout player consistently.

If the user reports a UX issue, it most likely relates to pending items
#2, #3 or #5 above — see backlog table.
