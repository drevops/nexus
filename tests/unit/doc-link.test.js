import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync, deflateSync } from 'node:zlib';
import { MAX_DOCUMENT_BYTES, MAX_LINK_LENGTH, decodeDocument, documentLink, encodeDocument, linkParams } from '../../src/doc-link.js';
import { TEMPLATES, templatePath } from '../../src/templates.js';
import { savedDocument } from '../fixtures/saved-document.js';

const ROOT = join(import.meta.dirname, '..', '..');

const PAGE = 'https://nexus.drevops.com/index.html';

const DAMAGED = 'The link is incomplete or damaged.';

function templateDocument(template) {
  return JSON.parse(readFileSync(join(ROOT, templatePath(template)), 'utf8'));
}

// The template with a position for each entity and field, as a saved
// diagram has.
function laidOut(doc) {
  const layout = {};

  doc.entities.forEach((entity, i) => {
    const id = entity.entityType + '.' + entity.bundle;

    layout[id] = { x: i * 431, y: -i * 97 };
    entity.fields.forEach((field, j) => {
      layout['field:' + id + ':' + field.name] = { x: i * 431 + 180, y: j * 53 - i * 97 };
    });
  });

  return { ...doc, layout: layout };
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

test('round trips a document through its encoding', async (t) => {
  for (const [name, doc] of dataProviderRoundTrip()) {
    await t.test(name, async () => {
      const encoded = await encodeDocument(doc);

      assert.match(encoded, /^[A-Za-z0-9_-]+$/);
      assert.deepEqual(await decodeDocument(encoded), doc);
    });
  }
});

function dataProviderRoundTrip() {
  return [
    ['the full saved document', savedDocument],
    ['an empty diagram', { nexus: 1, entities: [] }],
    [
      'labels outside ASCII',
      { nexus: 1, title: 'Événements ✓ 日本語 🚀', entities: [{ entityType: 'node', bundle: 'a', label: 'Ä "quoted" <b>', fields: [] }] },
    ],
    ...TEMPLATES.map((template) => ['the ' + template.id + ' template', templateDocument(template)]),
  ];
}

test('compresses a template with a layout into a link under the limit', async () => {
  for (const template of TEMPLATES) {
    const doc = laidOut(templateDocument(template));
    const link = documentLink(PAGE, await encodeDocument(doc), 'node.page');

    assert.ok(link.length <= MAX_LINK_LENGTH, template.id + ' makes a link of ' + link.length + ' characters');
    assert.ok(link.length < JSON.stringify(doc).length / 4, template.id + ' is not compressed');
  }
});

test('rejects text that does not decode to a document', async (t) => {
  for (const [name, text, message] of dataProviderBrokenText()) {
    await t.test(name, async () => {
      await assert.rejects(decodeDocument(text), { message: message });
    });
  }
});

function dataProviderBrokenText() {
  const deflated = (text) => base64Url(deflateSync(Buffer.from(text)));
  const json = Buffer.from('{"nexus":1,"entities":[]}');
  const valid = base64Url(deflateSync(json));
  const badChecksum = deflateSync(json);

  badChecksum[badChecksum.length - 1] ^= 0x01;

  return [
    ['empty text', '', DAMAGED],
    ['null', null, DAMAGED],
    ['undefined', undefined, DAMAGED],
    ['characters outside base64url', 'abc$def', DAMAGED],
    ['a space', 'abc def', DAMAGED],
    ['standard base64 characters', 'ab+/cd', DAMAGED],
    ['base64 padding', 'abcd==', DAMAGED],
    ['a length no base64 has', 'abcde', DAMAGED],
    ['bytes that are not deflate', base64Url(Buffer.from([0xff, 0xff, 0xff, 0xff])), DAMAGED],
    ['a truncated stream', valid.slice(0, valid.length - 4), DAMAGED],
    ['raw deflate without a checksum', base64Url(deflateRawSync(json)), DAMAGED],
    ['a checksum that does not match the data', base64Url(badChecksum), DAMAGED],
    ['deflate of text that is not JSON', deflated('not json'), DAMAGED],
    ['deflate of bytes that are not UTF-8', base64Url(deflateSync(Buffer.from([0x22, 0xc3, 0x28, 0x22]))), DAMAGED],
    ['deflate of a document larger than the limit', deflated(' '.repeat(MAX_DOCUMENT_BYTES) + '{}'), 'The diagram in the link is larger than 5 MB.'],
  ];
}

// Each character of the link is swapped for 2 other base64url characters. A
// swap in the last character can touch only its unused low bits, so the
// document decodes unchanged.
test('rejects a link with any 1 character changed, or decodes it unchanged', async () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const encoded = await encodeDocument(savedDocument);
  const changed = [];

  for (let i = 0; i < encoded.length; i++) {
    const at = alphabet.indexOf(encoded[i]);

    for (const shift of [1, 17]) {
      const text = encoded.slice(0, i) + alphabet[(at + shift) % alphabet.length] + encoded.slice(i + 1);
      const decoded = await decodeDocument(text).catch(() => savedDocument);

      if (JSON.stringify(decoded) !== JSON.stringify(savedDocument)) {
        changed.push(i + '+' + shift);
      }
    }
  }

  assert.deepEqual(changed, []);
});

