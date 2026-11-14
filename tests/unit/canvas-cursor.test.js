import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasCursor } from '../../src/canvas-cursor.js';

const ENTITY = { group: 'entity', grabbable: true };
const FIELD = { group: 'field', grabbable: true };
const PROXY = { group: 'proxy', grabbable: true };
const NOTE = { group: 'annotation', grabbable: true };
const LOCKED = { group: 'entity', grabbable: false };

test('picks the cursor for the canvas state', async (t) => {
  for (const [name, state, expected] of dataProviderCanvasCursor()) {
    await t.test(name, () => {
      assert.equal(canvasCursor(state), expected);
    });
  }
});

function dataProviderCanvasCursor() {
  return [
    ['no state', undefined, ''],
    ['the empty canvas in View mode', {}, ''],
    ['an entity in View mode', { node: ENTITY }, 'pointer'],
    ['a field in View mode', { node: FIELD }, 'pointer'],
    ['a proxy in View mode', { node: PROXY }, 'pointer'],
    ['an annotation in View mode', { node: NOTE }, 'pointer'],
    ['an entity during a comparison', { node: ENTITY, comparing: true }, 'pointer'],
    ['an annotation during a comparison', { node: NOTE, comparing: true }, ''],
    ['the empty canvas in Edit mode', { edit: true }, ''],
    ['a grabbable entity in Edit mode', { node: ENTITY, edit: true }, 'grab'],
    ['a grabbable annotation in Edit mode', { node: NOTE, edit: true }, 'grab'],
    ['a node an isolation locks in Edit mode', { node: LOCKED, edit: true }, 'pointer'],
    ['a held node in Edit mode', { node: ENTITY, edit: true, holding: true }, 'grabbing'],
    ['a held node that left the pointer', { edit: true, holding: true }, 'grabbing'],
    ['the empty canvas in Connect mode', { edit: true, connect: true }, ''],
    ['a field in Connect mode', { node: FIELD, edit: true, connect: true }, 'crosshair'],
    ['an entity in Connect mode', { node: ENTITY, edit: true, connect: true }, 'pointer'],
    ['a connection being drawn over the empty canvas', { edit: true, connect: true, connecting: true }, 'crosshair'],
    ['a connection being drawn over an entity', { node: ENTITY, edit: true, connect: true, connecting: true }, 'crosshair'],
    ['a Note being placed over the empty canvas', { edit: true, placing: true }, 'crosshair'],
    ['a Note being placed over an entity', { node: ENTITY, edit: true, placing: true }, 'crosshair'],
    ['a pan over the empty canvas', { panning: true }, 'grabbing'],
    ['a pan over an entity in View mode', { node: ENTITY, panning: true }, 'grabbing'],
    ['a pan while a Note is being placed', { edit: true, placing: true, panning: true }, 'grabbing'],
    ['a pan while a connection is being drawn', { node: FIELD, edit: true, connect: true, connecting: true, panning: true }, 'grabbing'],
  ];
}
