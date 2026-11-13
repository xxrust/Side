import {validateNodeDocumentation} from './node-documentation.js';
import {isWorkpiecePlan,compileWorkpiecePlan} from './workpiece-plan.js';
// Purpose Compiler: 方案编译器
// 像编译器一样：缺链/缺源/输出契约不符 = 硬错误

import {validateOperationEvidenceJustification} from './pipeline-evidence-contract.js';
import { CompilerErrorCode, CompilerErrorMessages, SCHEMA_VERSION } from './purpose-compiler-schema.js';

const stable = value => JSON.stringify(value, (_, item) => 
  item && typeof item === 'object' && !Array.isArray(item) 
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) 
    : item
);

// Key by the full current canonical content, not object identity: callers may
// edit a nested parameter or source in place while a session is running.
const fingerprintCache=new Map();
const MAX_FINGERPRINT_CACHE_ENTRIES=16,MAX_FINGERPRINT_CACHE_CHARS=2*1024*1024;
let fingerprintCacheChars=0;
function fingerprint(value) {
  // JSON.stringify observes nested edits too, but runs in the engine without
  // rebuilding a sorted object for every container on every progress event.
  // Canonicalize only misses so equivalent property orders keep the same hash.
  const serialized=JSON.stringify(value),cached=fingerprintCache.get(serialized);
  if(cached!==undefined){fingerprintCache.delete(serialized);fingerprintCache.set(serialized,cached);return cached;}
  const canonical=stable(value);
  let a = 2166136261, b = 2246822507;
  for (const byte of new TextEncoder().encode(canonical)) {
    a = Math.imul(a ^ byte, 16777619);
    b = Math.imul(b ^ byte, 3266489909);
  }
  const result=(a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  if(serialized.length<=MAX_FINGERPRINT_CACHE_CHARS){
    while(fingerprintCache.size>=MAX_FINGERPRINT_CACHE_ENTRIES||fingerprintCacheChars+serialized.length>MAX_FINGERPRINT_CACHE_CHARS){const oldest=fingerprintCache.keys().next().value;fingerprintCacheChars-=oldest.length;fingerprintCache.delete(oldest);}
    fingerprintCache.set(serialized,result);fingerprintCacheChars+=serialized.length;
  }
  return result;
}

function error(code, path, itemId = null, hint = null) {
  return {
    code,
    path,
    itemId,
    message: CompilerErrorMessages[code] || code,
    hint: hint || `修正 ${path} 后重新编译。`
  };
}

function warning(code, path, message, hint = null) {
  return { code, path, message, hint, level: 'warning' };
}

// 检查 Mock 占位文案
const MOCK_PATTERNS = /\b(tbd|todo|mock|placeholder)\b|待补|待填|^示例$|^example$|^\.{3,}$|^…+$/i;

function checkMockPlaceholder(value, path) {
  if (typeof value === 'string' && MOCK_PATTERNS.test(value.trim())) {
    return error(CompilerErrorCode.MOCK_PLACEHOLDER, path, null, 
      '禁止使用 TBD / 示例 / mock 占位；缺字段 = 编译失败。');
  }
  return null;
}

/**
 * 编译 Scheme，返回编译结果
 * @param {object} scheme - 包含 purposeCard / imagingConstraintCard / acceptanceCard / operatorGraph / evidenceBindings
 * @param {object} options - 编译选项 { mode: 'draft' | 'scheme', policy: 'strict' | 'loose' }
 * @returns {object} { ok: boolean, mode: string, errors: [], warnings: [], fingerprints: {} }
 * 
 * 模式说明：
 * - draft（草稿/临时探测）：允许无完整 Purpose，可跑、可出数，但标记 DRAFT，不得自称方案可用/验收通过
 * - scheme（正式方案）：Purpose 唯一且完备，硬错误全开，完成态只能是正式方案
 */
export function compileScheme(scheme, options = {}) {
  scheme = scheme || {};
  if(isWorkpiecePlan(scheme)&&options.mode!=='draft')return compileWorkpiecePlan(scheme);
  const mode = options.mode || 'scheme'; // 'draft' | 'scheme'
  const policy = options.policy || 'strict';
  const errors = [];
  const invalid = !['draft','scheme'].includes(mode) || !scheme || typeof scheme!=='object' || Array.isArray(scheme) ||
    scheme.operatorGraph && (!Array.isArray(scheme.operatorGraph.nodes) || scheme.operatorGraph.nodes.some(n=>!n || typeof n!=='object' || n.expected_outputs && (!Array.isArray(n.expected_outputs)||n.expected_outputs.some(a=>!a || typeof a!=='object')) || n.justification?.boundaries && !Array.isArray(n.justification.boundaries)) || scheme.operatorGraph.edges && (!Array.isArray(scheme.operatorGraph.edges) || scheme.operatorGraph.edges.some(e=>!e || typeof e!=='object'))) ||
    scheme.evidenceBindings && (!Array.isArray(scheme.evidenceBindings) || scheme.evidenceBindings.some(b=>!b || typeof b!=='object')) ||
    scheme.acceptanceCard?.cases && (!Array.isArray(scheme.acceptanceCard.cases) || scheme.acceptanceCard.cases.some(c=>!c || typeof c!=='object'));
  if(invalid) return {ok:false,mode,isDraft:mode==='draft',errors:[error('SCHEME_INVALID','scheme')],warnings:[],fingerprints:{},version:SCHEMA_VERSION};
  const warnings = [];
  const fingerprints = {};

  // 1. 检查 PurposeCard 唯一性
  const purposeCards = (Array.isArray(scheme.purposeCard) ? scheme.purposeCard : [scheme.purposeCard]).filter(Boolean);
  
  if (purposeCards.length === 0) {
    if (mode === 'draft') {
      warnings.push(warning(CompilerErrorCode.PURPOSE_MISSING, 'scheme.purposeCard',
        '[DRAFT] 草稿无目的卡片；可跑可出数，但标记 DRAFT，不得自称方案可用/验收通过。',
        '升级为正式方案前，补全 PurposeCard 及 sources。'));
    } else {
      errors.push(error(CompilerErrorCode.PURPOSE_MISSING, 'scheme.purposeCard', null,
        '每个正式方案必须有 1 张 PurposeCard；先锁定目的，再提图。'));
    }
  } else if (purposeCards.length > 1) {
    errors.push(error(CompilerErrorCode.PURPOSE_NOT_UNIQUE, 'scheme.purposeCard', null,
      '同一方案只能有 1 张 PurposeCard；删除多余的卡片。'));
  }

  const purposeCard = purposeCards[0];
  if(purposeCard && !Array.isArray(purposeCard.items) || purposeCard?.items && (!Array.isArray(purposeCard.items) || purposeCard.items.some(i=>!i || typeof i!=='object' || i.sources && (!Array.isArray(i.sources) || i.sources.some(s=>!s || typeof s!=='object')))))
    return {ok:false,mode,isDraft:mode==='draft',errors:[error('SCHEME_INVALID','purposeCard.items')],warnings:[],fingerprints:{},version:SCHEMA_VERSION};
  
  if (purposeCard) {
    // 计算 purposeFingerprint
    fingerprints.purpose = fingerprint({
      kind: purposeCard.kind,
      items: purposeCard.items
    });

    // 检查 Purpose items
    if (!Array.isArray(purposeCard.items) || purposeCard.items.length === 0) {
      if (mode === 'draft') {
        warnings.push(warning(CompilerErrorCode.PURPOSE_ITEM_EMPTY, 'purposeCard.items',
          '[DRAFT] 目的卡片无目的项；草稿可运行，但须标 DRAFT。',
          '升级为正式方案前，补充至少 1 个目的项。'));
      } else {
        errors.push(error(CompilerErrorCode.PURPOSE_ITEM_EMPTY, 'purposeCard.items', purposeCard.id,
          '正式方案的目的卡片至少需要 1 个目的项。'));
      }
    } else {
      for (const [index, item] of purposeCard.items.entries()) {
        const itemPath = `purposeCard.items[${index}]`;
        
        // 检查 label Mock
        const mockErr = checkMockPlaceholder(item.label, `${itemPath}.label`);
        if (mockErr) errors.push(mockErr);
        
        // 检查 sources 必填
        if (!Array.isArray(item.sources) || item.sources.length === 0) {
          if (mode === 'draft') {
            warnings.push(warning(CompilerErrorCode.PURPOSE_ITEM_NO_SOURCE, `${itemPath}.sources`,
              `[DRAFT] 目的项 "${item.label}" 无来源；草稿允许，但须标 DRAFT。`,
              '升级为正式方案前，补充至少 1 个 source。'));
          } else {
            errors.push(error(CompilerErrorCode.PURPOSE_ITEM_NO_SOURCE, `${itemPath}.sources`, item.id,
              '正式方案的每个目的项至少需要 1 个 source（document / human / session_extract）。'));
          }
        } else {
          // 检查每个 source
          for (const [sIndex, source] of item.sources.entries()) {
            const sourcePath = `${itemPath}.sources[${sIndex}]`;
            if (!['document', 'human', 'session_extract'].includes(source.type)) {
              errors.push(error('SOURCE_TYPE_INVALID', sourcePath, item.id,
                'source.type 必须是 document / human / session_extract。'));
            }
            if (!source.ref || typeof source.ref !== 'string' || source.ref.trim().length === 0) {
              errors.push(error('SOURCE_REF_MISSING', sourcePath, item.id,
                'source.ref 必须是非空字符串。'));
            }
            const mockErr = checkMockPlaceholder(source.ref, `${sourcePath}.ref`);
            if (mockErr) errors.push(mockErr);
          }
        }
        
        // 检查 output 与 rule 匹配
        if (!['ok_ng', 'class_label', 'numeric'].includes(item.output)) {
          errors.push(error('OUTPUT_TYPE_INVALID', `${itemPath}.output`, item.id,
            'output 必须是 ok_ng / class_label / numeric。'));
        }
        
        if (item.output === 'ok_ng' && !validRule(item.rule?.pass_when)) {
          errors.push(error('RULE_MISSING', `${itemPath}.rule.pass_when`, item.id,
            'ok_ng 需 rule.pass_when，例如 {metric:"count",equals:2}、{all:[規則,...]}、{any:[規則,...]} 或 {not:規則}；未提供的觀察回 UNKNOWN。'));
        }
        
        if (item.output === 'numeric') {
          if (!Number.isFinite(item.rule?.nominal) || 
              ![item.rule?.tol_abs, item.rule?.tol_pct].some(v => Number.isFinite(v) && v >= 0)) {
            errors.push(error('RULE_MISSING', `${itemPath}.rule`, item.id,
              'numeric 类型需要 rule.nominal + tol_abs 或 tol_pct。'));
          }
        }
        
        if (item.output === 'class_label' && (!Array.isArray(item.rule?.allowed_labels) || !item.rule.allowed_labels.length)) {
          errors.push(error('RULE_MISSING', `${itemPath}.rule.allowed_labels`, item.id,
            'class_label 类型需要 rule.allowed_labels 数组。'));
        }
      }
    }
  }

  // 2. 检查 ImagingConstraintCard
  const constraintCard = scheme.imagingConstraintCard;
  
  if (constraintCard) {
    // 计算 constraintFingerprint
    fingerprints.constraint = fingerprint(constraintCard);

    // 检查 linkedPurposeId
    if (!purposeCard || constraintCard.linkedPurposeId !== purposeCard.id) {
      errors.push(error(CompilerErrorCode.CONSTRAINT_PURPOSE_MISLINK, 
        'imagingConstraintCard.linkedPurposeId', constraintCard.id,
        `linkedPurposeId 必须指向唯一的 PurposeCard (${purposeCard?.id || 'null'})。`));
    }
    
    // 检查 measure 类是否有标定
    if (purposeCard && purposeCard.kind === 'measure' && !constraintCard.calibrationRequired) {
      if (policy === 'strict') {
        errors.push(error(CompilerErrorCode.MEASURE_WITHOUT_CALIB, 
          'imagingConstraintCard.calibrationRequired', constraintCard.id,
          '测量类目的默认要求 calibrationRequired=true；若确需 false，改用 policy=loose。'));
      } else {
        warnings.push(warning('MEASURE_WITHOUT_CALIB_WARNING', 
          'imagingConstraintCard.calibrationRequired',
          '测量类目的但 calibrationRequired=false，可能影响精度。',
          '确认是否需要标定。'));
      }
    }
    
    // 检查 overrideReason（若约束被改过）
    // 简化：如果有 overrideReason 但为空或 mock，报错
    if (constraintCard.overrideReason !== undefined) {
      const mockErr = checkMockPlaceholder(constraintCard.overrideReason, 'imagingConstraintCard.overrideReason');
      if (mockErr) errors.push(mockErr);
    }
    
    // 检查 lightingNotes（软警告）
    if (typeof constraintCard.lightingNotes !== 'string' || constraintCard.lightingNotes.trim().length === 0) {
      warnings.push(warning('LIGHTING_NOTES_EMPTY', 'imagingConstraintCard.lightingNotes',
        '成像约束缺少 lightingNotes（背光/暗场等）。', '补充打光条件。'));
    }
  } else if (mode === 'scheme') {
    // measure 类默认要求 constraint
    errors.push(error(CompilerErrorCode.CONSTRAINT_MISSING, 'scheme.imagingConstraintCard', null,
      '测量类目的默认要求 ImagingConstraintCard；若确不需要，改用 policy=loose。'));
  }

  // 3. 检查 AcceptanceCard
  const acceptanceCard = scheme.acceptanceCard;
  
  if (!acceptanceCard) {
    if (mode === 'draft') {
      warnings.push(warning(CompilerErrorCode.ACCEPTANCE_MISSING, 'scheme.acceptanceCard',
        '[DRAFT] 草稿无验收卡片；可出数，但不得自称验收通过。',
        '升级为正式方案前，补充 AcceptanceCard。'));
    } else {
      errors.push(error(CompilerErrorCode.ACCEPTANCE_MISSING, 'scheme.acceptanceCard', null,
        '正式方案缺少验收卡片（AcceptanceCard）；无验收标准不能确认通过。'));
    }
  }
  
  if (acceptanceCard) {
    // 检查 linkedPurposeId
    if (!purposeCard || acceptanceCard.linkedPurposeId !== purposeCard.id) {
      errors.push(error(CompilerErrorCode.ACCEPTANCE_PURPOSE_MISLINK, 
        'acceptanceCard.linkedPurposeId', acceptanceCard.id,
        `linkedPurposeId 必须指向唯一的 PurposeCard (${purposeCard?.id || 'null'})。`));
    }
    
    // 检查 cases（软警告）
    if (!Array.isArray(acceptanceCard.cases) || acceptanceCard.cases.length === 0) {
      warnings.push(warning('ACCEPTANCE_CASES_EMPTY', 'acceptanceCard.cases',
        '验收卡片无样本案例（cases 为空）。', '至少添加 1 个正/负样本。'));
    } else if (acceptanceCard.cases.length < 3) {
      warnings.push(warning('ACCEPTANCE_CASES_FEW', 'acceptanceCard.cases',
        `验收案例过少（${acceptanceCard.cases.length} 个）。`, '建议至少 3 个正负样本。'));
    }
  }

  // 4. 检查 EvidenceBinding（目的项 → 证据节点）
  const evidenceBindings = scheme.evidenceBindings || [];
  
  if (purposeCard && purposeCard.items) {
    for (const item of purposeCard.items) {
      const bound = evidenceBindings.some(b => b.purposeItemId === item.id);
      if (!bound) {
        if (mode === 'draft') {
          warnings.push(warning(CompilerErrorCode.EVIDENCE_UNBOUND, `evidenceBindings`,
            `[DRAFT] 目的项 "${item.label}" 无图绑定；草稿允许，但须标 DRAFT。`,
            '升级为正式方案前，绑定每个 Purpose item 到证据节点。'));
        } else {
          errors.push(error(CompilerErrorCode.EVIDENCE_UNBOUND, 
            `evidenceBindings`, item.id,
            `目的项 "${item.label}" (${item.id}) 无图绑定；每个 Purpose item 至少绑定一个证据节点。`));
        }
      }
    }
  }

  // Formal plans are executable Python graphs. Unsupported ops fail closed.
  const operatorGraph = scheme.operatorGraph;
  const nodes = Array.isArray(operatorGraph?.nodes) ? operatorGraph.nodes : [];
  const add = (code, path, hint) => errors.push(error(code, path, null, hint));
  if (!nodes.length) add('EXECUTABLE_GRAPH_MISSING', 'operatorGraph.nodes', '至少提供一个可执行节点。');
  const ids = new Set();
  for (const [i, node] of nodes.entries()) {
    const path = `operatorGraph.nodes[${i}]`;
    try{validateNodeDocumentation(node?.documentation);}catch(e){add('DOCUMENTATION_INVALID',path+'.documentation',e.message);}
    if (!node?.id || ids.has(node.id)) add('GRAPH_NODE_INVALID', path, '节点 id 必须非空且唯一。');
    ids.add(node?.id);
    const native=!!node?.nativePlan;
    if (!native && (node?.op !== 'programmable-python' || typeof node.code !== 'string' || !node.code.trim()))
      add('GRAPH_NOT_EXECUTABLE', path, 'Python fallback 節點需含完整 code；Rust 節點需提供 nativePlan。');
    if(native&& (node.nativePlan.backend!=='rust-native'||!node.nativePlan.plan||!Array.isArray(node.nativePlan.plan.nodes)||!node.nativePlan.plan.nodes.length))
      add('NATIVE_PLAN_INVALID', path+'.nativePlan', 'Rust 節點需要 nativePlan.backend="rust-native" 與非空 typed plan。');
    if(!Array.isArray(node.expected_outputs) || !node.expected_outputs.length) add('GRAPH_OUTPUTS_MISSING',path+'.expected_outputs','声明实际产物 id/type。');
    const outputs = node?.expected_outputs || (node?.outputContract?.evidence ? [{id:node.outputContract.evidence,type:'evidence'}] : []);
    const audit = validateOperationEvidenceJustification(node?.justification, {
      nodeId:node?.id, requiredParameters:Object.keys(node?.parameters || {}).map(name=>({name,source:'agent-proposal'})),
      allowVisuals:true, evidenceArtifacts:outputs, gateIds:(node?.justification?.boundaries || []).filter(b=>b.check?.kind==='gate').map(b=>b.check.id)
    });
    if (!audit.valid) add('DOCUMENT_REFERENCE_INVALID', path+'.justification', JSON.stringify(audit.errors));
    for (const [j, boundary] of (node.justification?.boundaries || []).entries()) {
      if (boundary.pass_when !== undefined && !validRule(boundary.pass_when))
        add('RULE_MISSING', `${path}.justification.boundaries[${j}].pass_when`, '邊界需可執行 metric/all/any/not 規則；語法見 get_purpose_scheme_capabilities.ruleGrammar。');
    }
    if (!node?.source || node.source.schemeFingerprint !== schemeFingerprint(scheme))
      add('SOURCE_MISMATCH', path+'.source', '重新綁定目前來源與方案。');
  }
  const producers=new Map();
  for(const [i,node] of nodes.entries())for(const output of node?.expected_outputs||[]){const prior=producers.get(output.id);if(prior&&prior!==node.id)warnings.push(warning('DUPLICATE_ARTIFACT_PRODUCER',`operatorGraph.nodes[${i}].expected_outputs`,'同名產物由多個節點宣告；輸入仍以 nodeId+artifactId 綁定，請改成節點內唯一名稱。'));else producers.set(output.id,node.id);}
  // Named inputs make dependency arrows carry actual saved data.
  for(const [i,node] of nodes.entries()){
    if(node.image_ids!==undefined&&(!Array.isArray(node.image_ids)||!node.image_ids.length||node.image_ids.some(id=>typeof id!=='string'||!id)||new Set(node.image_ids).size!==node.image_ids.length))add('GRAPH_IMAGE_IDS_INVALID',`operatorGraph.nodes[${i}].image_ids`,'提供不重複的原圖 ID 陣列。');
    if(node.inputs!==undefined&&(!node.inputs||typeof node.inputs!=='object'||Array.isArray(node.inputs)))add('GRAPH_INPUT_INVALID',`operatorGraph.nodes[${i}].inputs`,'inputs 必須為具名 slot 物件。');
    else for(const [slot,input]of Object.entries(node.inputs||{})){
      const upstream=nodes.find(n=>n.id===input?.nodeId);
      if(!/^[A-Za-z_][\w]*$/.test(slot)||!upstream||!upstream.expected_outputs?.some(a=>a.id===input.artifactId)||!(operatorGraph.edges||[]).some(e=>e.from===input.nodeId&&e.to===node.id))add('GRAPH_INPUT_DANGLING',`operatorGraph.nodes[${i}].inputs.${slot}`,'輸入須引用上游真實節點的宣告產物，並建立 from→to 依賴邊。');
    }
    if(node.outputContract?.target_image_id!==undefined&&(typeof node.outputContract.target_image_id!=='string'||node.source&&!node.source.images?.some(i=>i.imageId===node.outputContract.target_image_id)))add('OUTPUT_CONTRACT_MISMATCH',`operatorGraph.nodes[${i}].outputContract.target_image_id`,'單一目標須為本節點的真實來源 image ID。');
    for(const name of ['case_outputs','case_image_id'])if(node.outputContract?.[name]!==undefined&&(typeof node.outputContract[name]!=='string'||!/^\w+(?:\.\w+)*$/.test(node.outputContract[name])||node.outputContract[name].split('.').some(k=>['__proto__','prototype','constructor'].includes(k))))add('OUTPUT_CONTRACT_MISMATCH',`operatorGraph.nodes[${i}].outputContract.${name}`,'使用非空安全欄位路徑；case_outputs 指向逐圖陣列，case_image_id 指向該列原圖 ID。');
  }
  // Check edges and cycles, so a successful compile is an executable graph.
  const indegree = new Map(nodes.map(n=>[n.id,0])), children = new Map(nodes.map(n=>[n.id,[]]));
  for (const [i, edge] of (operatorGraph?.edges || []).entries()) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) add('GRAPH_EDGE_DANGLING', `operatorGraph.edges[${i}]`, '边的 from/to 必须引用现有节点。');
    else { indegree.set(edge.to,indegree.get(edge.to)+1); children.get(edge.from).push(edge.to); }
  }
  const edgeKeys=new Set();
  for(const [i,edge] of (operatorGraph?.edges||[]).entries()){const key=`${edge?.from}->${edge?.to}`;if(edgeKeys.has(key))add('DUPLICATE_DEPENDENCY_EDGE',`operatorGraph.edges[${i}]`,'同一依賴邊不可重複宣告。');edgeKeys.add(key);}
  const queue = [...indegree.keys()].filter(id=>!indegree.get(id)); let visited=0;
  while(queue.length){const id=queue.shift();visited++;for(const child of children.get(id)){indegree.set(child,indegree.get(child)-1);if(!indegree.get(child))queue.push(child);}}
  if(visited!==nodes.length) add('GRAPH_CYCLE','operatorGraph.edges','图必须无环。');
  for (const [i,binding] of evidenceBindings.entries()) {
    const node=nodes.find(n=>n.id===binding.operatorNodeId), item=purposeCard?.items?.find(p=>p.id===binding.purposeItemId);
    const artifacts=node?.expected_outputs || (node?.outputContract?.evidence ? [{id:node.outputContract.evidence}] : []);
    if(!node || !item || !artifacts.some(a=>a.id===binding.evidenceArtifactId)) add('EVIDENCE_BINDING_DANGLING',`evidenceBindings[${i}]`,'绑定必须引用真实节点、目的项和声明产物。');
    const contract=node?.outputContract;
    if(item && !(item.output==='ok_ng' ? contract?.classification==='OK|NG' : item.output==='numeric' ? typeof contract?.numeric==='string' : typeof contract?.class_label==='string'))
      add('OUTPUT_CONTRACT_MISMATCH',`evidenceBindings[${i}]`,'节点输出必须与目的项类型一致。');
  }
  if(!acceptanceCard?.cases?.length) add('ACCEPTANCE_CASES_EMPTY','acceptanceCard.cases','至少一个具有 expectedOutputs 的真实案例。');
  for(const [i,c] of (acceptanceCard?.cases || []).entries())
    for(const item of purposeCard?.items || []) {
      const expected=c.expectedOutputs?.[item.id];
      if(!c.imageRef || (item.output==='ok_ng' ? !['OK','NG'].includes(expected) : item.output==='numeric' ? !Number.isFinite(expected) : !item.rule?.allowed_labels?.includes(expected)))
        add('ACCEPTANCE_CASE_INVALID',`acceptanceCard.cases[${i}]`,'案例必须有 imageRef 和符合目的类型的 expectedOutputs。');
    }
  const scan=(value,path)=>{
    const err=checkMockPlaceholder(value,path); if(err) errors.push(err);
    if(value && typeof value==='object') for(const [key,child] of Object.entries(value)) scan(child,`${path}.${key}`);
  };
  scan(scheme,'scheme');
  fingerprints.basis=schemeFingerprint(scheme);
  if(scheme.fingerprints?.basis && scheme.fingerprints.basis!==fingerprints.basis)
    add('JUSTIFICATION_SOURCE_MISMATCH','fingerprints.basis','方案变更，旧编译结果失效。');
  if (operatorGraph) fingerprints.graph=fingerprint(operatorGraph);
  if(mode==='draft') warnings.push(...errors.splice(0).map(e=>({...e,level:'warning'})));

  // 6. 最终结果
  const ok = errors.length === 0;
  
  return {
    ok,
    mode, // 'draft' | 'scheme'
    isDraft: mode === 'draft',
    errors,
    warnings,
    fingerprints,
    version: SCHEMA_VERSION
  };
}

