import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { icon } from '../../src/icons.js';

const ROOT = join(import.meta.dirname, '..', '..');
const LOGO = readFileSync(join(ROOT, 'logo.svg'), 'utf8');

// Returns the attributes of an opening tag as an object.
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

// Returns what an SVG draws: its view box, and every group, path and circle
// with its attributes, in document order.
function drawing(svg) {
  const root = attributes(svg.match(/<svg\b[^>]*>/)[0]);
  const elements = [...svg.matchAll(/<(g|path|circle)\b[^>]*>/g)].map((match) => ({ element: match[1], ...attributes(match[0]) }));

  return { viewBox: root.viewBox, elements: elements };
}

test('draws the page icon with the shapes of logo.svg', () => {
  const logo = drawing(LOGO);
  const classes = logo.elements.map((element) => element.class);

  assert.ok(classes.includes('ink') && classes.includes('ref'), 'logo.svg has no ink or ref shapes');
  assert.deepEqual(drawing(icon('nexus')), logo);
});

test('colours the logo ink for light and dark colour schemes and keeps the blue', () => {
  const style = LOGO.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\s+/g, '');

  for (const rule of ['.ink{fill:#333e43}', '.ref{fill:#53b4eb}', '@media(prefers-color-scheme:dark){.ink{fill:#fff}}']) {
    assert.ok(style.includes(rule), 'logo.svg is missing ' + rule);
  }
});

test('shows logo.svg above the README title', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const logo = readme.search(/<img\b[^>]*\bsrc="logo\.svg"/);

  assert.ok(logo >= 0, 'README.md does not show logo.svg');
  assert.ok(logo < readme.indexOf('<h1'), 'README.md shows logo.svg below its title');
});
