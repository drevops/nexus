import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleShoelaceHosts } from '../../src/host-titles.js';

// An element that records the attributes set on it.
function fakeElement() {
  const attributes = {};

  return {
    attributes: attributes,
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
  };
}

// Runs the hook over a vnode of the type and props, with the given ref.
function hooked(type, props, ref = null) {
  const options = {};
  const vnode = { type: type, props: { ...props }, ref: ref };

  titleShoelaceHosts(options);
  options.vnode(vnode);

  return vnode;
}

test('titles the host of a Shoelace element with an attribute instead of a property', async (t) => {
  for (const type of dataProviderShoelaceTypes()) {
    await t.test(type, () => {
      const vnode = hooked(type, { title: 'Filter the fields', size: 'small' });
      const element = fakeElement();

      vnode.ref(element);

      assert.deepEqual(vnode.props, { size: 'small' });
      assert.deepEqual(element.attributes, { title: 'Filter the fields' });
    });
  }
});

function dataProviderShoelaceTypes() {
  return ['sl-button', 'sl-input', 'sl-select', 'sl-switch', 'sl-textarea', 'sl-color-picker'];
}

test('leaves the title of any other element or value as it is', async (t) => {
  for (const [name, type, props] of dataProviderUntouched()) {
    await t.test(name, () => {
      const vnode = hooked(type, props);

      assert.deepEqual(vnode.props, props);
      assert.equal(vnode.ref, null);
    });
  }
});

function dataProviderUntouched() {
  return [
    ['a native button', 'button', { title: 'Close' }],
    ['a component', () => null, { title: 'Close' }],
    ['a Shoelace element without a title', 'sl-input', { size: 'small' }],
    ['a Shoelace element with a title that is not a string', 'sl-input', { title: null }],
  ];
}

test('keeps the ref the element already has', async (t) => {
  for (const [name, ref, read] of dataProviderRefs()) {
    await t.test(name, () => {
      const vnode = hooked('sl-input', { title: 'Label' }, ref);
      const element = fakeElement();

      vnode.ref(element);
      assert.equal(read(), element);

      vnode.ref(null);
      assert.equal(read(), null);
      assert.deepEqual(element.attributes, { title: 'Label' });
    });
  }
});

function dataProviderRefs() {
  const object = { current: undefined };
  let called = undefined;

  return [
    ['an object ref', object, () => object.current],
    [
      'a function ref',
      (element) => {
        called = element;
      },
      () => called,
    ],
  ];
}

test('runs the vnode hook the options already held', () => {
  const seen = [];
  const options = { vnode: (vnode) => seen.push(vnode.type) };

  titleShoelaceHosts(options);
  options.vnode({ type: 'sl-input', props: { title: 'Label' }, ref: null });
  options.vnode({ type: 'div', props: {}, ref: null });

  assert.deepEqual(seen, ['sl-input', 'div']);
});
