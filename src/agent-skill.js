/**
 * The text the Create with AI dialog offers: the prompt and the install
 * command that point an AI agent at the create-nexus-diagram skill, and the
 * reading of the document the agent writes back.
 */

export const SKILL_NAME = 'create-nexus-diagram';

export const SKILL_PATH = 'skills/' + SKILL_NAME + '/SKILL.md';

// The first fenced code block, with or without a language tag.
const CODE_FENCE = /```[\w-]*[^\S\n]*\n([\s\S]*?)\n[^\S\n]*```/;

/**
 * Returns the URL the skill is served from, resolved against a base URL such
 * as the page's.
 */
export function skillUrl(base) {
  return new URL(SKILL_PATH, base).href;
}

/**
 * Returns a prompt that tells an agent able to read web pages to follow the
 * skill at the given URL.
 */
export function agentPrompt(url) {
  return [
    'Read the Nexus skill at ' + url + ' and follow it to write a Nexus diagram document (.nexus.json) of the Drupal content model below.',
    "If you can't save files, reply with the whole document in a single JSON code block.",
    '',
    '<Describe the content model here, or attach a screenshot, spreadsheet or spec.>',
  ].join('\n');
}

/**
 * Returns a shell command that downloads the skill from the given URL into
 * the project's Claude Code skills folder.
 */
export function installCommand(url) {
  return 'curl -sSL --create-dirs -o .claude/skills/' + SKILL_NAME + '/SKILL.md ' + url;
}

/**
 * Parses a document pasted from an agent's reply.
 *
 * The reply may wrap the JSON in a Markdown code fence, so the first fenced
 * block is read when there is one. Throws an Error that says what is wrong
 * when nothing is pasted or the text is not JSON.
 */
export function pastedDocument(text) {
  const trimmed = String(text ?? '').trim();

  if (!trimmed) {
    throw new Error('Paste the document the agent wrote first.');
  }

  const fenced = trimmed.match(CODE_FENCE);

  try {
    return JSON.parse(fenced ? fenced[1] : trimmed);
  } catch (e) {
    throw new Error("That isn't valid JSON: " + e.message);
  }
}
