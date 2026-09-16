(() => {
  'use strict';

  const TYPE_LABELS = {
    stock: 'Stock',
    flow: 'Flux',
    variable: 'Variable',
    parameter: 'Paramètre'
  };

  const PALETTE = ['#315bdb', '#7b55c7', '#1f8a68', '#d07a22', '#bd4c63', '#2f7fa7', '#68748a'];
  const SCENARIO_COLORS = ['#315bdb', '#d07a22', '#1f8a68', '#7b55c7', '#bd4c63'];

  const state = {
    view: 'model',
    model: null,
    selected: null,
    connectMode: false,
    connectSource: null,
    drag: null,
    lastSimulation: null,
    activeScenarioId: 'baseline'
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindUI();
    const saved = loadLocal();
    state.model = saved || createExampleModel();
    normalizeModel();
    renderAll();
  }

  function cacheElements() {
    [
      'canvas','canvasWrap','edgeLayer','emptyState','inspector','inspectorEmpty','inspectorContent','canvasHint',
      'runButton','exportButton','importButton','importFileInput','loadExampleButton','clearButton','connectButton',
      'fitButton','saveButton','horizonInput','dtInput','timeUnitInput','mainChart','simulationStatus','metricsGrid',
      'resultsTableBody','scenarioList','scenarioEditor','scenarioChart','scenarioMetricSelect','addScenarioButton',
      'loopsList','behaviourInsights','qualityChecks','toast'
    ].forEach(id => els[id] = document.getElementById(id));
  }

  function bindUI() {
    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
    document.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addNode(btn.dataset.add)));
    document.querySelectorAll('[data-empty-add]').forEach(btn => btn.addEventListener('click', () => addNode(btn.dataset.emptyAdd)));

    els.connectButton.addEventListener('click', toggleConnectMode);
    els.runButton.addEventListener('click', () => { runAndRender(); switchView('simulate'); });
    els.loadExampleButton.addEventListener('click', () => { state.model = createExampleModel(); state.selected = null; state.lastSimulation = null; normalizeModel(); saveLocal(); renderAll(); toast('Exemple rechargé'); });
    els.clearButton.addEventListener('click', () => { state.model = createEmptyModel(); state.selected = null; state.lastSimulation = null; saveLocal(); renderAll(); toast('Nouveau modèle'); });
    els.saveButton.addEventListener('click', () => { saveLocal(); toast('Modèle sauvegardé dans ce navigateur'); });
    els.exportButton.addEventListener('click', exportModel);
    els.importButton.addEventListener('click', () => els.importFileInput.click());
    els.importFileInput.addEventListener('change', importModel);
    els.fitButton.addEventListener('click', fitNodes);
    els.addScenarioButton.addEventListener('click', addScenario);
    els.scenarioMetricSelect.addEventListener('change', renderScenarioComparison);

    ['horizonInput','dtInput','timeUnitInput'].forEach(id => els[id].addEventListener('change', () => {
      const cfg = state.model.simulation;
      cfg.horizon = numberOr(els.horizonInput.value, cfg.horizon);
      cfg.dt = numberOr(els.dtInput.value, cfg.dt);
      cfg.unit = els.timeUnitInput.value.trim() || 'temps';
      saveLocal();
    }));

    window.addEventListener('resize', renderEdges);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); saveLocal(); toast('Sauvegardé');
      }
      if (e.key === 'Escape') {
        state.connectMode = false; state.connectSource = null; state.selected = null; renderAll();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
        deleteSelection();
      }
    });
  }

  function createEmptyModel() {
    return {
      version: 1,
      name: 'Nouveau modèle',
      nodes: [],
      edges: [],
      scenarios: [{ id: 'baseline', name: 'Baseline', color: SCENARIO_COLORS[0], overrides: {} }],
      simulation: { horizon: 36, dt: 1, unit: 'mois' }
    };
  }

  function createExampleModel() {
    return {
      version: 1,
      name: 'Adoption d’un produit',
      simulation: { horizon: 36, dt: 1, unit: 'mois' },
      nodes: [
        { id:'n_potential', type:'stock', name:'Clients potentiels', symbol:'potential_clients', x:110, y:150, initial:10000, unit:'clients' },
        { id:'n_users', type:'stock', name:'Clients actifs', symbol:'active_clients', x:565, y:150, initial:500, unit:'clients' },
        { id:'n_acq', type:'flow', name:'Acquisition', symbol:'acquisition', x:350, y:160, formula:'potential_clients * adoption_rate', from:'n_potential', to:'n_users', unit:'clients/mois' },
        { id:'n_churn', type:'flow', name:'Churn', symbol:'churn', x:780, y:160, formula:'active_clients * churn_rate', from:'n_users', to:null, unit:'clients/mois' },
        { id:'n_adopt', type:'parameter', name:'Taux d’adoption', symbol:'adoption_rate', x:280, y:330, value:0.018, min:0.002, max:0.05, step:0.001, unit:'/mois' },
        { id:'n_churnrate', type:'parameter', name:'Taux de churn', symbol:'churn_rate', x:690, y:330, value:0.012, min:0.001, max:0.04, step:0.001, unit:'/mois' },
        { id:'n_wom', type:'variable', name:'Bouche-à-oreille', symbol:'word_of_mouth', x:470, y:360, formula:'active_clients / 1000', unit:'indice' }
      ],
      edges: [
        { id:'e1', from:'n_potential', to:'n_acq', polarity:'+' },
        { id:'e2', from:'n_adopt', to:'n_acq', polarity:'+' },
        { id:'e3', from:'n_acq', to:'n_users', polarity:'+' },
        { id:'e4', from:'n_users', to:'n_churn', polarity:'+' },
        { id:'e5', from:'n_churnrate', to:'n_churn', polarity:'+' },
        { id:'e6', from:'n_churn', to:'n_users', polarity:'-' },
        { id:'e7', from:'n_users', to:'n_wom', polarity:'+' },
        { id:'e8', from:'n_wom', to:'n_adopt', polarity:'+' }
      ],
      scenarios: [
        { id:'baseline', name:'Baseline', color:SCENARIO_COLORS[0], overrides:{} },
        { id:'boost', name:'Acquisition accélérée', color:SCENARIO_COLORS[1], overrides:{ adoption_rate:0.03 } },
        { id:'retention', name:'Meilleure rétention', color:SCENARIO_COLORS[2], overrides:{ churn_rate:0.006 } }
      ]
    };
  }

  function normalizeModel() {
    const m = state.model;
    m.nodes ||= [];
    m.edges ||= [];
    m.scenarios ||= [{ id:'baseline', name:'Baseline', color:SCENARIO_COLORS[0], overrides:{} }];
    m.simulation ||= { horizon:36, dt:1, unit:'mois' };
    if (!m.scenarios.some(s => s.id === state.activeScenarioId)) state.activeScenarioId = m.scenarios[0]?.id || 'baseline';
    m.nodes.forEach((n, idx) => {
      n.id ||= uid('n');
      n.name ||= `${TYPE_LABELS[n.type] || 'Élément'} ${idx+1}`;
      n.symbol ||= uniqueSymbol(slugify(n.name), n.id);
      n.x = numberOr(n.x, 150 + idx*20);
      n.y = numberOr(n.y, 120 + idx*20);
      if (n.type === 'stock') n.initial = numberOr(n.initial, 0);
      if (n.type === 'parameter') {
        n.value = numberOr(n.value, 1); n.min = numberOr(n.min, 0); n.max = numberOr(n.max, Math.max(10, n.value*2)); n.step = numberOr(n.step, .1);
      }
      if (n.type === 'variable') n.formula ||= '0';
      if (n.type === 'flow') { n.formula ||= '0'; if (!('from' in n)) n.from = null; if (!('to' in n)) n.to = null; }
    });
  }

  function renderAll() {
    renderTabs();
    renderCanvas();
    renderInspector();
    renderSimulationView();
    renderScenarios();
    renderInsights();
    els.horizonInput.value = state.model.simulation.horizon;
    els.dtInput.value = state.model.simulation.dt;
    els.timeUnitInput.value = state.model.simulation.unit;
  }

  function switchView(view) {
    state.view = view;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('is-active', v.id === `view-${view}`));
    if (view === 'scenarios') renderScenarios();
    if (view === 'insights') renderInsights();
    if (view === 'simulate') renderSimulationView();
  }

  function renderTabs() { switchView(state.view); }

  function addNode(type) {
    const centerX = Math.max(120, els.canvasWrap.clientWidth / 2 - 70 + (Math.random()*50-25));
    const centerY = Math.max(100, els.canvasWrap.clientHeight / 2 - 30 + (Math.random()*50-25));
    const base = { id:uid('n'), type, x:centerX, y:centerY, unit:'' };
    if (type === 'stock') Object.assign(base, { name:'Nouveau stock', symbol:uniqueSymbol('stock'), initial:100 });
    if (type === 'flow') Object.assign(base, { name:'Nouveau flux', symbol:uniqueSymbol('flow'), formula:'0', from:null, to:null });
    if (type === 'variable') Object.assign(base, { name:'Nouvelle variable', symbol:uniqueSymbol('variable'), formula:'0' });
    if (type === 'parameter') Object.assign(base, { name:'Nouveau paramètre', symbol:uniqueSymbol('parameter'), value:1, min:0, max:10, step:.1 });
    state.model.nodes.push(base);
    state.selected = { kind:'node', id:base.id };
    saveLocal(); renderAll(); toast(`${TYPE_LABELS[type]} ajouté`);
  }

  function renderCanvas() {
    els.canvas.innerHTML = '';
    els.emptyState.classList.toggle('hidden', state.model.nodes.length > 0);

    state.model.nodes.forEach(node => {
      const el = document.createElement('div');
      el.className = `node ${node.type}`;
      el.dataset.nodeId = node.id;
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      if (state.selected?.kind === 'node' && state.selected.id === node.id) el.classList.add('selected');
      if (state.connectSource === node.id) el.classList.add('connect-source');
      const meta = nodeMeta(node);
      el.innerHTML = `<div class="node-type">${escapeHtml(TYPE_LABELS[node.type] || node.type)}</div><div class="node-name">${escapeHtml(node.name)}</div><div class="node-meta">${escapeHtml(meta)}</div>`;
      el.addEventListener('pointerdown', e => onNodePointerDown(e, node.id));
      el.addEventListener('click', e => onNodeClick(e, node.id));
      els.canvas.appendChild(el);
    });
    requestAnimationFrame(renderEdges);
    updateCanvasHint();
  }

  function nodeMeta(n) {
    if (n.type === 'stock') return `${formatNumber(n.initial)} ${n.unit || 'initial'}`;
    if (n.type === 'parameter') return `${formatNumber(n.value)} ${n.unit || ''}`.trim();
    return n.formula || 'Aucune formule';
  }

  function renderEdges() {
    const wrapRect = els.canvasWrap.getBoundingClientRect();
    const edgeParts = [];
    const nodeEls = Object.fromEntries([...els.canvas.querySelectorAll('.node')].map(el => [el.dataset.nodeId, el]));

    state.model.edges.forEach(edge => {
      const fromEl = nodeEls[edge.from];
      const toEl = nodeEls[edge.to];
      if (!fromEl || !toEl) return;
      const a = centerInWrap(fromEl, wrapRect);
      const b = centerInWrap(toEl, wrapRect);
      const dx = Math.max(50, Math.abs(b.x-a.x)*.42);
      const path = `M ${a.x} ${a.y} C ${a.x + (b.x>=a.x?dx:-dx)} ${a.y}, ${b.x - (b.x>=a.x?dx:-dx)} ${b.y}, ${b.x} ${b.y}`;
      const selected = state.selected?.kind === 'edge' && state.selected.id === edge.id;
      const color = edge.polarity === '-' ? '#b84949' : '#59636f';
      const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
      edgeParts.push(`
        <defs><marker id="arrow-${edge.id}" markerWidth="8" markerHeight="8" refX="6.5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="${color}"/></marker></defs>
        <path d="${path}" fill="none" stroke="${selected ? '#315bdb' : color}" stroke-width="${selected ? 2.5 : 1.6}" marker-end="url(#arrow-${edge.id})" opacity=".88" />
        <path class="edge-hit" data-edge-id="${edge.id}" d="${path}" fill="none" stroke="transparent" stroke-width="14" />
        <circle cx="${mx}" cy="${my}" r="9" fill="#fff" stroke="#d9e0e6" />
        <text class="edge-label" x="${mx}" y="${my+3.5}" text-anchor="middle" fill="${color}">${escapeHtml(edge.polarity || '+')}</text>
      `);
    });
    els.edgeLayer.innerHTML = edgeParts.join('');
    els.edgeLayer.querySelectorAll('.edge-hit').forEach(path => path.addEventListener('click', e => {
      e.stopPropagation(); state.selected = { kind:'edge', id:path.dataset.edgeId }; renderCanvas(); renderInspector();
    }));
  }

  function centerInWrap(el, wrapRect) {
    const r = el.getBoundingClientRect();
    return { x:r.left-wrapRect.left+r.width/2, y:r.top-wrapRect.top+r.height/2 };
  }

  function onNodePointerDown(e, id) {
    if (state.connectMode) return;
    const n = getNode(id); if (!n) return;
    state.drag = { id, startX:e.clientX, startY:e.clientY, x:n.x, y:n.y, moved:false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!state.drag) return;
    const dx = e.clientX-state.drag.startX, dy = e.clientY-state.drag.startY;
    if (Math.abs(dx)+Math.abs(dy) > 3) state.drag.moved = true;
    const n = getNode(state.drag.id); if (!n) return;
    n.x = Math.max(10, state.drag.x+dx);
    n.y = Math.max(10, state.drag.y+dy);
    const el = els.canvas.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`);
    if (el) { el.style.left = `${n.x}px`; el.style.top = `${n.y}px`; }
    renderEdges();
  }

  function onPointerUp() {
    if (state.drag?.moved) saveLocal();
    state.drag = null;
  }

  function onNodeClick(e, id) {
    e.stopPropagation();
    if (state.drag?.moved) return;
    if (state.connectMode) {
      if (!state.connectSource) {
        state.connectSource = id; renderCanvas(); updateCanvasHint(); return;
      }
      if (state.connectSource === id) {
        state.connectSource = null; renderCanvas(); return;
      }
      const exists = state.model.edges.some(ed => ed.from === state.connectSource && ed.to === id);
      if (!exists) state.model.edges.push({ id:uid('e'), from:state.connectSource, to:id, polarity:'+' });
      state.connectSource = null; state.connectMode = false; els.connectButton.classList.remove('is-active');
      saveLocal(); renderAll(); toast('Lien causal ajouté'); return;
    }
    state.selected = { kind:'node', id };
    renderCanvas(); renderInspector();
  }

  elsCanvasClickBinder();
  function elsCanvasClickBinder() {
    document.addEventListener('DOMContentLoaded', () => {
      els.canvasWrap?.addEventListener('click', e => {
        if (e.target === els.canvasWrap || e.target === els.canvas || e.target === els.edgeLayer) {
          state.selected = null; renderCanvas(); renderInspector();
        }
      });
    });
  }

  function toggleConnectMode() {
    state.connectMode = !state.connectMode;
    state.connectSource = null;
    els.connectButton.classList.toggle('is-active', state.connectMode);
    updateCanvasHint(); renderCanvas();
  }

  function updateCanvasHint() {
    if (state.connectMode) els.canvasHint.textContent = state.connectSource ? 'Choisis la variable influencée.' : 'Choisis la variable qui influence.';
    else els.canvasHint.textContent = 'Glisse les éléments. Clique pour modifier.';
  }

  function renderInspector() {
    const sel = state.selected;
    const has = !!sel;
    els.inspectorEmpty.classList.toggle('hidden', has);
    els.inspectorContent.classList.toggle('hidden', !has);
    if (!has) { els.inspectorContent.innerHTML = ''; return; }

    if (sel.kind === 'edge') return renderEdgeInspector(sel.id);
    const n = getNode(sel.id); if (!n) { state.selected = null; return renderInspector(); }
    const symbols = state.model.nodes.filter(x => x.id !== n.id).map(x => x.symbol).filter(Boolean);
    const stockOptions = `<option value="">— Extérieur du système —</option>` + state.model.nodes.filter(x => x.type === 'stock').map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');

    let specific = '';
    if (n.type === 'stock') {
      specific = field('Valeur initiale', `<input type="number" step="any" data-prop="initial" value="${attr(n.initial)}">`) + field('Unité', `<input data-prop="unit" value="${attr(n.unit || '')}" placeholder="ex. clients">`);
    } else if (n.type === 'parameter') {
      specific = field('Valeur', `<input type="number" step="any" data-prop="value" value="${attr(n.value)}">`) +
        `<div class="field-row">${field('Minimum', `<input type="number" step="any" data-prop="min" value="${attr(n.min)}">`)}${field('Maximum', `<input type="number" step="any" data-prop="max" value="${attr(n.max)}">`)}</div>` +
        `<div class="field-row">${field('Pas', `<input type="number" step="any" data-prop="step" value="${attr(n.step)}">`)}${field('Unité', `<input data-prop="unit" value="${attr(n.unit || '')}" placeholder="ex. %/mois">`)}</div>`;
    } else if (n.type === 'flow') {
      specific = field('Formule', `<textarea data-prop="formula" placeholder="ex. clients * churn_rate">${escapeHtml(n.formula || '')}</textarea><div class="field-hint">Utilise les symboles ci-dessous. Fonctions: min, max, abs, pow, sqrt, exp, log.</div>`) +
        `<div class="field-row">${field('Depuis', `<select data-prop="from">${stockOptions}</select>`)}${field('Vers', `<select data-prop="to">${stockOptions}</select>`)}</div>` + field('Unité', `<input data-prop="unit" value="${attr(n.unit || '')}" placeholder="ex. clients/mois">`);
    } else {
      specific = field('Formule', `<textarea data-prop="formula" placeholder="ex. active_clients / 1000">${escapeHtml(n.formula || '')}</textarea><div class="field-hint">Une variable peut dépendre des stocks, paramètres, flux et autres variables.</div>`) + field('Unité', `<input data-prop="unit" value="${attr(n.unit || '')}">`);
    }

    els.inspectorContent.innerHTML = `
      <div class="inspector-head"><div><span class="type-badge">${TYPE_LABELS[n.type]}</span><h3>${escapeHtml(n.name)}</h3></div><button class="icon-button" id="closeInspector" title="Fermer">×</button></div>
      ${field('Nom', `<input data-prop="name" value="${attr(n.name)}">`)}
      ${field('Symbole', `<input data-prop="symbol" value="${attr(n.symbol)}"><div class="field-hint">Identifiant utilisé dans les formules. Lettres, chiffres et _ uniquement.</div>`)}
      ${specific}
      ${(n.type === 'flow' || n.type === 'variable') ? `<div class="separator"></div><div class="field"><label>Symboles disponibles</label><div class="symbol-list">${symbols.map(s => `<button class="symbol-pill" data-symbol="${attr(s)}">${escapeHtml(s)}</button>`).join('')}</div></div>` : ''}
      <div class="separator"></div>
      <div class="inspector-footer"><button class="button danger" id="deleteSelection">Supprimer</button><button class="button" id="duplicateNode">Dupliquer</button></div>
    `;

    if (n.type === 'flow') {
      const fromSel = els.inspectorContent.querySelector('[data-prop="from"]');
      const toSel = els.inspectorContent.querySelector('[data-prop="to"]');
      fromSel.value = n.from || ''; toSel.value = n.to || '';
    }

    els.inspectorContent.querySelector('#closeInspector').addEventListener('click', () => { state.selected = null; renderInspector(); renderCanvas(); });
    els.inspectorContent.querySelector('#deleteSelection').addEventListener('click', deleteSelection);
    els.inspectorContent.querySelector('#duplicateNode').addEventListener('click', duplicateNode);
    els.inspectorContent.querySelectorAll('[data-prop]').forEach(input => input.addEventListener('change', e => updateNodeProperty(n.id, e.target.dataset.prop, e.target.value)));
    els.inspectorContent.querySelectorAll('.symbol-pill').forEach(btn => btn.addEventListener('click', e => {
      const ta = els.inspectorContent.querySelector('[data-prop="formula"]'); if (!ta) return;
      ta.value = `${ta.value}${ta.value.trim() ? ' ' : ''}${e.currentTarget.dataset.symbol}`; ta.focus();
    }));
  }

  function renderEdgeInspector(id) {
    const edge = state.model.edges.find(e => e.id === id); if (!edge) { state.selected = null; return renderInspector(); }
    const a = getNode(edge.from), b = getNode(edge.to);
    els.inspectorContent.innerHTML = `
      <div class="inspector-head"><div><span class="type-badge">Lien causal</span><h3>${escapeHtml(a?.name || '?')} → ${escapeHtml(b?.name || '?')}</h3></div><button class="icon-button" id="closeInspector">×</button></div>
      ${field('Polarité', `<select id="edgePolarity"><option value="+">+ même sens</option><option value="-">− sens inverse</option></select><div class="field-hint">Si la cause augmente, l'effet augmente (+) ou diminue (−), toutes choses égales par ailleurs.</div>`)}
      <div class="separator"></div>
      <button class="button danger" id="deleteSelection">Supprimer le lien</button>
    `;
    els.inspectorContent.querySelector('#edgePolarity').value = edge.polarity || '+';
    els.inspectorContent.querySelector('#edgePolarity').addEventListener('change', e => { edge.polarity = e.target.value; saveLocal(); renderCanvas(); renderInsights(); });
    els.inspectorContent.querySelector('#closeInspector').addEventListener('click', () => { state.selected = null; renderInspector(); renderCanvas(); });
    els.inspectorContent.querySelector('#deleteSelection').addEventListener('click', deleteSelection);
  }

  function updateNodeProperty(id, prop, raw) {
    const n = getNode(id); if (!n) return;
    if (['initial','value','min','max','step'].includes(prop)) n[prop] = numberOr(raw, 0);
    else if (['from','to'].includes(prop)) n[prop] = raw || null;
    else if (prop === 'symbol') n[prop] = uniqueSymbol(slugify(raw) || 'value', n.id);
    else n[prop] = raw;
    saveLocal(); renderCanvas(); renderInspector(); renderScenarios();
  }

  function duplicateNode() {
    const n = getNode(state.selected?.id); if (!n) return;
    const copy = JSON.parse(JSON.stringify(n));
    copy.id = uid('n'); copy.name = `${n.name} copie`; copy.symbol = uniqueSymbol(`${n.symbol}_copy`); copy.x += 30; copy.y += 30;
    state.model.nodes.push(copy); state.selected = {kind:'node', id:copy.id}; saveLocal(); renderAll();
  }

  function deleteSelection() {
    const sel = state.selected; if (!sel) return;
    if (sel.kind === 'edge') state.model.edges = state.model.edges.filter(e => e.id !== sel.id);
    else {
      state.model.nodes = state.model.nodes.filter(n => n.id !== sel.id);
      state.model.edges = state.model.edges.filter(e => e.from !== sel.id && e.to !== sel.id);
      state.model.nodes.filter(n => n.type === 'flow').forEach(f => { if (f.from === sel.id) f.from = null; if (f.to === sel.id) f.to = null; });
    }
    state.selected = null; state.lastSimulation = null; saveLocal(); renderAll(); toast('Supprimé');
  }

  function runAndRender() {
    try {
      state.lastSimulation = simulate(state.model, {});
      renderSimulationView(); renderInsights(); toast('Simulation terminée');
    } catch (err) {
      console.error(err); toast(`Erreur: ${err.message}`, 4500);
    }
  }

  function simulate(model, overrides = {}) {
    const dt = Math.max(.0001, numberOr(model.simulation.dt, 1));
    const horizon = Math.max(dt, numberOr(model.simulation.horizon, 36));
    const steps = Math.floor(horizon / dt);
    const stocks = model.nodes.filter(n => n.type === 'stock');
    const params = model.nodes.filter(n => n.type === 'parameter');
    const vars = model.nodes.filter(n => n.type === 'variable');
    const flows = model.nodes.filter(n => n.type === 'flow');
    const values = {};
    params.forEach(p => values[p.symbol] = numberOr(overrides[p.symbol], numberOr(p.value, 0)));
    stocks.forEach(s => values[s.symbol] = numberOr(s.initial, 0));
    const series = { time: [] };
    model.nodes.forEach(n => series[n.symbol] = []);

    for (let i=0; i<=steps; i++) {
      const t = i * dt;
      values.TIME = t;
      evaluateComputed(values, vars, flows);
      series.time.push(t);
      model.nodes.forEach(n => series[n.symbol].push(numberOr(values[n.symbol], 0)));
      if (i === steps) break;

      const stockDelta = Object.fromEntries(stocks.map(s => [s.id, 0]));
      flows.forEach(f => {
        const q = numberOr(values[f.symbol], 0);
        if (f.from && stockDelta[f.from] !== undefined) stockDelta[f.from] -= q;
        if (f.to && stockDelta[f.to] !== undefined) stockDelta[f.to] += q;
      });
      stocks.forEach(s => {
        values[s.symbol] = values[s.symbol] + stockDelta[s.id] * dt;
        if (!Number.isFinite(values[s.symbol])) throw new Error(`Le stock “${s.name}” devient invalide.`);
      });
    }
    return { series, values, dt, horizon, overrides };
  }

  function evaluateComputed(values, vars, flows) {
    const computed = [...vars, ...flows];
    for (let pass=0; pass<Math.max(2, computed.length); pass++) {
      computed.forEach(n => {
        try { values[n.symbol] = evalFormula(n.formula || '0', values); }
        catch { values[n.symbol] = values[n.symbol] ?? 0; }
      });
    }
  }

  function evalFormula(formula, values) {
    const names = Object.keys(values);
    const vals = Object.values(values);
    const fn = Function(...names, 'min','max','abs','pow','sqrt','exp','log','round','floor','ceil', `"use strict"; return (${formula});`);
    const result = fn(...vals, Math.min, Math.max, Math.abs, Math.pow, Math.sqrt, Math.exp, Math.log, Math.round, Math.floor, Math.ceil);
    if (!Number.isFinite(result)) throw new Error('Résultat non numérique');
    return result;
  }

  function renderSimulationView() {
    if (!state.lastSimulation) {
      els.simulationStatus.textContent = 'Clique sur Simuler';
      els.mainChart.innerHTML = '<div class="chart-empty">Lance une simulation pour afficher les courbes.</div>';
      els.metricsGrid.innerHTML = '<div class="chart-empty" style="height:160px">Aucun résultat pour le moment.</div>';
      els.resultsTableBody.innerHTML = '';
      return;
    }
    els.simulationStatus.textContent = `${state.lastSimulation.horizon} ${state.model.simulation.unit} · pas ${state.lastSimulation.dt}`;
    const stocks = state.model.nodes.filter(n => n.type === 'stock');
    renderLineChart(els.mainChart, stocks.map((s,i) => ({ label:s.name, values:state.lastSimulation.series[s.symbol], color:PALETTE[i%PALETTE.length] })), state.lastSimulation.series.time);

    els.metricsGrid.innerHTML = stocks.slice(0,4).map(s => {
      const arr = state.lastSimulation.series[s.symbol]; const start = arr[0] || 0; const end = arr[arr.length-1] || 0; const pct = start !== 0 ? ((end-start)/Math.abs(start))*100 : 0;
      return `<div class="metric"><div class="metric-label">${escapeHtml(s.name)}</div><div class="metric-value">${formatNumber(end)}</div><div class="metric-delta ${pct>=0?'up':'down'}">${pct>=0?'▲':'▼'} ${formatNumber(Math.abs(pct))}% vs départ</div></div>`;
    }).join('') || '<div class="chart-empty" style="height:160px">Ajoute au moins un stock.</div>';

    els.resultsTableBody.innerHTML = state.model.nodes.map(n => {
      const arr = state.lastSimulation.series[n.symbol]; const val = arr?.[arr.length-1];
      return `<tr><td>${escapeHtml(n.name)}</td><td>${TYPE_LABELS[n.type]}</td><td><code>${escapeHtml(n.symbol)}</code></td><td>${formatNumber(val)} ${escapeHtml(n.unit||'')}</td></tr>`;
    }).join('');
  }

  function renderLineChart(container, seriesList, xValues) {
    if (!seriesList.length || !xValues?.length) { container.innerHTML = '<div class="chart-empty">Pas de données à afficher.</div>'; return; }
    const width = Math.max(600, container.clientWidth || 700), height = Math.max(260, container.clientHeight || 320);
    const m = {l:45,r:18,t:18,b:32}; const iw=width-m.l-m.r, ih=height-m.t-m.b;
    const all = seriesList.flatMap(s => s.values).filter(Number.isFinite);
    let yMin = Math.min(...all), yMax = Math.max(...all); if (yMin===yMax) { yMin-=1; yMax+=1; }
    if (yMin > 0) yMin = 0;
    const xMin=xValues[0], xMax=xValues[xValues.length-1] || 1;
    const px = x => m.l + ((x-xMin)/(xMax-xMin||1))*iw;
    const py = y => m.t + (1-(y-yMin)/(yMax-yMin||1))*ih;
    const grid = [];
    for (let i=0;i<=4;i++) {
      const y=m.t+(i/4)*ih; const val=yMax-(i/4)*(yMax-yMin);
      grid.push(`<line class="chart-grid" x1="${m.l}" y1="${y}" x2="${width-m.r}" y2="${y}"/><text class="chart-label" x="${m.l-7}" y="${y+3}" text-anchor="end">${shortNumber(val)}</text>`);
    }
    for (let i=0;i<=5;i++) { const x=m.l+(i/5)*iw; const val=xMin+(i/5)*(xMax-xMin); grid.push(`<text class="chart-label" x="${x}" y="${height-9}" text-anchor="middle">${formatNumber(val)}</text>`); }
    const lines = seriesList.map((s,idx) => {
      const d = s.values.map((v,i) => `${i?'L':'M'} ${px(xValues[i])} ${py(v)}`).join(' ');
      return `<path class="chart-line" d="${d}" stroke="${s.color || PALETTE[idx%PALETTE.length]}"/>`;
    }).join('');
    const legend = `<div class="chart-legend">${seriesList.map((s,i) => `<span class="legend-item"><span class="legend-dot" style="background:${s.color || PALETTE[i%PALETTE.length]}"></span>${escapeHtml(s.label)}</span>`).join('')}</div>`;
    container.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}">${grid.join('')}<line class="chart-axis" x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${height-m.b}"/><line class="chart-axis" x1="${m.l}" y1="${height-m.b}" x2="${width-m.r}" y2="${height-m.b}"/>${lines}</svg>${legend}`;
  }

  function renderScenarios() {
    normalizeModel();
    const scenarios = state.model.scenarios;
    if (!scenarios.length) return;
    if (!scenarios.some(s => s.id === state.activeScenarioId)) state.activeScenarioId = scenarios[0].id;
    els.scenarioList.innerHTML = scenarios.map(s => `<div class="scenario-card ${s.id===state.activeScenarioId?'is-active':''}" data-scenario-id="${s.id}"><div class="scenario-card-top"><strong>${escapeHtml(s.name)}</strong><span class="scenario-dot" style="background:${s.color}"></span></div><small>${Object.keys(s.overrides||{}).length} hypothèse(s) modifiée(s)</small></div>`).join('');
    els.scenarioList.querySelectorAll('.scenario-card').forEach(card => card.addEventListener('click', () => { state.activeScenarioId = card.dataset.scenarioId; renderScenarios(); }));

    const active = scenarios.find(s => s.id === state.activeScenarioId);
    const params = state.model.nodes.filter(n => n.type === 'parameter');
    els.scenarioEditor.innerHTML = `
      <div class="scenario-editor-head"><input id="scenarioNameInput" value="${attr(active.name)}"><div><button class="button" id="resetScenario">Réinitialiser</button>${active.id!=='baseline'?'<button class="button danger" id="deleteScenario">Supprimer</button>':''}</div></div>
      ${params.length ? params.map(p => {
        const value = active.overrides?.[p.symbol] ?? p.value;
        const min = Number.isFinite(p.min) ? p.min : 0, max = Number.isFinite(p.max) ? p.max : Math.max(10,p.value*2), step = p.step || .1;
        return `<div class="slider-row"><div class="slider-label"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.symbol)} · ${escapeHtml(p.unit||'sans unité')}</small></div><input type="range" min="${attr(min)}" max="${attr(max)}" step="${attr(step)}" value="${attr(value)}" data-scenario-symbol="${attr(p.symbol)}"><input class="slider-value" type="number" step="${attr(step)}" value="${attr(value)}" data-scenario-number="${attr(p.symbol)}"></div>`;
      }).join('') : '<div class="chart-empty" style="height:220px">Ajoute des paramètres au modèle pour créer un playground.</div>'}
    `;
    const nameInput = els.scenarioEditor.querySelector('#scenarioNameInput');
    nameInput.addEventListener('change', () => { active.name = nameInput.value || 'Scénario'; saveLocal(); renderScenarios(); });
    const reset = els.scenarioEditor.querySelector('#resetScenario'); reset?.addEventListener('click', () => { active.overrides = {}; saveLocal(); renderScenarios(); });
    const del = els.scenarioEditor.querySelector('#deleteScenario'); del?.addEventListener('click', () => { state.model.scenarios = state.model.scenarios.filter(s => s.id!==active.id); state.activeScenarioId='baseline'; saveLocal(); renderScenarios(); });

    els.scenarioEditor.querySelectorAll('[data-scenario-symbol]').forEach(range => {
      range.addEventListener('input', () => syncScenarioValue(active, range.dataset.scenarioSymbol, range.value, 'range'));
    });
    els.scenarioEditor.querySelectorAll('[data-scenario-number]').forEach(inp => {
      inp.addEventListener('change', () => syncScenarioValue(active, inp.dataset.scenarioNumber, inp.value, 'number'));
    });

    const stockOptions = state.model.nodes.filter(n => n.type === 'stock');
    const prior = els.scenarioMetricSelect.value;
    els.scenarioMetricSelect.innerHTML = stockOptions.map(s => `<option value="${s.symbol}">${escapeHtml(s.name)}</option>`).join('');
    if (stockOptions.some(s => s.symbol===prior)) els.scenarioMetricSelect.value = prior;
    renderScenarioComparison();
  }

  function syncScenarioValue(scenario, symbol, raw, source) {
    scenario.overrides ||= {}; scenario.overrides[symbol] = numberOr(raw, 0);
    const counterpart = source === 'range' ? els.scenarioEditor.querySelector(`[data-scenario-number="${CSS.escape(symbol)}"]`) : els.scenarioEditor.querySelector(`[data-scenario-symbol="${CSS.escape(symbol)}"]`);
    if (counterpart) counterpart.value = raw;
    saveLocal(); renderScenarioComparison();
  }

  function addScenario() {
    const id=uid('s'); const idx=state.model.scenarios.length;
    state.model.scenarios.push({ id, name:`Scénario ${idx}`, color:SCENARIO_COLORS[idx%SCENARIO_COLORS.length], overrides:{} });
    state.activeScenarioId=id; saveLocal(); renderScenarios();
  }

  function renderScenarioComparison() {
    const symbol = els.scenarioMetricSelect.value || state.model.nodes.find(n=>n.type==='stock')?.symbol;
    if (!symbol) { els.scenarioChart.innerHTML='<div class="chart-empty">Ajoute un stock pour comparer les scénarios.</div>'; return; }
    const rows=[]; let x=null;
    state.model.scenarios.forEach(s => {
      try { const sim=simulate(state.model, s.overrides||{}); x ||= sim.series.time; rows.push({label:s.name, values:sim.series[symbol], color:s.color}); } catch(e) { console.warn(e); }
    });
    renderLineChart(els.scenarioChart, rows, x || []);
  }

  function renderInsights() {
    renderLoops(); renderBehaviourInsights(); renderQualityChecks();
  }

  function renderLoops() {
    const loops = findLoops(state.model.nodes, state.model.edges);
    if (!loops.length) { els.loopsList.innerHTML='<div class="insight-item"><div class="insight-title">Aucune boucle détectée</div><p>Crée des liens causaux qui reviennent à leur point de départ pour faire apparaître les rétroactions.</p></div>'; return; }
    els.loopsList.innerHTML = loops.slice(0,8).map(loop => {
      const names = loop.nodeIds.map(id=>getNode(id)?.name||'?');
      const negative = loop.edgeIds.filter(id => state.model.edges.find(e=>e.id===id)?.polarity==='-').length;
      const reinforcing = negative % 2 === 0;
      return `<div class="insight-item"><div class="insight-title"><span class="loop-badge ${reinforcing?'reinforcing':'balancing'}">${reinforcing?'Renforcement':'Équilibrage'}</span>${escapeHtml(names.join(' → '))}</div><p>${reinforcing?'Cette boucle tend à amplifier un mouvement initial.':'Cette boucle tend à contrebalancer un mouvement initial.'}</p></div>`;
    }).join('');
  }

  function findLoops(nodes, edges) {
    const adj = new Map(nodes.map(n=>[n.id,[]])); edges.forEach(e=>adj.get(e.from)?.push(e));
    const raw=[]; const maxDepth=7;
    nodes.forEach(start => {
      const dfs=(current,pathNodes,pathEdges,seen)=>{
        if (pathEdges.length>=maxDepth) return;
        for (const edge of adj.get(current)||[]) {
          if (edge.to===start.id && pathEdges.length>=1) raw.push({nodeIds:[...pathNodes], edgeIds:[...pathEdges,edge.id]});
          else if (!seen.has(edge.to)) { const s=new Set(seen); s.add(edge.to); dfs(edge.to,[...pathNodes,edge.to],[...pathEdges,edge.id],s); }
        }
      };
      dfs(start.id,[start.id],[],new Set([start.id]));
    });
    const unique=new Map();
    raw.forEach(l=>{ const key=[...l.nodeIds].sort().join('|'); if(!unique.has(key)) unique.set(key,l); });
    return [...unique.values()];
  }

  function renderBehaviourInsights() {
    if (!state.lastSimulation) { els.behaviourInsights.innerHTML='<div class="insight-item"><div class="insight-title">Pas encore de simulation</div><p>Lance le modèle pour obtenir une lecture automatique des trajectoires.</p></div>'; return; }
    const stocks=state.model.nodes.filter(n=>n.type==='stock');
    const items=[];
    stocks.forEach(s=>{
      const a=state.lastSimulation.series[s.symbol]; if (!a?.length) return;
      const start=a[0], end=a[a.length-1], peak=Math.max(...a), trough=Math.min(...a);
      const delta=end-start;
      let title, text;
      if (Math.abs(delta) < Math.max(1,Math.abs(start))*.02) { title=`${s.name} reste quasi stable`; text=`La valeur finale (${formatNumber(end)}) reste proche du niveau initial (${formatNumber(start)}).`; }
      else if (delta>0) { title=`${s.name} augmente`; text=`Le stock passe de ${formatNumber(start)} à ${formatNumber(end)}. Pic observé : ${formatNumber(peak)}.`; }
      else { title=`${s.name} diminue`; text=`Le stock passe de ${formatNumber(start)} à ${formatNumber(end)}. Point bas observé : ${formatNumber(trough)}.`; }
      items.push(`<div class="insight-item"><div class="insight-title">${escapeHtml(title)}</div><p>${escapeHtml(text)}</p></div>`);
    });
    els.behaviourInsights.innerHTML=items.join('')||'<div class="insight-item"><div class="insight-title">Aucun stock</div><p>Une simulation dynamique devient plus utile dès qu’un stock accumule les effets dans le temps.</p></div>';
  }

  function renderQualityChecks() {
    const symbols=state.model.nodes.map(n=>n.symbol); const duplicate=symbols.length!==new Set(symbols).size;
    const flows=state.model.nodes.filter(n=>n.type==='flow'); const unattached=flows.filter(f=>!f.from&&!f.to).length;
    const hasStock=state.model.nodes.some(n=>n.type==='stock');
    const formulaIssues=[];
    state.model.nodes.filter(n=>['flow','variable'].includes(n.type)).forEach(n=>{ try { const dummy=Object.fromEntries(symbols.map(s=>[s,1])); evalFormula(n.formula||'0',dummy); } catch { formulaIssues.push(n.name); } });
    const checks=[
      {ok:hasStock,title:'Stocks présents',text:hasStock?'Le modèle contient au moins une accumulation.':'Ajoute un stock pour représenter ce qui s’accumule.'},
      {ok:!duplicate,title:'Symboles uniques',text:duplicate?'Deux éléments utilisent le même symbole.':'Chaque élément a un identifiant de formule distinct.'},
      {ok:unattached===0,title:'Flux connectés',text:unattached?`${unattached} flux ne modifie encore aucun stock.`:'Tous les flux sont rattachés à au moins un stock.'},
      {ok:formulaIssues.length===0,title:'Formules lisibles',text:formulaIssues.length?`À vérifier : ${formulaIssues.join(', ')}.`:'Les formules peuvent être évaluées avec des valeurs de test.'},
      {ok:state.model.edges.length>0,title:'Structure causale',text:state.model.edges.length?'Des influences sont explicitées sur la carte.':'Ajoute des liens causaux pour documenter le raisonnement.'},
      {ok:state.model.scenarios.length>1,title:'Scénarios',text:state.model.scenarios.length>1?'Plusieurs hypothèses sont comparables.':'Ajoute au moins un scénario alternatif.'}
    ];
    els.qualityChecks.innerHTML=checks.map(c=>`<div class="quality-check"><div class="check-state ${c.ok?'ok':'warn'}">${c.ok?'✓':'!'}</div><strong>${escapeHtml(c.title)}</strong><span>${escapeHtml(c.text)}</span></div>`).join('');
  }

  function fitNodes() {
    if (!state.model.nodes.length) return;
    const minX=Math.min(...state.model.nodes.map(n=>n.x)), minY=Math.min(...state.model.nodes.map(n=>n.y));
    const dx=40-minX, dy=50-minY;
    state.model.nodes.forEach(n=>{n.x+=dx;n.y+=dy;}); saveLocal(); renderCanvas();
  }

  function exportModel() {
    const blob=new Blob([JSON.stringify(state.model,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`${slugify(state.model.name||'dynamic-canvas')}.json`; a.click(); URL.revokeObjectURL(url); toast('Modèle exporté');
  }

  function importModel(e) {
    const file=e.target.files?.[0]; if(!file)return;
    const r=new FileReader(); r.onload=()=>{ try { state.model=JSON.parse(r.result); state.selected=null; state.lastSimulation=null; normalizeModel(); saveLocal(); renderAll(); toast('Modèle importé'); } catch { toast('Fichier JSON invalide'); } }; r.readAsText(file); e.target.value='';
  }

  function saveLocal() { try { localStorage.setItem('dynamic-canvas-model', JSON.stringify(state.model)); } catch {} }
  function loadLocal() { try { const raw=localStorage.getItem('dynamic-canvas-model'); return raw?JSON.parse(raw):null; } catch { return null; } }

  function field(label, content) { return `<div class="field"><label>${label}</label>${content}</div>`; }
  function getNode(id) { return state.model.nodes.find(n=>n.id===id); }
  function uid(prefix='id') { return `${prefix}_${Math.random().toString(36).slice(2,9)}`; }
  function slugify(s='') { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').replace(/^([0-9])/,'v_$1'); }
  function uniqueSymbol(base, ignoreId=null) { let s=base||'value', i=2; const used=new Set(state.model?.nodes.filter(n=>n.id!==ignoreId).map(n=>n.symbol)||[]); while(used.has(s)) s=`${base}_${i++}`; return s; }
  function numberOr(v,fallback=0) { const n=Number(v); return Number.isFinite(n)?n:fallback; }
  function formatNumber(v) { if(!Number.isFinite(Number(v)))return '—'; const n=Number(v); const abs=Math.abs(n); const digits=abs!==0&&abs<1?3:abs>=1000?0:2; return new Intl.NumberFormat('fr-FR',{maximumFractionDigits:digits}).format(n); }
  function shortNumber(v) { const n=Number(v); if(Math.abs(n)>=1e6)return `${(n/1e6).toFixed(1)}M`; if(Math.abs(n)>=1e3)return `${(n/1e3).toFixed(1)}k`; return formatNumber(n); }
  function escapeHtml(s) { return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function attr(s) { return escapeHtml(String(s??'')); }
  let toastTimer; function toast(message,duration=2200){ clearTimeout(toastTimer); els.toast.textContent=message; els.toast.classList.add('show'); toastTimer=setTimeout(()=>els.toast.classList.remove('show'),duration); }
})();
