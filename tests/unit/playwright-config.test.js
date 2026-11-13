import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const E2E_DIR = join(ROOT, 'tests', 'e2e');

// Each query string evaluates the config module afresh.
async function loadConfig(query, port) {
  if (port === undefined) {
    delete process.env.NEXUS_E2E_PORT;
  } else {
    process.env.NEXUS_E2E_PORT = port;
  }

  const { default: config } = await import('../../playwright.config.js?' + query);

  return config;
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.on('error', () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

test('points the tests and the server at the port in NEXUS_E2E_PORT', async () => {
  const config = await loadConfig('pinned', '45678');

  assert.equal(config.use.baseURL, 'http://127.0.0.1:45678');
  assert.equal(config.webServer.url, 'http://127.0.0.1:45678/index.html');
  assert.deepEqual(config.webServer.env, { PORT: '45678' });
  assert.equal(process.env.NEXUS_E2E_PORT, '45678');
});

test('picks a free port and records it in NEXUS_E2E_PORT for the workers', async () => {
  const config = await loadConfig('free');
  const port = process.env.NEXUS_E2E_PORT;

  assert.match(port, /^\d+$/);
  assert.notEqual(port, '8000');
  assert.equal(config.use.baseURL, 'http://127.0.0.1:' + port);
  assert.deepEqual(config.webServer.env, { PORT: port });
  assert.ok(await canListen(Number(port)), 'port ' + port + ' is taken');
});

test('never reuses a server another checkout started', async () => {
  const config = await loadConfig('reuse', '45679');

  assert.equal(config.webServer.reuseExistingServer, false);
});

for (const name of readdirSync(E2E_DIR).filter((file) => file.endsWith('.js'))) {
  test('names no fixed server port in tests/e2e/' + name, () => {
    const source = readFileSync(join(E2E_DIR, name), 'utf8');

    assert.doesNotMatch(source, /(127\.0\.0\.1|localhost):\d+/);
  });
}
