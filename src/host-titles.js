/**
 * Titles Shoelace controls on their host element.
 *
 * Preact sets `title` as a property when an element has one. Shoelace's
 * button, input, textarea, switch and checkbox declare their own `title`
 * property and copy it to an inner element only, so hovering the rest of the
 * control, such as a switch's label, shows no title. The `vnode` hook in
 * `options` moves the `title` of every `sl-*` element to a ref that sets the
 * attribute, which titles the whole host and which Shoelace reads back into
 * the property.
 */

function applyRef(ref, element) {
  if (typeof ref === 'function') {
    ref(element);
  } else if (ref) {
    ref.current = element;
  }
}

/**
 * Adds the hook to Preact's `options`, after any `vnode` hook it holds.
 */
export function titleShoelaceHosts(options) {
  const previous = options.vnode;

  options.vnode = (vnode) => {
    const props = vnode.props;

    if (typeof vnode.type === 'string' && vnode.type.startsWith('sl-') && props && typeof props.title === 'string') {
      const title = props.title;
      const ref = vnode.ref;

      delete props.title;
      vnode.ref = (element) => {
        if (element) {
          element.setAttribute('title', title);
        }

        applyRef(ref, element);
      };
    }

    if (previous) {
      previous(vnode);
    }
  };
}
