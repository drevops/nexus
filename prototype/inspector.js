/**
 * Preact prototype: the build-mode inspector.
 *
 * The declarative counterpart to the form-builder functions in
 * assets/builder.js (entityForm/fieldForm/openFieldForm + the delegated
 * onInspectorInput/onInspectorClick handlers). Here each form is a controlled
 * component: inputs bind to state, edits write straight through to the live
 * Cytoscape node, and there is no innerHTML, no data-* attribute protocol and
 * no manual re-render call. Compare the two side by side.
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import htmBase from 'htm';
import { icon } from '../assets/icons.js';

const html = htmBase.bind(h);

const FIELD_TYPES = ['string', 'string_long', 'text_long', 'boolean', 'integer', 'datetime', 'link', 'image', 'entity_reference', 'entity_reference_revisions'];
const REFERENCE_TYPES = ['entity_reference', 'entity_reference_revisions'];
const TYPE_LABELS = { node: 'Content type', taxonomy_term: 'Vocabulary', media: 'Media', paragraph: 'Paragraph', block_content: 'Block', user: 'User' };

function fieldsOf(cy, entityId) {
  return cy.nodes('[group="field"][entity="' + entityId + '"]');
}

function refTargets(cy, fieldId) {
  return cy.getElementById(fieldId).connectedEdges('[group="ref"]').filter((e) => e.source().id() === fieldId).map((e) => e.target().id());
}

export function existingFields(cy) {
  const byName = {};
  cy.nodes('[group="field"]').forEach((f) => {
    const name = f.data('name');
    if (name && !byName[name]) {
      byName[name] = { name: name, label: f.data('label'), fieldType: f.data('fieldType'), kind: f.data('kind') };
    }
  });
  return Object.keys(byName).sort().map((name) => byName[name]);
}

function Row({ label, children }) {
  return html`<div class="insp__row"><label>${label}</label>${children}</div>`;
}

export function EntityForm({ cy, id, onSelect, onAddField, onDelete, onChange }) {
  const node = cy.getElementById(id);
  const [label, setLabel] = useState(node.data('label'));

  const fields = fieldsOf(cy, id).map((f) => html`
    <button class="insp__field" onClick=${() => onSelect(f.id())}>${f.data('label')} <code>${f.data('name')}</code></button>`);

  return html`
    <div class="insp">
      <p class="insp__title">Entity</p>
      <${Row} label="Label">
        <input class="insp__input" value=${label} onInput=${(e) => { setLabel(e.target.value); node.data('label', e.target.value); onChange(); }} />
      <//>
      <${Row} label="Type"><span class="insp__ro">${TYPE_LABELS[node.data('entityType')] || node.data('entityType')}</span><//>
      <${Row} label="Machine name"><code>${node.data('bundle')}</code><//>
      <div class="insp__section">
        <div class="insp__sectionhead"><span>Fields</span><button class="insp__btn" onClick=${() => onAddField(id)}>${rawIcon('plus')}Field</button></div>
        ${fields.length ? fields : html`<p class="insp__empty">No fields yet.</p>`}
      </div>
      <button class="insp__delete" onClick=${() => onDelete(id)}>${rawIcon('trash')}Delete entity</button>
    </div>`;
}

export function FieldForm({ cy, id, onSelect, onDelete, onChange }) {
  const node = cy.getElementById(id);
  const [state, setState] = useState({
    label: node.data('label'),
    fieldType: node.data('fieldType'),
    kind: node.data('kind'),
    required: !!node.data('required'),
  });

  function set(key, value) {
    node.data(key, value);
    if (key === 'kind') {
      node.connectedEdges('[group="ref"]').data('cardinality', value === 'multi' ? '1..n' : '1');
    }
    setState((prev) => ({ ...prev, [key]: value }));
    onChange();
  }

  const isRef = REFERENCE_TYPES.includes(state.fieldType);
  const targets = refTargets(cy, id);
  const entityOptions = cy.nodes('[group="entity"]').map((e) => html`<option value=${e.id()}>${e.data('label')}</option>`);

  function addTarget(targetId) {
    if (!targetId) {
      return;
    }
    const edgeId = 'ref:' + id + '>' + targetId;
    if (cy.getElementById(edgeId).empty()) {
      cy.add({ group: 'edges', data: { id: edgeId, source: id, target: targetId, group: 'ref', cardinality: state.kind === 'multi' ? '1..n' : '1' } });
      onChange();
    }
  }

  function removeTarget(targetId) {
    cy.getElementById('ref:' + id + '>' + targetId).remove();
    onChange();
  }

  return html`
    <div class="insp">
      <p class="insp__title">Field</p>
      <${Row} label="Label">
        <input class="insp__input" value=${state.label} onInput=${(e) => set('label', e.target.value)} />
      <//>
      <${Row} label="Machine name"><code>${node.data('name')}</code><//>
      <${Row} label="Type">
        <select class="insp__input" value=${state.fieldType} onChange=${(e) => set('fieldType', e.target.value)}>
          ${FIELD_TYPES.map((t) => html`<option value=${t}>${t}</option>`)}
        </select>
      <//>
      <${Row} label="Cardinality">
        <select class="insp__input" value=${state.kind} onChange=${(e) => set('kind', e.target.value)}>
          <option value="single">Single</option>
          <option value="multi">Multiple</option>
        </select>
      <//>
      <${Row} label="Required">
        <input type="checkbox" checked=${state.required} onChange=${(e) => set('required', e.target.checked)} />
      <//>
      ${isRef && html`
        <div class="insp__section">
          <div class="insp__sectionhead"><span>References</span></div>
          ${targets.length ? targets.map((t) => html`
            <div class="insp__ref">${cy.getElementById(t).data('label') || t}
              <button class="insp__x" aria-label="Remove" onClick=${() => removeTarget(t)}>${rawIcon('x', 14)}</button>
            </div>`) : html`<p class="insp__empty">No references.</p>`}
          <div class="insp__row">
            <select class="insp__input" value="" onChange=${(e) => { addTarget(e.target.value); e.target.value = ''; }}>
              <option value="">Add target…</option>
              ${entityOptions}
            </select>
          </div>
        </div>`}
      <button class="insp__delete" onClick=${() => onDelete(id)}>${rawIcon('trash')}Delete field</button>
    </div>`;
}

export function NewFieldForm({ cy, entityId, onCreate }) {
  const [form, setForm] = useState({ name: '', label: '', fieldType: 'string', kind: 'single' });
  const existing = existingFields(cy);

  function onName(value) {
    const match = existing.find((f) => f.name === value);
    setForm((prev) => match ? { name: value, label: match.label, fieldType: match.fieldType, kind: match.kind } : { ...prev, name: value });
  }

  return html`
    <div class="insp">
      <p class="insp__title">New field</p>
      <${Row} label="Machine name">
        <input class="insp__input" list="proto-existing-fields" value=${form.name} placeholder="e.g. field_body" autocomplete="off" onInput=${(e) => onName(e.target.value)} />
      <//>
      <datalist id="proto-existing-fields">
        ${existing.map((f) => html`<option value=${f.name}>${f.label} (${f.fieldType})</option>`)}
      </datalist>
      <${Row} label="Label">
        <input class="insp__input" value=${form.label} placeholder="e.g. Body" onInput=${(e) => setForm((p) => ({ ...p, label: e.target.value }))} />
      <//>
      <${Row} label="Type">
        <select class="insp__input" value=${form.fieldType} onChange=${(e) => setForm((p) => ({ ...p, fieldType: e.target.value }))}>
          ${FIELD_TYPES.map((t) => html`<option value=${t}>${t}</option>`)}
        </select>
      <//>
      <${Row} label="Cardinality">
        <select class="insp__input" value=${form.kind} onChange=${(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>
          <option value="single">Single</option>
          <option value="multi">Multiple</option>
        </select>
      <//>
      <p class="insp__hint">Type a new name, or pick an existing field to reuse its definition.</p>
      <button class="insp__create" onClick=${() => onCreate(entityId, form)}>${rawIcon('check')}Create field</button>
    </div>`;
}

// Icons come from the shared icon set as raw SVG strings; wrap for htm.
function rawIcon(name, size) {
  return html`<span dangerouslySetInnerHTML=${{ __html: icon(name, size) }}></span>`;
}
