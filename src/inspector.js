/**
 * Build-mode inspector, as Preact components over Shoelace controls.
 *
 * Shoelace controls follow the light and dark themes automatically. Edits
 * are written straight to the live Cytoscape node; structural changes go
 * through the builder controller on the store. Each edit records a history
 * step, and typing into 1 text field makes 1 step.
 *
 * The new-field "machine name" stays a native input because it needs a
 * datalist for the reuse autocomplete, which Shoelace 2.x has no equivalent
 * for. The data-* attributes give tests and scripts hooks to target controls
 * by intent.
 */

import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import htmBase from 'htm';
import { icon } from './icons.js';
import { cardinalityLabel, kindForCardinality, FIELD_TYPES, KIND_SYSTEM, MAX_CARDINALITY, REFERENCE_FIELD_TYPES } from './model.js';
import { ANNOTATION_KINDS } from './annotations.js';
import { formatFieldLine, parseFieldLines } from './bulk-fields.js';
import { allowedValuesText, parseAllowedValues, settingText } from './field-settings.js';
import { BULK_FIELDS_LABEL, inspectorTrail, NEW_FIELD_LABEL, nodeLookup } from './inspector-trail.js';
import { describeNode } from './history.js';
import { checkpoint } from './undo.js';
import { getController, getBuilder, openInspector, bump } from './store.js';

const html = htmBase.bind(h);

const CARDINALITY_OPTIONS = [
  ['1', 'Single'],
  ...Array.from({ length: MAX_CARDINALITY - 1 }, (_, index) => [String(index + 2), String(index + 2)]),
  ['-1', 'Unlimited'],
];
const ANNOTATION_OPTIONS = ANNOTATION_KINDS.map((entry) => [entry.kind, entry.label]);
const ANNOTATION_KIND_TITLE = 'The kind of annotation: ' + ANNOTATION_KINDS.map((entry) => entry.label).join(', ');
const METHOD_TITLE = 'A method shown under the label, such as an HTTP verb';

// The selection whose form last took the focus. A form the history remounts
// keeps its selection, so the focus stays where it was.
let focusedSelection = null;

// Set by a breadcrumb crumb: the crumb holding the focus is gone once the
// entity form replaces its screen, so the form takes the focus instead.
let focusEntityForm = false;

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

// Focuses the field in `ref` each time `selection` opens the form, so typing
// fills the form rather than running the keyboard shortcuts. A Shoelace
// field takes the focus only once it has rendered.
function useFocusOnOpen(ref, selection) {
  useEffect(() => {
    if (selection === focusedSelection) {
      return;
    }

    const field = ref.current;

    focusedSelection = selection;
    Promise.resolve(field.updateComplete).then(() => field.focus());
  }, [selection]);
}

// A note on any node; writing to it live rebuilds the canvas badge. Forms are
// keyed by node id, so this remounts (and re-reads the note) per selection.
function NoteField({ node }) {
  const [note, setNote] = useState(node.data('note') || '');
  return html` <div class="insp__note">
    <label>Note</label>
    <sl-textarea
      size="small"
      data-note
      rows="3"
      resize="auto"
      placeholder="Add a note - shows as a badge on the canvas…"
      title="A note on this node, shown as a badge on the canvas"
      value=${note}
      onsl-input=${(e) => {
        setNote(e.target.value);
        node.data('note', e.target.value);
        getController().rebuildNotes();
        bump();
        checkpoint('Edited the note on ' + describeNode(node), 'note:' + node.id());
      }}
    ></sl-textarea>
  </div>`;
}

// Sets a description or field setting, or removes its key when the value is
// blank, so a cleared setting matches one never set.
function setSetting(node, key, value) {
  const blank = Array.isArray(value) ? value.length === 0 : typeof value === 'string' ? settingText(value) === '' : value === null;

  if (blank) {
    node.removeData(key);
  } else {
    node.data(key, value);
  }
}

