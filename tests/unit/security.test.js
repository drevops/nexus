import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8');

const SOURCES = readdirSync(join(ROOT, 'src'))
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file: file, code: readFileSync(join(ROOT, 'src', file), 'utf8') }));

// The policy as a map of directive to its list of sources.
function policy() {
  const meta = INDEX.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(meta, 'index.html sets no Content Security Policy');

  return Object.fromEntries(
    meta[1]
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...sources]) => [name, sources]),
  );
}

test('sets the Content Security Policy before any script', () => {
  const meta = INDEX.indexOf('http-equiv="Content-Security-Policy"');

  assert.ok(meta > 0);
  assert.ok(meta < INDEX.indexOf('<script'));
});

test('allows only its own origin to run code and send requests', async (t) => {
  const directives = policy();

  for (const [directive, expected] of dataProviderDirectives()) {
    await t.test(directive, () => {
      assert.deepEqual(
        directives[directive].filter((source) => !source.startsWith("'sha256-")),
        expected,
      );
    });
  }
});

function dataProviderDirectives() {
  return [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'"]],
    // Shoelace fetches its system icons from data: URLs.
    ['connect-src', ["'self'", 'data:']],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'none'"]],
  ];
}

test('lists a hash for each inline script and no other', () => {
  const inline = [...INDEX.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (match) => "'sha256-" + createHash('sha256').update(match[1]).digest('base64') + "'",
  );

  assert.ok(inline.length > 0);
  assert.deepEqual(
    policy()['script-src'].filter((source) => source.startsWith("'sha256-")),
    inline,
  );
});

test('runs no code from strings and opens no channel but fetch() of its own files', async (t) => {
  for (const [name, pattern] of dataProviderForbiddenApis()) {
    await t.test(name, () => {
      const found = SOURCES.filter(({ code }) => pattern.test(code)).map(({ file }) => file);

      assert.deepEqual(found, []);
    });
  }
});

function dataProviderForbiddenApis() {
  return [
    ['eval()', /\beval\s*\(/],
    ['new Function()', /\bFunction\s*\(/],
    ['a timer given a string', /set(?:Timeout|Interval)\s*\(\s*['"`]/],
    ['document.write()', /document\.write/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['sendBeacon()', /sendBeacon/],
    ['WebSocket', /WebSocket/],
    ['EventSource', /EventSource/],
    ['document.cookie', /document\.cookie/],
    ['a script element', /createElement\s*\(\s*['"`]script/],
    ['fetch() of an absolute URL', /fetch\s*\(\s*['"`](?:https?:)?\/\//],
    ['an absolute URL in a script import', /\bimport\s*(?:\(\s*|[^'"`]*from\s*)['"`](?:https?:)?\/\//],
  ];
}

test('opens every external link without access to the page', () => {
  const links = [...INDEX.matchAll(/<[^>]+target="_blank"[^>]*>/g)].map((match) => match[0]);

  assert.ok(links.length > 0);
  links.forEach((link) => assert.match(link, /\brel="[^"]*\bnoopener\b/, link));
});
