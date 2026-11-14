import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { MODEL_PREFIXES } from '../../src/parser.js';
import { TEMPLATES } from '../../src/templates.js';

const NAME = 'add-nexus-template';
const ROOT = join(import.meta.dirname, '..', '..');
const SKILL = readFileSync(join(ROOT, '.claude', 'skills', NAME, 'SKILL.md'), 'utf8');
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// Fixtures hold made-up models, so they never list the templates.
const SCANNED = ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'src', 'scripts', 'tests'];
const SKIPPED = new Set(['tests/fixtures']);

function frontmatter() {
  const block = SKILL.match(/^---\n([\s\S]*?)\n---\n/);

  assert.ok(block, 'SKILL.md has no frontmatter');

  return Object.fromEntries(block[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]));
}

function codeSpans(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
}

// The repository files the skill names, such as 'src/templates.js'. A path
// with a '<placeholder>' names no single file.
function namedFiles(text = SKILL) {
  return codeSpans(text).filter((span) => /^[\w.-]+(?:\/[\w.-]+)*\.(?:js|mjs|md)$/.test(span));
}

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function listFiles(path) {
  if (SKIPPED.has(path)) {
    return [];
  }

  if (!statSync(join(ROOT, path)).isDirectory()) {
    return [path];
  }

  return readdirSync(join(ROOT, path)).flatMap((name) => listFiles(relative(ROOT, join(ROOT, path, name))));
}

function namesEveryTemplate(text) {
  return TEMPLATES.every((template) => text.includes(template.label) || text.includes("'" + template.id + "'") || text.includes('template-' + template.id));
}

test('names the skill after its folder in the Agent Skills format', () => {
  const { name, description } = frontmatter();

  assert.equal(name, NAME);
  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(description.length > 0 && description.length <= 1024, 'the description is empty or longer than 1024 characters');
});

test('names only repository files that exist', () => {
  const files = namedFiles();

  assert.ok(files.length > 0);

  for (const file of files) {
    assert.ok(existsSync(join(ROOT, file)), file + ' does not exist');
  }
});

test('runs only npm scripts the project defines', () => {
  const scripts = [...SKILL.matchAll(/npm run ([\w-]+)/g)].map((match) => match[1]);

  assert.ok(scripts.includes('update-templates'));

  for (const script of scripts) {
    assert.ok(Object.hasOwn(PACKAGE.scripts, script), script + ' is not an npm script');
  }
});

test('lists the config files with exactly the prefixes the parser reads', () => {
  const pattern = SKILL.match(/grep -E '\/\(([^)]+)\)\\\.\[\^\/\]\+\\\.yml\$'/);

  assert.ok(pattern, 'SKILL.md has no grep for the config files');

  const prefixes = pattern[1].split('|').map((prefix) => prefix.replaceAll('\\.', '.') + '.');

  assert.deepEqual(prefixes.sort(), [...MODEL_PREFIXES].sort());
});

// A constant such as 'TEMPLATES', a function such as 'dataProviderTemplates()'
// or a test title of 4 words or more.
function isPointer(span) {
  return /^[A-Z][A-Z0-9_]+$/.test(span) || /^\w+\(\)$/.test(span) || /^[a-z][\w',]*(?: [\w',]+){3,}$/.test(span);
}

test('names each constant, function and test it points to in a file on the same line', async (t) => {
  const pointers = new Map();

  for (const line of SKILL.split('\n')) {
    const files = namedFiles(line);

    for (const span of codeSpans(line).filter(isPointer)) {
      if (files.length > 0) {
        pointers.set(span + ' in ' + files.join(' or '), { name: span.replace(/\(\)$/, ''), files });
      }
    }
  }

  assert.ok(pointers.size > 0);

  for (const [title, { name, files }] of pointers) {
    await t.test(title, () => {
      assert.ok(files.some((file) => read(file).includes(name)));
    });
  }
});

test('names every file that lists every template', () => {
  const listing = SCANNED.flatMap(listFiles).filter((file) => namesEveryTemplate(read(file)));
  const named = new Set(namedFiles());

  assert.ok(listing.includes('src/templates.js'));
  assert.deepEqual(
    listing.filter((file) => !named.has(file)),
    [],
  );
});