// A text setting of a node. `toText` and `fromText` convert between the value
// the node holds and the text the control shows.
function TextSetting({ node, dataKey, label, title, placeholder, multiline, action, toText = (value) => value || '', fromText = (text) => text }) {
  const [text, setText] = useState(toText(node.data(dataKey)));

  function onInput(e) {
    setText(e.target.value);
    setSetting(node, dataKey, fromText(e.target.value));
    bump();
    checkpoint(action + ' ' + describeNode(node), dataKey + ':' + node.id());
  }

  if (!multiline) {
    return html`<${Row} label=${label}
      ><sl-input size="small" data-setting=${dataKey} title=${title} placeholder=${placeholder} value=${text} onsl-input=${onInput}></sl-input
    ><//>`;
  }

  return html`<div class="insp__note">
    <label>${label}</label>
    <sl-textarea
      size="small"
      data-setting=${dataKey}
      rows="2"
      resize="auto"
      title=${title}
      placeholder=${placeholder}
      value=${text}
      onsl-input=${onInput}
    ></sl-textarea>
  </div>`;
}

const TRANSLATABLE_VALUES = { yes: true, no: false };

function TranslatableSetting({ node }) {
  const current = node.data('translatable');
  const [value, setValue] = useState(current === true ? 'yes' : current === false ? 'no' : '');

  function onChange(e) {
    const picked = Object.hasOwn(TRANSLATABLE_VALUES, e.target.value) ? TRANSLATABLE_VALUES[e.target.value] : null;

    setValue(e.target.value);
    setSetting(node, 'translatable', picked);
    bump();

    if (picked === null) {
      checkpoint('Cleared whether ' + describeNode(node) + ' is translatable');
    } else {
      checkpoint('Made ' + describeNode(node) + (picked ? ' translatable' : ' not translatable'));
    }
  }

  return html`<${Row} label="Translatable"
    ><sl-select
      size="small"
      data-setting="translatable"
      clearable
      placeholder="Not set"
      title="Whether the field's value can differ per language. Clear it when the source doesn't say."
      value=${value}
      onsl-change=${onChange}
      ><sl-option value="yes">Yes</sl-option><sl-option value="no">No</sl-option></sl-select
    ><//
  >`;
}

export function existingFields() {
  const byName = {};
  cy()
    .nodes('[group="field"]')
    .forEach((f) => {
      const name = f.data('name');
      if (name && !byName[name]) {
        byName[name] = {
          name: name,
          label: f.data('label'),
          fieldType: f.data('fieldType'),
          cardinality: f.data('cardinality') != null ? f.data('cardinality') : 1,
        };
      }
    });
  return Object.keys(byName)
    .sort()
    .map((name) => byName[name]);
}

function fieldsOf(entityId) {
  return cy().nodes('[group="field"][entity="' + entityId + '"]');
}

// Base fields belong to their entity type, so another entity copies only the
// rest.
function copyableFields(entityId) {
  return fieldsOf(entityId).filter((field) => field.data('kind') !== KIND_SYSTEM);
}

function refTargets(fieldId) {
  return cy()
    .getElementById(fieldId)
    .connectedEdges('[group="ref"]')
    .filter((e) => e.source().id() === fieldId)
    .map((e) => e.target().id());
}

