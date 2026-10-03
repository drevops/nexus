import { test } from 'node:test';
import assert from 'node:assert/strict';
import { humanize, machineName, fileSlug } from '../../src/names.js';

test('humanizes a machine name into a label', async (t) => {
  for (const [name, value, expected] of dataProviderHumanize()) {
    await t.test(name, () => {
      assert.equal(humanize(value), expected);
    });
  }
});

function dataProviderHumanize() {
  return [
    ['a single word', 'article', 'Article'],
    ['an underscored name', 'taxonomy_term', 'Taxonomy Term'],
    ['a dotted id', 'node.article', 'Node Article'],
    ['a double underscore', 'field__body', 'Field  Body'],
    ['words already capitalised', 'Blog Post', 'Blog Post'],
    ['a digit after an underscore', 'field_2', 'Field 2'],
    ['a number', 42, '42'],
    ['an empty string', '', ''],
    ['null', null, ''],
    ['undefined', undefined, ''],
  ];
}

test('derives a machine name the way Drupal does', async (t) => {
  for (const [name, value, expected] of dataProviderMachineName()) {
    await t.test(name, () => {
      assert.equal(machineName(value), expected);
    });
  }
});

function dataProviderMachineName() {
  return [
    ['a valid machine name', 'field_body', 'field_body'],
    ['a valid name with a double underscore', 'field__body', 'field__body'],
    ['mixed case', 'Article', 'article'],
    ['spaces between words', 'Blog post', 'blog_post'],
    ['a run of spaces and punctuation', 'Hero  -  Banner!', 'hero_banner'],
    ['an underscore next to a space', 'a_ b', 'a__b'],
    ['leading and trailing separators', '  _Promo_ ', 'promo'],
    ['a dot', 'node.article', 'node_article'],
    ['digits', 'Field 2', 'field_2'],
    ['a character outside a-z', 'Café', 'caf'],
    ['punctuation only', '!!!', ''],
    ['a number', 42, '42'],
    ['an empty string', '', ''],
    ['null', null, ''],
    ['undefined', undefined, ''],
  ];
}

test('keeps a machine name unchanged when it is already valid', () => {
  for (const value of ['article', 'field_body', 'field__body', 'block_2']) {
    assert.equal(machineName(machineName(value)), machineName(value));
    assert.equal(machineName(value), value);
  }
});

test('slugs a title into a file name', async (t) => {
  for (const [name, value, expected] of dataProviderFileSlug()) {
    await t.test(name, () => {
      assert.equal(fileSlug(value), expected);
    });
  }
});

function dataProviderFileSlug() {
  return [
    ['a title', 'Example content model', 'example-content-model'],
    ['mixed case', 'My Model', 'my-model'],
    ['underscores', 'my_model', 'my-model'],
    ['a run of spaces and punctuation', 'Q3 -- Launch: plan!', 'q3-launch-plan'],
    ['leading and trailing separators', '  -Draft- ', 'draft'],
    ['a dot', 'v1.2', 'v1-2'],
    ['punctuation only', '!!!', ''],
    ['a number', 2026, '2026'],
    ['an empty string', '', ''],
    ['null', null, ''],
    ['undefined', undefined, ''],
  ];
}
