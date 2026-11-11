import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_DEFAULTS, frameSettings } from '../../src/mode-frame.js';

test('leaves View mode transparent and frames Edit mode by default', () => {
  assert.deepEqual(FRAME_DEFAULTS, { enabled: true, view: '#00000000', edit: '#f59e0b' });
});

test('fills in the frame settings from saved ones', async (t) => {
  for (const [name, saved, expected] of dataProviderFrameSettings()) {
    await t.test(name, () => {
      assert.deepEqual(frameSettings(saved), expected);
    });
  }
});

function dataProviderFrameSettings() {
  return [
    ['nothing saved', undefined, FRAME_DEFAULTS],
    ['null', null, FRAME_DEFAULTS],
    ['a string', 'on', FRAME_DEFAULTS],
    ['an empty object', {}, FRAME_DEFAULTS],
    ['every value saved', { enabled: false, view: '#112233', edit: '#44556677' }, { enabled: false, view: '#112233', edit: '#44556677' }],
    ['only the switch', { enabled: false }, { ...FRAME_DEFAULTS, enabled: false }],
    ['only the Edit colour', { edit: '#ABCDEF' }, { ...FRAME_DEFAULTS, edit: '#ABCDEF' }],
    ['a switch that is not a boolean', { enabled: 'false' }, FRAME_DEFAULTS],
    ['a colour name', { view: 'red' }, FRAME_DEFAULTS],
    ['a 3-digit hex colour', { view: '#123' }, FRAME_DEFAULTS],
    ['a hex colour without its hash', { edit: '112233' }, FRAME_DEFAULTS],
    ['a colour carrying CSS', { edit: '#112233; display: none' }, FRAME_DEFAULTS],
    ['a colour that is a number', { edit: 112233 }, FRAME_DEFAULTS],
  ];
}

test('ignores keys it does not know', () => {
  assert.deepEqual(frameSettings({ enabled: true, width: 40 }), FRAME_DEFAULTS);
});
