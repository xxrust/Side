// Purpose Card UI: 最小可用卡片视图
// 画板自由摆位，显示目的、约束、验收卡片

import { CompilerErrorCode } from './purpose-compiler-schema.js';

/**
 * 渲染 PurposeCard
 */
export function renderPurposeCard(purposeCard, errors = []) {
  const cardErrors = errors.filter(e => 
    e.path?.includes('purposeCard') || 
    e.itemId && purposeCard.items.some(item => item.id === e.itemId)
  );
  
  const kindNames = {
    classify: '分类',
    measure: '测量',
    classify_then_okng: '分类+OK/NG'
  };
  
  const outputNames = {
    ok_ng: 'OK/NG',
    class_label: '类别',
    numeric: '数值'
  };
  
  return `
    <div class="purpose-card card" data-card-id="${purposeCard.id}" style="left: ${purposeCard.position.x}px; top: ${purposeCard.position.y}px;">
      <div class="card-header">
        <h3>🎯 检测目的 (${kindNames[purposeCard.kind]})</h3>
        ${cardErrors.length > 0 ? `<span class="error-badge">${cardErrors.length} 错误</span>` : ''}
      </div>
      <div class="card-body">
        ${purposeCard.items.length === 0 
          ? '<p class="empty-hint">未添加目的项</p>' 
          : purposeCard.items.map(item => `
            <div class="purpose-item ${errors.some(e => e.itemId === item.id) ? 'has-error' : ''}">
              <div class="item-label">
                <strong>${item.label}</strong>
                <span class="item-output">[${outputNames[item.output]}]</span>
              </div>
              ${item.sources.length > 0 
                ? `<div class="item-sources">
                     来源: ${item.sources.map(s => `
                       <span class="source-tag" title="${s.ref}">${s.type}</span>
                     `).join(' ')}
                   </div>`
                : '<div class="item-sources error">⚠ 缺少来源</div>'}
              ${errors.filter(e => e.itemId === item.id).map(e => `
                <div class="error-message">${e.code}: ${e.message}</div>
              `).join('')}
            </div>
          `).join('')}
      </div>
      ${cardErrors.length > 0 
        ? `<div class="card-errors">
             ${cardErrors.map(e => `<div class="error-item">${e.code}: ${e.message}</div>`).join('')}
           </div>`
        : ''}
    </div>
  `;
}

/**
 * 渲染 ImagingConstraintCard
 */
export function renderImagingConstraintCard(constraintCard, errors = []) {
  const cardErrors = errors.filter(e => 
    e.path?.includes('imagingConstraintCard') || 
    e.itemId === constraintCard.id
  );
  
  return `
    <div class="constraint-card card" data-card-id="${constraintCard.id}" style="left: ${constraintCard.position.x}px; top: ${constraintCard.position.y}px;">
      <div class="card-header">
        <h3>📷 成像约束</h3>
        ${cardErrors.length > 0 ? `<span class="error-badge">${cardErrors.length} 错误</span>` : ''}
      </div>
      <div class="card-body">
        ${constraintCard.minFeaturePx 
          ? `<div class="constraint-item">最小特征: ${constraintCard.minFeaturePx} px</div>` 
          : ''}
        ${constraintCard.pixelSizeUm 
          ? `<div class="constraint-item">像素尺寸: ${constraintCard.pixelSizeUm} μm</div>` 
          : ''}
        ${constraintCard.calibrationRequired !== undefined
          ? `<div class="constraint-item">标定: ${constraintCard.calibrationRequired ? '需要' : '不需要'}</div>`
          : ''}
        ${constraintCard.lightingNotes
          ? `<div class="constraint-item">打光: ${constraintCard.lightingNotes}</div>`
          : '<div class="constraint-item empty">⚠ 缺少打光说明</div>'}
        ${constraintCard.overrideReason
          ? `<div class="constraint-override">人工改约束: ${constraintCard.overrideReason}</div>`
          : ''}
      </div>
      ${cardErrors.length > 0 
        ? `<div class="card-errors">
             ${cardErrors.map(e => `<div class="error-item">${e.code}: ${e.message}</div>`).join('')}
           </div>`
        : ''}
    </div>
  `;
}

