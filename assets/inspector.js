/**
 * Build-mode inspector, as Preact controlled components.
 *
 * Each form binds inputs to state and writes straight through to the live
 * Cytoscape node; structural changes (create/delete/reference) go through the
 * builder controller published on the store. There is no innerHTML and no
 * delegated data-* protocol - selecting, editing and creating are ordinary
 * component interactions. A few data-* hooks remain purely so tests (and
 * scripts) can target inputs by intent.
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import htmBase from 'htm';
import { icon } from './icons.js';
import { getController, getBuilder, openInspector, bump } from './store.js';

const html = htmBase.bind(h);

const ENTITY_TYPES = [['node', 'Content type'], ['taxonomy_term', 'Vocabulary'], ['media', 'Media'], ['paragraph', 'Paragraph'], ['block_content', 'Block'], ['user', 'User']];
const FIELD_TYPES = ['string', 'string_long', 'text_long', 'text_with_summary', 'boolean', 'integer', 'decimal', 'datetime', 'link', 'email', 'list_string', 'image', 'file', 'entity_reference', 'entity_reference_revisions'];
const REFERENCE_TYPES = ['entity_reference', 'entity_reference_revisions'];
const ANNOTATION_KINDS = [['event', 'Event'], ['api', 'API'], ['callback', 'Callback']];
const TYPE_LABELS = { node: 'Content type', taxonomy_term: 'Vocabulary', media: 'Media', paragraph: 'Paragraph', block_content: 'Block', user: 'User', external: 'External entity' };

function cy() {
  return getController().cy;
}

function rawIcon(name, size) {
  return html`<span dangerouslySetInnerHTML=${{ __html: icon(name, size) }}></span>`;
}

function Row({ label, children }) {
  return html`<div class="insp__row"><label>${label}</label>${children}</div>`;
}

function optionList(list) {
  return list.map((item) => {
    const value = Array.isArray(item) ? item[0] : item;
    const label = Array.isArray(item) ? item[1] : item;
    return html`<option value=${value}>${label}</option>`;
  });
}

export function existingFields() {
  const byName = {};
  cy().nodes('[group="field"]').forEach((f) => {
    const name = f.data('name');
    if (name && !byName[name]) {
      byName[name] = { name: name, label: f.data('label'), fieldType: f.data('fieldType'), kind: f.data('kind') };
    }
  });
  return Object.keys(byName).sort().map((name) => byName[name]);
}

function fieldsOf(entityId) {
  return cy().nodes('[group="field"][entity="' + entityId + '"]');
}

function refTargets(fieldId) {
  return cy().getElementById(fieldId).connectedEdges('[group="ref"]').filter((e) => e.source().id() === fieldId).map((e) => e.target().id());
}

export function EntityForm({ id }) {
  const node = cy().getElementById(id);
  const [label, setLabel] = useState(node.data('label'));

  const fields = fieldsOf(id).map((f) => html`
    <button class="insp__field" onClick=${() => openInspector({ kind: 'field', id: f.id() })}>${f.data('label')} <code>${f.data('name')}</code></button>`);

  return html`
    <div class="insp">
      <p class="insp__title">Entity</p>
      <${Row} label="Label">
        <input class="insp__input" value=${label} onInput=${(e) => { setLabel(e.target.value); node.data('label', e.target.value); bump(); }} />
      <//>
      <${Row} label="Type"><span class="insp__ro">${TYPE_LABELS[node.data('entityType')] || node.data('entityType')}</span><//>
      <${Row} label="Machine name"><code>${node.data('bundle')}</code><//>
      <div class="insp__section">
        <div class="insp__sectionhead"><span>Fields</span><button class="insp__btn" data-add-field onClick=${() => openInspector({ kind: 'new-field', entityId: id })}>${rawIcon('plus')}Field</button></div>
        ${fields.length ? fields : html`<p class="insp__empty">No fields yet.</p>`}
      </div>
      <button class="insp__delete" onClick=${() => getBuilder().deleteNode(id)}>${rawIcon('trash')}Delete entity</button>
    </div>`;
}

export function FieldForm({ id }) {
  const node = cy().getElementById(id);
  const [s, setS] = useState({ label: node.data('label'), fieldType: node.data('fieldType'), kind: node.data('kind'), required: !!node.data('required') });

  function set(key, value) {
    node.data(key, value);
    if (key === 'kind') {
      node.connectedEdges('[group="ref"]').data('cardinality', value === 'multi' ? '1..n' : '1');
    }
    setS((prev) => ({ ...prev, [key]: value }));
    bump();
  }

  const isRef = REFERENCE_TYPES.includes(s.fieldType);
  const targets = refTargets(id);
  const entityOptions = cy().nodes('[group="entity"]').map((e) => html`<option value=${e.id()}>${e.data('label')}</option>`);

  return html`
    <div class="insp">
      <p class="insp__title">Field</p>
      <${Row} label="Label"><input class="insp__input" value=${s.label} onInput=${(e) => set('label', e.target.value)} /><//>
      <${Row} label="Machine name"><code>${node.data('name')}</code><//>
      <${Row} label="Type"><select class="insp__input" value=${s.fieldType} onChange=${(e) => set('fieldType', e.target.value)}>${optionList(FIELD_TYPES)}</select><//>
      <${Row} label="Cardinality">
        <select class="insp__input" value=${s.kind} onChange=${(e) => set('kind', e.target.value)}>
          <option value="single">Single</option><option value="multi">Multiple</option>
        </select>
      <//>
      <${Row} label="Required"><input type="checkbox" checked=${s.required} onChange=${(e) => set('required', e.target.checked)} /><//>
      ${isRef && html`
        <div class="insp__section">
          <div class="insp__sectionhead"><span>References</span></div>
          ${targets.length ? targets.map((t) => html`
            <div class="insp__ref">${cy().getElementById(t).data('label') || t}
              <button class="insp__x" aria-label="Remove" onClick=${() => { getBuilder().removeReference(id, t); bump(); }}>${rawIcon('x', 14)}</button>
            </div>`) : html`<p class="insp__empty">No references.</p>`}
          <div class="insp__row">
            <select class="insp__input" value="" onChange=${(e) => { if (e.target.value) { getBuilder().addReference(id, e.target.value); e.target.value = ''; bump(); } }}>
              <option value="">Add target…</option>${entityOptions}
            </select>
          </div>
        </div>`}
      <button class="insp__delete" onClick=${() => getBuilder().deleteNode(id)}>${rawIcon('trash')}Delete field</button>
    </div>`;
}

export function AnnotationForm({ id }) {
  const node = cy().getElementById(id);
  const [s, setS] = useState({ label: node.data('label'), kind: node.data('kind'), method: node.data('method') || '' });

  function set(key, value) {
    node.data(key, value);
    setS((prev) => ({ ...prev, [key]: value }));
    bump();
  }

  return html`
    <div class="insp">
      <p class="insp__title">Annotation</p>
      <${Row} label="Label"><input class="insp__input" value=${s.label} onInput=${(e) => set('label', e.target.value)} /><//>
      <${Row} label="Kind"><select class="insp__input" value=${s.kind} onChange=${(e) => set('kind', e.target.value)}>${optionList(ANNOTATION_KINDS)}</select><//>
      <${Row} label="Method"><input class="insp__input" value=${s.method} placeholder="POST, GET…" onInput=${(e) => set('method', e.target.value)} /><//>
      <button class="insp__delete" onClick=${() => getBuilder().deleteNode(id)}>${rawIcon('trash')}Delete</button>
    </div>`;
}

export function NewEntityForm() {
  const [form, setForm] = useState({ entityType: 'node', bundle: '', label: '' });

  return html`
    <div class="insp" data-new="entity">
      <p class="insp__title">New entity</p>
      <${Row} label="Type"><select class="insp__input" value=${form.entityType} onChange=${(e) => setForm((p) => ({ ...p, entityType: e.target.value }))}>${optionList(ENTITY_TYPES)}</select><//>
      <${Row} label="Machine name"><input class="insp__input" data-new-bundle value=${form.bundle} placeholder="e.g. article" onInput=${(e) => setForm((p) => ({ ...p, bundle: e.target.value }))} /><//>
      <${Row} label="Label"><input class="insp__input" data-new-label value=${form.label} placeholder="e.g. Article" onInput=${(e) => setForm((p) => ({ ...p, label: e.target.value }))} /><//>
      <button class="insp__create" data-create-entity onClick=${() => getBuilder().createEntity(form)}>${rawIcon('check')}Create entity</button>
    </div>`;
}

export function NewFieldForm({ entityId, side }) {
  const [form, setForm] = useState({ name: '', label: '', fieldType: 'string', kind: 'single' });
  const existing = existingFields();

  function onName(value) {
    const match = existing.find((f) => f.name === value);
    setForm((prev) => match ? { name: value, label: match.label, fieldType: match.fieldType, kind: match.kind } : { ...prev, name: value });
  }

  return html`
    <div class="insp" data-new="field" data-side=${side || ''}>
      <p class="insp__title">New field</p>
      <${Row} label="Machine name">
        <input class="insp__input" data-new-name list="existing-field-list" value=${form.name} placeholder="e.g. field_body" autocomplete="off" onInput=${(e) => onName(e.target.value)} />
      <//>
      <datalist id="existing-field-list">${existing.map((f) => html`<option value=${f.name}>${f.label} (${f.fieldType})</option>`)}</datalist>
      <${Row} label="Label"><input class="insp__input" data-new-label value=${form.label} placeholder="e.g. Body" onInput=${(e) => setForm((p) => ({ ...p, label: e.target.value }))} /><//>
      <${Row} label="Type"><select class="insp__input" data-new-fieldtype value=${form.fieldType} onChange=${(e) => setForm((p) => ({ ...p, fieldType: e.target.value }))}>${optionList(FIELD_TYPES)}</select><//>
      <${Row} label="Cardinality">
        <select class="insp__input" value=${form.kind} onChange=${(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>
          <option value="single">Single</option><option value="multi">Multiple</option>
        </select>
      <//>
      <p class="insp__hint">Type a new name, or pick an existing field to reuse its definition.</p>
      <button class="insp__create" data-create-field onClick=${() => getBuilder().createField(entityId, form, side)}>${rawIcon('check')}Create field</button>
    </div>`;
}

export function NewAnnotationForm() {
  const [form, setForm] = useState({ kind: 'event', label: '', method: '' });

  return html`
    <div class="insp" data-new="annotation">
      <p class="insp__title">New annotation</p>
      <${Row} label="Kind"><select class="insp__input" value=${form.kind} onChange=${(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>${optionList(ANNOTATION_KINDS)}</select><//>
      <${Row} label="Label"><input class="insp__input" data-new-label value=${form.label} placeholder="e.g. Sync API" onInput=${(e) => setForm((p) => ({ ...p, label: e.target.value }))} /><//>
      <${Row} label="Method"><input class="insp__input" value=${form.method} placeholder="POST, GET…" onInput=${(e) => setForm((p) => ({ ...p, method: e.target.value }))} /><//>
      <button class="insp__create" data-create-annotation onClick=${() => getBuilder().createAnnotation(form)}>${rawIcon('check')}Create annotation</button>
    </div>`;
}

export function InspectorBody({ selected }) {
  if (!selected) {
    return html`<p class="insp__empty">Select a node in build mode to inspect it.</p>`;
  }
  if (selected.kind === 'entity') {
    return html`<${EntityForm} key=${selected.id} id=${selected.id} />`;
  }
  if (selected.kind === 'field') {
    return html`<${FieldForm} key=${selected.id} id=${selected.id} />`;
  }
  if (selected.kind === 'annotation') {
    return html`<${AnnotationForm} key=${selected.id} id=${selected.id} />`;
  }
  if (selected.kind === 'new-entity') {
    return html`<${NewEntityForm} />`;
  }
  if (selected.kind === 'new-annotation') {
    return html`<${NewAnnotationForm} />`;
  }
  return html`<${NewFieldForm} key=${'new:' + selected.entityId} entityId=${selected.entityId} side=${selected.side} />`;
}
