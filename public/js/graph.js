/**
 * 知识图谱可视化:基于力导向布局的 SVG 图
 * 节点按掌握度着色:weak=红, developing=橙, mastered=绿, unknown=灰
 */
function renderKnowledgeGraph(container, data) {
  const nodes = (data.nodes || []).map(n => ({ ...n }));
  const edges = (data.edges || []).map(e => ({ source: e.source_id, target: e.target_id }));
  const mastery = data.mastery || {};
  const practice = {};
  (data.practiceStats || []).forEach(s => { practice[s.kp_id] = s.acc; });

  const W = 820, H = 460;
  const centerX = W / 2, centerY = H / 2;

  nodes.forEach((n, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = Math.min(W, H) * 0.32 + (n.weight || 1) * 12;
    n.x = centerX + Math.cos(angle) * radius;
    n.y = centerY + Math.sin(angle) * radius;
    n.vx = 0; n.vy = 0;
  });

  // 力导向迭代
  for (let iter = 0; iter < 220; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 2400 / (d * d);
        dx /= d; dy /= d;
        a.vx += dx * force; a.vy += dy * force;
        b.vx -= dx * force; b.vy -= dy * force;
      }
    }
    const edgeSet = new Set(edges.map(e => e.source + '|' + e.target));
    for (const e of edges) {
      const a = nodes.find(n => n.id === e.source), b = nodes.find(n => n.id === e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (d - 90) * 0.04;
      a.vx += (dx / d) * force; a.vy += (dy / d) * force;
      b.vx -= (dx / d) * force; b.vy -= (dy / d) * force;
    }
    for (const n of nodes) {
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(48, Math.min(W - 48, n.x));
      n.y = Math.max(40, Math.min(H - 40, n.y));
    }
  }

  const levels = {};
  nodes.forEach(n => {
    let level = 'unknown';
    if (mastery[n.id]) {
      level = mastery[n.id].level;
    } else if (practice[n.id] != null) {
      level = practice[n.id] >= 0.6 ? 'mastered' : practice[n.id] >= 0.4 ? 'developing' : 'weak';
    }
    levels[n.id] = level;
  });

  const colors = { weak: '#dc2626', developing: '#d97706', mastered: '#059669', unknown: '#9ca3af' };
  const labels = { weak: '薄弱', developing: '待加强', mastered: '掌握', unknown: '未诊断' };

  const legend = Object.keys(colors).map(k =>
    `<span class="item"><span class="swatch" style="background:${colors[k]}"></span>${labels[k]}</span>`
  ).join('');

  container.innerHTML = `
    <div style="margin-bottom:12px">
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;background:#fafbff;border-radius:12px;border:1px solid #e5e9f2">
        <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#c7cddd"/></marker></defs>
        ${edges.map(e => {
          const a = nodes.find(n => n.id === e.source), b = nodes.find(n => n.id === e.target);
          if (!a || !b) return '';
          return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#c7cddd" stroke-width="1.6" marker-end="url(#arrow)"/>`;
        }).join('')}
        ${nodes.map(n => {
          const r = 22 + (n.weight || 1) * 4;
          const c = colors[levels[n.id]] || colors.unknown;
          const score = mastery[n.id] ? `<text x="${n.x}" y="${n.y - r - 6}" text-anchor="middle" font-size="11" font-weight="800" fill="${c}">${mastery[n.id].score}分</text>` : '';
          return `<g><circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-width="2.2"/><circle cx="${n.x}" cy="${n.y}" r="6" fill="${c}"/><text x="${n.x}" y="${n.y + r + 14}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#374151">${esc(n.name)}</text>${score}</g>`;
        }).join('')}
      </svg>
    </div>
    <div class="legend">${legend}</div>
  `;
}