export function EntityForm({ id }) {
  const node = cy().getElementById(id);
  const [label, setLabel] = useState(node.data('label'));
  const formRef = useRef(null);

  useEffect(() => {
    if (focusEntityForm) {
      focusEntityForm = false;
      formRef.current.focus();
    }
  }, []);

  const fields = fieldsOf(id).map(
    (f) =>
      html` <button class="insp__field" title="Inspect this field" onClick=${() => openInspector({ kind: 'field', id: f.id() })}>
        ${f.data('label')} <code>${f.data('name')}</code>
      </button>`,
  );

  return html` <div class="insp" tabindex="-1" ref=${formRef}>
    <p class="insp__title">Entity</p>
    <${Row} label="Label">
      <sl-input
        size="small"
        data-label
        title="The entity's label"
        value=${label}
        onsl-input=${(e) => {
          setLabel(e.target.value);
          node.data('label', e.target.value);
          // Each proxy holds a copy of its target's label.
          getController().syncReferences();
          bump();
          checkpoint('Relabelled ' + describeNode(node), 'label:' + id);
        }}
      ></sl-input>
    <//>
    <${Row} label="Type"><span class="insp__ro">${getController().typeLabel(node.data('entityType'))}</span><//>
    <${Row} label="Machine name"
      ><sl-input
        size="small"
        data-machine-name
        value=${node.data('bundle')}
        title="Rename the machine name (updates its fields and references)"
        onsl-change=${(e) => getBuilder().renameEntity(id, e.target.value)}
      ></sl-input
    ><//>
    <${TextSetting}
      node=${node}
      dataKey="description"
      label="Description"
      title="The bundle's description, as Drupal shows it to editors"
      placeholder="Describe what this bundle is for…"
      multiline
      action="Edited the description of"
    />
    <${NoteField} node=${node} />
    <div class="insp__section">
      <div class="insp__sectionhead">
        <span>Fields</span>
        <span class="insp__actions"
          ><sl-button
            size="small"
            data-bulk-fields
            title="Add several fields at once, or copy them from another entity"
            onClick=${() => openInspector({ kind: 'bulk-fields', entityId: id })}
            >${rawIcon('list')}Bulk</sl-button
          ><sl-button size="small" data-add-field title="Add a field to this entity" onClick=${() => openInspector({ kind: 'new-field', entityId: id })}
            >${rawIcon('plus')}Field</sl-button
          ></span
        >
      </div>
      ${fields.length ? fields : html`<p class="insp__empty">No fields yet.</p>`}
    </div>
    <sl-button size="small" variant="danger" outline class="insp__delete" title="Delete this entity and its fields" onClick=${() => getBuilder().deleteNode(id)}
      >${rawIcon('trash')}Delete entity</sl-button
    >
  </div>`;
}

// The other bundles that share the field's storage, each with its own label
// for the field. A base or calculated field has no storage to share.
function SharedWith({ id, entityId }) {
  const record = getController()
    .records()
    .find((r) => r.id === id);

  if (!record || !record.usedIn.length) {
    return null;
  }

  const others = record.usedIn.filter((bundle) => bundle.entityId !== entityId);
  const buttons = others.map(
    (bundle) =>
      html`<button
        type="button"
        class="insp__field"
        data-shared-bundle=${bundle.entityId}
        title=${'Open ' + bundle.entity + ', which labels this field ' + bundle.field}
        onClick=${() => {
          focusEntityForm = true;
          getBuilder().select(bundle.entityId);
        }}
      >
        ${bundle.entity} <span class="insp__shared-label">${bundle.field}</span>
      </button>`,
  );

  return html`<div class="insp__section" data-shared-with>
    <div class="insp__sectionhead"><span>Also used in</span></div>
    ${buttons.length ? buttons : html`<p class="insp__empty">No other bundle has this field.</p>`}
  </div>`;
}