test('decodes a document exactly at the size limit', async () => {
  const doc = '"' + 'a'.repeat(MAX_DOCUMENT_BYTES - 2) + '"';

  assert.equal((await decodeDocument(base64Url(deflateSync(Buffer.from(doc))))).length, MAX_DOCUMENT_BYTES - 2);
});

test('decodes JSON that is not a document, which opening then rejects', async () => {
  assert.deepEqual(await decodeDocument(base64Url(deflateSync(Buffer.from('[1,2]')))), [1, 2]);
  assert.equal(await decodeDocument(base64Url(deflateSync(Buffer.from('null')))), null);
});

test('builds a link to the page that carries the document', async (t) => {
  for (const [name, page, focus, expected] of dataProviderDocumentLink()) {
    await t.test(name, () => {
      assert.equal(documentLink(page, 'q1YCAA', focus), expected);
    });
  }
});

function dataProviderDocumentLink() {
  return [
    ['with no focus', PAGE, null, PAGE + '#doc=q1YCAA'],
    ['with an empty focus', PAGE, '', PAGE + '#doc=q1YCAA'],
    ['with a focus', PAGE, 'node.event', PAGE + '#doc=q1YCAA&focus=node.event'],
    ['replacing the fragment the page has', PAGE + '#doc=old&focus=node.page', null, PAGE + '#doc=q1YCAA'],
    ['keeping the query and the path', 'http://127.0.0.1:8000/sub/dir/?q=1', null, 'http://127.0.0.1:8000/sub/dir/?q=1#doc=q1YCAA'],
    ['encoding a focus that holds reserved characters', PAGE, 'node.a&b=c #d', PAGE + '#doc=q1YCAA&focus=node.a%26b%3Dc+%23d'],
  ];
}

test('reads the document and focus a fragment carries', async (t) => {
  for (const [name, hash, expected] of dataProviderLinkParams()) {
    await t.test(name, () => {
      assert.deepEqual(linkParams(hash), expected);
    });
  }
});

function dataProviderLinkParams() {
  return [
    ['an empty fragment', '', null],
    ['a bare #', '#', null],
    ['null', null, null],
    ['undefined', undefined, null],
    ['a fragment with only a focus', '#focus=node.event', null],
    ['an anchor', '#annotation-overlay', null],
    ['a document', '#doc=q1YCAA', { encoded: 'q1YCAA', focus: null }],
    ['a document without the #', 'doc=q1YCAA', { encoded: 'q1YCAA', focus: null }],
    ['an empty document', '#doc=', { encoded: '', focus: null }],
    ['a document and a focus', '#doc=q1YCAA&focus=node.event', { encoded: 'q1YCAA', focus: 'node.event' }],
    ['a focus before the document', '#focus=node.event&doc=q1YCAA', { encoded: 'q1YCAA', focus: 'node.event' }],
    ['an empty focus', '#doc=q1YCAA&focus=', { encoded: 'q1YCAA', focus: null }],
    ['percent-encoded values', '#doc=q1Y%43AA&focus=node.a%26b', { encoded: 'q1YCAA', focus: 'node.a&b' }],
    ['the first of 2 documents', '#doc=first&doc=second', { encoded: 'first', focus: null }],
    ['an unknown key', '#doc=q1YCAA&other=1', { encoded: 'q1YCAA', focus: null }],
  ];
}

test('reads back the link it builds', async () => {
  const encoded = await encodeDocument(savedDocument);
  const params = linkParams(new URL(documentLink(PAGE, encoded, 'node.a&b=c #d')).hash);

  assert.deepEqual(params, { encoded: encoded, focus: 'node.a&b=c #d' });
  assert.deepEqual(await decodeDocument(params.encoded), savedDocument);
});
