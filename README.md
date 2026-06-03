# Kinetic PWA Tracker

> **Case Study:** Pushing the Frontiers of AI-Collaborative Software Engineering.

A vanilla-JS strength-training tracker built as an experiment in **human-in-the-loop development with foundational AI models**. The Product Owner role (architecture, UX, QA, methodology) is sustained by a human; AI assistants multiply implementation speed under strict direction.

**Live demo:** [eloquent-swan-d412d4.netlify.app](https://eloquent-swan-d412d4.netlify.app/)
**Case study landing:** root of this Vercel deployment

---

## What it is

A premium-feel iOS-style PWA for tracking strength workouts. Designed for use in the gym from an iPhone — offline-first, instalable, no server, no account, no telemetry. Data lives in IndexedDB on the user's device.

- **6 months** of real training data imported from an Apple Numbers spreadsheet (586 sessions)
- **Vanilla JS, zero dependencies** in runtime (only CDN-loaded Chart.js + Dexie)
- **No build step, no npm, no framework** — every file is human-readable
- **Modular ES modules** — 46 files, ~5,300 lines across analytics, store, services, components, views

---

## Architecture in one paragraph

A single shell HTML (`index.html`) loads ES modules from `/js/`. The Store layer (`js/store/`) wraps IndexedDB via Dexie and mirrors to localStorage for resilience. Pure analytics (`js/analytics/`) take `(sessions, byId)` arguments and never touch state — they're testable in Node. Views (`js/views/`) compose presenters using a tiny `h()` virtual-DOM helper. Side effects (audio, vibration, modals, service worker) live in `js/services/`. A network-first service worker with `stale-while-revalidate` for assets makes the PWA installable and deploy-safe.

```
js/
├── main.js              entry, registers service worker
├── app.js               orchestrator (tab nav, home↔routine, header)
├── constants.js
├── utils/               $, h(), date, format helpers
├── store/               persistence, CRUD, migrations, event bus
├── analytics/           PURE functions: 1RM, volume, PR, stagnation, streak…
├── services/            DOM, audio, vibration, rest-timer, plate-calc, PWA
├── charts/              Chart.js wrappers
├── components/          UI primitives based on h()
└── views/               high-level compositions
```

The complete handover document (architecture, decisions, pending work) is in [`CLAUDE.md`](./CLAUDE.md).

---

## Key technical decisions

| Decision | Rationale |
|---|---|
| **Vanilla JS + ES modules** | Maximum portability. Any file readable/editable directly, no toolchain to break. |
| **IndexedDB via Dexie + localStorage mirror** | Offline-first with iOS storage-eviction resilience. |
| **Network-first SW for HTML, stale-while-revalidate for assets** | Solves the classic PWA "deploy trap" — new versions reach installed apps. |
| **Wall-clock rest timer** (`endAt` timestamp) | Survives iOS screen-lock between sets, where `setInterval`-as-counter fails. |
| **Strict double-progression rule** | Only bump weight if all top-range sets are completed; never auto-decrease. |
| **Apple-style adherence heatmap** | Levels by distinct exercises, 12 weeks aligned to Monday, opacity-graded cells. |

---

## Human-in-the-loop QA

Documented cases where I overrode the AI's first proposal because the generated logic was methodologically wrong or visually crude — see the [case study landing page](./portfolio-presentation.html) for the full write-up with code excerpts.

---

## Run locally

```bash
./start.command       # Ruby or Python fallback static server, opens Safari
```

Or any static server: `python3 -m http.server 8080` from the repo root.

---

## Credits

**Designed & Orchestrated by Lukas Kopecky** · Built in collaboration with **Claude Agent**.
