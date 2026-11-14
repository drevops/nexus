import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadShare, downloadText } from '../../src/template-download.js';

// A response whose body arrives in the given chunks of UTF-8 text.
function chunkedResponse(chunks, init = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });

  return new Response(body, init);
}

function fetcherOf(response) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return typeof response === 'function' ? response() : response;
  };

  return { fetcher, calls };
}

test('measures the share of a download against its expected size', async (t) => {
  for (const [name, received, size, expected] of dataProviderShares()) {
    await t.test(name, () => {
      assert.equal(downloadShare(received, size), expected);
    });
  }
});

function dataProviderShares() {
  return [
    ['nothing yet', 0, 200, 0],
    ['a quarter', 50, 200, 0.25],
    ['all of it', 200, 200, 1],
    ['more than expected', 300, 200, 1],
    ['an unknown size', 50, 0, 0],
    ['a negative size', 50, -1, 0],
    ['a missing size', 50, undefined, 0],
  ];
}

test('downloads text in chunks and reports the share after each one, then 1', async () => {
  const { fetcher, calls } = fetcherOf(chunkedResponse(['ab', 'cd', 'efgh']));
  const shares = [];

  const text = await downloadText('templates/cms.nexus.json', { size: 8, fetcher, priority: 'low', onProgress: (share) => shares.push(share) });

  assert.equal(text, 'abcdefgh');
  assert.deepEqual(shares, [0.25, 0.5, 1, 1]);
  assert.deepEqual(calls, [{ url: 'templates/cms.nexus.json', options: { priority: 'low' } }]);
});

test('decodes a character split across 2 chunks', async () => {
  const bytes = new TextEncoder().encode('café');
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 4));
      controller.enqueue(bytes.slice(4));
      controller.close();
    },
  });
  const { fetcher } = fetcherOf(new Response(body));

  assert.equal(await downloadText('a.json', { size: bytes.length, fetcher }), 'café');
});

test('reads a response without a body stream as text', async () => {
  const shares = [];
  const response = { ok: true, status: 200, body: null, text: async () => '{}' };
  const { fetcher } = fetcherOf(response);

  assert.equal(await downloadText('a.json', { size: 2, fetcher, onProgress: (share) => shares.push(share) }), '{}');
  assert.deepEqual(shares, [1]);
});

test('downloads with the default options', async () => {
  const original = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return chunkedResponse(['{}']);
  };

  try {
    assert.equal(await downloadText('a.json'), '{}');
  } finally {
    globalThis.fetch = original;
  }

  assert.deepEqual(calls, [{ url: 'a.json', options: { priority: 'auto' } }]);
});

test('reports a failed download by the name of the file', async (t) => {
  for (const [name, respond, message] of dataProviderFailures()) {
    await t.test(name, async () => {
      const { fetcher } = fetcherOf(respond);

      await assert.rejects(downloadText('templates/cms.nexus.json', { size: 10, fetcher }), { message });
    });
  }
});

function dataProviderFailures() {
  const offline = 'cms.nexus.json could not be downloaded. Check your connection and try again.';
  const broken = new ReadableStream({
    pull(controller) {
      controller.error(new TypeError('network error'));
    },
  });

  return [
    [
      'a network failure',
      () => {
        throw new TypeError('Failed to fetch');
      },
      offline,
    ],
    ['a missing file', () => new Response('Not found', { status: 404 }), 'cms.nexus.json returned 404'],
    ['a server error', () => new Response('', { status: 500 }), 'cms.nexus.json returned 500'],
    ['a body that breaks off', () => new Response(broken), offline],
  ];
}
