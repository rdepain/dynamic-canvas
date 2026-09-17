(() => {
  'use strict';

  const nativeParse = JSON.parse.bind(JSON);
  const nativeStringify = JSON.stringify.bind(JSON);

  const looksLikeModel = value => Boolean(
    value && typeof value === 'object' && Array.isArray(value.nodes) && Array.isArray(value.edges) && value.simulation
  );

  // Keep a reference to the same model object used by app.js without changing its public API.
  JSON.parse = function patchedParse(...args) {
    const value = nativeParse(...args);
    if (looksLikeModel(value)) window.__dynamicCanvasLiveModel = value;
    return value;
  };

  JSON.stringify = function patchedStringify(value, ...args) {
    if (looksLikeModel(value)) window.__dynamicCanvasLiveModel = value;
    return nativeStringify(value, ...args);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const stats = document.getElementById('modelStats');
    const connectBtn = document.getElementById('connectBtn');
    const edgesSvg = document.getElementById('edges');
    const inspectorEmpty = document.getElementById('inspectorEmpty');
    const inspectorContent = document.getElementById('inspectorContent');
    const saveBtn = document.getElementById('saveBtn');

    if (!stats || !connectBtn || !edgesSvg || !inspectorEmpty || !inspectorContent) return;

    const style = document.createElement('style');
    style.textContent = `
      .dc-edge-hit { pointer-events: stroke !important; cursor: pointer; }
      .dc-edge-clickable { pointer-events: all !important; cursor: pointer; }
      .dc-edge-picker { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
      .dc-edge-polarity { border:1px solid var(--line); background:#fff; border-radius:10px; padding:11px 8px; font-weight:800; cursor:pointer; }
      .dc-edge-polarity.is-positive { border-color:#75c7ad; background:#f1fbf7; color:#16815f; }
      .dc-edge-polarity.is-negative { border-color:#e1a1a9; background:#fff5f6; color:#b84955; }
      .dc-edge-help { display:block; color:var(--muted); font-size:11px; line-height:1.45; margin-top:9px; }
      .dc-edge-summary { padding:10px 12px; border:1px solid var(--line); border-radius:10px; background:#f9fafc; margin-bottom:14px; font-size:12px; line-height:1.45; }
    `;
    document.head.appendChild(style);

    const parseLinkCount = () => {
      const match = stats.textContent.match(/(\d+)\s+liens?/i);
      return match ? Number(match[1]) : 0;
    };

    const ensureLiveModel = () => {
      if (looksLikeModel(window.__dynamicCanvasLiveModel)) return window.__dynamicCanvasLiveModel;
      saveBtn?.click();
      if (looksLikeModel(window.__dynamicCanvasLiveModel)) return window.__dynamicCanvasLiveModel;
      try {
        const fallback = nativeParse(localStorage.getItem('dynamic_canvas_v2') || 'null');
        if (looksLikeModel(fallback)) return fallback;
      } catch (_) {}
      return null;
    };

    const persistModel = model => {
      localStorage.setItem('dynamic_canvas_v2', nativeStringify(model));
    };

    const renderEdgeInspector = index => {
      const model = ensureLiveModel();
      const edge = model?.edges?.[index];
      if (!edge) return;

      const from = model.nodes.find(n => n.id === edge.from);
      const to = model.nodes.find(n => n.id === edge.to);
      inspectorEmpty.classList.add('hidden');
      inspectorContent.classList.remove('hidden');
      inspectorContent.innerHTML = `
        <span class="eyebrow">Lien causal</span>
        <h3>${escapeHtml(from?.name || 'Source')} → ${escapeHtml(to?.name || 'Destination')}</h3>
        <div class="dc-edge-summary">Ce lien décrit le <strong>sens de l’influence</strong> entre les deux éléments.</div>
        <div class="form-group">
          <label>Type de lien</label>
          <div class="dc-edge-picker">
            <button type="button" class="dc-edge-polarity ${edge.polarity !== '-' ? 'is-positive' : ''}" data-dc-polarity="+">+ Renforce</button>
            <button type="button" class="dc-edge-polarity ${edge.polarity === '-' ? 'is-negative' : ''}" data-dc-polarity="-">− Réduit</button>
          </div>
          <small class="dc-edge-help"><strong>+</strong> : si la source augmente, la destination tend à augmenter. <strong>−</strong> : elle tend à diminuer.</small>
        </div>
      `;

      inspectorContent.querySelectorAll('[data-dc-polarity]').forEach(button => {
        button.addEventListener('click', () => {
          edge.polarity = button.dataset.dcPolarity;
          persistModel(model);
          refreshEdgeLabel(index, edge.polarity);
          renderEdgeInspector(index);
        });
      });
    };

    const refreshEdgeLabel = (index, polarity) => {
      const texts = directChildren(edgesSvg, 'text');
      const circles = directChildren(edgesSvg, 'circle');
      const text = texts[index];
      const circle = circles[index];
      if (text) {
        text.textContent = polarity;
        text.setAttribute('fill', polarity === '-' ? '#cf5b62' : '#445');
      }
      if (circle) circle.setAttribute('stroke', '#5a4ff3');
    };

    const directChildren = (parent, tag) => [...parent.children].filter(el => el.tagName?.toLowerCase() === tag);

    const enhanceEdges = () => {
      const model = ensureLiveModel();
      if (!model?.edges?.length) return;

      edgesSvg.style.pointerEvents = 'none';
      const paths = directChildren(edgesSvg, 'path').filter(p => !p.classList.contains('dc-edge-hit'));
      const circles = directChildren(edgesSvg, 'circle');
      const texts = directChildren(edgesSvg, 'text');

      edgesSvg.querySelectorAll('.dc-edge-hit').forEach(el => el.remove());

      paths.forEach((path, index) => {
        if (!model.edges[index]) return;
        const hit = path.cloneNode(false);
        hit.removeAttribute('marker-end');
        hit.setAttribute('stroke', 'transparent');
        hit.setAttribute('stroke-width', '18');
        hit.classList.add('dc-edge-hit');
        hit.dataset.edgeIndex = String(index);
        hit.addEventListener('click', event => {
          event.stopPropagation();
          if (connectBtn.style.background) connectBtn.click();
          renderEdgeInspector(index);
        });
        edgesSvg.appendChild(hit);

        [circles[index], texts[index]].forEach(el => {
          if (!el) return;
          el.classList.add('dc-edge-clickable');
          el.onclick = event => {
            event.stopPropagation();
            if (connectBtn.style.background) connectBtn.click();
            renderEdgeInspector(index);
          };
        });
      });
    };

    let previousLinks = parseLinkCount();
    const statsObserver = new MutationObserver(() => {
      const currentLinks = parseLinkCount();
      if (currentLinks > previousLinks && connectBtn.style.background) {
        setTimeout(() => {
          if (connectBtn.style.background) connectBtn.click();
          enhanceEdges();
        }, 0);
      }
      previousLinks = currentLinks;
    });
    statsObserver.observe(stats, { childList: true, characterData: true, subtree: true });

    let enhancing = false;
    const edgeObserver = new MutationObserver(() => {
      if (enhancing) return;
      enhancing = true;
      requestAnimationFrame(() => {
        enhanceEdges();
        enhancing = false;
      });
    });
    edgeObserver.observe(edgesSvg, { childList: true });

    setTimeout(enhanceEdges, 80);
  });

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
})();
