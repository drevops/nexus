import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHANGE_ADDED,
  CHANGE_CHANGED,
  CHANGE_KINDS,
  CHANGE_REMOVED,
  changeCounts,
  changeKind,
  changeMarks,
  diffModels,
  groupChanges,
  propertyText,
  sharedMark,
} from '../../src/model-diff.js';
import { documentToModel } from '../../src/document.js';
import { TEMPLATES, templatePath } from '../../src/templates.js';
import { savedDocument } from '../fixtures/saved-document.js';

const ROOT = join(import.meta.dirname, '..', '..');

const ARTICLE = 'node.article';
const TAGS = 'taxonomy_term.tags';
const TITLE_FIELD = 'field:node.article:field_title';
const TAGS_FIELD = 'field:node.article:field_tags';
const TAGS_REF = 'ref:' + TAGS_FIELD + '>' + TAGS;

// A sound document: an Article with a title and a reference to Tags, and the
// Tags vocabulary.
function baseDocument() {
  return {
    nexus: 1,
    title: 'Base',
    entities: [
      {
        entityType: 'node',
        bundle: 'article',
        label: 'Article',
        fields: [
          { name: 'field_title', label: 'Title', fieldType: 'string', kind: 'single', cardinality: 1, required: true },
          {
            name: 'field_tags',
            label: 'Tags',
            fieldType: 'entity_reference',
            kind: 'multi',
            cardinality: -1,
            targetType: 'taxonomy_term',
            targetBundles: ['tags'],
          },
        ],
      },
      { entityType: 'taxonomy_term', bundle: 'tags', label: 'Tags', fields: [] },
    ],
  };
}

function modelOf(doc) {
  return documentToModel(doc).modelData;
}

// The base document after `edit` changes a copy of it.
function edited(edit) {
  const doc = structuredClone(baseDocument());

  edit(doc);

  return doc;
}

function article(doc) {
  return doc.entities.find((entity) => entity.bundle === 'article');
}

function field(doc, name) {
  return article(doc).fields.find((item) => item.name === name);
}

// The changes as [change, element, id] triples, in order.
function summary(changes) {
  return changes.map((change) => [change.change, change.element, change.id]);
}

test('finds no changes between a model and itself', () => {
  assert.deepEqual(diffModels(modelOf(baseDocument()), modelOf(baseDocument())), []);
  assert.deepEqual(diffModels(modelOf(savedDocument), modelOf(structuredClone(savedDocument))), []);
});

test('finds no changes between any template and itself', () => {
  for (const template of TEMPLATES) {
    const doc = JSON.parse(readFileSync(join(ROOT, templatePath(template)), 'utf8'));

    assert.deepEqual(diffModels(modelOf(doc), modelOf(structuredClone(doc))), [], template.id);
  }
});

test('finds empty and missing models alike', () => {
  assert.deepEqual(diffModels(null, undefined), []);
  assert.deepEqual(diffModels({ nodes: [], edges: [] }, {}), []);
});

test('lists each kind of change', async (t) => {
  for (const [name, edit, expected] of dataProviderChanges()) {
    await t.test(name, () => {
      assert.deepEqual(summary(diffModels(modelOf(baseDocument()), modelOf(edited(edit)))), expected);
    });
  }
});

