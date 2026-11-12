import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_NAME, SKILL_PATH, agentPrompt, installCommand, pastedDocument, skillUrl } from '../../src/agent-skill.js';

const ROOT = join(import.meta.dirname, '..', '..');
const URL = 'https://nexus.drevops.com/skills/create-nexus-diagram/SKILL.md';

test('points at the skill in the repository', () => {
  assert.ok(existsSync(join(ROOT, SKILL_PATH)));
  assert.match(readFileSync(join(ROOT, SKILL_PATH), 'utf8'), new RegExp('^---\\nname: ' + SKILL_NAME + '\\n'));
});

test('resolves the skill URL against the page', async (t) => {
  for (const [name, base, expected] of dataProviderSkillUrl()) {
    await t.test(name, () => {
      assert.equal(skillUrl(base), expected);
    });
  }
});

function dataProviderSkillUrl() {
  return [
    ['the site root', 'https://nexus.drevops.com/', URL],
    ['the page at the site root', 'https://nexus.drevops.com/index.html', URL],
    ['a page in a subfolder', 'https://example.github.io/nexus/index.html', 'https://example.github.io/nexus/skills/create-nexus-diagram/SKILL.md'],
    ['a local server', 'http://127.0.0.1:8000/index.html?x=1#y', 'http://127.0.0.1:8000/skills/create-nexus-diagram/SKILL.md'],
  ];
}

test('tells the agent to read the skill and how to reply without files', () => {
  const prompt = agentPrompt(URL);

  assert.ok(prompt.startsWith('Read the Nexus skill at ' + URL + ' '));
  assert.match(prompt, /\.nexus\.json/);
  assert.match(prompt, /single JSON code block/);
  assert.match(prompt, /\n\n<Describe the content model here[^\n]*>$/);
});

test('downloads the skill into the Claude Code skills folder', () => {
  assert.equal(installCommand(URL), 'curl -sSL --create-dirs -o .claude/skills/create-nexus-diagram/SKILL.md ' + URL);
});

test('reads a pasted document', async (t) => {
  for (const [name, text] of dataProviderPastedDocument()) {
    await t.test(name, () => {
      assert.deepEqual(pastedDocument(text), { nexus: 1, entities: [] });
    });
  }
});

function dataProviderPastedDocument() {
  const json = '{ "nexus": 1, "entities": [] }';

  return [
    ['plain JSON', json],
    ['JSON with blank lines around it', '\n\n  ' + json + '  \n'],
    ['a json code fence', '```json\n' + json + '\n```'],
    ['a code fence without a language', '```\n' + json + '\n```'],
    ['a code fence inside a reply', 'Here is the diagram:\n\n```json\n' + json + '\n```\n\nI assumed the tags are a vocabulary.'],
    ['an indented code fence', '  ```json\n  ' + json + '\n  ```'],
    ['the first of 2 code fences', '```json\n' + json + '\n```\n\n```bash\nnpm run check-diagram\n```'],
    ['a code fence with Windows line endings', '```json\r\n' + json + '\r\n```'],
  ];
}

test('says what is wrong with a paste it cannot read', async (t) => {
  for (const [name, text, expected] of dataProviderUnreadablePaste()) {
    await t.test(name, () => {
      assert.throws(() => pastedDocument(text), { message: expected });
    });
  }
});

function dataProviderUnreadablePaste() {
  return [
    ['nothing', '', /^Paste the document the agent wrote first\.$/],
    ['only white space', ' \n\t ', /^Paste the document the agent wrote first\.$/],
    ['null', null, /^Paste the document the agent wrote first\.$/],
    ['undefined', undefined, /^Paste the document the agent wrote first\.$/],
    ['prose', 'Sorry, I could not read the screenshot.', /^That isn't valid JSON: /],
    ['cut-off JSON', '{ "nexus": 1, "entities": [', /^That isn't valid JSON: /],
    ['a code fence holding cut-off JSON', '```json\n{ "nexus": 1\n```', /^That isn't valid JSON: /],
  ];
}
