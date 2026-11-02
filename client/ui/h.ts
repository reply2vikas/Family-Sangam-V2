// Tiny DOM builder. It only ever creates text nodes and elements, never parses HTML,
// so user-supplied or AI-supplied text cannot become markup.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Anything that can be placed inside an element. null, undefined and false are skipped. */
export type Child = Node | string | number | boolean | null | undefined | readonly Child[];

/** Attributes and listeners. Keys starting with "on" whose value is a function become listeners. */
export type Props = Record<string, unknown>;

function applyProps(el: Element, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value == null) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as EventListener);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
}

function append(el: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * h('button', { class: 'primary', onclick: fn, 'aria-label': 'Go' }, 'Text', childNode)
 * true sets an empty attribute; false, null and undefined skip it.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

/** The same builder for SVG elements, created in the SVG namespace. */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

export function clear<E extends Element>(el: E): E {
  el.replaceChildren();
  return el;
}

/** A label and its input, linked by id. */
export function field(label: string, id: string, props: Props): [HTMLLabelElement, HTMLInputElement] {
  return [h('label', { for: id }, label), h('input', { id, ...props })];
}

/** An element the page must contain; a missing one is a programming error. */
export function byId<E extends HTMLElement = HTMLElement>(id: string): E {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as E;
}
