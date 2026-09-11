# Kinetic — Contexto para desarrollar prompts

> **Cómo usar este archivo:** pégalo al **principio** de una conversación nueva
> con Claude (chat). Así Claude entiende mi app aunque **no pueda ver el código**.
> Su trabajo aquí es ayudarme a pensar features y a **redactar prompts claros**
> que luego llevo a **Claude Code** (que sí tiene el código) para que lo
> implemente, verifique y despliegue. En el chat NO se toca código: solo se
> razona, se propone y se afina el prompt.

---

## 1. Qué es la app

- **Kinetic** (antes "Rutina") es una **PWA premium de entrenamiento de fuerza**,
  estilo iOS. La uso yo, en el **gimnasio desde el iPhone**. Funciona **offline**
  y se instala en la pantalla de inicio como una app.
- Es de **uso personal**: no hay cuentas ni servidor de usuarios. **Todos los
  datos se guardan en el propio navegador del móvil** (nada en la nube).
- Autor: **Lukas**. Trabajo en **español**, soy **principiante con la terminal y
  git**, y me importa mucho que la app se vea y se sienta a **nivel de diseño
  Apple** (premium, pulida, minimalista).

## 2. Para qué sirve este documento

- Que Claude (chat) me ayude a: **idear features**, **afinar el diseño/UX**,
  **describir bugs**, y sobre todo **convertir una idea en un prompt bien
  definido**.
- El flujo real es: *idea → Claude chat me ayuda a redactar el prompt → pego el
  prompt en Claude Code → se implementa, se verifica y se despliega.*

## 3. Stack y LÍMITES (importante para no proponer imposibles)

- **Vanilla JavaScript** con **módulos ES nativos**. **Sin framework, sin
  bundler, sin paso de build, sin npm.** Cada archivo se puede leer y editar
  directamente.
- Datos: **IndexedDB** (via Dexie por CDN) + espejo en **localStorage**.
  Gráficos con **Chart.js** (por CDN).
- **PWA**: `manifest.json` + service worker con precache. Un solo `index.html`;
  módulos en `/js`; estilos en `/styles`.
- **Mobile-first**, el objetivo principal es **iOS Safari** (iPhone).
- Existe además un **envoltorio nativo opcional (Capacitor)** solo para leer las
  **kcal reales del Apple Watch** (HealthKit).

> ❌ **No proponer:** React/Vue/Svelte, instalar paquetes npm, un backend o base
> de datos propia, ni nada que necesite compilarse. ✅ **Sí encaja:** HTML/CSS/JS
> puro, componentes hechos a mano, mejoras de UX/visuales, lógica en módulos JS.

## 4. Vocabulario (la interfaz y el código usan palabras distintas)

La app tiene **2 niveles visibles**: una **Rutina** (el plan) que contiene
varios **Días** (entrenos).

| Yo digo (interfaz) | Qué es |
|---|---|
| **Rutina** | El plan completo (ej. "Hipertrofia 4 días"). Contiene días. |
| **Día** | Un entreno concreto (ej. "Día 1 · Lunes · Push"). Contiene ejercicios. |
| **Ejercicio** | Un movimiento (ej. Press banca), con sus series/rango/descanso. |
| **Serie** | Una serie de un ejercicio (peso × reps). |
| **Sesión / Entrenamiento** | Lo que registro un día al entrenar. |

## 5. Pantallas principales (pestañas de abajo)

- **Rutina** (inicio): mis rutinas y sus días; se navega hacia dentro (drill-down).
- **Historial**: lo que he registrado por ejercicio.
- **Progreso**: estadísticas + gráfico + sugerencia de peso + "chip de decisión"
  (subir/mantener/deload).
- **Análisis**: KPIs, **mapa de calor muscular**, duración de los entrenos,
  energía/ánimo previos, correlaciones.
- **Cuerpo**: peso corporal y medidas (grasa, cintura, brazos, etc.) en el tiempo.
- **Reproductor de entrenamiento** (pantalla completa): al pulsar "Iniciar" —
  carrusel de ejercicios, marcar cada serie con ✓, cronómetro de descanso grande.

## 6. Funciones que YA existen (para no reinventarlas)

- **Reproductor a pantalla completa**: swipe entre ejercicios, ✓ por serie
  (auto-guarda + arranca el descanso), timer de descanso grande, minimizar.
