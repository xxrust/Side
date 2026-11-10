/** Regression reporter (hybrid): disk-readable artifacts for Agent validation.
 * Adapted from Origin PR #1 naming; consumes Codex agentcv-dag-0.2 project shape.
 * UI is optional — Agent reads JSON/HTML/SVG files.
 */
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function optionBCompliant(project) {
  const shares = project.edges.filter(e => e.kind === 'shares');
  const requires = project.edges.filter(e => e.kind === 'requires');
  return shares.every(s => requires.some(r => r.from === s.from && r.to === s.to));
}

export function blockedByOnlyRequires(project) {
  for (const run of Object.values(project.runs || {})) {
    for (const b of run.blocked_by || []) {
      const edge = project.edges.find(e => e.id === b.edgeId);
      if (edge && edge.kind !== 'requires') return false;
    }
  }
  return true;
}

export function summarize(project) {
  const runs = project.runs || {};
  const statuses = Object.values(runs).map(r => r.status);
  return {
    total_nodes: project.nodes.length,
    total_edges: project.edges.length,
    total_runs: Object.keys(runs).length,
    succeeded: statuses.filter(s => s === 'succeeded').length,
    failed: statuses.filter(s => s === 'failed').length,
    blocked: statuses.filter(s => s === 'blocked').length,
    oob: statuses.filter(s => s === 'oob').length,
    stale: statuses.filter(s => s === 'stale').length,
    pending: project.nodes.filter(n => !runs[n.id]).length
  };
}

/** Build JSON + HTML + SVG. Keeps schema agentcv-regression-0.2; adds summary/validation from cloud reporter. */
export function buildReport(project) {
  const rows = project.nodes.map(n => ({
    id: n.id,
    version: n.version,
    status: project.runs[n.id]?.status || 'pending',
    evidence: project.runs[n.id]?.evidence || 'unknown',
    conformance: project.runs[n.id]?.conformance || 'unknown',
    blocked_by: project.runs[n.id]?.blocked_by || []
  }));
  const summary = summarize(project);
  const validation = {
    option_b_compliant: optionBCompliant(project),
    no_bare_shares: optionBCompliant(project),
    blocked_by_only_requires: blockedByOnlyRequires(project)
  };
  const json = {
    schema: 'agentcv-regression-0.2',
    generated_at: new Date().toISOString(),
    summary,
    validation,
    runs: structuredClone(project.runs),
    nodes: project.nodes.map(n => ({ id: n.id, kind: n.kind, title: n.title, version: n.version })),
    edges: project.edges.map(e => ({ id: e.id, from: e.from, to: e.to, kind: e.kind }))
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${60 + rows.length * 38}"><rect width="100%" height="100%" fill="#10151f"/><text x="20" y="28" fill="white">AgentCV · execution / evidence / conformance</text>${rows.map((r, i) => `<text x="20" y="${64 + i * 38}" fill="${r.status === 'succeeded' ? '#69dfcf' : '#ffcb74'}">${escape(r.id)} v${r.version} | ${escape(r.status)} | ${escape(r.evidence)} | ${escape(r.conformance)}</text>`).join('')}</svg>`;
  const checks = [
    ['方案 B 合规（shares 同源 requires）', validation.option_b_compliant],
    ['无裸 shares', validation.no_bare_shares],
    ['blocked_by 仅沿 requires', validation.blocked_by_only_requires]
  ].map(([label, ok]) => `<div>${ok ? '✅' : '❌'} ${escape(label)}</div>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><title>AgentCV report</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;background:#f5f5f5}.box{background:#fff;padding:20px;border-radius:8px;max-width:1100px;margin:0 auto}h1{border-bottom:2px solid #4a9eff;padding-bottom:8px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card{background:#f9f9f9;padding:12px;border-left:4px solid #4a9eff}.ok{color:#28a745;font-weight:700}.bad{color:#dc3545;font-weight:700}.val{background:#e7f4e7;padding:12px;border-radius:6px;margin:16px 0}</style>
<div class="box"><h1>AgentCV regression</h1>
<p>生成时间：${escape(json.generated_at)} · schema ${escape(json.schema)}</p>
<div class="grid">
<div class="card"><div class="${summary.succeeded ? 'ok' : ''}">${summary.succeeded}</div><div>succeeded</div></div>
<div class="card"><div class="${summary.blocked ? 'bad' : ''}">${summary.blocked}</div><div>blocked</div></div>
<div class="card"><div class="${summary.oob ? 'bad' : ''}">${summary.oob}</div><div>oob</div></div>
</div>
<div class="val"><strong>方案 B / G 验收</strong>${checks}</div>
${svg}
<pre>${escape(JSON.stringify(json, null, 2))}</pre>
<p style="color:#999;font-size:13px">无界面验收产物 · Agent 读文件即可 · UI 可选消费者</p>
</div>`;
  return { json, svg, html };
}
