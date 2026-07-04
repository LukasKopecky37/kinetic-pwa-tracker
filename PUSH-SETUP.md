# Notificaciones push del descanso — guía de configuración

Esto hace que la notificación de "descanso terminado" llegue **aunque tengas
el iPhone bloqueado** o la app en segundo plano. Solo hay que configurarlo
**una vez**.

Arquitectura: la app (PWA) → `/api/schedule` (función en Vercel) → **QStash**
(retardo preciso) → `/api/fire` → **Web Push** (VAPID) → APNs → tu iPhone.

> ⚠️ El push solo funciona en el despliegue de **Vercel** (el que tiene las
> funciones `/api`). En la versión de Netlify (estática) no hay backend.

---

## 1. Crear cuenta en Upstash y copiar el token de QStash

1. Entra en **https://upstash.com** → *Sign up* (gratis, puedes usar Google/GitHub).
2. En el panel, ve a **QStash** (menú lateral).
3. Copia el **`QSTASH_TOKEN`** (empieza por `eyJ...`). Es lo único que
   necesitamos de QStash.

Plan gratis de QStash: 500 mensajes/día — de sobra para entrenar.

---

## 2. Poner las variables de entorno en Vercel

En **https://vercel.com** → tu proyecto `kinetic-pwa-tracker` →
**Settings → Environment Variables**. Añade estas **5** (para *Production*):

| Nombre | Valor |
|---|---|
| `VAPID_PUBLIC`  | *(te lo paso yo — clave pública)* |
| `VAPID_PRIVATE` | *(te lo paso yo — clave privada, SECRETA)* |
| `VAPID_SUBJECT` | `mailto:kopecky.lukas37@gmail.com` |
| `QSTASH_TOKEN`  | *(el que copiaste en el paso 1)* |
| `PUSH_SECRET`   | *(te lo paso yo — secreto compartido)* |

> Estas tres claves (`VAPID_PRIVATE`, `PUSH_SECRET`, y el token) son **secretas**
> y por eso NO están en el repositorio. Pégalas solo en Vercel.

Guarda y pulsa **Redeploy** (Deployments → ⋯ → Redeploy) para que las
funciones cojan las variables.

---

## 3. Activar en el iPhone

1. Abre la app desde el **icono de la pantalla de inicio** (si no la tienes:
   ábrela en Safari → botón Compartir → *Añadir a pantalla de inicio*).
   En iOS las notificaciones push **solo** funcionan así, no desde Safari.
2. Dentro de la app: **Ajustes (⚙) → Notificaciones**.
3. Pulsa **Activar notificaciones** y acepta el permiso.
4. Pulsa **Enviar prueba** → debería llegarte una notificación en 1–2 s.
5. Prueba real: empieza un descanso, **bloquea el móvil** y espera. Debe
   sonar/vibrar al terminar.

---

## 4. Si algo no va

- **"No llegó la prueba"** con un código:
  - `(server not configured)` → faltan variables en Vercel (paso 2) o no
    hiciste Redeploy.
  - `(410)` → la suscripción caducó: pulsa *Activar notificaciones* otra vez.
- **No sale el permiso** → la app no está abierta desde el icono de inicio,
  o iOS < 16.4. Actualiza iOS.
- **La prueba llega pero el aviso del descanso no** → revisa que el
  `QSTASH_TOKEN` es correcto; en el panel de QStash → *Logs* verás si el
  mensaje se publicó y si el callback a `/api/fire` respondió 200.

---

## Notas técnicas

- Las claves VAPID se generaron con curva P-256 (el estándar de Web Push).
- `/api/fire` valida un `PUSH_SECRET` para que nadie ajeno a QStash pueda
  disparar pushes a tu dispositivo.
- Al pulsar *Saltar* o *±15* la app cancela/reprograma el mensaje en QStash
  (`/api/cancel` + nuevo `/api/schedule`).
- Si el backend no está configurado, la app sigue funcionando igual: el timer
  local avisa en primer plano; solo pierdes el aviso con la pantalla bloqueada.