// Each case edits the base document into the after side and lists the
// changes expected from the base document to it.
function dataProviderChanges() {
  return [
    ['no edit', () => {}, []],
    [
      'an added entity with a field',
      (doc) =>
        doc.entities.push({
          entityType: 'node',
          bundle: 'page',
          label: 'Page',
          fields: [{ name: 'field_body', label: 'Body', fieldType: 'text_long', kind: 'single' }],
        }),
      [
        [CHANGE_ADDED, 'entity', 'node.page'],
        [CHANGE_ADDED, 'field', 'field:node.page:field_body'],
      ],
    ],
    [
      'a removed entity with its fields and references',
      (doc) => doc.entities.splice(0, 1),
      [
        [CHANGE_REMOVED, 'entity', ARTICLE],
        [CHANGE_REMOVED, 'field', TITLE_FIELD],
        [CHANGE_REMOVED, 'field', TAGS_FIELD],
        [CHANGE_REMOVED, 'reference', TAGS_REF],
      ],
    ],
    ['a renamed entity label', (doc) => (article(doc).label = 'Story'), [[CHANGE_CHANGED, 'entity', ARTICLE]]],
    ['an added entity description', (doc) => (article(doc).description = 'News items'), [[CHANGE_CHANGED, 'entity', ARTICLE]]],
    [
      'a renamed bundle',
      (doc) => (article(doc).bundle = 'story'),
      [
        [CHANGE_REMOVED, 'entity', ARTICLE],
        [CHANGE_REMOVED, 'field', TITLE_FIELD],
        [CHANGE_REMOVED, 'field', TAGS_FIELD],
        [CHANGE_REMOVED, 'reference', TAGS_REF],
        [CHANGE_ADDED, 'entity', 'node.story'],
        [CHANGE_ADDED, 'field', 'field:node.story:field_title'],
        [CHANGE_ADDED, 'field', 'field:node.story:field_tags'],
        [CHANGE_ADDED, 'reference', 'ref:field:node.story:field_tags>' + TAGS],
      ],
    ],
    [
      'an added field',
      (doc) => article(doc).fields.push({ name: 'field_date', label: 'Date', fieldType: 'datetime', kind: 'single' }),
      [[CHANGE_ADDED, 'field', 'field:node.article:field_date']],
    ],
    ['a removed field', (doc) => article(doc).fields.splice(0, 1), [[CHANGE_REMOVED, 'field', TITLE_FIELD]]],
    ['a changed field type', (doc) => (field(doc, 'field_title').fieldType = 'string_long'), [[CHANGE_CHANGED, 'field', TITLE_FIELD]]],
    ['a changed cardinality', (doc) => (field(doc, 'field_title').cardinality = 3), [[CHANGE_CHANGED, 'field', TITLE_FIELD]]],
    ['a field no longer required', (doc) => (field(doc, 'field_title').required = false), [[CHANGE_CHANGED, 'field', TITLE_FIELD]]],
    ['a changed field label', (doc) => (field(doc, 'field_title').label = 'Headline'), [[CHANGE_CHANGED, 'field', TITLE_FIELD]]],
    ['added help text', (doc) => (field(doc, 'field_title').description = 'Shown in lists'), [[CHANGE_CHANGED, 'field', TITLE_FIELD]]],
    ['a default value', (doc) => (field(doc, 'field_title').defaultValue = 'Untitled'), [[CHANGE_CHANGED, 'field', TITLE_FIELD]]],
    ['allowed values', (doc) => (field(doc, 'field_title').allowedValues = [{ value: 'a', label: 'A' }]), [[CHANGE_CHANGED, 'field', TITLE_FIELD]]],
    ['a translatability', (doc) => (field(doc, 'field_title').translatable = true), [[CHANGE_CHANGED, 'field', TITLE_FIELD]]],
    [
      'an added reference target',
      (doc) => {
        doc.entities.push({ entityType: 'taxonomy_term', bundle: 'topics', label: 'Topics', fields: [] });
        field(doc, 'field_tags').targetBundles.push('topics');
      },
      [
        [CHANGE_ADDED, 'reference', 'ref:' + TAGS_FIELD + '>taxonomy_term.topics'],
        [CHANGE_ADDED, 'entity', 'taxonomy_term.topics'],
      ],
    ],
    [
      'a reference that targets every bundle instead',
      (doc) => {
        doc.entities.push({ entityType: 'taxonomy_term', bundle: '*', label: 'Any taxonomy term', fields: [] });
        field(doc, 'field_tags').targetBundles = [];
      },
      [
        [CHANGE_REMOVED, 'reference', TAGS_REF],
        [CHANGE_ADDED, 'reference', 'ref:' + TAGS_FIELD + '>taxonomy_term.*'],
        [CHANGE_ADDED, 'entity', 'taxonomy_term.*'],
      ],
    ],
    ['a removed reference', (doc) => (field(doc, 'field_tags').targetBundles = ['missing']), [[CHANGE_REMOVED, 'reference', TAGS_REF]]],
    ['a note, which is not compared', (doc) => (field(doc, 'field_title').note = 'Ask the editors'), []],
    ['a hidden field, which is not compared', (doc) => (field(doc, 'field_title').hidden = true), []],
    ['blank help text, which counts as none', (doc) => (field(doc, 'field_title').description = '   '), []],
  ];
}

