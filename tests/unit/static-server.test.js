import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { join } from 'node:path';
import { createStaticServer } from '../static-server.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const DIR = join(ROOT, '.artifacts', 'tmp', 'static-server-' + process.pid);

let origin;
let server;

test.before(async () => {
  mkdirSync(join(DIR, 'site', 'src'), { recursive: true });
  mkdirSync(join(DIR, 'site-other'), { recursive: true });
  writeFileSync(join(DIR, 'site', 'index.html'), '<p>home</p>');
  writeFileSync(join(DIR, 'site', 'src', 'app.js'), 'export {};');
  writeFileSync(join(DIR, 'site', 'data.bin'), 'raw');
  writeFileSync(join(DIR, 'site-other', 'secret.txt'), 'secret');
  writeFileSync(join(DIR, 'outside.txt'), 'outside');

  server = createStaticServer(join(DIR, 'site'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
});

test.after(() => {
  server.close();
  rmSync(DIR, { recursive: true, force: true });
});

test('serves files with their content type', async (t) => {
  for (const [path, status, type, body] of dataProviderRequests()) {
    await t.test(path, async () => {
      const response = await fetch(origin + path);

      assert.equal(response.status, status);
      assert.equal(response.headers.get('content-type'), type);
      assert.equal(await response.text(), body);
    });
  }
});

function dataProviderRequests() {
  return [
    ['/', 200, 'text/html; charset=utf-8', '<p>home</p>'],
    ['/index.html', 200, 'text/html; charset=utf-8', '<p>home</p>'],
    ['/src/app.js?v=1', 200, 'text/javascript; charset=utf-8', 'export {};'],
    ['/data.bin', 200, 'application/octet-stream', 'raw'],
    ['/missing.js', 404, 'text/plain', 'Not found'],
    ['/src/', 404, 'text/plain', 'Not found'],
  ];
}

// A URL string normalizes '..' away, so the raw paths go out as options.
test('serves nothing outside its folder', async (t) => {
  for (const [path, status] of dataProviderEscapes()) {
    await t.test(path, async () => {
      const response = await new Promise((resolve, reject) => {
        get({ host: '127.0.0.1', port: server.address().port, path: path }, (res) => {
          res.resume();
          resolve(res);
        }).on('error', reject);
      });

      assert.equal(response.statusCode, status);
    });
  }
});

function dataProviderEscapes() {
  return [
    ['/..%2foutside.txt', 403],
    ['/..%2fsite-other%2fsecret.txt', 403],
    ['/%2e%2e/outside.txt', 404],
    ['/../outside.txt', 404],
  ];
}
