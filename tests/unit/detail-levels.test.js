import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LEVEL,
  DETAIL_LEVELS,
  detailLevel,
  levelHidesTitle,
  levelShowsField,
  levelToShow,
  lowestLevelFor,
  nextLevel,
  showsFields,
} from '../../src/detail-levels.js';
import { DIAGRAM_DEFAULTS } from '../../src/diagram-defaults.js';
import { KIND_CALCULATED, KIND_MULTI, KIND_SINGLE, KIND_SYSTEM } from '../../src/model.js';
import { hasIcon } from '../../src/icons.js';

const FIELDS = {
  baseText: { kind: KIND_SYSTEM, fieldType: 'string' },
  baseReference: { kind: KIND_SYSTEM, fieldType: 'entity_reference' },
  text: { kind: KIND_SINGLE, fieldType: 'string' },
  multiText: { kind: KIND_MULTI, fieldType: 'text_long' },
  reference: { kind: KIND_SINGLE, fieldType: 'entity_reference' },
  revisions: { kind: KIND_MULTI, fieldType: 'entity_reference_revisions' },
  calculated: { kind: KIND_CALCULATED, fieldType: 'computed' },
};

test('lists the levels from the fewest fields to the most, each with a label, a title and its own icon', () => {
  assert.deepEqual(
    DETAIL_LEVELS.map((level) => [level.id, level.label]),
    [
      ['entities', 'Entities'],
      ['references', 'References'],
      ['configurable', 'Configurable'],
      ['all', 'All'],
    ],
  );

  DETAIL_LEVELS.forEach((level) => {
    assert.ok(level.title.length > 0, level.id);
    assert.ok(hasIcon(level.icon), level.id);
  });
  assert.equal(new Set(DETAIL_LEVELS.map((level) => level.icon)).size, DETAIL_LEVELS.length);
  assert.equal(new Set(DETAIL_LEVELS.map((level) => level.title)).size, DETAIL_LEVELS.length);
  assert.ok(Object.isFrozen(DETAIL_LEVELS));
});

test('opens at the All level, the level new diagrams default to', () => {
  assert.equal(DEFAULT_LEVEL, 'all');
  assert.equal(DIAGRAM_DEFAULTS.level, DEFAULT_LEVEL);
});

test('finds a level by its id', async (t) => {
  for (const [id, expected] of dataProviderLevelIds()) {
    await t.test(String(id), () => {
      const level = detailLevel(id);

      assert.equal(level ? level.id : null, expected);
    });
  }
});

function dataProviderLevelIds() {
  return [
    ['entities', 'entities'],
    ['references', 'references'],
    ['configurable', 'configurable'],
    ['all', 'all'],
    ['All', null],
    ['', null],
    ['constructor', null],
    [undefined, null],
    [null, null],
  ];
}

test('cycles through the levels and wraps from the last to the first', async (t) => {
  for (const [id, expected] of dataProviderNextLevels()) {
    await t.test(String(id), () => {
      assert.equal(nextLevel(id).id, expected);
    });
  }
});

function dataProviderNextLevels() {
  return [
    ['entities', 'references'],
    ['references', 'configurable'],
    ['configurable', 'all'],
    ['all', 'entities'],
    ['unknown', 'entities'],
    [undefined, 'entities'],
  ];
}

test('shows fields at every level but Entities', () => {
  assert.deepEqual(
    DETAIL_LEVELS.map((level) => [level.id, showsFields(level.id)]),
    [
      ['entities', false],
      ['references', true],
      ['configurable', true],
      ['all', true],
    ],
  );
});

test('shows exactly the fields of each level', async (t) => {
  for (const [level, shown] of dataProviderShownFields()) {
    await t.test(level, () => {
      const actual = Object.keys(FIELDS).filter((name) => levelShowsField(level, FIELDS[name]));

      assert.deepEqual(actual, shown);
    });
  }
});

function dataProviderShownFields() {
  return [
    ['entities', []],
    ['references', ['reference', 'revisions']],
    ['configurable', ['text', 'multiText', 'reference', 'revisions', 'calculated']],
    ['all', Object.keys(FIELDS)],
    ['unknown', Object.keys(FIELDS)],
    ['constructor', Object.keys(FIELDS)],
  ];
}

test('shows every field a level shows at each level after it', () => {
  DETAIL_LEVELS.slice(1).forEach((level, index) => {
    const before = DETAIL_LEVELS[index];

    Object.entries(FIELDS).forEach(([name, field]) => {
      if (levelShowsField(before.id, field)) {
        assert.ok(levelShowsField(level.id, field), name + ' at ' + level.id);
      }
    });
  });
});

test('finds the first level that shows a field', async (t) => {
  for (const [name, expected] of dataProviderLowestLevels()) {
    await t.test(name, () => {
      assert.equal(lowestLevelFor(FIELDS[name]).id, expected);
    });
  }
});

function dataProviderLowestLevels() {
  return [
    ['baseText', 'all'],
    ['baseReference', 'all'],
    ['text', 'configurable'],
    ['multiText', 'configurable'],
    ['reference', 'references'],
    ['revisions', 'references'],
    ['calculated', 'configurable'],
  ];
}

test('names the level that hides a field and the level that shows it', async (t) => {
  for (const [level, name, expected] of dataProviderHiddenTitles()) {
    await t.test(level + ' ' + name, () => {
      assert.equal(levelHidesTitle(level, FIELDS[name]), expected);
    });
  }
});

function dataProviderHiddenTitles() {
  return [
    ['entities', 'reference', 'The Entities level hides this field. Pick References to go to it'],
    ['entities', 'text', 'The Entities level hides this field. Pick Configurable to go to it'],
    ['references', 'text', 'The References level hides this field. Pick Configurable to go to it'],
    ['configurable', 'baseText', 'The Configurable level hides this field. Pick All to go to it'],
    ['configurable', 'baseReference', 'The Configurable level hides this field. Pick All to go to it'],
  ];
}

test('finds the first level that shows every field, never below the level given', async (t) => {
  for (const [name, level, fields, expected] of dataProviderLevelsToShow()) {
    await t.test(name, () => {
      assert.equal(
        levelToShow(
          level,
          fields.map((field) => FIELDS[field]),
        ),
        expected,
      );
    });
  }
});

function dataProviderLevelsToShow() {
  return [
    ['no fields', 'references', [], 'references'],
    ['a field the level shows', 'references', ['reference'], 'references'],
    ['a field a higher level shows', 'entities', ['reference'], 'references'],
    ['a text field at References', 'references', ['text'], 'configurable'],
    ['a base field at Configurable', 'configurable', ['baseText'], 'all'],
    ['a reference field at All', 'all', ['reference'], 'all'],
    ['fields that need different levels', 'entities', ['reference', 'text', 'calculated'], 'configurable'],
    ['a base field among others', 'references', ['reference', 'baseReference'], 'all'],
    ['an unknown level', 'unknown', ['text'], 'all'],
  ];
}
