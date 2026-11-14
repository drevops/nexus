/**
 * The cursor the diagram canvas shows: what a press of the left button does
 * at the pointer.
 *
 * A pan or a held node shows `grabbing`, drawing a connection or placing a
 * Note shows `crosshair`, and the empty canvas and edges show the default
 * cursor. Over a node, View mode shows `pointer`, because a click focuses the
 * node. Edit mode shows `grab` on a node a drag moves and `pointer` on one a
 * click only selects. Connect mode shows `crosshair` on a field, where a
 * press starts a connection.
 */

/**
 * Returns the CSS cursor for the canvas state, or '' for the default.
 *
 * `node` describes the node under the pointer as `{ group, grabbable }`, or
 * is null. `edit` and `connect` are the modes, `panning` and `holding` a
 * right-drag pan and a grabbed node, `connecting` a connection being drawn,
 * `placing` a Note waiting for its spot and `comparing` an open comparison.
 */
export function canvasCursor({ node, edit, connect, panning, holding, connecting, placing, comparing } = {}) {
  if (panning || holding) {
    return 'grabbing';
  }

  if (connecting || placing) {
    return 'crosshair';
  }

  if (!node) {
    return '';
  }

  if (edit && connect) {
    return node.group === 'field' ? 'crosshair' : 'pointer';
  }

  if (edit) {
    return node.grabbable ? 'grab' : 'pointer';
  }

  // A double-click opens any node in Edit mode, which a comparison turns
  // off, and an annotation does nothing on a single click.
  if (comparing && node.group === 'annotation') {
    return '';
  }

  return 'pointer';
}