/**
 * 渲染 AcceptanceCard
 */
export function renderAcceptanceCard(acceptanceCard, errors = [], warnings = []) {
  const cardErrors = errors.filter(e => 
    e.path?.includes('acceptanceCard') || 
    e.itemId === acceptanceCard.id
  );
  
  const cardWarnings = warnings.filter(w => 
    w.path?.includes('acceptanceCard')
  );
  
  return `
    <div class="acceptance-card card" data-card-id="${acceptanceCard.id}" style="left: ${acceptanceCard.position.x}px; top: ${acceptanceCard.position.y}px;">
      <div class="card-header">
        <h3>✓ 验收标准</h3>
        ${cardErrors.length > 0 ? `<span class="error-badge">${cardErrors.length} 错误</span>` : ''}
        ${cardWarnings.length > 0 ? `<span class="warning-badge">${cardWarnings.length} 警告</span>` : ''}
      </div>
      <div class="card-body">
        ${acceptanceCard.metrics.falseNegativeRateMax !== null
          ? `<div class="metric-item">漏检率上限: ${(acceptanceCard.metrics.falseNegativeRateMax * 100).toFixed(1)}%</div>`
          : ''}
        ${acceptanceCard.metrics.falsePositiveRateMax !== null
          ? `<div class="metric-item">误检率上限: ${(acceptanceCard.metrics.falsePositiveRateMax * 100).toFixed(1)}%</div>`
          : ''}
        ${acceptanceCard.metrics.repeatabilityPct !== null
          ? `<div class="metric-item">重复性: ${acceptanceCard.metrics.repeatabilityPct.toFixed(1)}%</div>`
          : ''}
        <div class="cases-summary">
          样本数: ${acceptanceCard.cases.length} 
          (正: ${acceptanceCard.cases.filter(c => c.type === 'positive').length}, 
           负: ${acceptanceCard.cases.filter(c => c.type === 'negative').length})
        </div>
      </div>
      ${cardErrors.length > 0 
        ? `<div class="card-errors">
             ${cardErrors.map(e => `<div class="error-item">${e.code}: ${e.message}</div>`).join('')}
           </div>`
        : ''}
      ${cardWarnings.length > 0 
        ? `<div class="card-warnings">
             ${cardWarnings.map(w => `<div class="warning-item">${w.message}</div>`).join('')}
           </div>`
        : ''}
    </div>
  `;
}

/**
 * 渲染编译结果摘要
 */
