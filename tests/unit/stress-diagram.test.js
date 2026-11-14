import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDiagram } from '../../scripts/lib/diagram-check.mjs';
import { STRESS_COUNTS, stressDiagram } from '../../scripts/lib/stress-diagram.mjs';
import { MAX_DOCUMENT_BYTES, MAX_LINK_LENGTH, decodeDocument, encodeDocument } from '../../src/doc-link.js';
import { REFERENCE_FIELD_TYPES } from '../../src/model.js';

test('holds about 300 entities of 4 built-in types', () => {
  const counts = {};

  stressDiagram().entities.forEach((entity) => {
    counts[entity.entityType] = (counts[entity.entityType] || 0) + 1;
  });

  assert.deepEqual(counts, STRESS_COUNTS);
  assert.equal(stressDiagram().entities.length, 300);
});

test('builds the same document on every call', () => {
  assert.deepEqual(stressDiagram(), stressDiagram());
  assert.notEqual(stressDiagram(), stressDiagram());
});

test('passes the diagram checks with no errors or warnings', () => {
  assert.deepEqual(checkDiagram(stressDiagram()), { errors: [], warnings: [] });
});

test('references every paragraph and media type', () => {
  const doc = stressDiagram();
  const references = doc.entities.flatMap((entity) => entity.fields.filter((field) => REFERENCE_FIELD_TYPES.includes(field.fieldType)));
  const referenced = new Set(references.flatMap((field) => field.targetBundles.map((bundle) => field.targetType + '.' + bundle)));
  const targets = doc.entities.filter((entity) => ['paragraph', 'media'].includes(entity.entityType));

  assert.equal(targets.length, STRESS_COUNTS.paragraph + STRESS_COUNTS.media);
  targets.forEach((entity) => assert.ok(referenced.has(entity.entityType + '.' + entity.bundle), entity.bundle));
});

test('has labels that wrap onto several lines', () => {
  const lengths = stressDiagram().entities.map((entity) => entity.label.length);

  assert.ok(Math.max(...lengths) > 30);
  assert.ok(Math.min(...lengths) < 12);
});

test('fits a link the app opens', async () => {
  const doc = stressDiagram();
  const encoded = await encodeDocument(doc);

  assert.ok(JSON.stringify(doc).length < MAX_DOCUMENT_BYTES);
  assert.ok(encoded.length < MAX_LINK_LENGTH, encoded.length + ' characters');
  assert.deepEqual(await decodeDocument(encoded), doc);
});