test('lists the old and new value of each changed property', async (t) => {
  for (const [name, edit, element, expected] of dataProviderProperties()) {
    await t.test(name, () => {
      const changes = diffModels(modelOf(baseDocument()), modelOf(edited(edit)));
      const change = changes.find((item) => item.element === element);

      assert.deepEqual(
        change.properties.map((property) => [property.key, property.label, property.before, property.after]),
        expected,
      );
    });
  }
});

// Each case edits the base document, names the element whose change it reads
// and lists [key, label, before, after] for each changed property.
function dataProviderProperties() {
  return [
    ['an entity label', (doc) => (article(doc).label = 'Story'), 'entity', [['label', 'Label', 'Article', 'Story']]],
    ['an entity description', (doc) => (article(doc).description = 'News'), 'entity', [['description', 'Description', '', 'News']]],
    [
      'several field properties at once',
      (doc) => {
        field(doc, 'field_title').fieldType = 'string_long';
        field(doc, 'field_title').cardinality = -1;
        field(doc, 'field_title').required = false;
      },
      'field',
      [
        ['fieldType', 'Type', 'string', 'string_long'],
        ['cardinality', 'Cardinality', 1, -1],
        ['required', 'Required', true, false],
      ],
    ],
    ['a field label', (doc) => (field(doc, 'field_title').label = 'Headline'), 'field', [['label', 'Label', 'Title', 'Headline']]],
    ['help text', (doc) => (field(doc, 'field_title').description = 'Shown'), 'field', [['description', 'Help text', '', 'Shown']]],
    ['a default value', (doc) => (field(doc, 'field_title').defaultValue = 'X'), 'field', [['defaultValue', 'Default value', '', 'X']]],
    [
      'allowed values',
      (doc) => (field(doc, 'field_title').allowedValues = [{ value: 'a', label: 'A' }]),
      'field',
      [['allowedValues', 'Allowed values', [], [{ value: 'a', label: 'A' }]]],
    ],
    ['a translatability', (doc) => (field(doc, 'field_title').translatable = false), 'field', [['translatable', 'Translatable', null, false]]],
  ];
}

test('describes each change for the Changes panel', () => {
  const after = edited((doc) => {
    article(doc).fields.push({ name: 'field_date', label: 'Date', fieldType: 'datetime', kind: 'single' });
    article(doc).fields.push({ name: 'field_code', fieldType: 'string', kind: 'single' });
  });
  const changes = diffModels(modelOf(baseDocument()), modelOf(after));

  assert.deepEqual(changes[0], {
    change: CHANGE_ADDED,
    element: 'field',
    id: 'field:node.article:field_date',
    entityId: ARTICLE,
    name: 'field_date',
    label: 'Date',
    properties: [],
  });
  assert.equal(changes[1].label, 'field_code', 'a field without a label is named by its machine name');

  const removed = diffModels(modelOf(baseDocument()), modelOf(edited((doc) => (field(doc, 'field_tags').targetBundles = ['missing'])))).find(
    (change) => change.element === 'reference',
  );

  assert.deepEqual(removed, {
    change: CHANGE_REMOVED,
    element: 'reference',
    id: TAGS_REF,
    entityId: ARTICLE,
    fieldId: TAGS_FIELD,
    targetId: TAGS,
    label: 'Tags → Tags',
    properties: [],
  });
});

test('names a reference target by the label of the after side, then the before side, then its id', () => {
  const after = edited((doc) => {
    doc.entities[1] = { entityType: 'taxonomy_term', bundle: 'topics', label: '', fields: [] };
    field(doc, 'field_tags').targetBundles = ['topics'];
    field(doc, 'field_title').label = 'Headline';
  });
  const labels = diffModels(modelOf(baseDocument()), modelOf(after))
    .filter((change) => change.element === 'reference')
    .map((change) => change.label);

  assert.deepEqual(labels, ['Tags → Tags', 'Tags → taxonomy_term.topics']);
});

test('names a renamed element by its label on the after side', () => {
  const after = edited((doc) => (doc.entities[1].label = 'Keywords'));

  assert.equal(diffModels(modelOf(baseDocument()), modelOf(after))[0].label, 'Keywords');
});

test('leaves out a reference whose target the model does not draw', () => {
  const after = modelOf(baseDocument());

  after.edges.push({ data: { id: 'ref:' + TITLE_FIELD + '>node.gone', source: TITLE_FIELD, target: 'node.gone', group: 'ref' } });
  after.edges.push({ data: { id: 'ref:field:node.gone:field_x>' + TAGS, source: 'field:node.gone:field_x', target: TAGS, group: 'ref' } });

  assert.deepEqual(diffModels(modelOf(baseDocument()), after), []);
});

