import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { formatFieldLine, parseFieldLines } from '../../src/bulk-fields.js';
import { FIELD_TYPES, MAX_CARDINALITY, REFERENCE_FIELD_TYPES } from '../../src/model.js';
import { machineName } from '../../src/names.js';
import { SYMBOLS, customTypeList, isHexColor, isTypeName, typeColors, typeSymbols } from '../../src/type-styles.js';

const ENTITY_IDS = ['node.article', 'node.page', 'taxonomy_term.tags', 'media.image'];

// Machine names as machineName() writes them, with no leading or trailing
// underscore.
const MACHINE_NAME = fc.stringMatching(/^[a-z][a-z0-9_]{0,20}$/).filter((name) => machineName(name) === name);

// Labels of words joined by single spaces, which the parser trims back.
const LABEL = fc
  .array(fc.stringMatching(/^[A-Za-z0-9()'&.-]{1,8}$/), { minLength: 1, maxLength: 4 })
  .map((words) => words.join(' '))
  .filter((label) => !label.startsWith('#'));

const FIELD = fc
  .record({
    name: MACHINE_NAME,
    label: LABEL,
    fieldType: fc.constantFrom(...FIELD_TYPES),
    cardinality: fc.oneof(fc.constant(-1), fc.integer({ min: 1, max: MAX_CARDINALITY })),
    required: fc.boolean(),
    targets: fc.uniqueArray(fc.constantFrom(...ENTITY_IDS)),
  })
  .map((field) => ({ ...field, targets: REFERENCE_FIELD_TYPES.includes(field.fieldType) ? field.targets : [] }));

// Any value JSON.parse() can produce, keyed by any string.
const JSON_MAP = fc.dictionary(fc.string(), fc.jsonValue());

test('reads any written field line back as the same definition', () => {
  fc.assert(
    fc.property(FIELD, (field) => {
      const line = formatFieldLine(field);

      assert.deepEqual(parseFieldLines(line, { entityIds: ENTITY_IDS }), [{ line: 1, text: line, field: field }]);
    }),
  );
});

test('turns any text into a machine name that stays the same when converted again', () => {
  fc.assert(
    fc.property(fc.string(), (text) => {
      const name = machineName(text);

      assert.match(name, /^(?:[a-z0-9][a-z0-9_]*[a-z0-9]|[a-z0-9]|)$/);
      assert.equal(machineName(name), name);
    }),
  );
});

test('keeps only machine-name types with hex colours from any parsed map', () => {
  fc.assert(
    fc.property(JSON_MAP, (map) => {
      const colors = typeColors(map);

      assert.equal(Object.getPrototypeOf(colors), Object.prototype);
      Object.entries(colors).forEach(([type, color]) => {
        assert.ok(isTypeName(type), type);
        assert.ok(isHexColor(color), color);
        assert.equal(map[type], color);
      });
    }),
  );
});

test('keeps only machine-name types with known symbols from any parsed map', () => {
  fc.assert(
    fc.property(JSON_MAP, (map) => {
      Object.entries(typeSymbols(map)).forEach(([type, symbol]) => {
        assert.ok(isTypeName(type), type);
        assert.ok(Object.hasOwn(SYMBOLS, symbol), symbol);
      });
    }),
  );
});

test('keeps each machine-name custom type once, with a text label, from any parsed list', () => {
  const item = fc.oneof(fc.jsonValue(), fc.record({ type: fc.oneof(MACHINE_NAME, fc.string()), label: fc.jsonValue() }));

  fc.assert(
    fc.property(fc.array(item), (list) => {
      const types = customTypeList(list);

      assert.equal(new Set(types.map((t) => t.type)).size, types.length);
      types.forEach((t) => {
        assert.deepEqual(Object.keys(t), ['type', 'label']);
        assert.ok(isTypeName(t.type), t.type);
        assert.equal(typeof t.label, 'string');
      });
    }),
  );
});
