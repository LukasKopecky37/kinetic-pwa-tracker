/**
 * tips-modal.js — editor de "Notas técnicas permanentes" de un ejercicio.
 *
 * Escribe a `exercise.tips` (en `data.exercises[]`, NO en el log de la
 * sesión). Persistencia automática al cerrar (estilo Apple Notes: no hay
 * "cancelar"). Compartido por el player activo (botón TIPS) y por la vista
 * de Progreso / Biblioteca, para que las notas se lean y editen desde
 * cualquier sitio, no solo durante el entreno.
 *
 * @param {{id:string, name:string, tips?:string}} exercise
 * @param {() => void} [onSaved] callback tras guardar (refresca indicadores).
 */
import { $ } from '../utils/dom.js';
import { escapeH } from '../utils/format.js';
import { openModal, closeModal } from './modal.js';
import { toast } from './toast.js';
import { Store } from '../store/store.js';

export function openTipsModal(exercise, onSaved) {
  const initial = exercise.tips || '';
  openModal(
    '<div class="modal-head">' +
      '<div>' +
        '<h3>Notas técnicas</h3>' +
        '<div class="tips-sub">' + escapeH(exercise.name) + '</div>' +
      '</div>' +
      '<button class="x" id="tipsClose" type="button" aria-label="Guardar y cerrar">×</button>' +
    '</div>' +
    '<div class="modal-body">' +
      '<p class="tips-hint">' +
        'Información <b>permanente</b> del ejercicio · se mostrará en todas las ' +
        'sesiones futuras. Ideal para configuraciones de máquina, claves técnicas ' +
        'o recordatorios de foco.' +
      '</p>' +
      '<textarea id="tipsText" class="tips-textarea" rows="7" ' +
        'placeholder="Ej. Ajustar el banco en la posición 3 · Mantener los codos cerrados · Foco en la fase excéntrica…" ' +
        'autocapitalize="sentences" autocorrect="on" spellcheck="true">' +
        escapeH(initial) +
      '</textarea>' +
    '</div>' +
    '<div class="modal-foot">' +
      '<button class="btn" id="tipsSave" type="button">Listo</button>' +
    '</div>'
  );

  const ta = $('#tipsText');
  // Foco diferido — algunos navegadores no aceptan focus durante un layout
  // pendiente; 60 ms es suficiente para que el modal pinte completo.
  setTimeout(() => ta.focus(), 60);

  function saveAndClose() {
    const next = ta.value.trim();
    if (next !== (initial || '').trim()) {
      // Solo persistimos si cambió algo → evita un emit innecesario que
      // dispararía suscriptores del Store sin razón.
      Store.updateExercise(exercise.id, { tips: next });
      toast(next ? 'Notas guardadas' : 'Notas eliminadas');
    }
    closeModal();
    if (onSaved) onSaved();
  }

  $('#tipsClose').addEventListener('click', saveAndClose);
  $('#tipsSave').addEventListener('click', saveAndClose);
  // Cmd/Ctrl + Enter desde el textarea → guardar (atajo de power-user).
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      saveAndClose();
    }
  });
}
