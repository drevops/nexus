import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOOGLE_ANALYTICS_ID } from '../../src/analytics-id.js';
import { startAnalytics } from '../../src/analytics.js';

// A window with only the document calls startAnalytics() makes. Appended
// elements are collected in `appended`.
function fakeWindow(props) {
  const appended = [];
  const win = {
    document: {
      createElement: (tagName) => ({ tagName: tagName }),
      head: { appendChild: (element) => appended.push(element) },
    },
    ...props,
  };

  return { win: win, appended: appended };
}

function commands(win) {
  return win.dataLayer.map((entry) => [...entry]);
}

test('ships an empty measurement ID in source', () => {
  assert.equal(GOOGLE_ANALYTICS_ID, '');
});

for (const measurementId of ['', undefined, null]) {
  test('loads nothing for the measurement ID ' + JSON.stringify(measurementId), () => {
    const { win, appended } = fakeWindow();

    assert.equal(startAnalytics(measurementId, win), false);
    assert.deepEqual(appended, []);
    assert.equal('dataLayer' in win, false);
  });
}

test('loads gtag.js asynchronously for a measurement ID', () => {
  const { win, appended } = fakeWindow();

  assert.equal(startAnalytics('G-TEST123', win), true);
  assert.deepEqual(appended, [{ tagName: 'script', async: true, src: 'https://www.googletagmanager.com/gtag/js?id=G-TEST123' }]);
});

test('queues the gtag commands with a fixed page title', () => {
  const { win } = fakeWindow();

  startAnalytics('G-TEST123', win);
  const [js, config, ...rest] = commands(win);

  assert.equal(js[0], 'js');
  assert.ok(js[1] instanceof Date);
  assert.deepEqual(config, ['config', 'G-TEST123', { page_title: 'Nexus' }]);
  assert.deepEqual(rest, []);
});

test('queues the gtag commands as Arguments objects', () => {
  const { win } = fakeWindow();

  startAnalytics('G-TEST123', win);

  for (const entry of win.dataLayer) {
    assert.equal(Object.prototype.toString.call(entry), '[object Arguments]');
  }
});

test('appends to an existing dataLayer', () => {
  const queued = { event: 'queued' };
  const dataLayer = [queued];
  const { win } = fakeWindow({ dataLayer: dataLayer });

  startAnalytics('G-TEST123', win);

  assert.equal(win.dataLayer, dataLayer);
  assert.equal(dataLayer.length, 3);
  assert.equal(dataLayer[0], queued);
});

test('encodes the measurement ID in the gtag.js address', () => {
  const { win, appended } = fakeWindow();

  startAnalytics('G-A&B C', win);

  assert.equal(appended[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-A%26B%20C');
});
