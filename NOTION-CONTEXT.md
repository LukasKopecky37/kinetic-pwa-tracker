# Kinetic (Rutina) — contexto para Claude Cowork vía Notion

> **Cómo usar esto:** pega esta página en tu Notion. Cuando abras una sesión
> de Claude Cowork sobre esta página (o le des acceso a ella), Claude
> entenderá el proyecto sin que tengas que re-explicarlo desde cero. Si esa
> sesión de Cowork llega a tener acceso al repositorio real
> (`~/Documents/Claude/Projects/GYM`), dile que **lea `CLAUDE.md` en la raíz
> del proyecto** — ese archivo es la fuente de verdad completa y siempre
> más al día que esta página; esto es solo el resumen de arranque.

---

## Qué es esto

**Kinetic** (el usuario lo llama "Rutina" al hablar) es una PWA de
entrenamiento de fuerza, de uso real: Lukas la usa en el gimnasio desde su
iPhone. No es un proyecto de juguete — hay meses de datos de entrenamiento
reales dependiendo de que funcione bien.

- **Dueño**: Lukas Kopecky (kopecky.lukas37@gmail.com). Principiante con
  terminal/git — explica los pasos, no asumas familiaridad.
- **Repo**: `github.com/LukasKopecky37/kinetic-pwa-tracker`
- **En este Mac**: `~/Documents/Claude/Projects/GYM`
- **App en vivo**: Netlify (manual) + Vercel (auto en cada push)
- También sirve como **pieza de portfolio** (case study de desarrollo
  humano+IA) — el `index.html` de la raíz del repo es esa landing page,
  SEPARADA de la app real (que vive en `app/`).

## Stack

Vanilla JS con módulos ES nativos. **Sin framework, sin bundler, sin paso
de build, sin npm** para la app en sí. IndexedDB (Dexie) + espejo en
localStorage. Chart.js para gráficos. PWA instalable con service worker.
El `package.json` de la raíz del repo existe solo para dos piezas
opcionales (backend de notificaciones Web Push, envoltorio nativo
Capacitor/HealthKit) — nunca para la app web.

## Arquitectura en una frase

Un único `index.html` (dentro de `app/`) carga módulos ES desde `/js/`.
`js/store/` envuelve IndexedDB y hace de fuente única de datos. `js/analytics/`
son funciones PURAS (sin tocar el DOM ni el Store) — el motor de
auto-progresión vive ahí. `js/views/` compone las pantallas. `js/services/`
son efectos secundarios (audio, vibración, red, service worker).

## Lo más importante — dos invariantes que nunca deben romperse

Estos dos bugs YA ocurrieron una vez cada uno con datos reales del usuario,
y ambos están corregidos. Cualquier cambio en el reproductor de
entrenamiento (`active-workout.js`) debe respetarlos:

1. **La fila muestra/guarda la realidad, nunca una suposición.** Arranca
   con lo que el usuario hizo de verdad la última vez (o, si el motor
   decidió genuinamente subir/bajar peso, con el nuevo objetivo ya
   merecido) — nunca con una sugerencia especulativa metida en un campo
   editable sin que el usuario la confirme activamente.
2. **Al marcar una serie (✓), se guarda EXACTAMENTE lo que hay en esa fila
   en ese momento.** Ya pasó que un campo "espejo" (pensado para el modo
   unilateral) se quedaba con un valor viejo y silenciosamente
   sobreescribía el peso que el usuario acababa de editar — la pantalla
   decía un número, el histórico guardaba otro. Cualquier campo que exista
   "por duplicado" (uno canónico + uno espejo) es sospechoso hasta que se
   demuestre que el espejo nunca puede mandar fuera de su propio modo.

## Qué construye la app (funciones principales)

- **Rutina → Días → Ejercicios**: jerarquía de 2 niveles visibles.
- **Reproductor de entrenamiento** a pantalla completa: carrusel de
  ejercicios, marcar cada serie, descanso con temporizador de reloj real
  (sobrevive al bloqueo de pantalla del iPhone).
- **Motor de auto-progresión**: decide subir/mantener/bajar peso con
  reglas estrictas (todas las series al tope del rango para subir;
  mayoría estricta por debajo del mínimo para bajar). Resuelve bien pesos
  mixtos dentro de la misma sesión. Soporta ejercicios estándar, asistidos
  (menos peso = progreso) y de peso corporal.
- **Series unilaterales** ("manos separadas"): registra cada lado por
  separado, exige que ambos lados cumplan el objetivo.
- **Bi-series (supersets)**: flujo intercalado A→B→descanso→A automático.
- **Notificaciones de descanso** por Web Push (llegan con el móvil
  bloqueado) vía un backend serverless en Vercel + Upstash QStash.
- **HealthKit real** (kcal del Apple Watch) vía un envoltorio nativo
  opcional con Capacitor — requiere cuenta de Apple Developer de pago.
- **Análisis**: mapa de calor muscular, duración de entrenamientos,
  correlación energía/ánimo↔PR, medidas corporales con gráficos.
- **Importador de histórico CSV**, exportación/importación completa a JSON.

## Convenciones de trabajo

- **Responde en español.**
- **Nunca pruebes nada sobre los datos reales del usuario** — reproduce
  los escenarios con datos sintéticos y verifica antes de afirmar que algo
  funciona (comparar lo que se ve en pantalla contra lo que realmente
  queda guardado, no asumir que coinciden).
- **Cada despliegue sube la versión (`CACHE_VERSION`) de `app/sw.js`** —
  si no, la PWA instalada sigue sirviendo el código viejo.
- **Pausa antes de subir a producción** (push a git / sincronizar
  Netlify) cualquier cambio que toque cómo se guardan los datos de
  entrenamiento — muestra el diff/lo verificado y espera el visto bueno.

## Dónde está todo lo demás

- `CLAUDE.md` (raíz del repo) — la documentación técnica completa y
  siempre actualizada: modelo de datos, reglas exactas del motor de
  progresión, historial de versiones, lista de pendientes.
- `.claude/agents/kinetic-expert.md` — un sub-agente de Claude Code ya
  cargado con todo este contexto, para cuando se trabaje en terminal.
- `CONTEXTO-CHAT.md` — versión para pegar en un chat de claude.ai sin
  acceso a código, pensada para ayudar a redactar prompts (no para
  Cowork — esta página cumple ese rol).