- **Series con pesos distintos**, ejercicios **unilaterales** ("manos separadas",
  registra cada lado), **peso corporal / lastre**, **bi-series (supersets)**.
- **Motor de auto-progresión**: decide **subir / mantener / deload** según reglas
  estrictas del rango de reps. Muestra un **chip de decisión** y un **"objetivo"**
  del día. La fila del reproductor **arranca con lo que hice de verdad la última
  vez** (el objetivo es una guía, no se guarda solo).
- **Ajustes por ejercicio**: descanso, rango de reps, incremento de carga, tipo
  (estándar / asistido / peso corporal).
- **Notas técnicas ("Tips")** por ejercicio.
- **Notificaciones de descanso** (Web Push, llegan con el móvil bloqueado).
- **Importar histórico desde CSV**.
- **Mapa de calor muscular** (qué músculos he trabajado).
- **Datos corporales** (peso, grasa, medidas) con gráficos.
- **Exportar / importar todos los datos a JSON** (copia de seguridad).
- **Datos de demo** para ver cómo quedan los gráficos sin entrenar semanas.
- **HealthKit nativo** (kcal del Apple Watch) via el envoltorio Capacitor (opcional).

## 7. Diseño / identidad visual

- **Oscuro tipo iOS**, glassmorphism, **acento naranja `#ff7a2f`**. Minimalista y
  premium. Referencias: **Strong, Hevy, Whoop, Apple Fitness** — pero **más
  minimalista**.
- Todo debe sentirse fluido y cuidado: animaciones sutiles, esquinas
  redondeadas concéntricas, buen espaciado, tipografía clara. Nada que parezca
  "barato" o de plantilla.

## 8. Dónde viven los datos (resumen del modelo)

Todo en un único objeto guardado localmente. A grandes rasgos:
`rutinas (mesos) → días (routines) → ejercicios (items) → biblioteca de
ejercicios`, más `sesiones` (lo registrado), `entrenamientos` (contenedor del
día), `medidas corporales`, y `ajustes`. No hay servidor: si borro los datos del
navegador, se pierden (por eso existe el export a JSON).

## 9. Despliegue (cómo llega un cambio al móvil)

- Se sube **solo a Vercel** al hacer `git push`, y a **Netlify** arrastrando la
  carpeta `~/Desktop/Kinetic-App-Netlify`.
- Para que un cambio se vea en el iPhone: se sube la **versión del service
  worker** y **cierro/abro la PWA** para que descargue lo nuevo.

---

## 10. Cómo redactar un buen prompt para Claude Code (plantilla)

Cuando tengamos clara la idea, ayúdame a rellenar esto:

```
PANTALLA / FUNCIÓN: (dónde ocurre — ej. reproductor de entrenamiento, pestaña Progreso)

PROBLEMA o IDEA: (qué pasa hoy vs. qué quiero)

COMPORTAMIENTO ESPERADO: (paso a paso, lo más concreto posible)

DISEÑO (si aplica): (cómo se ve / se siente; recuerda: oscuro iOS, acento naranja, premium)

RESTRICCIONES: (vanilla JS, sin build, mobile-first / iPhone; no romper lo que ya existe)
```

### Ejemplo de prompt bien hecho

> **Pantalla:** Ajustes por ejercicio (dentro del reproductor).
> **Idea:** En mancuernas de aislamiento (elevaciones laterales, etc.) el
> incremento de +2,5 kg cae en pesos imposibles (8 → 10,5). Quiero poder
> elegir el **incremento por ejercicio** (ej. +1 o +2 kg).
> **Comportamiento esperado:** en Ajustes del ejercicio, un selector de
> incremento (1 / 2 / 2,5 / 5 kg…). El "objetivo" del motor y el chip de
> decisión deben usar ese incremento, de modo que el peso sugerido caiga
> siempre en una mancuerna que existe.
> **Diseño:** un pill/selector coherente con el resto de Ajustes.
> **Restricciones:** vanilla JS, sin build, que no afecte a los pesos ya
> registrados.

---

## 11. Cómo trabajo (preferencias)

- **En español**, con explicaciones **claras y paso a paso** (soy principiante
  con terminal/git).
- Me importa el **pulido visual** y la **sensación premium** por encima de todo.
- Prefiero que las cosas se **verifiquen** antes de darlas por hechas, y avanzar
  **una cosa a la vez**.
- Si una idea tiene varias opciones de diseño, **propónmelas y espera** a que
  elija antes de "construir".
