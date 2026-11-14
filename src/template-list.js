/**
 * Draws the landing screen's template rows and downloads each template's
 * diagram, with the share received drawn as a bar along the bottom of its
 * row.
 *
 * Each row's `data-download` holds `loading`, `done` or `failed`, and its
 * `--progress` the share received, from 0 to 1.
 */

import { TEMPLATES, summaryCounts, templatePath, templateTitle } from './templates.js';
import { formatCount } from './entity-types.js';
import { downloadText } from './template-download.js';
import { icon } from './icons.js';
import { $ } from './dom.js';

const downloads = new Map();

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

function rowTitle(template, state) {
  if (state === 'failed') {
    return 'The ' + templateTitle(template) + ' diagram could not be downloaded. Click to try again.';
  }

  return 'Load the ' + templateTitle(template) + ' content model';
}

function templateRow(template, index) {
  const row = element('button', 'template-row');
  row.type = 'button';
  row.id = 'template-' + template.id;
  row.dataset.template = template.id;
  row.title = rowTitle(template, 'loading');

  // The digit keys 1 to 9 load the templates in order.
  if (index < 9) {
    row.dataset.shortcut = String(index + 1);
  }

  const mark = element('span', 'template-row__mark');
  mark.style.setProperty('--template-color', template.color);
  mark.innerHTML = icon(template.icon);

  const head = element('span', 'template-row__head');
  head.append(element('span', 'template-row__name', template.label), element('span', 'template-row__badge', template.version));

  const counts = summaryCounts(template).map(({ type, count }) => formatCount(type, count));
  const body = element('span', 'template-row__body');
  body.append(head, element('span', 'template-row__summary', template.summary), element('span', 'template-row__counts', counts.join(' · ')));

  const go = element('span', 'template-row__go');
  go.innerHTML = icon('chevron-right');

  const progress = element('span', 'template-row__progress');
  progress.style.setProperty('--template-color', template.color);
  progress.setAttribute('aria-hidden', 'true');

  row.append(mark, body, go, progress);

  return row;
}

function showDownload(template, state, share) {
  const row = $('template-' + template.id);

  if (!row) {
    return;
  }

  row.dataset.download = state;
  row.title = rowTitle(template, state);
  row.style.setProperty('--progress', String(share));
  if (state === 'loading') {
    row.setAttribute('aria-busy', 'true');
  } else {
    row.removeAttribute('aria-busy');
  }
}

/**
 * Returns the text of a template's diagram, downloading it on the first call
 * and again on the call after a failed download.
 */
export function templateText(template, priority = 'auto') {
  const pending = downloads.get(template.id);

  if (pending) {
    return pending;
  }

  showDownload(template, 'loading', 0);

  const download = downloadText(templatePath(template), {
    size: template.size,
    priority,
    onProgress: (share) => showDownload(template, 'loading', share),
  }).then(
    (text) => {
      showDownload(template, 'done', 1);
      return text;
    },
    (error) => {
      downloads.delete(template.id);
      showDownload(template, 'failed', 1);
      throw error;
    },
  );

  downloads.set(template.id, download);

  return download;
}

/**
 * Finds the template a row of the list draws.
 */
export function rowTemplate(row) {
  return TEMPLATES.find((template) => template.id === row.dataset.template);
}

/**
 * Draws a row per template.
 */
export function drawTemplateList() {
  $('template-list').replaceChildren(...TEMPLATES.map(templateRow));
}

/**
 * Starts downloading every diagram that isn't downloaded or downloading, at
 * low priority, so the app's own files load first.
 */
export function downloadTemplates() {
  for (const template of TEMPLATES) {
    // A failed download marks its row, and a click on it downloads again.
    templateText(template, 'low').catch(() => {});
  }
}