/**
 * 创建空 Scheme
 */
export function createScheme(schemeId = null) {
  const id = schemeId || `scheme-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
  return {
    id,
    version: SCHEMA_VERSION,
    purposeCard: null,
    imagingConstraintCard: null,
    acceptanceCard: null,
    operatorGraph: null,
    evidenceBindings: [],
    fingerprints: {}
  };
}

/**
 * 创建 PurposeCard
 */
export function createPurposeCard(schemeId, kind = 'classify') {
  return {
    id: `purpose-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
    schemeId,
    kind,
    items: [],
    position: { x: 100, y: 100 }
  };
}

/**
 * 创建 ImagingConstraintCard
 */
export function createImagingConstraintCard(schemeId, linkedPurposeId) {
  return {
    id: `constraint-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
    schemeId,
    linkedPurposeId,
    minFeaturePx: null,
    pixelSizeUm: null,
    workingDistanceMm: null,
    fovMm: null,
    lightingNotes: '',
    calibrationRequired: true,
    overrideReason: null,
    position: { x: 400, y: 100 }
  };
}

/**
 * 创建 AcceptanceCard
 */
export function createAcceptanceCard(schemeId, linkedPurposeId) {
  return {
    id: `acceptance-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
    schemeId,
    linkedPurposeId,
    metrics: {
      falseNegativeRateMax: null,
      falsePositiveRateMax: null,
      repeatabilityPct: null
    },
    cases: [],
    position: { x: 700, y: 100 }
  };
}

