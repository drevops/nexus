/**
 * Edit history: the versions a diagram goes through, stored as the changes
 * between them.
 *
 * A snapshot holds the state a version can differ in: the title, the data of
 * the model elements (entities, fields, annotations and the edges between
 * them) and the position of every model node and proxy. Proxies are derived
 * from the ref edges, so only their positions are kept.
 *
 * A change holds the parts of 2 snapshots that differ, as a pair of partial
 * snapshots. Applying its `before` side undoes it, applying its `after` side
 * redoes it, and neither touches an element the change does not name.
 */

const MODEL_NODE_GROUPS = ['entity', 'field', 'annotation'];
const MODEL_EDGE_GROUPS = ['has', 'ref', 'annotation'];

// The node groups a history label names by their group.
const NAMED_GROUPS = ['entity', 'field', 'annotation', 'proxy'];

const PARTS = ['elements', 'positions'];

// Cytoscape rejects changes to these keys, so data updates leave them alone.
const IMMUTABLE_KEYS = ['id', 'source', 'target', 'parent'];

export const HISTORY_LIMIT = 200;

/**
 * Names a node in a history label: its group and its label in quotes, such
 * as 'field “Body”'. A node without a label is named by its id.
 */
export function describeNode(node) {
  const group = node.data('group');
  const noun = NAMED_GROUPS.includes(group) ? group : 'node';

  return noun + ' “' + (node.data('label') || node.id()) + '”';
}

// A copy of element data. Keys holding undefined are left out, so they
// compare equal to missing keys.
function plainData(data) {
  const copy = {};

  Object.keys(data).forEach((key) => {
    if (data[key] !== undefined) {
      copy[key] = data[key];
    }
  });

  return copy;
}

// Deep equality for the plain values a snapshot holds.
function same(a, b) {
  if (a === b) {
    return true;
  }

  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  const keys = Object.keys(a);

  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]));
}

/**
 * Returns the snapshot of a graph under the given title.
 *
 * Cytoscape returns its own data and position objects, so the snapshot holds
 * copies.
 */
export function snapshotGraph(cy, title) {
  const elements = {};
  const positions = {};

  cy.nodes().forEach((node) => {
    const group = node.data('group');
    const isModel = MODEL_NODE_GROUPS.includes(group);

    if (isModel) {
      elements[node.id()] = { group: 'nodes', data: plainData(node.data()) };
    }

    if (isModel || group === 'proxy') {
      positions[node.id()] = { x: node.position('x'), y: node.position('y') };
    }
  });

  cy.edges().forEach((edge) => {
    if (MODEL_EDGE_GROUPS.includes(edge.data('group'))) {
      elements[edge.id()] = { group: 'edges', data: plainData(edge.data()) };
    }
  });

  return { title: title, elements: elements, positions: positions };
}

function emptyPartial() {
  return { elements: {}, positions: {} };
}

function isEmpty(partial) {
  return !('title' in partial) && PARTS.every((part) => Object.keys(partial[part]).length === 0);
}

/**
 * Returns the change from 1 snapshot to another, or null when both hold the
 * same state. An element or position missing from a side is null on it.
 */
export function diffSnapshots(from, to) {
  const change = { before: emptyPartial(), after: emptyPartial() };

  PARTS.forEach((part) => {
    new Set([...Object.keys(from[part]), ...Object.keys(to[part])]).forEach((id) => {
      const before = from[part][id] ?? null;
      const after = to[part][id] ?? null;

      if (!same(before, after)) {
        change.before[part][id] = before;
        change.after[part][id] = after;
      }
    });
  });

  if (from.title !== to.title) {
    change.before.title = from.title;
    change.after.title = to.title;
  }

  return isEmpty(change.before) ? null : change;
}

// Merges partial snapshots in the order they apply in, so the last one that
// names an element, a position or the title decides it.
function overlay(partials) {
  const merged = emptyPartial();

  partials.forEach((partial) => {
    PARTS.forEach((part) => Object.assign(merged[part], partial[part]));

    if ('title' in partial) {
      merged.title = partial.title;
    }
  });

  return merged;
}

/**
 * Returns the change 2 consecutive changes make together, or null when the
 * second one reverts the first.
 */
export function composeChanges(first, second) {
  const before = overlay([second.before, first.before]);
  const after = overlay([first.after, second.after]);

  PARTS.forEach((part) => {
    Object.keys(before[part]).forEach((id) => {
      if (same(before[part][id], after[part][id])) {
        delete before[part][id];
        delete after[part][id];
      }
    });
  });

  if ('title' in before && before.title === after.title) {
    delete before.title;
    delete after.title;
  }

  return isEmpty(before) ? null : { before: before, after: after };
}

// Sets the data of an element to `data`, removing the keys `data` lacks.
function setData(element, data) {
  Object.keys(element.data()).forEach((key) => {
    if (!IMMUTABLE_KEYS.includes(key) && !Object.hasOwn(data, key)) {
      element.removeData(key);
    }
  });

  Object.keys(data).forEach((key) => {
    if (!IMMUTABLE_KEYS.includes(key) && !same(element.data(key), data[key])) {
      element.data(key, data[key]);
    }
  });
}

// Cytoscape edits the data and position objects it is given in place, so it
// gets copies of the stored ones.
function restoreNode(cy, id, definition, position) {
  const node = cy.getElementById(id);

  if (node.nonempty()) {
    setData(node, definition.data);
    return;
  }

  cy.add({ group: 'nodes', data: { ...definition.data }, position: { ...position } });
}

