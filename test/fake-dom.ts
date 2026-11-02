// A tiny fake DOM so screen code can run under node:test without a browser.
// It records attributes, children and listeners; tests read those back.

import type { Ctx } from '../client/ui/context.ts';

export class FakeNode {}

export class FakeText extends FakeNode {
  readonly text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }
}

export class FakeEl extends FakeNode {
  readonly tag: string;
  readonly ns: string | undefined;
  attrs: Record<string, string> = {};
  children: FakeNode[] = [];
  listeners: Record<string, () => unknown> = {};
  value = '';
  disabled = false;
  hidden = false;

  constructor(tag: string, ns?: string) {
    super();
    this.tag = tag;
    this.ns = ns;
  }

  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  addEventListener(type: string, fn: () => unknown): void {
    this.listeners[type] = fn;
  }
  append(...kids: FakeNode[]): void {
    this.children.push(...kids);
  }
  replaceChildren(...kids: FakeNode[]): void {
    this.children = kids;
  }

  get textContent(): string {
    return this.children
      .map((c) => (c instanceof FakeText ? c.text : c instanceof FakeEl ? c.textContent : ''))
      .join('');
  }
}

/** Swap in the fake document; returns a function that restores the real globals. */
export function installFakeDom(): () => void {
  const saved = { document: globalThis.document, Node: globalThis.Node };
  const fakeDocument = {
    createElement: (t: string) => new FakeEl(t),
    createElementNS: (ns: string, t: string) => new FakeEl(t, ns),
    createTextNode: (t: string) => new FakeText(t),
  };
  Object.assign(globalThis, { Node: FakeNode, document: fakeDocument });
  return () => {
    Object.assign(globalThis, saved);
  };
}

/** View a value created by the screen code as the fake element it really is. */
export const fake = (el: unknown): FakeEl => {
  if (!(el instanceof FakeEl)) throw new Error('not a fake element');
  return el;
};

/** A fresh fake element typed as a real one, for passing into screen code. */
export const fakeRoot = (): HTMLElement => new FakeEl('div') as unknown as HTMLElement;

/** Every element under (and including) `el`, depth first. */
export function walk(el: FakeEl, out: FakeEl[] = []): FakeEl[] {
  out.push(el);
  for (const c of el.children) if (c instanceof FakeEl) walk(c, out);
  return out;
}

/** The first element matching `pred`; fails the test when there is none. */
export function find(el: unknown, pred: (e: FakeEl) => boolean): FakeEl {
  const hit = walk(fake(el)).find(pred);
  if (!hit) throw new Error('element not found');
  return hit;
}

/** True when some element matches `pred`. */
export const has = (el: unknown, pred: (e: FakeEl) => boolean): boolean => walk(fake(el)).some(pred);

/** Run a recorded listener and wait for it if it is async. */
export async function fire(el: FakeEl, type = 'click'): Promise<void> {
  const fn = el.listeners[type];
  if (!fn) throw new Error(`no ${type} listener`);
  await fn();
}

/** A context with only the parts a test needs; the rest fail loudly if used. */
export function partialCtx(parts: Partial<Ctx>): Ctx {
  return new Proxy(parts, {
    get(target, key) {
      if (key in target) return target[key as keyof Ctx];
      throw new Error(`test context has no ${String(key)}`);
    },
  }) as Ctx;
}
