/**
 * Overlay réglages & performance (F1 ou ²/`) — masqué par défaut.
 * Graphe de frame-time avec 1% low, compteurs, curseurs d'ambiance.
 * Aucune chaîne construite à chaque frame : mise à jour du texte throttlée.
 */
export function createOverlay(engine, scene, refs) {
  const root = document.createElement('div');
  root.style.cssText = `
    position:fixed;top:12px;left:12px;z-index:50;display:none;
    background:rgba(8,12,22,.85);border:1px solid rgba(232,220,200,.2);
    border-radius:8px;padding:12px 14px;color:#e8dcc8;
    font:12px/1.6 'Courier New',monospace;letter-spacing:.04em;min-width:280px`;
  root.innerHTML = `
    <div style="letter-spacing:.3em;color:#ffb066;margin-bottom:6px">LA ROUTE — PERF</div>
    <canvas id="fg" width="256" height="64" style="display:block;background:rgba(0,0,0,.35);border-radius:4px"></canvas>
    <div id="stats" style="margin:8px 0"></div>
    <label style="display:block">soleil <input id="sunA" type="range" min="-80" max="80" value="-20" style="width:150px"></label>
    <label style="display:block">brume <input id="fogD" type="range" min="0" max="40" value="6" style="width:150px"></label>
  `;
  document.body.appendChild(root);

  const fg = root.querySelector('#fg').getContext('2d');
  const stats = root.querySelector('#stats');

  root.querySelector('#sunA').addEventListener('input', (e) => {
    const a = (+e.target.value) * Math.PI / 180;
    refs.sun.direction.set(Math.sin(a) * 0.8, -Math.max(0.12, Math.cos(a) * 0.5), 0.75);
  });
  root.querySelector('#fogD').addEventListener('input', (e) => {
    refs.fog.fogDensity = (+e.target.value) / 1000;
  });

  // M7 : cases A/B des passes de post (si la chaîne est branchée)
  if (refs.post) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-top:8px;padding-top:8px;'
      + 'border-top:1px solid rgba(232,220,200,.2);'
      + 'display:flex;flex-wrap:wrap;gap:2px 12px';
    for (const name of ['fxaa', 'bloom', 'grain', 'sharpen', 'vignette', 'tonemapping']) {
      const lab = document.createElement('label');
      lab.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = refs.post.has(name);              // tout est actif par défaut
      cb.addEventListener('change', () => refs.post.set(name, cb.checked));
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(name));
      row.appendChild(lab);
    }
    root.appendChild(row);
  }

  addEventListener('keydown', (e) => {
    if (e.code === 'F1' || e.code === 'Backquote') {
      e.preventDefault();
      root.style.display = root.style.display === 'none' ? 'block' : 'none';
    }
  });

  const N = 256;
  const samples = new Float32Array(N);
  const sorted = new Float32Array(N);
  let idx = 0, lastNow = 0, statTimer = 0;

  function tick(now) {
    if (lastNow) {
      samples[idx] = now - lastNow;
      idx = (idx + 1) % N;
    }
    lastNow = now;
    if (root.style.display === 'none') return;

    // graphe
    fg.clearRect(0, 0, 256, 64);
    fg.strokeStyle = 'rgba(232,220,200,.25)';
    fg.beginPath(); fg.moveTo(0, 64 - 16.6 * 2); fg.lineTo(256, 64 - 16.6 * 2); fg.stroke();
    fg.fillStyle = '#ffb066';
    for (let i = 0; i < N; i++) {
      const v = samples[(idx + i) % N];
      const h = Math.min(62, v * 2);
      fg.fillRect(i, 64 - h, 1, h);
    }
    // stats (throttle 4 Hz — pas de chaînes à chaque frame)
    statTimer += 1;
    if (statTimer >= 15) {
      statTimer = 0;
      sorted.set(samples);
      sorted.sort();
      const p99 = sorted[Math.min(N - 1, (N * 0.99) | 0)];
      const fps = engine.getFps();
      stats.textContent =
        fps.toFixed(0) + ' fps · 1% low ' + (1000 / Math.max(0.01, p99)).toFixed(0) +
        ' fps · ' + scene.getActiveMeshes().length + ' meshes';
    }
  }

  return { tick };
}