/**
 * 添加 Purpose Item
 */
export function addPurposeItem(purposeCard, label, output = 'ok_ng', sources = []) {
  const item = {
    id: `item-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
    label,
    output,
    rule: output === 'ok_ng' ? { pass_when: null } : 
          output === 'numeric' ? { nominal: null, tol_abs: null } :
          { allowed_labels: [] },
    sources: sources.length > 0 ? sources : []
  };
  purposeCard.items.push(item);
  return item;
}

/**
 * 添加 EvidenceBinding
 */
export function addEvidenceBinding(scheme, purposeItemId, operatorNodeId, evidenceArtifactId) {
  const binding = {
    purposeItemId,
    operatorNodeId,
    evidenceArtifactId
  };
  scheme.evidenceBindings.push(binding);
  return binding;
}

export function schemeFingerprint(scheme) {
  if(!scheme) return null;
  return fingerprint({execution:scheme.execution,classificationSpec:scheme.classificationSpec,metricBindings:scheme.metricBindings,purpose:scheme.purposeCard,constraint:scheme.imagingConstraintCard,acceptance:scheme.acceptanceCard,
    bindings:scheme.evidenceBindings,graph:scheme.operatorGraph && {...scheme.operatorGraph,nodes:(scheme.operatorGraph.nodes||[]).map(({justification,source,documentation,...node})=>{
      const boundaryRules=(justification?.boundaries||[]).filter(b=>b.pass_when!==undefined).map(({condition,check,onFailure,pass_when})=>({condition,check,onFailure,pass_when}));
      return boundaryRules.length?{...node,boundaryRules}:node;
    })}});
}
export const sourceFingerprint = stable;

export function validPurposeRule(rule){
 if(!rule || typeof rule!=='object' || Array.isArray(rule))return false;
 const keys=Object.keys(rule);
 if(keys.length===1&&['all','any'].includes(keys[0]))return Array.isArray(rule[keys[0]])&&rule[keys[0]].length>0&&rule[keys[0]].every(validPurposeRule);
 if(keys.length===1&&keys[0]==='not')return validPurposeRule(rule.not);
 return typeof rule.metric==='string'&&/^[A-Za-z_][\w]*(?:\.[A-Za-z_0-9][\w]*)*$/.test(rule.metric)&&!rule.metric.split('.').some(k=>['__proto__','prototype','constructor'].includes(k))&&['min','max','lt','gt','equals'].some(k=>Object.hasOwn(rule,k))&&
 Object.entries(rule).every(([k,v])=>k==='metric'||(k==='equals'?['number','string','boolean'].includes(typeof v)&&(typeof v!=='number'||Number.isFinite(v)):['min','max','lt','gt'].includes(k)&&Number.isFinite(v)));
}
const validRule=validPurposeRule;
export function evaluatePurposeRule(rule,data){
 if(!validRule(rule))return null;
 if(rule.all||rule.any){const checks=(rule.all||rule.any).map(r=>evaluatePurposeRule(r,data));return rule.all?(checks.includes(false)?false:checks.includes(null)?null:true):(checks.includes(true)?true:checks.includes(null)?null:false);}
 if(rule.not){const value=evaluatePurposeRule(rule.not,data);return value===null?null:!value;}
 const value=rule.metric.split('.').reduce((v,k)=>v&&Object.hasOwn(v,k)?v[k]:undefined,data);
 if(value===undefined||value===null||typeof value==='number'&&!Number.isFinite(value))return null;
 const comparisons=Object.entries(rule).filter(([k])=>k!=='metric');
 if(comparisons.some(([k])=>k!=='equals'&&typeof value!=='number'))return null;
 return comparisons.every(([k,v])=>k==='equals'?value===v:k==='min'?value>=v:k==='max'?value<=v:k==='lt'?value<v:value>v);
}
