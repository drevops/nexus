/**
 * Preact prototype: the panel windowing system.
 *
 * The declarative counterpart to the vanilla assets/panels.js. All panel state
 * (open, docked side, floating position, stack order) lives in one reducer-ish
 * state object; the DOM is a pure function of it. Compare the imperative
 * class-toggling and appendChild juggling in the vanilla file against this.
 */

import { h } from 'preact';
import { useState, useRef, useCallback } from 'preact/hooks';
import htmBase from 'htm';
import { icon } from '../assets/icons.js';

const html = htmBase.bind(h);

const DEFAULT_POS = {
  entities: { left: 16, top: 16 },
  table: { right: 16, top: 16 },
  inspector: { right: 16, top: 16 },
  settings: { right: 16, top: 16 },
  legend: { right: 16, bottom: 16 },
};

let zCounter = 10;

export function usePanelManager(initialOpen = []) {
  const [panels, setPanels] = useState(() => {
    const state = {};
    Object.keys(DEFAULT_POS).forEach((id) => {
      state[id] = { open: initialOpen.includes(id), dock: null, pos: { ...DEFAULT_POS[id] }, z: 4 };
    });
    return state;
  });

  const patch = useCallback((id, next) => {
    setPanels((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));
  }, []);

  const open = useCallback((id) => { zCounter += 1; patch(id, { open: true, z: zCounter }); }, [patch]);
  const close = useCallback((id) => patch(id, { open: false }), [patch]);
  const toggle = useCallback((id) => setPanels((prev) => ({ ...prev, [id]: { ...prev[id], open: !prev[id].open } })), []);
  const focus = useCallback((id) => { zCounter += 1; patch(id, { z: zCounter }); }, [patch]);

  const togglePin = useCallback((id, el) => {
    setPanels((prev) => {
      const panel = prev[id];
      if (panel.dock) {
        return { ...prev, [id]: { ...panel, dock: null, pos: { ...DEFAULT_POS[id] } } };
      }
      const rect = el.getBoundingClientRect();
      const area = el.closest('.stage__canvas').getBoundingClientRect();
      const side = (rect.left + rect.width / 2) < (area.left + area.width / 2) ? 'left' : 'right';
      return { ...prev, [id]: { ...panel, dock: side } };
    });
  }, []);

  const startDrag = useCallback((id, evt, el) => {
    if (evt.target.closest('button, input, select, a, code')) {
      return;
    }
    const area = el.closest('.stage__canvas').getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const offsetX = evt.clientX - rect.left;
    const offsetY = evt.clientY - rect.top;

    function move(e) {
      patch(id, { pos: { left: Math.max(0, e.clientX - area.left - offsetX), top: Math.max(0, e.clientY - area.top - offsetY) } });
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    }

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    evt.preventDefault();
  }, [patch]);

  return { panels, api: { open, close, toggle, focus, togglePin, startDrag } };
}

function floatStyle(panel) {
  const p = panel.pos;
  return {
    left: p.left != null ? p.left + 'px' : '',
    top: p.top != null ? p.top + 'px' : '',
    right: p.right != null ? p.right + 'px' : '',
    bottom: p.bottom != null ? p.bottom + 'px' : '',
    zIndex: panel.z,
  };
}

export function Panel({ id, title, panel, wide, header, api, children }) {
  const ref = useRef(null);
  if (!panel.open) {
    return null;
  }

  const docked = !!panel.dock;
  const cls = 'panel' + (wide ? ' panel--wide' : '') + (docked ? ' is-docked' : '');
  const style = docked ? { zIndex: panel.z } : floatStyle(panel);

  return html`
    <section ref=${ref} class=${cls} style=${style} onMouseDown=${() => api.focus(id)}>
      <div class="panel__head" onMouseDown=${(e) => api.startDrag(id, e, ref.current)}>
        <span class="panel__title">${title}</span>
        ${header}
        <span class="panel__spacer"></span>
        <button class="panel__pin" type="button" title="Pin to side" aria-label="Pin" onClick=${() => api.togglePin(id, ref.current)} dangerouslySetInnerHTML=${{ __html: icon('pin') }}></button>
        <button class="panel__close" type="button" aria-label="Close" onClick=${() => api.close(id)} dangerouslySetInnerHTML=${{ __html: icon('x') }}></button>
      </div>
      <div class="panel__body">${children}</div>
    </section>`;
}
