/**
 * Draws the landing screen before the diagram libraries and the app load.
 *
 * Runs from the document head, ahead of the deferred vendor scripts, and
 * imports only small modules and the Shoelace button the card shows. It draws
 * the landing's icons, the version and the template rows, starts downloading
 * the template diagrams and then sets `data-drawn` on the landing, which
 * shows the card in its final layout.
 *
 * index.html preloads each of its own modules, so they download together
 * rather than 1 import level at a time.
 */

import '../assets/vendor/shoelace/components/button/button.js';
import { initIcons } from './icons.js';
import { VERSION } from './version.js';
import { drawTemplateList } from './template-list.js';
import { $ } from './dom.js';

const landing = $('landing');

document.querySelectorAll('[data-version]').forEach((el) => {
  el.textContent = VERSION;
});

initIcons(landing);
drawTemplateList();
landing.toggleAttribute('data-drawn', true);
