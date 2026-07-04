/**
 * Floating panels: drag by the header, pin to a left/right dock, and close.
 *
 * A panel floats over the canvas by default and is dragged by its header. The
 * pin button docks it into the fixed rail on whichever side it is nearer; the
 * canvas shrinks so pinned panels never cover the graph. Unpinning floats it
 * again.
 */

const TOGGLES = {
  'entities-toggle': 'entities',
  'table-toggle': 'table',
  'legend-toggle': 'legend',
  'settings-toggle': 'settings',
};

const DEFAULT_POS = {
  entities: { left: 16, top: 16 },
  table: { right: 16, top: 16 },
  inspector: { right: 16, top: 16 },
  settings: { right: 16, top: 16 },
  legend: { right: 16, bottom: 16 },
};

const positioned = {};
let topZ = 5;

function $(id) {
  return document.getElementById(id);
}

function raise(panel) {
  if (!panel.classList.contains('is-docked')) {
    topZ += 1;
    panel.style.zIndex = topZ;
  }
}

function canvas() {
  return document.querySelector('.stage__canvas');
}

function resizeCanvas() {
  if (window.__nexus && window.__nexus.cy) {
    window.__nexus.cy.resize();
  }
}

function setToggle(panel) {
  const toggleId = panel.getAttribute('data-toggle');
  if (toggleId && $(toggleId)) {
    $(toggleId).classList.toggle('is-active', !panel.hidden);
  }
}

function placeDefault(panel) {
  const pos = DEFAULT_POS[panel.id] || { right: 16, top: 16 };
  panel.style.left = pos.left != null ? pos.left + 'px' : '';
  panel.style.right = pos.right != null ? pos.right + 'px' : '';
  panel.style.top = pos.top != null ? pos.top + 'px' : '';
  panel.style.bottom = pos.bottom != null ? pos.bottom + 'px' : '';
}

export function openPanel(id) {
  const panel = $(id);
  panel.hidden = false;
  if (!panel.classList.contains('is-docked') && !positioned[id]) {
    placeDefault(panel);
    positioned[id] = true;
  }
  raise(panel);
  setToggle(panel);
}

export function closePanel(id) {
  $(id).hidden = true;
  setToggle($(id));
}

function togglePanel(id) {
  if ($(id).hidden) {
    openPanel(id);
  }
  else {
    closePanel(id);
  }
}

function pin(panel) {
  const rect = panel.getBoundingClientRect();
  const area = canvas().getBoundingClientRect();
  const side = (rect.left + rect.width / 2) < (area.left + area.width / 2) ? 'dock-left' : 'dock-right';
  panel.classList.add('is-docked');
  panel.style.cssText = '';
  panel.hidden = false;
  $(side).appendChild(panel);
  resizeCanvas();
}

function unpin(panel) {
  panel.classList.remove('is-docked');
  canvas().appendChild(panel);
  placeDefault(panel);
  positioned[panel.id] = true;
  raise(panel);
  resizeCanvas();
}

function togglePin(panel) {
  if (panel.classList.contains('is-docked')) {
    unpin(panel);
  }
  else {
    pin(panel);
  }
}

function startDrag(panel, evt) {
  if (panel.classList.contains('is-docked')) {
    return;
  }
  const rect = panel.getBoundingClientRect();
  const area = canvas().getBoundingClientRect();
  const offsetX = evt.clientX - rect.left;
  const offsetY = evt.clientY - rect.top;

  function move(e) {
    panel.style.right = '';
    panel.style.bottom = '';
    panel.style.left = Math.max(0, e.clientX - area.left - offsetX) + 'px';
    panel.style.top = Math.max(0, e.clientY - area.top - offsetY) + 'px';
  }

  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    positioned[panel.id] = true;
  }

  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  evt.preventDefault();
}

export function initPanels() {
  Object.keys(TOGGLES).forEach((toggleId) => {
    if ($(toggleId)) {
      $(toggleId).addEventListener('click', () => togglePanel(TOGGLES[toggleId]));
    }
  });

  Array.prototype.forEach.call(document.querySelectorAll('.panel'), (panel) => {
    panel.addEventListener('mousedown', () => raise(panel));

    const head = panel.querySelector('.panel__head');
    if (head) {
      head.addEventListener('mousedown', (evt) => {
        if (evt.target.closest('button, input, select, a, code')) {
          return;
        }
        startDrag(panel, evt);
      });
    }

    const pinBtn = panel.querySelector('.panel__pin');
    if (pinBtn) {
      pinBtn.addEventListener('click', () => togglePin(panel));
    }

    const closeBtn = panel.querySelector('.panel__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closePanel(panel.id));
    }
  });
}