export function FieldForm({ id }) {
  const node = cy().getElementById(id);
  const [s, setS] = useState({
    label: node.data('label'),
    fieldType: node.data('fieldType'),
    cardinality: node.data('cardinality') != null ? node.data('cardinality') : 1,
    required: !!node.data('required'),
  });
  // Read once, so clearing the list doesn't remove its box mid-edit.
  const [hasAllowedValues] = useState(Boolean(node.data('allowedValues')));

  function set(key, value) {
    node.data(key, value);
    setS((prev) => ({ ...prev, [key]: value }));
    bump();
  }

  function setCardinality(value) {
    const cardinality = parseInt(value, 10);
    node.data('cardinality', cardinality);
    node.data('kind', kindForCardinality(cardinality));
    node.connectedEdges('[group="ref"]').data('cardinality', cardinalityLabel(cardinality));
    // Each proxy edge holds a copy of its ref edge's cardinality.
    getController().syncReferences();
    setS((prev) => ({ ...prev, cardinality: cardinality }));
    bump();
    checkpoint('Changed the cardinality of ' + describeNode(node));
  }

  const isRef = REFERENCE_FIELD_TYPES.includes(s.fieldType);
  const targets = refTargets(id);
  const entityOptions = cy()
    .nodes('[group="entity"]')
    .map((e) => html`<sl-option value=${e.id()}>${e.data('label')}</sl-option>`);

  return html` <div class="insp">
    <p class="insp__title">Field</p>
    <${Row} label="Label"
      ><sl-input
        size="small"
        data-label
        title="The field's label"
        value=${s.label}
        onsl-input=${(e) => {
          set('label', e.target.value);
          checkpoint('Relabelled ' + describeNode(node), 'label:' + id);
        }}
      ></sl-input
    ><//>
    <${Row} label="Machine name"
      ><sl-input
        size="small"
        data-machine-name
        value=${node.data('name')}
        title="Rename the machine name (updates its references)"
        onsl-change=${(e) => getBuilder().renameField(id, e.target.value)}
      ></sl-input
    ><//>
    <${Row} label="Type"
      ><sl-select
        size="small"
        title="The field type"
        value=${s.fieldType}
        onsl-change=${(e) => {
          set('fieldType', e.target.value);
          checkpoint('Changed the type of ' + describeNode(node));
        }}
        >${slOptions(FIELD_TYPES)}</sl-select
      ><//
    >
    <${Row} label="Cardinality"
      ><sl-select
        size="small"
        data-cardinality
        title="How many values the field holds"
        value=${String(s.cardinality)}
        onsl-change=${(e) => setCardinality(e.target.value)}
        >${slOptions(CARDINALITY_OPTIONS)}</sl-select
      ><//
    >
    <${Row} label="Required"
      ><sl-switch
        size="small"
        title="Whether the field must have a value"
        checked=${s.required}
        onsl-change=${(e) => {
          set('required', e.target.checked);
          checkpoint('Made ' + describeNode(node) + (e.target.checked ? ' required' : ' optional'));
        }}
      ></sl-switch
    ><//>
    <${TranslatableSetting} node=${node} />
    <${TextSetting}
      node=${node}
      dataKey="description"
      label="Help text"
      title="The help text editors see under the field"
      placeholder="Explain what goes in this field…"
      multiline
      action="Edited the help text of"
    />
    <${TextSetting}
      node=${node}
      dataKey="defaultValue"
      label="Default value"
      title="The value a new item starts with"
      placeholder="No default"
      action="Changed the default value of"
    />
    ${
      (String(s.fieldType).startsWith('list_') || hasAllowedValues) &&
      html`<${TextSetting}
        node=${node}
        dataKey="allowedValues"
        label="Allowed values"
        title="The values the list offers, 1 per line as value|label. A line without a label uses its value."
        placeholder=${'draft|Draft\npublished|Published'}
        multiline
        action="Changed the allowed values of"
        toText=${(list) => allowedValuesText(list || [])}
        fromText=${parseAllowedValues}
      />`
    }
    ${
      isRef &&
      html` <div class="insp__section">
        <div class="insp__sectionhead"><span>References</span></div>
        ${
          targets.length
            ? targets.map(
                (t) =>
                  html` <sl-tag
                    class="insp__reftag"
                    size="small"
                    removable
                    title=${'This field references ' + (cy().getElementById(t).data('label') || t) + '. The cross removes the reference.'}
                    onsl-remove=${() => {
                      getBuilder().removeReference(id, t);
                      bump();
                    }}
                    >${cy().getElementById(t).data('label') || t}</sl-tag
                  >`,
              )
            : html`<p class="insp__empty">No references.</p>`
        }
        <sl-select
          size="small"
          placeholder="Add target…"
          title="Add an entity this field references"
          value=""
          onsl-change=${(e) => {
            if (e.target.value) {
              getBuilder().createReference(id, e.target.value);
              e.target.value = '';
              bump();
            }
          }}
          >${entityOptions}</sl-select
        >
      </div>`
    }
    <${SharedWith} id=${id} entityId=${node.data('entity')} />
    <${NoteField} node=${node} />
    <sl-button size="small" variant="danger" outline class="insp__delete" title="Delete this field" onClick=${() => getBuilder().deleteNode(id)}
      >${rawIcon('trash')}Delete field</sl-button
    >
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

  return html` <div class="insp">
    <p class="insp__title">Annotation</p>
    <${Row} label="Label"
      ><sl-input
        size="small"
        title="The annotation's label"
        value=${s.label}
        onsl-input=${(e) => {
          set('label', e.target.value);
          checkpoint('Relabelled ' + describeNode(node), 'label:' + id);
        }}
      ></sl-input
    ><//>
    <${Row} label="Kind"
      ><sl-select
        size="small"
        title=${ANNOTATION_KIND_TITLE}
        value=${s.kind}
        onsl-change=${(e) => {
          set('kind', e.target.value);
          checkpoint('Changed the kind of ' + describeNode(node));
        }}
        >${slOptions(ANNOTATION_OPTIONS)}</sl-select
      ><//
    >
    <${Row} label="Method"
      ><sl-input
        size="small"
        title=${METHOD_TITLE}
        value=${s.method}
        placeholder="POST, GET…"
        onsl-input=${(e) => {
          set('method', e.target.value);
          checkpoint('Changed the method of ' + describeNode(node), 'method:' + id);
        }}
      ></sl-input
    ><//>
    <${NoteField} node=${node} />
    <sl-button size="small" variant="danger" outline class="insp__delete" title="Delete this annotation" onClick=${() => getBuilder().deleteNode(id)}
      >${rawIcon('trash')}Delete</sl-button
    >
  </div>`;
}

export function NewEntityForm({ entityType, selection }) {
  const [form, setForm] = useState({ entityType: entityType || 'node', bundle: '', label: '' });
  const bundleRef = useRef(null);
  const controller = getController();
  const typeOptions = controller.allTypes().map((type) => [type, controller.typeLabel(type)]);

  useFocusOnOpen(bundleRef, selection);

  return html` <div class="insp" data-new="entity">
    <p class="insp__title">New ${controller.typeLabel(form.entityType) || 'entity'}</p>
    <${Row} label="Type"
      ><sl-select
        size="small"
        title="The entity type of the new bundle"
        value=${form.entityType}
        onsl-change=${(e) => setForm((p) => ({ ...p, entityType: e.target.value }))}
        >${slOptions(typeOptions)}</sl-select
      ><//
    >
    <${Row} label="Machine name"
      ><sl-input
        size="small"
        data-new-bundle
        ref=${bundleRef}
        title="Machine name of the new bundle, such as article"
        value=${form.bundle}
        placeholder="e.g. article"
        onsl-input=${(e) => setForm((p) => ({ ...p, bundle: e.target.value }))}
      ></sl-input
    ><//>
    <${Row} label="Label"
      ><sl-input
        size="small"
        data-new-label
        title="Label of the new bundle, such as Article"
        value=${form.label}
        placeholder="e.g. Article"
        onsl-input=${(e) => setForm((p) => ({ ...p, label: e.target.value }))}
      ></sl-input
    ><//>
    <sl-button size="small" variant="primary" class="insp__create" data-create-entity title="Create the entity" onClick=${() => getBuilder().createEntity(form)}
      >${rawIcon('check')}Create entity</sl-button
    >
  </div>`;
}

export function NewFieldForm({ entityId, side, selection }) {
  const entities = cy().nodes('[group="entity"]');
  const [form, setForm] = useState({
    entity: entityId || (entities.length ? entities[0].id() : ''),
    name: '',
    label: '',
    fieldType: 'string',
    cardinality: 1,
    target: '',
  });
  const nameRef = useRef(null);
  const existing = existingFields();

  useFocusOnOpen(nameRef, selection);

  function onName(value) {
    const match = existing.find((f) => f.name === value);
    setForm((prev) =>
      match ? { ...prev, name: value, label: match.label, fieldType: match.fieldType, cardinality: match.cardinality } : { ...prev, name: value },
    );
  }

  const resolvedEntity = entityId || form.entity;
  const isRef = REFERENCE_FIELD_TYPES.includes(form.fieldType);
  const entityOptions = entities.map((e) => html`<sl-option value=${e.id()}>${e.data('label')}</sl-option>`);

  return html` <div class="insp" data-new="field" data-side=${side || ''}>
    <p class="insp__title">${NEW_FIELD_LABEL}</p>
    ${
      !entityId
        ? html`<${Row} label="On entity"
            ><sl-select
              size="small"
              data-new-entity
              title="The entity to add the field to"
              value=${form.entity}
              onsl-change=${(e) => setForm((p) => ({ ...p, entity: e.target.value }))}
              >${entityOptions}</sl-select
            ><//
          >`
        : null
    }
    <${Row} label="Machine name">
      <input
        class="insp__input"
        data-new-name
        ref=${nameRef}
        list="existing-field-list"
        title="Machine name of the new field, or of an existing field to reuse its definition"
        value=${form.name}
        placeholder="e.g. field_body"
        autocomplete="off"
        onInput=${(e) => onName(e.target.value)}
      />
    <//>
    <datalist id="existing-field-list">${existing.map((f) => html`<option value=${f.name}>${f.label} (${f.fieldType})</option>`)}</datalist>
    <${Row} label="Label"
      ><sl-input
        size="small"
        data-new-label
        title="Label of the new field, such as Body"
        value=${form.label}
        placeholder="e.g. Body"
        onsl-input=${(e) => setForm((p) => ({ ...p, label: e.target.value }))}
      ></sl-input
    ><//>
    <${Row} label="Type"
      ><sl-select
        size="small"
        data-new-fieldtype
        title="The field type"
        value=${form.fieldType}
        onsl-change=${(e) => setForm((p) => ({ ...p, fieldType: e.target.value }))}
        >${slOptions(FIELD_TYPES)}</sl-select
      ><//
    >
    <${Row} label="Cardinality"
      ><sl-select
        size="small"
        data-new-cardinality
        title="How many values the field holds"
        value=${String(form.cardinality)}
        onsl-change=${(e) => setForm((p) => ({ ...p, cardinality: parseInt(e.target.value, 10) }))}
        >${slOptions(CARDINALITY_OPTIONS)}</sl-select
      ><//
    >
    ${
      isRef
        ? html`<${Row} label="Link to"
            ><sl-select
              size="small"
              data-new-target
              title="The entity the new field references"
              value=${form.target}
              placeholder="(no reference)"
              clearable
              onsl-change=${(e) => setForm((p) => ({ ...p, target: e.target.value }))}
              >${entityOptions}</sl-select
            ><//
          >`
        : null
    }
    <p class="insp__hint">Type a new name, or pick an existing field to reuse its definition.</p>
    <sl-button
      size="small"
      variant="primary"
      class="insp__create"
      data-create-field
      title="Create the field"
      onClick=${() => getBuilder().createField(resolvedEntity, form, side)}
      >${rawIcon('check')}Create field</sl-button
    >
  </div>`;
}

// A field node as the definition bulk-fields.js reads and writes.
function fieldDefinition(field) {
  return {
    name: field.data('name'),
    label: field.data('label'),
    fieldType: field.data('fieldType'),
    cardinality: field.data('cardinality') != null ? field.data('cardinality') : 1,
    required: !!field.data('required'),
    targets: refTargets(field.id()),
  };
}

function countOf(count, noun) {
  return count + ' ' + noun + (count === 1 ? '' : 's');
}

function BulkLine({ entry }) {
  if (entry.error) {
    return html`<li class="insp__bulkline is-error" data-bulk-line=${entry.line}>Line ${entry.line}: ${entry.error}</li>`;
  }

  const field = entry.field;
  const targets = field.targets.map((target) => cy().getElementById(target).data('label') || target);
  const details = [field.fieldType, cardinalityLabel(field.cardinality), field.required ? 'required' : null, targets.length ? '→ ' + targets.join(', ') : null];

  return html`<li class="insp__bulkline" data-bulk-line=${entry.line}>
    ${field.label} <code>${field.name}</code>
    <span class="insp__bulkdetails">${details.filter(Boolean).join(' · ')}</span>
  </li>`;
}

export function BulkFieldsForm({ entityId, selection }) {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState('');
  const textRef = useRef(null);
  const entity = cy().getElementById(entityId);
  const entities = cy().nodes('[group="entity"]');
  const existing = existingFields();
  const taken = fieldsOf(entityId).map((field) => field.data('name'));
  const fieldTypes = [
    ...FIELD_TYPES,
    ...cy()
      .nodes('[group="field"]')
      .map((field) => field.data('fieldType')),
  ];
  const entries = parseFieldLines(text, { taken: taken, existing: existing, entityIds: entities.map((e) => e.id()), fieldTypes: fieldTypes });
  const fields = entries.filter((entry) => entry.field).map((entry) => entry.field);
  const errorCount = entries.length - fields.length;
  const sources = entities.filter((e) => e.id() !== entityId && copyableFields(e.id()).nonempty());

  useFocusOnOpen(textRef, selection);

  // Appends the source's fields as lines, leaving out the names the entity
  // already has or the text already lists.
  function copyFrom(sourceId) {
    const listed = new Set([...taken, ...fields.map((field) => field.name)]);
    const definitions = copyableFields(sourceId).map(fieldDefinition);
    const lines = definitions.filter((field) => !listed.has(field.name)).map(formatFieldLine);
    const skipped = definitions.length - lines.length;

    setText((prev) => [prev.trimEnd(), ...lines].filter(Boolean).join('\n'));
    setCopied(
      'Copied ' +
        countOf(lines.length, 'field') +
        ' from ' +
        cy().getElementById(sourceId).data('label') +
        (skipped ? ', skipped ' + skipped + ' already listed or on this entity.' : '.'),
    );
  }

  let action = BULK_FIELDS_LABEL;

  if (errorCount) {
    action = 'Fix ' + countOf(errorCount, 'line');
  } else if (fields.length) {
    action = 'Add ' + countOf(fields.length, 'field');
  }

  return html` <div class="insp" data-new="bulk-fields">
    <p class="insp__title">Add fields to ${entity.nonempty() ? entity.data('label') : 'entity'}</p>
    ${
      sources.length
        ? html`<${Row} label="Copy from"
            ><sl-select
              size="small"
              data-copy-from
              title="Add the fields of another entity to the box"
              placeholder="Pick an entity…"
              value=""
              onsl-change=${(e) => {
                if (e.target.value) {
                  copyFrom(e.target.value);
                  e.target.value = '';
                }
              }}
              >${sources.map((e) => html`<sl-option value=${e.id()}>${e.data('label')} (${copyableFields(e.id()).length})</sl-option>`)}</sl-select
            ><//
          >`
        : null
    }
    ${copied ? html`<p class="insp__hint" data-copied>${copied}</p>` : null}
    <sl-textarea
      size="small"
      class="insp__bulktext"
      data-bulk-text
      ref=${textRef}
      title="The fields to add, 1 per line"
      label="Fields, 1 per line"
      help-text="A label or machine name, then any of a type, a cardinality, required and target entity ids, split by commas."
      rows="8"
      resize="auto"
      placeholder=${'Body\nfield_tags, entity_reference, unlimited, taxonomy_term.tags\nSummary (field_summary), text_long, required'}
      value=${text}
      onsl-input=${(e) => setText(e.target.value)}
    ></sl-textarea>
    ${
      entries.length
        ? html`<ul class="insp__bulk">
            ${entries.map((entry) => html`<${BulkLine} entry=${entry} />`)}
          </ul>`
        : null
    }
    <sl-button
      size="small"
      variant="primary"
      class="insp__create"
      data-create-fields
      title="Add the listed fields to the entity"
      disabled=${errorCount > 0 || !fields.length}
      onClick=${() => {
        if (!errorCount) {
          getBuilder().createFields(entityId, fields);
        }
      }}
      >${rawIcon('check')}${action}</sl-button
    >
  </div>`;
}

export function NewAnnotationForm() {
  const [form, setForm] = useState({ kind: 'event', label: '', method: '' });

  return html` <div class="insp" data-new="annotation">
    <p class="insp__title">New annotation</p>
    <${Row} label="Kind"
      ><sl-select size="small" title=${ANNOTATION_KIND_TITLE} value=${form.kind} onsl-change=${(e) => setForm((p) => ({ ...p, kind: e.target.value }))}
        >${slOptions(ANNOTATION_OPTIONS)}</sl-select
      ><//
    >
    <${Row} label="Label"
      ><sl-input
        size="small"
        data-new-label
        title="Label of the new annotation, such as Sync API"
        value=${form.label}
        placeholder="e.g. Sync API"
        onsl-input=${(e) => setForm((p) => ({ ...p, label: e.target.value }))}
      ></sl-input
    ><//>
    <${Row} label="Method"
      ><sl-input
        size="small"
        title=${METHOD_TITLE}
        value=${form.method}
        placeholder="POST, GET…"
        onsl-input=${(e) => setForm((p) => ({ ...p, method: e.target.value }))}
      ></sl-input
    ><//>
    <sl-button
      size="small"
      variant="primary"
      class="insp__create"
      data-create-annotation
      title="Create the annotation"
      onClick=${() => getBuilder().createAnnotation(form)}
      >${rawIcon('check')}Create annotation</sl-button
    >
  </div>`;
}

// The forms read the graph when they mount, so they are keyed by the store's
// revision and remount after the history changes the graph.
function InspectorForm({ selected, revision }) {
  if (selected.kind === 'entity') {
    return html`<${EntityForm} key=${selected.id + '@' + revision} id=${selected.id} />`;
  }
  if (selected.kind === 'field') {
    return html`<${FieldForm} key=${selected.id + '@' + revision} id=${selected.id} />`;
  }
  if (selected.kind === 'annotation') {
    return html`<${AnnotationForm} key=${selected.id + '@' + revision} id=${selected.id} />`;
  }
  if (selected.kind === 'new-entity') {
    return html`<${NewEntityForm} key=${'new:' + selected.entityType} entityType=${selected.entityType} selection=${selected} />`;
  }
  if (selected.kind === 'new-annotation') {
    return html`<${NewAnnotationForm} />`;
  }
  if (selected.kind === 'bulk-fields') {
    return html`<${BulkFieldsForm} key=${'bulk:' + selected.entityId + '@' + revision} entityId=${selected.entityId} selection=${selected} />`;
  }
  return html`<${NewFieldForm} key=${'new:' + selected.entityId + '@' + revision} entityId=${selected.entityId} side=${selected.side} selection=${selected} />`;
}

function Breadcrumb({ selected }) {
  const trail = inspectorTrail(selected, nodeLookup(cy()));

  if (!trail.length) {
    return null;
  }

  return html`<nav class="insp__crumbs" aria-label="Inspector breadcrumb">
    <ol>
      ${trail.map((crumb) =>
        crumb.id
          ? html`<li>
              <button
                type="button"
                class="insp__crumb"
                data-crumb=${crumb.id}
                title=${'Back to ' + crumb.label}
                onClick=${() => {
                  focusEntityForm = true;
                  getBuilder().select(crumb.id);
                }}
              >
                ${crumb.label}
              </button>
            </li>`
          : html`<li aria-current="page">${crumb.label}</li>`,
      )}
    </ol>
  </nav>`;
}

export function InspectorBody({ selected, revision }) {
  if (!selected) {
    return html`<p class="insp__empty">Select a node in build mode to inspect it.</p>`;
  }

  return html`<${Breadcrumb} selected=${selected} /><${InspectorForm} selected=${selected} revision=${revision} />`;
}
