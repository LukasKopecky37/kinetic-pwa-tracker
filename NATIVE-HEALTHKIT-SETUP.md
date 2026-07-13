# App nativa (Capacitor) + HealthKit — guía de configuración

Esto envuelve la MISMA web app (`/app`) en un contenedor iOS nativo para poder
leer las **kilocalorías activas reales del Apple Watch** vía HealthKit. La PWA
web sigue funcionando igual (con entrada manual de kcal); el contenedor nativo
es un segundo modo de ejecutar la app que además desbloquea HealthKit automático.

> El código ya está listo (servicio `health.js`, integración en el cierre de
> rutina, resumen y analíticas). Estos pasos son los que se ejecutan en tu Mac
> con Xcode — aquí no puedo compilar ni probar en un iPhone.

## Requisitos previos
- Un **Mac con Xcode** instalado (App Store).
- **Node.js** instalado (https://nodejs.org, versión LTS).
- Un **iPhone real con Apple Watch** emparejado (HealthKit **no** da datos en el simulador).
- Cuenta de Apple Developer (puedes usar tu equipo `2ZXL49N2NN`).

## Pasos (en la carpeta del proyecto: `~/Documents/Claude/Projects/GYM`)

```bash
# 1. Instala dependencias (Capacitor + HealthKit + web-push)
npm install

# 2. Genera el proyecto nativo iOS (usa el capacitor.config.json ya incluido)
npx cap add ios

# 3. Copia la web (/app) al proyecto nativo e instala el pod de HealthKit
npx cap sync ios

# 4. Abre el proyecto en Xcode
npx cap open ios
```

## En Xcode (una sola vez)

1. **Signing & Capabilities** (selecciona el target `App`):
   - *Team*: tu equipo Apple Developer (`2ZXL49N2NN`).
   - *Bundle Identifier*: `com.lukaskopecky.kinetic`.
   - Pulsa **+ Capability** → añade **HealthKit**.

2. **Info.plist** (target `App` → pestaña Info, o `ios/App/App/Info.plist`):
   Añade esta clave (descripción que verá el usuario al pedir permiso):

   ```xml
   <key>NSHealthShareUsageDescription</key>
   <string>Kinetic lee tu energía activa del Apple Watch para mostrar las kcal quemadas en cada entrenamiento.</string>
   ```

3. Conecta el iPhone por cable, selecciónalo arriba como destino y pulsa **▶ Run**.
   La primera vez, iOS mostrará la hoja de permisos de **Salud** → activa
   *Energía activa* y acepta.

## Probarlo

1. Con el iPhone puesto y el **Apple Watch en la muñeca**, haz un entrenamiento
   real en la app (Iniciar → sets → **Terminar**).
2. En el **Resumen** verás **🔥 XXX kcal** leído de la ventana exacta del entreno.
3. En **Análisis** aparece la tarjeta de energía activa (kcal 7 / 30 días).

> Para que haya kcal, el Watch tiene que haber registrado *Energía activa*
> durante la ventana del entreno (llévalo puesto y muévete). Si no hay datos o
> deniegas el permiso, la fila del resumen ofrece **＋ Añadir kcal** a mano.

## Cada vez que cambie la web

Tras un `git pull` o cambios en `/app`, vuelve a copiar la web al nativo:

```bash
npx cap copy ios     # (o `npx cap sync ios` si cambian plugins/deps)
```

## Notas honestas
- **Solo iPhone real.** HealthKit no devuelve datos en el simulador.
- El valor de `activeEnergyBurned` del plugin viene en **kcal**; si en tus
  pruebas ves una unidad rara, dímelo y ajusto la conversión en `health.js`.
- Las notificaciones push (`/api/*` en Vercel) NO funcionan dentro del
  contenedor nativo (usan el origen web); el temporizador de descanso en primer
  plano sí. Es independiente de HealthKit.
- El plugin usado es `capacitor-health` (compatible con Capacitor 8), accedido
  en runtime por `window.Capacitor.Plugins.Health` (sin bundler, respetando el
  "cero build step" de la web). Todo el HealthKit vive en `app/js/services/health.js`.
