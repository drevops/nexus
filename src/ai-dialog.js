/**
 * The Create with AI dialog.
 *
 * It hands the create-nexus-diagram skill to an AI agent in 3 ways - a prompt
 * that links the skill, the whole skill and a command that installs it - and
 * opens the document the agent writes back when it is pasted in.
 */

import { SKILL_PATH, agentPrompt, installCommand, pastedDocument, skillUrl } from './agent-skill.js';
import { $ } from './dom.js';

const LABEL_RESET_MS = 2000;

// The pending or finished download of the skill, or null before the first
// open and after a failed download, so the next open tries again.
let skillLoad = null;

const labelTimers = new WeakMap();

function showError(message) {
  $('ai-error-text').textContent = message;
  $('ai-error').open = !!message;
}

function loadSkill(url) {
  if (skillLoad) {
    return;
  }

  const block = $('ai-skill');

  skillLoad = fetch(SKILL_PATH)
    .then((response) => {
      if (!response.ok) {
        throw new Error(response.status);
      }

      return response.text();
    })
    .then((text) => {
      block.textContent = text;
      $('ai-copy-skill').disabled = false;
    })
    .catch(() => {
      block.textContent = 'The skill could not be loaded. Download it, or open ' + url + ' in a new tab.';
      skillLoad = null;
    });
}

function flashLabel(button, text) {
  const label = button.querySelector('.ai__copy-label');

  label.dataset.label ??= label.textContent;
  label.textContent = text;
  clearTimeout(labelTimers.get(button));
  labelTimers.set(
    button,
    setTimeout(() => {
      label.textContent = label.dataset.label;
    }, LABEL_RESET_MS),
  );
}

// The clipboard is unavailable outside a secure context and can be blocked,
// so the text is selected instead for the user to copy.
async function copy(button) {
  const block = $(button.dataset.copy);

  try {
    await navigator.clipboard.writeText(block.textContent);
    flashLabel(button, 'Copied');
  } catch {
    window.getSelection().selectAllChildren(block);
    flashLabel(button, 'Selected to copy');
  }
}

function openPasted(dialog, open) {
  showError('');

  try {
    open(pastedDocument($('ai-paste').value), 'Opened a diagram from an AI agent');
  } catch (e) {
    showError('Could not open that diagram: ' + e.message);
    $('ai-error').scrollIntoView({ block: 'nearest' });
    return;
  }

  $('ai-paste').value = '';
  dialog.hide();
}

/**
 * Wires the dialog to its toolbar and landing buttons.
 *
 * `open` takes a parsed document and the label of the first version in its
 * history, and throws when the document can't be drawn.
 */
export function initAiDialog(open) {
  const dialog = $('ai-dialog');
  const url = skillUrl(document.baseURI);

  $('ai-prompt').textContent = agentPrompt(url);
  $('ai-install').textContent = installCommand(url);

  for (const id of ['doc-ai', 'landing-ai']) {
    $(id).addEventListener('click', () => {
      showError('');
      dialog.show();
      loadSkill(url);
    });
  }

  for (const button of dialog.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', () => copy(button));
  }

  $('ai-close').addEventListener('click', () => dialog.hide());
  $('ai-open').addEventListener('click', () => openPasted(dialog, open));
}
