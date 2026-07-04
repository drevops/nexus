/**
 * Build-mode inspector, as Preact components over Shoelace controls.
 *
 * Inputs are sl-input, selects are sl-select, the required flag is an sl-switch
 * and references are sl-tags - all theming with light/dark automatically. Edits
 * write straight through to the live Cytoscape node; structural changes go
 * through the builder controller on the store. The new-field "machine name"
 * stays a native input because it needs a datalist for the reuse autocomplete,
 * which Shoelace 2.x has no equivalent for. A few data-* hooks remain so tests
 * and scripts can target controls by intent.
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
  return html`<span slot="prefix" dangerouslySetInnerHTML=${{ __html: icon(name, size) }}></span>`;
}

function Row({ label, children }) {
  return html`<div class="insp__row"><label>${label}</label>${children}</div>`;
}

function slOptions(list) {
  return list.map((item) => {
    const value = Array.isArray(item) ? item[0] : item;
    const label = Array.isArray(item) ? item[1] : item;
    return html`<sl-option value=${value}>${label}</sl-option>`;
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
    <button class="insp__field" title="Inspect this field" onClick=${() => openInspector({ kind: 'field', id: f.id() })}>${f.data('label')} <code>${f.data('name')}</code></button>`);

  return html`
    <div class="insp">
      <p class="insp__title">Entity</p>
      <${Row} label="Label">
        <sl-input size="small" value=${label} onsl-input=${(e) => { setLabel(e.target.value); node.data('label', e.target.value); bump(); }}></sl-input>
      <//>
      <${Row} label="Type"><span class="insp__ro">${TYPE_LABELS[node.data('entityType')] || node.data('entityType')}</span><//>
      <${Row} label="Machine name"><sl-input size="small" value=${node.data('bundle')} title="Rename the machine name (updates its fields and references)" onsl-change=${(e) => getBuilder().renameEntity(id, e.target.value)}></sl-input><//>
      <div class="insp__section">
        <div class="insp__sectionhead"><span>Fields</span><sl-button size="small" data-add-field title="Add a field to this entity" onClick=${() => openInspector({ kind: 'new-field', entityId: id })}>${rawIcon('plus')}Field</sl-button></div>
        ${fields.length ? fields : html`<p class="insp__empty">No fields yet.</p>`}
      </div>
      <sl-button size="small" variant="danger" outline class="insp__delete" title="Delete this entity and its fields" onClick=${() => getBuilder().deleteNode(id)}>${rawIcon('trash')}Delete entity</sl-button>
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
  const entityOptions = cy().nodes('[group="entity"]').map((e) => html`<sl-option value=${e.id()}>${e.data('label')}</sl-option>`);

  return html`
    <div class="insp">
      <p class="insp__title">Field</p>
      <${Row} label="Label"><sl-input size="small" value=${s.label} onsl-input=${(e) => set('label', e.target.value)}></sl-input><//>
      <${Row} label="Machine name"><sl-input size="small" value=${node.data('name')} title="Rename the machine name (updates its references)" onsl-change=${(e) => getBuilder().renameField(id, e.target.value)}></sl-input><//>
      <${Row} label="Type"><sl-select size="small" value=${s.fieldType} onsl-change=${(e) => set('fieldType', e.target.value)}>${slOptions(FIELD_TYPES)}</sl-select><//>
      <${Row} label="Cardinality">
        <sl-select size="small" value=${s.kind} onsl-change=${(e) => set('kind', e.target.value)}>
          <sl-option value="single">Single</sl-option><sl-option value="multi">Multiple</sl-option>
        </sl-select>
      <//>
      <${Row} label="Required"><sl-switch size="small" checked=${s.required} onsl-change=${(e) => set('required', e.target.checked)}></sl-switch><//>
      ${isRef && html`
        <div class="insp__section">
          <div class="insp__sectionhead"><span>References</span></div>
          ${targets.length ? targets.map((t) => html`
            <sl-tag class="insp__reftag" size="small" removable onsl-remove=${() => { getBuilder().removeReference(id, t); bump(); }}>${cy().getElementById(t).data('label') || t}</sl-tag>`) : html`<p class="insp__empty">No references.</p>`}
          <sl-select size="small" placeholder="Add target…" value="" onsl-change=${(e) => { if (e.target.value) { getBuilder().addReference(id, e.target.value); e.target.value = ''; bump(); } }}>${entityOptions}</sl-select>
        </div>`}
      <sl-button size="small" variant="danger" outline class="insp__delete" title="Delete this field" onClick=${() => getBuilder().deleteNode(id)}>${rawIcon('trash')}Delete field</sl-button>
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
      <${Row} label="Label"><sl-input size="small" value=${s.label} onsl-input=${(e) => set('label', e.target.value)}></sl-input><//>
      <${Row} label="Kind"><sl-select size="small" value=${s.kind} onsl-change=${(e) => set('kind', e.target.value)}>${slOptions(ANNOTATION_KINDS)}</sl-select><//>
      <${Row} label="Method"><sl-input size="small" value=${s.method} placeholder="POST, GET…" onsl-input=${(e) => set('method', e.target.value)}></sl-input><//>
      <sl-button size="small" variant="danger" outline class="insp__delete" title="Delete this annotation" onClick=${() => getBuilder().deleteNode(id)}>${rawIcon('trash')}Delete</sl-button>
    </div>`;
}

export function NewEntityForm({ entityType }) {
  const [form, setForm] = useState({ entityType: entityType || 'node', bundle: '', label: '' });

  return html`
    <div class="insp" data-new="entity">
      <p class="insp__title">New ${TYPE_LABELS[form.entityType] || 'entity'}</p>
      <${Row} label="Type"><sl-select size="small" value=${form.entityType} onsl-change=${(e) => setForm((p) => ({ ...p, entityType: e.target.value }))}>${slOptions(ENTITY_TYPES)}</sl-select><//>
      <${Row} label="Machine name"><sl-input size="small" data-new-bundle value=${form.bundle} placeholder="e.g. article" onsl-input=${(e) => setForm((p) => ({ ...p, bundle: e.target.value }))}></sl-input><//>
      <${Row} label="Label"><sl-input size="small" data-new-label value=${form.label} placeholder="e.g. Article" onsl-input=${(e) => setForm((p) => ({ ...p, label: e.target.value }))}></sl-input><//>
      <sl-button size="small" variant="primary" class="insp__create" data-create-entity title="Create the entity" onClick=${() => getBuilder().createEntity(form)}>${rawIcon('check')}Create entity</sl-button>
    </div>`;
}

export function NewFieldForm({ entityId, side }) {
  const entities = cy().nodes('[group="entity"]');
  const [form, setForm] = useState({ entity: entityId || (entities.length ? entities[0].id() : ''), name: '', label: '', fieldType: 'string', kind: 'single', target: '' });
  const existing = existingFields();

  function onName(value) {
    const match = existing.find((f) => f.name === value);
    setForm((prev) => match ? { ...prev, name: value, label: match.label, fieldType: match.fieldType, kind: match.kind } : { ...prev, name: value });
  }

  const resolvedEntity = entityId || form.entity;
  const isRef = REFERENCE_TYPES.includes(form.fieldType);
  const entityOptions = entities.map((e) => html`<sl-option value=${e.id()}>${e.data('label')}</sl-option>`);

  return html`
    <div class="insp" data-new="field" data-side=${side || ''}>
      <p class="insp__title">New field</p>
      ${!entityId ? html`<${Row} label="On entity"><sl-select size="small" data-new-entity value=${form.entity} onsl-change=${(e) => setForm((p) => ({ ...p, entity: e.target.value }))}>${entityOptions}</sl-select><//>` : null}
      <${Row} label="Machine name">
        <input class="insp__input" data-new-name list="existing-field-list" value=${form.name} placeholder="e.g. field_body" autocomplete="off" onInput=${(e) => onName(e.target.value)} />
      <//>
      <datalist id="existing-field-list">${existing.map((f) => html`<option value=${f.name}>${f.label} (${f.fieldType})</option>`)}</datalist>
      <${Row} label="Label"><sl-input size="small" data-new-label value=${form.label} placeholder="e.g. Body" onsl-input=${(e) => setForm((p) => ({ ...p, label: e.target.value }))}></sl-input><//>
      <${Row} label="Type"><sl-select size="small" data-new-fieldtype value=${form.fieldType} onsl-change=${(e) => setForm((p) => ({ ...p, fieldType: e.target.value }))}>${slOptions(FIELD_TYPES)}</sl-select><//>
      <${Row} label="Cardinality">
        <sl-select size="small" value=${form.kind} onsl-change=${(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>
          <sl-option value="single">Single</sl-option><sl-option value="multi">Multiple</sl-option>
        </sl-select>
      <//>
      ${isRef ? html`<${Row} label="Link to"><sl-select size="small" data-new-target value=${form.target} placeholder="(no reference)" clearable onsl-change=${(e) => setForm((p) => ({ ...p, target: e.target.value }))}>${entityOptions}</sl-select><//>` : null}
      <p class="insp__hint">Type a new name, or pick an existing field to reuse its definition.</p>
      <sl-button size="small" variant="primary" class="insp__create" data-create-field title="Create the field" onClick=${() => getBuilder().createField(resolvedEntity, form, side)}>${rawIcon('check')}Create field</sl-button>
    </div>`;
}

export function NewAnnotationForm() {
  const [form, setForm] = useState({ kind: 'event', label: '', method: '' });

  return html`
    <div class="insp" data-new="annotation">
      <p class="insp__title">New annotation</p>
      <${Row} label="Kind"><sl-select size="small" value=${form.kind} onsl-change=${(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>${slOptions(ANNOTATION_KINDS)}</sl-select><//>
      <${Row} label="Label"><sl-input size="small" data-new-label value=${form.label} placeholder="e.g. Sync API" onsl-input=${(e) => setForm((p) => ({ ...p, label: e.target.value }))}></sl-input><//>
      <${Row} label="Method"><sl-input size="small" value=${form.method} placeholder="POST, GET…" onsl-input=${(e) => setForm((p) => ({ ...p, method: e.target.value }))}></sl-input><//>
      <sl-button size="small" variant="primary" class="insp__create" data-create-annotation title="Create the annotation" onClick=${() => getBuilder().createAnnotation(form)}>${rawIcon('check')}Create annotation</sl-button>
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
    return html`<${NewEntityForm} entityType=${selected.entityType} />`;
  }
  if (selected.kind === 'new-annotation') {
    return html`<${NewAnnotationForm} />`;
  }
  return html`<${NewFieldForm} key=${'new:' + selected.entityId} entityId=${selected.entityId} side=${selected.side} />`;
}
