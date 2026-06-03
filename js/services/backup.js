/**
 * Backup — export e import de los datos completos del Store como JSON.
 *
 * Validación mínima: el objeto importado debe tener un array `sessions`.
 * Si no, se rechaza.
 */

import { Store } from '../store/store.js';
import { todayISO } from '../utils/date.js';
import { toast } from './toast.js';

/** Descarga `rutina-backup-YYYY-MM-DD.json`. */
export function exportJSON() {
  const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rutina-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exportado');
}

/**
 * Importa un JSON. Pide confirmación porque sobrescribe TODO.
 * @param {File} file
 * @param {() => void} onSuccess  callback para refrescar la UI
 */
export function importJSON(file, onSuccess) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const obj = JSON.parse(ev.target.result);
      if (!obj.sessions || !Array.isArray(obj.sessions)) throw new Error('sin sesiones');
      if (!confirm('Esto reemplazará todos los datos actuales. ¿Continuar?')) return;
      Store.replaceData(obj);    // se ocupa de ensureFields, save y emit data:replaced
      toast('Importado');
      if (onSuccess) onSuccess();
    } catch (_) {
      toast('Archivo no válido', 'bad');
    }
  };
  reader.readAsText(file);
}
