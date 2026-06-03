/**
 * Entry point. Carga `App`, arranca cuando el DOM esté listo y registra
 * el service worker para soporte offline (Fase F).
 *
 * `window.App` queda expuesto para depuración manual desde DevTools.
 */

import { App } from './app.js';
import { registerServiceWorker } from './services/pwa.js';

document.addEventListener('DOMContentLoaded', () => App.init());
registerServiceWorker();

window.App = App;
