/**
 * The controls that edit a Fields table cell in place, as Preact components
 * over Shoelace controls.
 *
 * The table draws 1 editor at a time, in place of the cell it edits. Each
 * editor takes the focus when it mounts and calls `onClose` once, with true
 * when the key press that closed it should return the focus to the cell.
 */

import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import htmBase from 'htm';

const html = htmBase.bind(h);

/**
 * A text box for 1 cell. Enter commits, and Shift+Enter starts a new line in
 * a `multiline` box. Escape cancels, and moving the focus away commits.
 */
export function TextEditor({ value, multiline, title, placeholder, onCommit, onClose }) {
  const ref = useRef(null);
  const closed = useRef(false);
  // Preact sets the value property on every render, and a store update can
  // re-render the table mid-edit, so the typed text is kept as state.
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    const control = ref.current;

    Promise.resolve(control.updateComplete).then(() => {
      control.focus();
      control.select();
    });
  }, []);

  function finish(commit, refocus) {
    if (closed.current) {
      return;
    }

    closed.current = true;

    if (commit) {
      onCommit(ref.current.value);
    }

    onClose(refocus);
  }

  function onKeyDown(e) {
    if (e.isComposing) {
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false, true);
    } else if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
      e.preventDefault();
      finish(true, true);
    }
  }

  if (multiline) {
    return html`<sl-textarea
      ref=${ref}
      class="field-table__editor"
      size="small"
      rows="3"
      resize="auto"
      title=${title}
      placeholder=${placeholder}
      value=${draft}
      onsl-input=${(e) => setDraft(e.target.value)}
      onKeyDown=${onKeyDown}
      onsl-blur=${() => finish(true, false)}
    ></sl-textarea>`;
  }

  return html`<sl-input
    ref=${ref}
    class="field-table__editor"
    size="small"
    title=${title}
    placeholder=${placeholder}
    value=${draft}
    onsl-input=${(e) => setDraft(e.target.value)}
    onKeyDown=${onKeyDown}
    onsl-blur=${() => finish(true, false)}
  ></sl-input>`;
}

/**
 * A select for 1 cell, opened as it mounts. `options` are [value, label]
 * pairs. Each pick calls `onChange` with the select's value, a list of values
 * when `multiple`, and the editor closes with the list. `onShow` runs as the
 * list opens.
 */
export function SelectEditor({ value, options, multiple, clearable, placeholder, title, onShow, onChange, onClose }) {
  const ref = useRef(null);
  const closed = useRef(false);

  function close() {
    if (!closed.current) {
      closed.current = true;
      onClose(true);
    }
  }

  useEffect(() => {
    const control = ref.current;

    Promise.resolve(control.updateComplete).then(() => {
      control.focus();
      control.show();
    });
  }, []);

  return html`<sl-select
    ref=${ref}
    class="field-table__editor"
    size="small"
    hoist
    multiple=${!!multiple}
    max-options-visible="0"
    clearable=${!!clearable}
    placeholder=${placeholder}
    title=${title}
    value=${value}
    onsl-show=${onShow}
    onKeyDown=${(e) => {
      // The select keeps Escape while its list is open, so this sees only an
      // Escape pressed with the list closed.
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }}
    onsl-change=${(e) => onChange(e.target.value)}
    onsl-hide=${(e) => {
      // A pick hides the list before the select fires sl-change, so the
      // editor stays until that event has run.
      if (e.target === e.currentTarget) {
        setTimeout(close);
      }
    }}
  >
    ${options.map(([optionValue, label]) => html`<sl-option value=${optionValue}>${label}</sl-option>`)}
  </sl-select>`;
}
