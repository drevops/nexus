import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA, checkDiagram } from '../../scripts/lib/diagram-check.mjs';
import { documentToModel } from '../../src/document.js';
import { ENTITY_TYPES } from '../../src/entity-types.js';
import { baseFieldsForEntityType } from '../../src/base-fields.js';
import { FIELD_TYPES, KIND_CALCULATED, KIND_MULTI, KIND_SINGLE, KIND_SYSTEM } from '../../src/model.js';

const NAME = 'create-nexus-diagram';
const SKILL = readFileSync(join(import.meta.dirname, '..', '..', 'skills', NAME, 'SKILL.md'), 'utf8');

function frontmatter() {
  const block = SKILL.match(/^---\n([\s\S]*?)\n---\n/);

  assert.ok(block, 'SKILL.md has no frontmatter');

  return Object.fromEntries(block[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]));
}

// The first JSON code block, which holds the example document.
function example() {
  const block = SKILL.match(/```json\n(\{[\s\S]*?\n\})\n```/);

  assert.ok(block, 'SKILL.md has no example document');

  return JSON.parse(block[1]);
}

// The rows of the Markdown table whose header row starts with the heading.
function tableRows(heading) {
  const lines = SKILL.split('\n');
  const start = lines.findIndex((line) => line.startsWith('| ' + heading + ' |'));

  assert.ok(start >= 0, 'SKILL.md has no table headed ' + heading);

  const rows = [];

  for (let index = start + 2; index < lines.length && lines[index].startsWith('|'); index++) {
    rows.push(
      lines[index]
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  }

  return rows;
}

test('names the skill after its folder in the Agent Skills format', () => {
  const { name, description } = frontmatter();

  assert.equal(name, NAME);
  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(description.length > 0 && description.length <= 1024, 'the description is empty or longer than 1024 characters');
});

test('points to the published schema', () => {
  assert.ok(SKILL.includes('`' + SCHEMA.$id + '`'));
  assert.equal(example().$schema, SCHEMA.$id);
});

test('gives an example document that draws everything it says', () => {
  assert.deepEqual(checkDiagram(example()), { errors: [], warnings: [] });
});

test('gives an example document that opens with every reference drawn', () => {
  const { modelData, layout } = documentToModel(example());
  const ids = new Set(modelData.nodes.map((node) => node.data.id));
  const refs = modelData.edges.filter((edge) => edge.data.group === 'ref');

  assert.ok(refs.length > 0);
  assert.deepEqual(
    refs.filter((edge) => !ids.has(edge.data.target)),
    [],
  );
  assert.deepEqual(layout, {});
});

test('documents each description and field setting, and uses each in its example', async (t) => {
  const doc = example();
  const fields = doc.entities.flatMap((entity) => entity.fields || []);

  for (const [name, key, items] of [
    ['an entity description', 'description', doc.entities],
    ['help text', 'description', fields],
    ['a default value', 'defaultValue', fields],
    ['allowed values', 'allowedValues', fields],
    ['translatability', 'translatable', fields],
  ]) {
    await t.test(name, () => {
      assert.ok(
        tableRows('Key').some(([cell]) => cell === '`' + key + '`'),
        key + ' is not in the settings table',
      );
      assert.ok(
        items.some((item) => Object.hasOwn(item, key)),
        key + ' is not in the example',
      );
    });
  }
});

test('lists every built-in entity type in order', () => {
  const rows = tableRows('Entity type').map(([type, label]) => ({ type: type.replaceAll('`', ''), label: label }));

  assert.deepEqual(
    rows,
    ENTITY_TYPES.map(({ type, label }) => ({ type, label })),
  );
});

test('lists every field type the builder offers in order', () => {
  const rows = tableRows('Field type').map(([type]) => type.replaceAll('`', ''));

  assert.deepEqual(rows, FIELD_TYPES);
});

test('lists every field kind', () => {
  const kinds = new Set(tableRows('The source says').map(([, kind]) => kind.replaceAll('`', '')));

  assert.deepEqual([...kinds].sort(), [KIND_CALCULATED, KIND_MULTI, KIND_SINGLE, KIND_SYSTEM].sort());
});

test('lists the base fields Nexus adds to each built-in entity type', async (t) => {
  for (const { type } of ENTITY_TYPES) {
    await t.test(type, () => {
      const fields = baseFieldsForEntityType(type);
      const line = SKILL.split('\n').find((candidate) => candidate.startsWith('- `' + type + '`: '));

      if (fields.length === 0) {
        assert.equal(line, undefined);
        return;
      }

      const listed = fields.map((field) => '`' + field.name + '` ' + field.label + ' (`' + field.fieldType + '`' + (field.required ? ', required' : '') + ')');

      assert.equal(line, '- `' + type + '`: ' + listed.join(', '));
    });
  }
});
