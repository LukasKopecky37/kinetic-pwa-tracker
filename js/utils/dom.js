/**
 * Helpers de DOM.
 *
 * `h(tag, props, ...children)` crea un HTMLElement con sus props y listeners
 * en una sola expresión, igual que la `h` de Preact/htm pero sin dependencias.
 *
 * Props soportadas:
 *   - `class`        → element.className
 *   - `style`        → Object.assign(element.style, ...)
 *   - `dataset`      → Object.assign(element.dataset, ...)
 *   - `onClick`,
 *     `onInput`, …   → addEventListener (eventos en lowercase)
 *   - `html`         → innerHTML (escape hatch para SVG inline u otros frags)
 *   - cualquier otra → setAttribute
 * Valores `null`, `undefined` o `false` se ignoran (útil para condicionales).
 *
 * Children pueden ser:
 *   - HTMLElement / Node
 *   - string / number  → texto
 *   - array            → se aplanan recursivamente
 *   - null / undef / false → se ignoran
 */

export const $  = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => (root || document).querySelectorAll(sel);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);

  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') {
        el.className = v;
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else if (k === 'dataset' && typeof v === 'object') {
        Object.assign(el.dataset, v);
      } else if (k === 'html') {
        el.innerHTML = v;
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v === true) {
        // Atributos booleanos (disabled, autofocus, readonly…)
        el.setAttribute(k, '');
      } else {
        el.setAttribute(k, v);
      }
    }
  }

  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/**
 * Monta `content` dentro de `container`, reemplazando lo que hubiera antes.
 * Acepta un nodo, un array de nodos, o cualquier mezcla con null/false que se filtran.
 *
 * @param {HTMLElement} container
 * @param {Node | Array<Node|null|false>} content
 */
export function mount(container, content) {
  const arr = (Array.isArray(content) ? content : [content]).filter(x => x != null && x !== false);
  container.replaceChildren(...arr);
}
