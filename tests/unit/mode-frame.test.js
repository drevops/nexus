import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_DEFAULTS, FRAME_MODES, frameSettings } from '../../src/mode-frame.js';

const VIEW = FRAME_DEFAULTS.view;
const EDIT = FRAME_DEFAULTS.edit;

test('frames Edit mode and leaves View mode unframed by default', () => {
  assert.deepEqual(FRAME_MODES, ['view', 'edit']);
  assert.deepEqual(FRAME_DEFAULTS, { view: { enabled: false, color: '#64748b' }, edit: { enabled: true, color: '#f59e0b' } });
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
    ['an array', [], FRAME_DEFAULTS],
    ['an empty object', {}, FRAME_DEFAULTS],
    [
      'every value saved',
      { view: { enabled: true, color: '#112233' }, edit: { enabled: false, color: '#44556677' } },
      { view: { enabled: true, color: '#112233' }, edit: { enabled: false, color: '#44556677' } },
    ],
    ['only the View switch', { view: { enabled: true } }, { view: { ...VIEW, enabled: true }, edit: EDIT }],
    ['only the Edit colour', { edit: { color: '#ABCDEF' } }, { view: VIEW, edit: { ...EDIT, color: '#ABCDEF' } }],
    [
      'a fully transparent colour kept with its switch',
      { edit: { enabled: true, color: '#11223300' } },
      { view: VIEW, edit: { enabled: true, color: '#11223300' } },
    ],
    ['a switch that is not a boolean', { edit: { enabled: 'false' } }, FRAME_DEFAULTS],
    ['a colour name', { view: { color: 'red' } }, FRAME_DEFAULTS],
    ['a 3-digit hex colour', { view: { color: '#123' } }, FRAME_DEFAULTS],
    ['a hex colour without its hash', { edit: { color: '112233' } }, FRAME_DEFAULTS],
    ['a colour carrying CSS', { edit: { color: '#112233; display: none' } }, FRAME_DEFAULTS],
    ['a colour that is a number', { edit: { color: 112233 } }, FRAME_DEFAULTS],
    ['a mode that is an array', { edit: ['#112233'] }, FRAME_DEFAULTS],
    ['an inherited mode', Object.create({ edit: { enabled: false } }), FRAME_DEFAULTS],
  ];
}

// Settings stored with 1 switch for both modes and a colour per mode.
test('reads frame settings stored with 1 switch', async (t) => {
  for (const [name, saved, expected] of dataProviderStoredFrameSettings()) {
    await t.test(name, () => {
      assert.deepEqual(frameSettings(saved), expected);
    });
  }
});

function dataProviderStoredFrameSettings() {
  return [
    ['the stored defaults', { enabled: true, view: '#00000000', edit: '#f59e0b' }, FRAME_DEFAULTS],
    ['the switch off', { enabled: false, view: '#00000000', edit: '#f59e0b' }, { view: VIEW, edit: { ...EDIT, enabled: false } }],
    ['only the switch off', { enabled: false }, { view: VIEW, edit: { ...EDIT, enabled: false } }],
    ['a View colour', { enabled: true, view: '#445566', edit: '#f59e0b' }, { view: { enabled: true, color: '#445566' }, edit: EDIT }],
    [
      'a View colour with the switch off',
      { enabled: false, view: '#445566' },
      { view: { enabled: false, color: '#445566' }, edit: { ...EDIT, enabled: false } },
    ],
    ['an Edit colour without a switch', { edit: '#112233' }, { view: VIEW, edit: { enabled: true, color: '#112233' } }],
    ['an Edit colour with opacity', { edit: '#11223380' }, { view: VIEW, edit: { enabled: true, color: '#11223380' } }],
    ['a transparent Edit colour', { enabled: true, edit: '#11223300' }, { view: VIEW, edit: { ...EDIT, enabled: false } }],
    ['a transparent Edit colour without a switch', { edit: '#f59e0b00' }, { view: VIEW, edit: { ...EDIT, enabled: false } }],
    ['an invalid colour', { enabled: true, view: 'red', edit: '#112233; display: none' }, FRAME_DEFAULTS],
    ['a switch that is not a boolean', { enabled: 'false', view: '#445566' }, { view: { enabled: true, color: '#445566' }, edit: EDIT }],
    [
      'a stored colour beside a mode object',
      { view: '#445566', edit: { enabled: false } },
      { view: { enabled: true, color: '#445566' }, edit: { ...EDIT, enabled: false } },
    ],
  ];
}

test('ignores keys it does not know', () => {
  assert.deepEqual(frameSettings({ width: 40, view: { enabled: false, width: 3 } }), FRAME_DEFAULTS);
});