// The ends of an edge are immutable data, so an edge whose ends changed is
// added again under its id. An edge with a missing end is left out.
function restoreEdge(cy, id, definition) {
  const edge = cy.getElementById(id);
  const { source, target } = definition.data;

  if (edge.nonempty() && edge.data('source') === source && edge.data('target') === target) {
    setData(edge, definition.data);
    return;
  }

  edge.remove();

  if (cy.getElementById(source).nonempty() && cy.getElementById(target).nonempty()) {
    cy.add({ group: 'edges', data: { ...definition.data } });
  }
}

/**
 * Brings a graph in line with a partial snapshot.
 *
 * Each element in the partial is added, updated, or removed when it is null.
 * Then `syncReferences(cy)` brings the proxies in line with the ref edges.
 * Last, each node and proxy in the partial moves to its position, so a proxy
 * restored with its reference is in the graph by then.
 */
export function applyPartial(cy, partial, syncReferences) {
  const entries = Object.entries(partial.elements);

  entries.forEach(([id, definition]) => {
    if (definition === null) {
      cy.getElementById(id).remove();
    }
  });

  // Nodes are restored first, since an edge needs both of its ends.
  entries.forEach(([id, definition]) => {
    if (definition && definition.group === 'nodes') {
      restoreNode(cy, id, definition, partial.positions[id]);
    }
  });

  entries.forEach(([id, definition]) => {
    if (definition && definition.group === 'edges') {
      restoreEdge(cy, id, definition);
    }
  });

  syncReferences(cy);

  Object.entries(partial.positions).forEach(([id, position]) => {
    const node = cy.getElementById(id);

    if (position && node.nonempty()) {
      node.position({ ...position });
    }
  });
}

/**
 * The versions of 1 diagram. Version 0 is the diagram as it was opened, and
 * version i is the diagram after step i.
 *
 * `graph.snapshot()` returns the snapshot of the diagram, and
 * `graph.apply(partial)` brings the diagram in line with a partial snapshot.
 * `options.now()` returns the time a version is made, and `options.limit`
 * caps the steps kept.
 */
export class History {
  constructor(graph, options = {}) {
    this.graph = graph;
    this.now = options.now || Date.now;
    this.limit = options.limit || HISTORY_LIMIT;
    this.origin = null;
    this.steps = [];
    this.index = 0;
    this.baseline = null;
    this.coalescing = null;
  }

  /**
   * Starts over with the diagram as it is as version 0, under `label`.
   */
  reset(label) {
    this.origin = { label: label, time: this.now() };
    this.steps = [];
    this.index = 0;
    this.baseline = this.graph.snapshot();
    this.coalescing = null;
  }

  /**
   * Records the change since the current version as a step under `label`,
   * dropping any undone steps. Returns whether the history changed.
   *
   * A record with the same `coalesce` key as the record before it joins its
   * step, so typing into 1 field makes 1 step. Any other record, a jump to a
   * version or a rebase ends the run.
   */
  record(label, coalesce = null) {
    if (!this.baseline) {
      return false;
    }

    const current = this.graph.snapshot();
    const change = diffSnapshots(this.baseline, current);

    if (!change) {
      return false;
    }

    this.baseline = current;
    this.steps.length = this.index;

    if (coalesce !== null && coalesce === this.coalescing) {
      this.join(label, change);
    } else {
      this.steps.push({ label: label, time: this.now(), change: change });
      this.coalescing = coalesce;
    }

    // The oldest kept step becomes version 0.
    while (this.steps.length > this.limit) {
      const oldest = this.steps.shift();
      this.origin = { label: oldest.label, time: oldest.time };
    }

    this.index = this.steps.length;

    return true;
  }

  // Joins a change onto the last step, which takes the label and time of the
  // change. A step whose edits cancel out is removed.
  join(label, change) {
    const last = this.steps.length - 1;
    const joined = composeChanges(this.steps[last].change, change);

    if (joined) {
      this.steps[last] = { label: label, time: this.now(), change: joined };
      return;
    }

    this.steps.pop();
    this.coalescing = null;
  }

  /**
   * Adopts the diagram as it is as the current version, without a step, so
   * no step includes the changes made since the last one.
   */
  rebase() {
    if (!this.baseline) {
      return;
    }

    this.baseline = this.graph.snapshot();
    this.coalescing = null;
  }

  /**
   * Brings the diagram to the version at `index` in 1 apply. Returns false
   * when that is the current version or no version.
   */
  goTo(index) {
    if (!this.baseline || index === this.index || index < 0 || index > this.steps.length) {
      return false;
    }

    // Undone steps apply newest first and redone ones oldest first, so the
    // step nearest the target decides each element.
    const partials =
      index < this.index
        ? this.steps
            .slice(index, this.index)
            .reverse()
            .map((step) => step.change.before)
        : this.steps.slice(this.index, index).map((step) => step.change.after);

    this.graph.apply(overlay(partials));
    this.index = index;
    this.baseline = this.graph.snapshot();
    this.coalescing = null;

    return true;
  }

  undo() {
    return this.goTo(this.index - 1);
  }

  redo() {
    return this.goTo(this.index + 1);
  }

  /**
   * Returns the label and time of each version, from version 0.
   */
  versions() {
    if (!this.origin) {
      return [];
    }

    return [this.origin, ...this.steps.map((step) => ({ label: step.label, time: step.time }))];
  }
}
