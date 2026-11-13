/**
 * The Copy link dialog.
 *
 * It shows the link to the open diagram and copies it, or, when the link
 * would be longer than MAX_LINK_LENGTH, says so and offers the diagram as a
 * .nexus.json file instead.
 */

import { MAX_LINK_LENGTH } from './doc-link.js';
import { $ } from './dom.js';

const PRIVACY = 'The diagram travels inside the link, so opening it sends nothing to a server.';

const TOO_LONG_ADVICE = 'Save it as a .nexus.json file and share the file instead.';

// Called by the Save .nexus.json button for the link the dialog shows.
let saveFile = null;

function showState(text, link) {
  $('link-text').textContent = text;
  $('link-url').value = link || '';
  $('link-url').hidden = !link;
  $('link-copy').hidden = !link;
  $('link-save').hidden = !!link;
}

// The clipboard is unavailable outside a secure context and can be blocked,
// so the link is selected instead for the user to copy.
async function copy(link) {
  try {
    await navigator.clipboard.writeText(link);
    showState('Copied a link to this diagram. ' + PRIVACY, link);
  } catch {
    showState('Copy the link below. ' + PRIVACY, link);
    await $('link-url').updateComplete;
    $('link-url').select();
  }
}

/**
 * Opens the dialog for a link and copies it.
 *
 * `save` saves the diagram as a .nexus.json file, offered when the link is
 * too long to hand out.
 */
export function showLinkDialog(link, save) {
  const dialog = $('link-dialog');

  saveFile = save;

  if (link.length > MAX_LINK_LENGTH) {
    const length = link.length.toLocaleString('en');
    const limit = MAX_LINK_LENGTH.toLocaleString('en');

    showState('This diagram makes a link of ' + length + ' characters, longer than the ' + limit + ' a link can hold. ' + TOO_LONG_ADVICE);
    dialog.show();
    return;
  }

  showState('Copying the link…', link);
  dialog.show();
  copy(link);
}

/**
 * Wires the dialog's buttons.
 */
export function initLinkDialog() {
  const dialog = $('link-dialog');

  $('link-close').addEventListener('click', () => dialog.hide());
  $('link-copy').addEventListener('click', () => copy($('link-url').value));
  $('link-save').addEventListener('click', () => {
    saveFile();
    dialog.hide();
  });
}