test('groups changes by the bundle they are listed under, in order', () => {
  const after = edited((doc) => {
    article(doc).label = 'Story';
    field(doc, 'field_title').required = false;
    doc.entities[1].label = 'Keywords';
  });
  const groups = groupChanges(diffModels(modelOf(baseDocument()), modelOf(after)));

  assert.deepEqual(
    groups.map((group) => [group.entityId, group.changes.map((change) => change.id)]),
    [
      [ARTICLE, [ARTICLE, TITLE_FIELD]],
      [TAGS, [TAGS]],
    ],
  );
  assert.deepEqual(groupChanges([]), []);
});

test('counts the changes of each kind', () => {
  const after = edited((doc) => {
    article(doc).label = 'Story';
    article(doc).fields.splice(0, 1);
    doc.entities.push({ entityType: 'node', bundle: 'page', label: 'Page', fields: [] });
  });

  assert.deepEqual(changeCounts(diffModels(modelOf(baseDocument()), modelOf(after))), { added: 1, removed: 1, changed: 1 });
  assert.deepEqual(changeCounts([]), { added: 0, removed: 0, changed: 0 });
});

test('marks every element a change names, with the edge of an added or removed field', () => {
  const after = edited((doc) => {
    article(doc).fields.splice(0, 1);
    field(doc, 'field_tags').label = 'Keywords';
  });
  const marks = changeMarks(diffModels(modelOf(baseDocument()), modelOf(after)));

  assert.deepEqual(
    [...marks.entries()],
    [
      [TITLE_FIELD, CHANGE_REMOVED],
      ['has:' + TITLE_FIELD, CHANGE_REMOVED],
      [TAGS_FIELD, CHANGE_CHANGED],
    ],
  );
});

test('finds the mark a set of ids shares', async (t) => {
  const marks = new Map([
    ['a', CHANGE_ADDED],
    ['b', CHANGE_ADDED],
    ['c', CHANGE_REMOVED],
  ]);

  for (const [name, ids, expected] of dataProviderSharedMarks()) {
    await t.test(name, () => assert.equal(sharedMark(marks, ids), expected));
  }
});

function dataProviderSharedMarks() {
  return [
    ['1 marked id', ['c'], CHANGE_REMOVED],
    ['ids with the same mark', ['a', 'b'], CHANGE_ADDED],
    ['ids with different marks', ['a', 'c'], null],
    ['a marked and an unmarked id', ['a', 'x'], null],
    ['an unmarked id', ['x'], null],
    ['no ids', [], null],
  ];
}

test('words each property value', async (t) => {
  for (const [key, value, expected] of dataProviderPropertyText()) {
    await t.test(key + ' ' + JSON.stringify(value), () => assert.equal(propertyText(key, value), expected));
  }
});

function dataProviderPropertyText() {
  return [
    ['label', 'Title', 'Title'],
    ['label', '', 'None'],
    ['fieldType', 'string', 'string'],
    ['cardinality', 1, '1'],
    ['cardinality', 4, '1..4'],
    ['cardinality', -1, '1..n'],
    ['required', true, 'Yes'],
    ['required', false, 'No'],
    ['translatable', true, 'Yes'],
    ['translatable', false, 'No'],
    ['translatable', null, 'Not set'],
    ['allowedValues', [], 'None'],
    [
      'allowedValues',
      [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'b' },
      ],
      'A (a), b',
    ],
    ['description', '<p>Shown <b>here</b></p>', 'Shown here'],
    ['description', '', 'None'],
    ['defaultValue', '', 'None'],
    ['defaultValue', '5', '5'],
  ];
}

test('lists each kind of change once, with a label, a title and its own colour', () => {
  assert.deepEqual(
    CHANGE_KINDS.map((kind) => kind.change),
    [CHANGE_ADDED, CHANGE_REMOVED, CHANGE_CHANGED],
  );
  assert.equal(new Set(CHANGE_KINDS.map((kind) => kind.color)).size, CHANGE_KINDS.length);

  for (const kind of CHANGE_KINDS) {
    assert.ok(kind.label && kind.title, kind.change);
    assert.match(kind.color, /^#[0-9a-f]{6}$/, kind.change);
    assert.equal(changeKind(kind.change), kind);
  }

  assert.equal(changeKind('moved'), undefined);
});
