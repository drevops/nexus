import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContentModel, Entity, KIND_CALCULATED } from '../../src/model.js';
import { ANNOTATION_FILES, ANNOTATION_KINDS, applyAnnotations } from '../../src/annotations.js';

const ROOT = join(import.meta.dirname, '..', '..');
const SOURCE = readFileSync(join(ROOT, 'src', 'annotations.js'), 'utf8');
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');
const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8');
const DOCS_URL = 'https://github.com/drevops/nexus#annotation-overlay';

// The README writes a key under the object that holds it, such as
// `nodes[].id` for the `id` of a node.
const KEY_PREFIXES = { data: '', node: 'nodes[].', edge: 'edges[].', field: 'computed_fields.<id>[].' };

const OVERLAY = {
  title: 'Annotated model',
  nodes: [
    { id: 'create_invoice', kind: 'callback', label: 'Create invoice', method: 'POST', attach: 'node.article' },
    { id: 'payments_api', kind: 'api', label: 'Payments API' },
    { id: 'invoice_paid', kind: 'event', label: 'InvoicePaid' },
  ],
  edges: [{ from: 'payments_api', to: 'invoice_paid', label: 'emits' }],
  computed_fields: { 'node.article': [{ name: 'computed_url', label: 'Computed URL' }] },
};

function model() {
  const m = new ContentModel('Original title');
  m.addEntity(new Entity('node', 'article', 'Article'));
  return m;
}

function nodesById(data) {
  const result = {};
  for (const node of data.nodes) {
    result[node.data.id] = node.data;
  }
  return result;
}

test('applies overlay nodes, edges and title', () => {
  const m = model();
  applyAnnotations(m, OVERLAY);

  assert.equal(m.getTitle(), 'Annotated model');

  const data = m.toArray();
  const nodes = nodesById(data);
  assert.equal(nodes.create_invoice.kind, 'callback');
  assert.equal(nodes.create_invoice.method, 'POST');
  assert.equal(nodes.payments_api.kind, 'api');
  assert.equal(nodes.invoice_paid.kind, 'event');

  const attach = data.edges.filter((e) => e.data.source === 'node.article' && e.data.target === 'create_invoice');
  assert.equal(attach.length, 1);

  const emits = data.edges.filter((e) => e.data.source === 'payments_api' && e.data.target === 'invoice_paid');
  assert.equal(emits.length, 1);
});

test('adds calculated fields to existing entities', () => {
  const m = model();
  applyAnnotations(m, OVERLAY);

  const computed = m.getEntity('node.article').fields.filter((f) => f.kind === KIND_CALCULATED);
  assert.equal(computed.length, 1);
  assert.equal(computed[0].name, 'computed_url');
});

test('labels the event, API and callback annotation kinds', () => {
  assert.deepEqual(ANNOTATION_KINDS, [
    { kind: 'event', label: 'Event' },
    { kind: 'api', label: 'API' },
    { kind: 'callback', label: 'Callback' },
  ]);
});

test('keeps every annotation kind and turns any other kind into an event', async (t) => {
  for (const [name, kind, expected] of dataProviderAnnotationKind()) {
    await t.test(name, () => {
      const m = model();
      applyAnnotations(m, { nodes: [{ id: 'note', kind: kind }] });

      assert.equal(nodesById(m.toArray()).note.kind, expected);
    });
  }
});

function dataProviderAnnotationKind() {
  return [
    ...ANNOTATION_KINDS.map((entry) => ['the ' + entry.label + ' kind', entry.kind, entry.kind]),
    ['an unknown kind', 'webhook', 'event'],
    ['a missing kind', undefined, 'event'],
    ['an inherited object property', 'constructor', 'event'],
  ];
}

test('ignores non-object overlays', () => {
  const m = model();
  applyAnnotations(m, null);
  assert.equal(m.getTitle(), 'Original title');
});

// Returns the README's "Annotation overlay" section, up to the next heading.
function overlaySection() {
  const start = README.indexOf('\n## Annotation overlay\n');
  assert.ok(start >= 0, 'README.md has no "Annotation overlay" section');
  const end = README.indexOf('\n## ', start + 1);

  return README.slice(start, end < 0 ? README.length : end);
}

// Returns every overlay key src/annotations.js reads, as the README writes it.
function readKeys() {
  const keys = [...SOURCE.matchAll(/\b(data|node|edge|field)\.(\w+)\b/g)].map((match) => KEY_PREFIXES[match[1]] + match[2]);

  return [...new Set(keys)];
}

// Returns the anchor GitHub gives a heading.
function anchor(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, '')
    .replace(/ /g, '-');
}

test('documents every overlay key the annotations module reads', async (t) => {
  const keys = readKeys();
  const firstCells = [...overlaySection().matchAll(/^\| (.+?) \|/gm)].map((match) => match[1]);
  const documented = firstCells.flatMap((cell) => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]));

  for (const key of ['title', 'nodes', 'nodes[].id', 'nodes[].attach', 'edges[].from', 'computed_fields', 'computed_fields.<id>[].name']) {
    assert.ok(keys.includes(key), 'found no read of ' + key + ' in src/annotations.js');
  }

  for (const key of keys) {
    await t.test(key, () => {
      assert.ok(documented.includes(key), 'README.md does not document ' + key);
    });
  }
});

test('documents every overlay file name and annotation kind', async (t) => {
  for (const [name, token] of dataProviderOverlayDocs()) {
    await t.test(name, () => {
      assert.ok(overlaySection().includes('`' + token + '`'), 'README.md does not name ' + token);
    });
  }
});

function dataProviderOverlayDocs() {
  return [...ANNOTATION_FILES.map((file) => ['the ' + file + ' file', file]), ...ANNOTATION_KINDS.map((entry) => ['the ' + entry.label + ' kind', entry.kind])];
}

test('links the landing note to the annotation overlay documentation', () => {
  const note = INDEX.match(/<p class="landing__note">([\s\S]*?)<\/p>/);
  assert.ok(note, 'index.html has no landing note');

  const link = note[1].match(/<a ([^>]*)><code>annotations\.yml<\/code><\/a>/);
  assert.ok(link, 'the landing note does not link annotations.yml');
  assert.ok(link[1].includes('href="' + DOCS_URL + '"'), 'the landing note does not link ' + DOCS_URL);
  assert.match(link[1], /target="_blank"/);
  assert.match(link[1], /rel="noopener"/);

  const headings = [...README.matchAll(/^#+ (.+)$/gm)].map((match) => anchor(match[1]));
  assert.ok(headings.includes(DOCS_URL.split('#')[1]), 'README.md has no heading for ' + DOCS_URL);
});
