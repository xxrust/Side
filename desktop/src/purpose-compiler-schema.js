// Purpose Compiler Schema: 目的驱动的方案编译器
// 表面：画板自由摆位卡片
// 实质：编译器式约束，缺链/缺源 = 硬错误

const SCHEMA_VERSION = 'agentcv-purpose-compiler-1';

// PurposeCard: 方案唯一目的声明
export const PurposeCardSchema = {
  id: 'string',
  schemeId: 'string',
  kind: 'classify | measure | classify_then_okng',
  items: [{
    id: 'string',
    label: 'string', // 人可读：孔距、缺齿、污渍…
    output: 'ok_ng | class_label | numeric',
    rule: 'object', // pass_when / nominal+tol_abs|tol_pct / allowed_labels
    sources: [{ // 必填，至少1个
      type: 'document | human | session_extract',
      ref: 'string',
      note: 'string?'
    }]
  }],
  position: { x: 'number', y: 'number' } // 画板位置
};

// ImagingConstraintCard: 由目的推导的成像约束
export const ImagingConstraintCardSchema = {
  id: 'string',
  schemeId: 'string',
  linkedPurposeId: 'string', // 必须指向唯一 PurposeCard
  minFeaturePx: 'number?', // 最小特征占像素
  pixelSizeUm: 'number?',
  workingDistanceMm: 'number?',
  fovMm: 'object?', // { width, height }
  lightingNotes: 'string?',
  calibrationRequired: 'boolean',
  overrideReason: 'string?', // 人工改约束时必填
  position: { x: 'number', y: 'number' }
};

// AcceptanceCard: 验收标准
export const AcceptanceCardSchema = {
  id: 'string',
  schemeId: 'string',
  linkedPurposeId: 'string',
  metrics: {
    falseNegativeRateMax: 'number?', // 漏检率上限
    falsePositiveRateMax: 'number?', // 误检率上限
    repeatabilityPct: 'number?' // 测量重复性
  },
  cases: [{ // 正负样本
    id: 'string',
    imageRef: 'string?', // 样本图片引用
    type: 'positive | negative',
    expectedOutputs: 'object' // 对齐 Purpose items
  }],
  position: { x: 'number', y: 'number' }
};

// EvidenceBinding: Purpose item → 图中证据节点
export const EvidenceBindingSchema = {
  purposeItemId: 'string',
  operatorNodeId: 'string', // pipeline node id
  evidenceArtifactId: 'string' // artifact id
};

// Scheme: 完整方案（包含卡片、图、绑定）
export const SchemeSchema = {
  id: 'string',
  version: SCHEMA_VERSION,
  purposeCard: 'PurposeCard?', // 0 or 1
  imagingConstraintCard: 'ImagingConstraintCard?',
  acceptanceCard: 'AcceptanceCard?',
  operatorGraph: 'object', // pipeline plan (已有)
  evidenceBindings: ['EvidenceBinding'],
  fingerprints: {
    purpose: 'string?',
    constraint: 'string?',
    graph: 'string?'
  }
};

// 编译错误码
export const CompilerErrorCode = {
  EXECUTABLE_GRAPH_MISSING:'EXECUTABLE_GRAPH_MISSING',
  EVIDENCE_BINDING_DANGLING:'EVIDENCE_BINDING_DANGLING',
  JUSTIFICATION_MISSING:'JUSTIFICATION_MISSING',
  ACCEPTANCE_CASES_EMPTY:'ACCEPTANCE_CASES_EMPTY',
  // Purpose 相关
  PURPOSE_MISSING: 'PURPOSE_MISSING',
  PURPOSE_NOT_UNIQUE: 'PURPOSE_NOT_UNIQUE',
  PURPOSE_ITEM_EMPTY: 'PURPOSE_ITEM_EMPTY',
  PURPOSE_ITEM_NO_SOURCE: 'PURPOSE_ITEM_NO_SOURCE',
  
  // Constraint 相关
  CONSTRAINT_MISSING: 'CONSTRAINT_MISSING',
  CONSTRAINT_PURPOSE_MISLINK: 'CONSTRAINT_PURPOSE_MISLINK',
  CONSTRAINT_OVERRIDE_NO_REASON: 'CONSTRAINT_OVERRIDE_NO_REASON',
  MEASURE_WITHOUT_CALIB: 'MEASURE_WITHOUT_CALIB',
  
  // Acceptance 相关
  ACCEPTANCE_MISSING: 'ACCEPTANCE_MISSING',
  ACCEPTANCE_PURPOSE_MISLINK: 'ACCEPTANCE_PURPOSE_MISLINK',
  
  // Evidence 绑定
  EVIDENCE_UNBOUND: 'EVIDENCE_UNBOUND',
  OUTPUT_CONTRACT_MISMATCH: 'OUTPUT_CONTRACT_MISMATCH',
  
  // 占位/Mock
  MOCK_PLACEHOLDER: 'MOCK_PLACEHOLDER',
  
  // 已有（衔接）
  JUSTIFICATION_SOURCE_MISMATCH: 'JUSTIFICATION_SOURCE_MISMATCH'
};

// 错误码描述（中文）
export const CompilerErrorMessages = {
  EXECUTABLE_GRAPH_MISSING:'正式方案缺少可执行图。',
  EVIDENCE_BINDING_DANGLING:'证据绑定引用了不存在的目的项、节点或产物。',
  JUSTIFICATION_MISSING:'可执行节点三项依据缺失或不完整。',
  ACCEPTANCE_CASES_EMPTY:'正式方案至少需要一个验收案例。',
  PURPOSE_MISSING: '方案缺少目的卡片（PurposeCard）；无目的不能跑通。',
  PURPOSE_NOT_UNIQUE: '方案存在多张目的卡片；每个方案有且仅有 1 张 PurposeCard。',
  PURPOSE_ITEM_EMPTY: '目的卡片无任何目的项（items 为空）。',
  PURPOSE_ITEM_NO_SOURCE: '目的项缺少来源（sources）；每条目的必须有至少 1 个 source。',
  
  CONSTRAINT_MISSING: '方案缺少成像约束卡片（ImagingConstraintCard）；正式方案必须包含成像约束。',
  CONSTRAINT_PURPOSE_MISLINK: '成像约束卡片的 linkedPurposeId 无效或不匹配。',
  CONSTRAINT_OVERRIDE_NO_REASON: '成像约束被人工修改，但缺少 overrideReason。',
  MEASURE_WITHOUT_CALIB: '测量类目的（numeric）要求标定，但 calibrationRequired=false。',
  
  ACCEPTANCE_MISSING: '方案缺少验收卡片（AcceptanceCard）；无验收标准不能确认通过。',
  ACCEPTANCE_PURPOSE_MISLINK: '验收卡片的 linkedPurposeId 无效或不匹配。',
  
  EVIDENCE_UNBOUND: '目的项无图绑定（EvidenceBinding）；每个 Purpose item 至少绑定一个证据节点。',
  OUTPUT_CONTRACT_MISMATCH: 'Operator 节点输出契约与 Purpose item 的 output 不匹配。',
  
  MOCK_PLACEHOLDER: '禁止使用 TBD / 示例 / mock 占位文案冒充完备。',
  
  JUSTIFICATION_SOURCE_MISMATCH: '算子节点 justification 的 sourceFingerprint 与当前 source 不匹配（已有守卫）。'
};

export { SCHEMA_VERSION };
