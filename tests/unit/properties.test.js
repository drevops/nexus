import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { formatFieldLine, parseFieldLines } from '../../src/bulk-fields.js';
import { FIELD_TYPES, MAX_CARDINALITY, REFERENCE_FIELD_TYPES } from '../../src/model.js';
import { machineName } from '../../src/names.js';
import { SYMBOLS, customTypeList, typeColors, typeSymbols } from '../../src/type-styles.js';

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

// The patterns the schema states, written out here so the tests don't take
// them from the module under test.
const TYPE_NAME_PATTERN = /^[a-z0-9_]+$/;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const NOT_TYPE_NAME = fc.string().filter((key) => !TYPE_NAME_PATTERN.test(key));

// A map of entries the filter keeps, merged with entries it drops: keys that
// aren't machine names and machine-name keys whose value is invalid.
function styleMap(validValue, invalidValue) {
  return fc
    .record({
      kept: fc.dictionary(MACHINE_NAME, validValue),
      badKeys: fc.dictionary(NOT_TYPE_NAME, fc.jsonValue()),
      badValues: fc.dictionary(MACHINE_NAME, invalidValue),
    })
    .map(({ kept, badKeys, badValues }) => ({ map: { ...badKeys, ...badValues, ...kept }, kept: { ...kept } }));
}

const NOT_JSON_STRING = fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.string()), fc.dictionary(fc.string(), fc.string()));

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

test('keeps exactly the machine-name types with hex colours', () => {
  const invalid = fc.oneof(
    fc.string().filter((value) => !HEX_COLOR_PATTERN.test(value)),
    NOT_JSON_STRING,
  );

  fc.assert(
    fc.property(styleMap(fc.stringMatching(HEX_COLOR_PATTERN), invalid), ({ map, kept }) => {
      assert.deepEqual(typeColors(map), kept);
    }),
  );
});

test('keeps exactly the machine-name types with known symbols', () => {
  const invalid = fc.oneof(
    fc.string().filter((value) => !Object.hasOwn(SYMBOLS, value)),
    NOT_JSON_STRING,
  );

  fc.assert(
    fc.property(styleMap(fc.constantFrom(...Object.keys(SYMBOLS)), invalid), ({ map, kept }) => {
      assert.deepEqual(typeSymbols(map), kept);
    }),
  );
});

test('keeps the first custom type of each machine name that has a text label', () => {
  const valid = fc.record({ type: MACHINE_NAME, label: fc.string(), extra: fc.jsonValue() }, { requiredKeys: ['type', 'label'] });
  const invalid = fc.oneof(
    fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.array(fc.string())),
    fc.record({ type: NOT_TYPE_NAME, label: fc.string() }),
    fc.record({ type: MACHINE_NAME, label: NOT_JSON_STRING }),
    fc.record({ label: fc.string() }),
  );
  const items = fc.array(
    fc.oneof(
      valid.map((value) => ({ ok: true, value })),
      invalid.map((value) => ({ ok: false, value })),
    ),
  );

  fc.assert(
    fc.property(items, (tagged) => {
      const expected = [];

      tagged
        .filter(({ ok }) => ok)
        .forEach(({ value }) => {
          if (!expected.some((t) => t.type === value.type)) {
            expected.push({ type: value.type, label: value.label });
          }
        });

      assert.deepEqual(customTypeList(tagged.map(({ value }) => value)), expected);
    }),
  );
});
