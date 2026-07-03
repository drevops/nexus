/**
 * Nexus content-model diagram front-end.
 *
 * Reads the model embedded in the #model script tag and renders it with
 * Cytoscape.js on an infinite, pannable canvas, mapping each element to the
 * diagram's visual language (see the legend).
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

  function readModel() {
    var el = document.getElementById('model');
    try {
      return JSON.parse(el.textContent);
    }
    catch (e) {
      return { meta: {}, nodes: [], edges: [] };
    }
  }

  function buildElements(model) {
    var ids = {};
    (model.nodes || []).forEach(function (n) {
      ids[n.data.id] = true;
    });

    var edges = (model.edges || []).filter(function (e) {
      return ids[e.data.source] && ids[e.data.target];
    });

    return { nodes: model.nodes || [], edges: edges };
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
          'text-max-width': 150,
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
      {
        selector: 'node[group="field"][kind="multi"]',
        style: {
          'border-width': 3,
          'border-style': 'double',
          'border-color': '#3d444d',
        },
      },
      {
        selector: 'node[group="field"][kind="system"]',
        style: {
          'border-style': 'dashed',
          'border-color': '#98a2b3',
          color: '#6b7280',
        },
      },
      {
        selector: 'node[group="field"][kind="calculated"]',
        style: {
          'background-color': '#ffd966',
          'border-color': '#c9a227',
        },
      },
      {
        selector: 'node[group="annotation"][kind="event"]',
        style: {
          shape: 'diamond',
          'background-color': '#ffffff',
          'border-color': '#333b45',
          'border-width': 1.5,
          label: 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': 10,
          width: 'label',
          height: 'label',
          padding: '12px',
        },
      },
      {
        selector: 'node[group="annotation"][kind="api"]',
        style: {
          shape: 'hexagon',
          'background-color': '#ffffff',
          'border-color': '#333b45',
          'border-width': 1.5,
          label: 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': 10,
          width: 'label',
          height: 'label',
          padding: '12px',
        },
      },
      {
        selector: 'node[group="annotation"][kind="callback"]',
        style: {
          shape: 'round-rectangle',
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
          'font-weight': 600,
          width: 'label',
          height: 'label',
          padding: '9px',
        },
      },
      {
        selector: 'edge',
        style: {
          'curve-style': 'taxi',
          'taxi-direction': 'horizontal',
          'taxi-turn': '40%',
          width: 1.2,
          'line-color': '#aeb4bd',
          'target-arrow-shape': 'none',
        },
      },
      {
        selector: 'edge[group="ref"]',
        style: {
          'line-color': '#8a94a3',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#8a94a3',
          'arrow-scale': 0.9,
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
      {
        selector: '.faded',
        style: { opacity: 0.12 },
      },
      {
        selector: '.highlight',
        style: { 'border-color': '#2f6db3', 'border-width': 3 },
      },
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

  function tooltipHtml(node) {
    var group = node.data('group');
    var name = node.data('label');

    if (group === 'entity') {
      return '<div class="tooltip__name">' + name + '</div>' +
        '<div class="tooltip__meta">' + typeLabel(node.data('entityType')) + ' · ' + node.data('bundle') + '</div>';
    }

    if (group === 'field') {
      var meta = [prettify(node.data('kind')) + ' field', node.data('fieldType')];
      var targets = node.outgoers('edge[group="ref"]').targets().map(function (t) {
        return t.data('label');
      });
      if (targets.length) {
        meta.push('→ ' + targets.join(', '));
      }
      return '<div class="tooltip__name">' + name + '</div><div class="tooltip__meta">' + meta.join(' · ') + '</div>';
    }

    var kind = prettify(node.data('group') === 'annotation' ? node.data('kind') : node.data('group'));
    var extra = node.data('method') ? ' · ' + node.data('method') : '';
    return '<div class="tooltip__name">' + name + '</div><div class="tooltip__meta">' + kind + extra + '</div>';
  }

  function init() {
    var model = readModel();
    var elements = buildElements(model);

    var cy = cytoscape({
      container: document.getElementById('cy'),
      elements: elements,
      style: style(),
      wheelSensitivity: 0.2,
      minZoom: 0.08,
      maxZoom: 3,
      layout: {
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 18,
        edgeSep: 8,
        rankSep: 70,
        nodeDimensionsIncludeLabels: true,
        animate: false,
      },
    });

    cy.ready(function () {
      cy.fit(undefined, 40);
    });

    buildLegend(document.getElementById('legend'));

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

    document.getElementById('fit').addEventListener('click', function () {
      cy.fit(undefined, 40);
    });

    document.getElementById('reset').addEventListener('click', function () {
      cy.zoom(1);
      cy.center();
    });

    document.getElementById('legend-toggle').addEventListener('click', function () {
      var legend = document.getElementById('legend');
      legend.hidden = !legend.hidden;
    });

    document.getElementById('search').addEventListener('input', function (evt) {
      var term = evt.target.value.trim().toLowerCase();
      if (!term) {
        cy.elements().removeClass('faded');
        return;
      }
      cy.elements().addClass('faded');
      var matches = cy.nodes('[group="entity"]').filter(function (n) {
        return (n.data('label') + ' ' + n.data('bundle')).toLowerCase().indexOf(term) !== -1;
      });
      matches.union(matches.successors()).union(matches.predecessors()).removeClass('faded');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  }
  else {
    init();
  }
})();
