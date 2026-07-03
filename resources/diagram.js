/**
 * Nexus content-model diagram front-end.
 *
 * Reads the model embedded in the #model script tag and renders it with
 * Cytoscape.js on an infinite, pannable canvas, mapping each element to the
 * diagram's visual language (see the legend). Fields are collapsed by default
 * to an entity-only overview; the toolbar reveals detail, filters, an entity
 * index and a field table.
 */
(function () {
  'use strict';

  var ENTITY_COLORS = {
    node: '#d9e2f3',
    taxonomy_term: '#9fc5e8',
    media: '#f6b26b',
    paragraph: '#ffffff',
    block_content: '#b6d7a8',
    user: '#ea9999',
    external: '#ea9999',
  };

  var ENTITY_TYPE_LABELS = {
    node: 'Content type',
    taxonomy_term: 'Vocabulary',
    media: 'Media',
    paragraph: 'Paragraph',
    block_content: 'Block',
    user: 'User',
    external: 'External entity',
  };

  var TYPE_ORDER = ['node', 'taxonomy_term', 'media', 'paragraph', 'block_content', 'user', 'external'];

  var fieldsMode = false;
  var rankDir = 'LR';
  var showMachineNames = false;
  var typeVisible = {};

  function prettify(value) {
    return String(value || '').replace(/[_.]/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function typeLabel(entityType) {
    return ENTITY_TYPE_LABELS[entityType] || prettify(entityType);
  }

  function entityColor(entityType) {
    return ENTITY_COLORS[entityType] || '#eceff3';
  }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function readModel() {
    try {
      return JSON.parse(document.getElementById('model').textContent);
    }
    catch (e) {
      return { meta: {}, nodes: [], edges: [] };
    }
  }

  // Model-derived lookups, populated in init().
  var entityById = {};
  var fieldById = {};
  var refsByField = {};

  function buildElements(model) {
    var nodes = model.nodes || [];
    var ids = {};
    nodes.forEach(function (n) {
      ids[n.data.id] = true;
      if (n.data.group === 'entity') {
        entityById[n.data.id] = n.data;
      }
      else if (n.data.group === 'field') {
        fieldById[n.data.id] = n.data;
      }
    });

    var edges = (model.edges || []).filter(function (e) {
      return ids[e.data.source] && ids[e.data.target];
    });

    // Collapsed entity-to-entity edges, aggregated from reference edges.
    var seen = {};
    var collapsed = [];
    edges.forEach(function (e) {
      if (e.data.group === 'ref') {
        (refsByField[e.data.source] = refsByField[e.data.source] || []).push(e.data.target);
      }
    });
    Object.keys(refsByField).forEach(function (fieldId) {
      var field = fieldById[fieldId];
      if (!field) {
        return;
      }
      refsByField[fieldId].forEach(function (target) {
        var key = field.entity + '>' + target;
        if (!seen[key] && ids[field.entity]) {
          seen[key] = true;
          collapsed.push({ data: { id: 'c:' + key, source: field.entity, target: target, group: 'collapsed' } });
        }
      });
    });

    return { nodes: nodes, edges: edges.concat(collapsed) };
  }

  function style() {
    return [
      {
        selector: 'node[group="entity"]',
        style: {
          shape: 'round-rectangle',
          'background-color': function (ele) {
            return entityColor(ele.data('entityType'));
          },
          'border-color': '#5b6470',
          'border-width': 1.5,
          label: function (ele) {
            return ele.data('label') + '\n' + typeLabel(ele.data('entityType'));
          },
          'text-wrap': 'wrap',
          'text-max-width': 160,
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': 12,
          'font-weight': 600,
          'line-height': 1.25,
          color: '#1f2933',
          width: 'label',
          height: 'label',
          padding: '10px',
        },
      },
      {
        selector: 'node[group="field"]',
        style: {
          shape: 'ellipse',
          'background-color': '#ffffff',
          'border-color': '#555c66',
          'border-width': 1,
          label: function (ele) {
            return ele.data('required') ? ele.data('label') + ' *' : ele.data('label');
          },
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': 10,
          color: '#2b333d',
          width: 'label',
          height: 'label',
          padding: '7px',
        },
      },
      { selector: 'node[group="field"][kind="multi"]', style: { 'border-width': 3, 'border-style': 'double', 'border-color': '#3d444d' } },
      { selector: 'node[group="field"][kind="system"]', style: { 'border-style': 'dashed', 'border-color': '#98a2b3', color: '#6b7280' } },
      { selector: 'node[group="field"][kind="calculated"]', style: { 'background-color': '#ffd966', 'border-color': '#c9a227' } },
      {
        selector: 'node[group="annotation"]',
        style: {
          'background-color': '#ffffff',
          'border-color': '#333b45',
          'border-width': 1.5,
          label: function (ele) {
            return ele.data('method') ? ele.data('label') + '\n' + ele.data('method') : ele.data('label');
          },
          'text-wrap': 'wrap',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': 10,
          width: 'label',
          height: 'label',
          padding: '12px',
        },
      },
      { selector: 'node[group="annotation"][kind="event"]', style: { shape: 'diamond' } },
      { selector: 'node[group="annotation"][kind="api"]', style: { shape: 'hexagon' } },
      { selector: 'node[group="annotation"][kind="callback"]', style: { shape: 'round-rectangle', 'font-weight': 600, padding: '9px' } },
      {
        selector: 'edge',
        style: {
          'curve-style': 'taxi',
          'taxi-direction': function () {
            return rankDir === 'TB' ? 'vertical' : 'horizontal';
          },
          'taxi-turn': '50%',
          'taxi-turn-min-distance': '8px',
          width: 1.2,
          'line-color': '#aeb4bd',
          'target-arrow-shape': 'none',
        },
      },
      {
        selector: 'edge[group="ref"], edge[group="collapsed"]',
        style: {
          'line-color': '#8a94a3',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#8a94a3',
          'arrow-scale': 0.9,
        },
      },
      {
        selector: 'edge[group="ref"]',
        style: {
          label: 'data(cardinality)',
          'font-size': 9,
          color: '#6b7280',
          'text-background-color': '#f4f5f7',
          'text-background-opacity': 1,
          'text-background-padding': 2,
        },
      },
      {
        selector: 'edge[group="annotation"]',
        style: {
          'line-style': 'dashed',
          'line-color': '#b5739d',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#b5739d',
          label: 'data(label)',
          'font-size': 9,
          color: '#8a5a76',
        },
      },
      { selector: '.faded', style: { opacity: 0.1 } },
      { selector: '.hidden', style: { display: 'none' } },
      { selector: '.highlight', style: { 'border-color': '#2f6db3', 'border-width': 3 } },
    ];
  }

  var SWATCHES = {
    entity: '<svg width="34" height="24"><rect x="2" y="4" width="30" height="16" rx="3" fill="#9fc5e8" stroke="#5b6470"/></svg>',
    single: '<svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#fff" stroke="#555c66"/></svg>',
    multi: '<svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#fff" stroke="#3d444d"/><ellipse cx="17" cy="12" rx="11" ry="6.5" fill="none" stroke="#3d444d"/></svg>',
    system: '<svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#fff" stroke="#98a2b3" stroke-dasharray="3 2"/></svg>',
    calculated: '<svg width="34" height="24"><ellipse cx="17" cy="12" rx="14" ry="9" fill="#ffd966" stroke="#c9a227"/></svg>',
    event: '<svg width="34" height="24"><polygon points="17,3 31,12 17,21 3,12" fill="#fff" stroke="#333b45"/></svg>',
    api: '<svg width="34" height="24"><polygon points="10,3 24,3 32,12 24,21 10,21 2,12" fill="#fff" stroke="#333b45"/></svg>',
    callback: '<svg width="34" height="24"><rect x="2" y="4" width="30" height="16" rx="2" fill="#fff" stroke="#333b45"/><line x1="2" y1="13" x2="32" y2="13" stroke="#333b45"/></svg>',
  };

  var LEGEND_ITEMS = [
    ['entity', 'Entity (name / type)'],
    ['single', 'Single-value field'],
    ['multi', 'Multi-value field'],
    ['system', 'System field'],
    ['calculated', 'Calculated field'],
    ['event', 'Event'],
    ['api', 'API'],
    ['callback', 'Callback / method'],
  ];

  function buildLegend(container) {
    var html = '<p class="legend__title">Legend</p>';
    LEGEND_ITEMS.forEach(function (item) {
      html += '<div class="legend__item"><span class="legend__swatch">' + SWATCHES[item[0]] +
        '</span><span class="legend__label">' + item[1] + '</span></div>';
    });
    container.innerHTML = html;
  }

  function fieldReferences(fieldId) {
    return (refsByField[fieldId] || []).map(function (target) {
      return entityById[target] ? entityById[target].label : target;
    });
  }

  function tooltipHtml(node) {
    var group = node.data('group');
    var name = esc(node.data('label'));

    if (group === 'entity') {
      return '<div class="tooltip__name">' + name + '</div>' +
        '<div class="tooltip__meta">' + esc(typeLabel(node.data('entityType'))) + ' · ' + esc(node.data('bundle')) + '</div>';
    }

    if (group === 'field') {
      var meta = [prettify(node.data('kind')) + ' field', esc(node.data('fieldType'))];
      var refs = fieldReferences(node.id());
      if (refs.length) {
        meta.push('→ ' + esc(refs.join(', ')));
      }
      return '<div class="tooltip__name">' + name + '</div><div class="tooltip__meta">' + meta.join(' · ') + '</div>';
    }

    var extra = node.data('method') ? ' · ' + esc(node.data('method')) : '';
    return '<div class="tooltip__name">' + name + '</div><div class="tooltip__meta">' + esc(prettify(node.data('kind'))) + extra + '</div>';
  }

  function init() {
    var model = readModel();
    var elements = buildElements(model);

    TYPE_ORDER.concat(Object.keys(entityById).map(function (id) {
      return entityById[id].entityType;
    })).forEach(function (t) {
      if (!(t in typeVisible)) {
        typeVisible[t] = true;
      }
    });

    var cy = cytoscape({
      container: document.getElementById('cy'),
      elements: elements,
      style: style(),
      minZoom: 0.05,
      maxZoom: 3,
      layout: { name: 'grid' },
    });

    function entityTypeOf(entityId) {
      return entityById[entityId] ? entityById[entityId].entityType : null;
    }

    function nodeVisible(node) {
      var group = node.data('group');
      if (group === 'entity') {
        return typeVisible[node.data('entityType')] !== false;
      }
      if (group === 'field') {
        return fieldsMode && typeVisible[entityTypeOf(node.data('entity'))] !== false;
      }
      return true;
    }

    function refresh(relayout) {
      var visible = {};
      cy.nodes().forEach(function (n) {
        var vis = nodeVisible(n);
        n.toggleClass('hidden', !vis);
        if (vis) {
          visible[n.id()] = true;
        }
      });
      cy.edges().forEach(function (e) {
        var group = e.data('group');
        var ends = visible[e.data('source')] && visible[e.data('target')];
        var vis;
        if (group === 'has' || group === 'ref') {
          vis = fieldsMode && ends;
        }
        else if (group === 'collapsed') {
          vis = !fieldsMode && ends;
        }
        else {
          vis = ends;
        }
        e.toggleClass('hidden', !vis);
      });

      if (relayout) {
        runLayout();
      }
    }

    function runLayout() {
      cy.elements(':visible').layout({
        name: 'dagre',
        rankDir: rankDir,
        ranker: 'network-simplex',
        nodeSep: fieldsMode ? 26 : 52,
        edgeSep: 16,
        rankSep: fieldsMode ? 95 : 150,
        nodeDimensionsIncludeLabels: true,
        animate: false,
      }).run();
      cy.fit(undefined, 50);
      positionCaptions();
    }

    function focusEntity(id) {
      var node = cy.getElementById(id);
      if (node.empty()) {
        return;
      }
      var hood = node.closedNeighborhood().closedNeighborhood();
      cy.elements().addClass('faded');
      hood.removeClass('faded');
      node.removeClass('faded');
      cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.8) }, { duration: 350 });
    }

    function clearFocus() {
      cy.elements().removeClass('faded');
    }

    // Machine-name captions rendered as a DOM layer below each node, so they
    // sit outside the shape in a monospace font.
    var captionsEl = document.getElementById('captions');
    var captionMap = {};

    function machineNameOf(node) {
      var group = node.data('group');
      if (group === 'entity') {
        return node.data('bundle');
      }
      if (group === 'field') {
        return node.data('name') || '';
      }
      return '';
    }

    function rebuildCaptions() {
      captionsEl.innerHTML = '';
      captionMap = {};
      if (!showMachineNames) {
        return;
      }
      cy.nodes().forEach(function (node) {
        var name = machineNameOf(node);
        if (!name) {
          return;
        }
        var div = document.createElement('div');
        div.className = 'caption';
        div.textContent = name;
        captionsEl.appendChild(div);
        captionMap[node.id()] = div;
      });
      positionCaptions();
    }

    function positionCaptions() {
      if (!showMachineNames) {
        return;
      }
      var zoom = cy.zoom();
      var tooSmall = zoom < 0.35;
      var size = Math.max(7, Math.min(13, 10 * zoom));
      Object.keys(captionMap).forEach(function (id) {
        var node = cy.getElementById(id);
        var div = captionMap[id];
        if (node.empty() || node.hasClass('hidden') || node.hasClass('faded') || tooSmall) {
          div.style.display = 'none';
          return;
        }
        var pos = node.renderedPosition();
        div.style.display = 'block';
        div.style.left = pos.x + 'px';
        div.style.top = (pos.y + node.renderedOuterHeight() / 2 + 3) + 'px';
        div.style.fontSize = size + 'px';
      });
    }

    // Legend.
    buildLegend(document.getElementById('legend'));

    // Type filters.
    var presentTypes = TYPE_ORDER.filter(function (t) {
      return Object.keys(entityById).some(function (id) {
        return entityById[id].entityType === t;
      });
    });
    var filtersEl = document.getElementById('type-filters');
    filtersEl.innerHTML = presentTypes.map(function (t) {
      return '<label class="filters__item"><input type="checkbox" data-type="' + esc(t) + '" checked>' +
        '<span class="filters__swatch" style="background:' + entityColor(t) + '"></span>' + esc(typeLabel(t)) + '</label>';
    }).join('');
    filtersEl.addEventListener('change', function (evt) {
      var input = evt.target;
      if (input && input.getAttribute('data-type')) {
        typeVisible[input.getAttribute('data-type')] = input.checked;
        refresh(true);
      }
    });

    // Entity index.
    var listEl = document.getElementById('entity-list');
    var entityHtml = Object.keys(entityById).map(function (id) {
      var e = entityById[id];
      var count = cy.nodes('[group="field"][entity="' + id + '"]').length;
      return '<div class="entity-row" data-type="' + esc(e.entityType) + '">' +
        '<button class="entity-row__name" data-id="' + esc(id) + '"><b>' + esc(e.label) + '</b> ' +
        '<span class="entity-row__type">' + esc(typeLabel(e.entityType)) + '</span></button>' +
        '<span class="entity-row__count">' + count + '</span>' +
        '<button class="entity-row__fields" data-fields="' + esc(id) + '">fields</button></div>';
    }).join('');
    listEl.innerHTML = entityHtml;
    listEl.addEventListener('click', function (evt) {
      var focus = evt.target.closest('.entity-row__name');
      if (focus) {
        focusEntity(focus.getAttribute('data-id'));
        return;
      }
      var fields = evt.target.closest('.entity-row__fields');
      if (fields) {
        openTable(fields.getAttribute('data-fields'));
      }
    });

    // Field table.
    var records = [];
    cy.nodes('[group="field"]').forEach(function (f) {
      var entity = entityById[f.data('entity')] || { label: f.data('entity'), entityType: '' };
      records.push({
        entityId: f.data('entity'),
        entity: entity.label,
        entityType: entity.entityType,
        field: f.data('label'),
        name: f.data('name') || '',
        type: f.data('fieldType'),
        kind: f.data('kind'),
        required: !!f.data('required'),
        refs: fieldReferences(f.id()),
      });
    });

    var tableEntity = document.getElementById('table-entity');
    tableEntity.innerHTML = '<option value="__all__">All entities</option>' + Object.keys(entityById).map(function (id) {
      return '<option value="' + esc(id) + '">' + esc(entityById[id].label) + '</option>';
    }).join('');

    function kindBadge(kind) {
      return '<span class="badge badge--' + esc(kind) + '">' + esc(kind) + '</span>';
    }

    function renderTable() {
      var filter = tableEntity.value;
      var term = document.getElementById('table-search').value.trim().toLowerCase();
      var rows = records.filter(function (r) {
        if (filter && filter !== '__all__' && r.entityId !== filter) {
          return false;
        }
        if (term) {
          var hay = (r.entity + ' ' + r.field + ' ' + r.name + ' ' + r.type + ' ' + r.refs.join(' ')).toLowerCase();
          if (hay.indexOf(term) === -1) {
            return false;
          }
        }
        return true;
      });

      var html = '<thead><tr><th>Field</th><th>Type</th><th>Card.</th><th>Req</th><th>References</th></tr></thead><tbody>';
      var current = null;
      rows.forEach(function (r) {
        if (r.entityId !== current) {
          current = r.entityId;
          html += '<tr class="is-group"><td colspan="5">' + esc(r.entity) + ' · ' + esc(typeLabel(r.entityType)) + '</td></tr>';
        }
        html += '<tr><td>' + esc(r.field) + '<br><code>' + esc(r.name) + '</code></td><td>' + esc(r.type) +
          '</td><td>' + kindBadge(r.kind) + '</td><td>' + (r.required ? '✓' : '') + '</td><td>' + esc(r.refs.join(', ')) + '</td></tr>';
      });
      if (!rows.length) {
        html += '<tr><td colspan="5">No fields match.</td></tr>';
      }
      document.getElementById('field-table').innerHTML = html + '</tbody>';
    }

    tableEntity.addEventListener('change', renderTable);
    document.getElementById('table-search').addEventListener('input', renderTable);
    renderTable();

    // Panels.
    function togglePanel(id, button) {
      var panel = document.getElementById(id);
      panel.hidden = !panel.hidden;
      button.classList.toggle('is-active', !panel.hidden);
    }

    var entitiesBtn = document.getElementById('entities-toggle');
    var tableBtn = document.getElementById('table-toggle');
    var legendBtn = document.getElementById('legend-toggle');

    entitiesBtn.addEventListener('click', function () {
      togglePanel('entities', entitiesBtn);
    });
    tableBtn.addEventListener('click', function () {
      togglePanel('table', tableBtn);
    });
    legendBtn.addEventListener('click', function () {
      togglePanel('legend', legendBtn);
    });

    function openTable(entityId) {
      tableEntity.value = entityId;
      renderTable();
      var panel = document.getElementById('table');
      panel.hidden = false;
      tableBtn.classList.add('is-active');
    }

    Array.prototype.forEach.call(document.querySelectorAll('.panel__close'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-close');
        document.getElementById(id).hidden = true;
        document.getElementById(id + '-toggle').classList.remove('is-active');
      });
    });

    // Legend on by default.
    document.getElementById('legend').hidden = false;
    legendBtn.classList.add('is-active');

    // Tooltip.
    var tooltip = document.getElementById('tooltip');
    cy.on('mouseover', 'node', function (evt) {
      tooltip.innerHTML = tooltipHtml(evt.target);
      tooltip.hidden = false;
    });
    cy.on('mousemove', 'node', function (evt) {
      tooltip.style.left = (evt.renderedPosition.x + 14) + 'px';
      tooltip.style.top = (evt.renderedPosition.y + 14) + 'px';
    });
    cy.on('mouseout', 'node', function () {
      tooltip.hidden = true;
    });
    cy.on('tap', function (evt) {
      if (evt.target === cy) {
        clearFocus();
      }
    });
    cy.on('tap', 'node[group="entity"]', function (evt) {
      focusEntity(evt.target.id());
    });

    // Toolbar.
    function zoomBy(factor) {
      cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    }

    document.getElementById('zoom-in').addEventListener('click', function () {
      zoomBy(1.25);
    });
    document.getElementById('zoom-out').addEventListener('click', function () {
      zoomBy(0.8);
    });
    document.getElementById('fit').addEventListener('click', function () {
      cy.fit(undefined, 45);
    });
    document.getElementById('reset').addEventListener('click', function () {
      clearFocus();
      cy.fit(undefined, 45);
    });

    var fieldsBtn = document.getElementById('fields-toggle');
    fieldsBtn.addEventListener('click', function () {
      fieldsMode = !fieldsMode;
      fieldsBtn.textContent = fieldsMode ? 'Hide fields' : 'Show fields';
      fieldsBtn.classList.toggle('is-active', fieldsMode);
      clearFocus();
      refresh(true);
    });

    var layoutBtn = document.getElementById('layout-toggle');
    layoutBtn.addEventListener('click', function () {
      rankDir = rankDir === 'LR' ? 'TB' : 'LR';
      layoutBtn.textContent = 'Layout: ' + rankDir;
      runLayout();
    });

    document.getElementById('machine-names').addEventListener('change', function (evt) {
      showMachineNames = evt.target.checked;
      rebuildCaptions();
    });

    var captionRaf = false;
    cy.on('render', function () {
      if (!showMachineNames || captionRaf) {
        return;
      }
      captionRaf = true;
      requestAnimationFrame(function () {
        captionRaf = false;
        positionCaptions();
      });
    });

    document.getElementById('search').addEventListener('input', function (evt) {
      var term = evt.target.value.trim().toLowerCase();
      if (!term) {
        clearFocus();
        return;
      }
      cy.elements().addClass('faded');
      var matches = cy.nodes('[group="entity"]').filter(function (n) {
        return (n.data('label') + ' ' + n.data('bundle')).toLowerCase().indexOf(term) !== -1;
      });
      matches.union(matches.closedNeighborhood().closedNeighborhood()).removeClass('faded');
    });

    // Initial render: entity-only overview.
    refresh(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  }
  else {
    init();
  }
})();