export function renderCompilationSummary(compileResult) {
  const { ok, mode, isDraft, errors, warnings } = compileResult;
  
  if (ok) {
    if (isDraft) {
      return `
        <div class="compilation-summary draft">
          <h4>⚠ DRAFT 草稿模式</h4>
          <div class="draft-notice">可跑、可出数，但标记 DRAFT，不得自称方案可用/验收通过</div>
          ${warnings.length > 0 
            ? `<div class="warnings-count">${warnings.length} 个警告（升级为正式方案前需修正）</div>` 
            : ''}
          <div class="draft-hint">
            升级为正式方案：补全 PurposeCard.sources + AcceptanceCard，使用 mode='scheme' 重新编译
          </div>
        </div>
      `;
    }
    return `
      <div class="compilation-summary success">
        <h4>✓ 方案結構編譯通過（仍需執行、案例回歸與發布）</h4>
        ${warnings.length > 0 
          ? `<div class="warnings-count">${warnings.length} 个警告</div>` 
          : ''}
      </div>
    `;
  }
  
  return `
    <div class="compilation-summary error">
      <h4>✗ ${isDraft ? 'DRAFT 草稿' : '方案'}编译失败</h4>
      <div class="errors-count">${errors.length} 个错误</div>
      ${warnings.length > 0 
        ? `<div class="warnings-count">${warnings.length} 个警告</div>` 
        : ''}
      <div class="error-list">
        ${errors.map(e => `
          <div class="error-item">
            <strong>${e.code}</strong>: ${e.message}
            ${e.hint ? `<div class="error-hint">${e.hint}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * 渲染关系边（Purpose → Constraint → Graph → Acceptance）
 */
export function renderRelationshipEdges(scheme) {
  const edges = [];
  
  if (scheme.purposeCard && scheme.imagingConstraintCard) {
    edges.push({
      from: scheme.purposeCard.id,
      to: scheme.imagingConstraintCard.id,
      label: 'derives',
      color: '#4CAF50'
    });
  }
  
  if (scheme.purposeCard && scheme.acceptanceCard) {
    edges.push({
      from: scheme.purposeCard.id,
      to: scheme.acceptanceCard.id,
      label: 'validates',
      color: '#2196F3'
    });
  }
  
  if (scheme.imagingConstraintCard && scheme.operatorGraph) {
    edges.push({
      from: scheme.imagingConstraintCard.id,
      to: 'operator-graph',
      label: 'constrains',
      color: '#FF9800'
    });
  }
  
  // EvidenceBindings
  if (scheme.evidenceBindings) {
    for (const binding of scheme.evidenceBindings) {
      edges.push({
        from: binding.purposeItemId,
        to: binding.operatorNodeId,
        label: 'binds',
        color: '#9C27B0',
        dashed: true
      });
    }
  }
  
  return edges;
}

/**
 * 样式（最小）
 */
export const cardStyles = `
<style>
.card {
  position: absolute;
  background: white;
  border: 2px solid #ddd;
  border-radius: 8px;
  min-width: 280px;
  max-width: 400px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  font-family: sans-serif;
  font-size: 14px;
}

.card.has-error {
  border-color: #f44336;
}

.card-header {
  background: #f5f5f5;
  padding: 12px;
  border-bottom: 1px solid #ddd;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: bold;
}

.error-badge {
  background: #f44336;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.warning-badge {
  background: #ff9800;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.card-body {
  padding: 12px;
}

.purpose-item {
  margin-bottom: 12px;
  padding: 8px;
  background: #fafafa;
  border-radius: 4px;
}

.purpose-item.has-error {
  background: #ffebee;
  border-left: 3px solid #f44336;
}

.item-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.item-output {
  font-size: 12px;
  color: #666;
}

.item-sources {
  font-size: 12px;
  color: #666;
}

.item-sources.error {
  color: #f44336;
}

.source-tag {
  display: inline-block;
  background: #e3f2fd;
  color: #1976d2;
  padding: 2px 6px;
  border-radius: 3px;
  margin-right: 4px;
  font-size: 11px;
}

.empty-hint {
  color: #999;
  font-style: italic;
}

.constraint-item, .metric-item {
  margin-bottom: 6px;
}

.constraint-item.empty {
  color: #ff9800;
}

.cases-summary {
  margin-top: 8px;
  padding: 8px;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 13px;
}

.card-errors, .card-warnings {
  padding: 12px;
  border-top: 1px solid #ddd;
}

.error-item {
  margin-bottom: 6px;
  color: #f44336;
  font-size: 13px;
}

.warning-item {
  margin-bottom: 6px;
  color: #ff9800;
  font-size: 13px;
}

.error-message {
  margin-top: 4px;
  padding: 4px;
  background: #ffebee;
  border-left: 3px solid #f44336;
  font-size: 12px;
}

.error-hint {
  margin-top: 2px;
  font-size: 12px;
  color: #666;
  font-style: italic;
}

.compilation-summary {
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.compilation-summary.success {
  background: #e8f5e9;
  border: 1px solid #4caf50;
}

.compilation-summary.error {
  background: #ffebee;
  border: 1px solid #f44336;
}

.compilation-summary.draft {
  background: #fff3e0;
  border: 2px solid #ff9800;
}

.draft-notice {
  font-size: 14px;
  color: #e65100;
  font-weight: bold;
  margin-bottom: 8px;
}

.draft-hint {
  margin-top: 8px;
  padding: 8px;
  background: #ffe0b2;
  border-radius: 4px;
  font-size: 13px;
  color: #e65100;
}

.compilation-summary h4 {
  margin: 0 0 8px 0;
}

.errors-count, .warnings-count {
  font-size: 14px;
  margin-bottom: 8px;
}

.error-list {
  margin-top: 12px;
}
</style>
`;
