// Purpose Compiler 单元测试

import { 
  compileScheme, 
  createScheme, 
  createPurposeCard, 
  createImagingConstraintCard,
  createAcceptanceCard,
  addPurposeItem,
  addEvidenceBinding,
  evaluatePurposeRule
} from '../src/purpose-compiler.js';
import { CompilerErrorCode } from '../src/purpose-compiler-schema.js';

// 简单的测试框架
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertError(result, code) {
  assert(result.errors.some(e => e.code === code), 
    `Expected error code ${code}, got ${result.errors.map(e => e.code).join(', ')}`);
}

function assertNoError(result, code) {
  assert(!result.errors.some(e => e.code === code), 
    `Unexpected error code ${code}`);
}

// 测试用例

console.log('Testing Purpose Compiler...\n');

// Test 1: PURPOSE_MISSING
console.log('Test 1: PURPOSE_MISSING');
{
  const scheme = createScheme();
  const result = compileScheme(scheme);
  assert(!result.ok, 'Scheme without purpose should fail');
  assertError(result, CompilerErrorCode.PURPOSE_MISSING);
  console.log('✓ PURPOSE_MISSING detected\n');
}

// Test 2: PURPOSE_NOT_UNIQUE
console.log('Test 2: PURPOSE_NOT_UNIQUE');
{
  const scheme = createScheme();
  scheme.purposeCard = createPurposeCard(scheme.id, 'classify');
  scheme.purposeCard=[scheme.purposeCard,{...scheme.purposeCard,id:'second'}];
  assertError(compileScheme(scheme),CompilerErrorCode.PURPOSE_NOT_UNIQUE);
}

// Test 3: PURPOSE_ITEM_EMPTY
console.log('Test 3: PURPOSE_ITEM_EMPTY');
{
  const scheme = createScheme();
  const purposeCard = createPurposeCard(scheme.id, 'classify');
  scheme.purposeCard = purposeCard;
  // items 为空
  const result = compileScheme(scheme);
  assert(!result.ok, 'Scheme with empty items should fail');
  assertError(result, CompilerErrorCode.PURPOSE_ITEM_EMPTY);
  console.log('✓ PURPOSE_ITEM_EMPTY detected\n');
}

// Test 4: PURPOSE_ITEM_NO_SOURCE
console.log('Test 4: PURPOSE_ITEM_NO_SOURCE');
{
  const scheme = createScheme();
  const purposeCard = createPurposeCard(scheme.id, 'classify');
  scheme.purposeCard = purposeCard;
  addPurposeItem(purposeCard, '缺齿检测', 'ok_ng', []); // 无 sources
  const result = compileScheme(scheme);
  assert(!result.ok, 'Scheme with item without sources should fail');
  assertError(result, CompilerErrorCode.PURPOSE_ITEM_NO_SOURCE);
  console.log('✓ PURPOSE_ITEM_NO_SOURCE detected\n');
}

// Test 5: CONSTRAINT_MISSING (measure 类)
console.log('Test 5: CONSTRAINT_MISSING');
{
  const scheme = createScheme();
  const purposeCard = createPurposeCard(scheme.id, 'measure');
  scheme.purposeCard = purposeCard;
  addPurposeItem(purposeCard, '孔距测量', 'numeric', [
    { type: 'document', ref: 'drawing-001.pdf', note: '图纸第3页' }
  ]);
  // 无 ImagingConstraintCard
  const result = compileScheme(scheme, { policy: 'strict' });
  assert(!result.ok, 'Measure scheme without constraint should fail in strict mode');
  assertError(result, CompilerErrorCode.CONSTRAINT_MISSING);
  console.log('✓ CONSTRAINT_MISSING detected\n');
}

// Test 6: MEASURE_WITHOUT_CALIB
console.log('Test 6: MEASURE_WITHOUT_CALIB');
{
  const scheme = createScheme();
  const purposeCard = createPurposeCard(scheme.id, 'measure');
  scheme.purposeCard = purposeCard;
  addPurposeItem(purposeCard, '孔距测量', 'numeric', [
    { type: 'human', ref: '工程师指定：孔距 10±0.5mm' }
  ]);
  const constraintCard = createImagingConstraintCard(scheme.id, purposeCard.id);
  constraintCard.calibrationRequired = false; // 测量但不标定
  scheme.imagingConstraintCard = constraintCard;
  const result = compileScheme(scheme, { policy: 'strict' });
  assert(!result.ok, 'Measure without calibration should fail in strict mode');
  assertError(result, CompilerErrorCode.MEASURE_WITHOUT_CALIB);
  console.log('✓ MEASURE_WITHOUT_CALIB detected\n');
}

// Test 7: CONSTRAINT_PURPOSE_MISLINK
console.log('Test 7: CONSTRAINT_PURPOSE_MISLINK');
{
  const scheme = createScheme();
  const purposeCard = createPurposeCard(scheme.id, 'classify');
  scheme.purposeCard = purposeCard;
  addPurposeItem(purposeCard, '污渍检测', 'ok_ng', [
    { type: 'session_extract', ref: 'session-2026-10-28-001' }
  ]);
  const constraintCard = createImagingConstraintCard(scheme.id, 'wrong-purpose-id');
  scheme.imagingConstraintCard = constraintCard;
  const result = compileScheme(scheme);
  assert(!result.ok, 'Constraint with wrong linkedPurposeId should fail');
  assertError(result, CompilerErrorCode.CONSTRAINT_PURPOSE_MISLINK);
  console.log('✓ CONSTRAINT_PURPOSE_MISLINK detected\n');
}

// Test 8: ACCEPTANCE_MISSING
console.log('Test 8: ACCEPTANCE_MISSING');
{
  const scheme = createScheme();
  const purposeCard = createPurposeCard(scheme.id, 'classify');
  scheme.purposeCard = purposeCard;
  addPurposeItem(purposeCard, '齿轮分类', 'class_label', [
    { type: 'document', ref: 'spec-v2.1.pdf' }
  ]);
  // 无 AcceptanceCard
  const result = compileScheme(scheme, { policy: 'strict' });
  assert(!result.ok, 'Scheme without acceptance should fail in strict mode');
  assertError(result, CompilerErrorCode.ACCEPTANCE_MISSING);
  console.log('✓ ACCEPTANCE_MISSING detected\n');
}

// Test 9: ACCEPTANCE_PURPOSE_MISLINK
console.log('Test 9: ACCEPTANCE_PURPOSE_MISLINK');
{
  const scheme = createScheme();
  const purposeCard = createPurposeCard(scheme.id, 'classify');
  scheme.purposeCard = purposeCard;
  addPurposeItem(purposeCard, '齿轮OK/NG', 'ok_ng', [
    { type: 'human', ref: '操作员培训手册第5章' }
  ]);
  const acceptanceCard = createAcceptanceCard(scheme.id, 'wrong-purpose-id');
  scheme.acceptanceCard = acceptanceCard;
  const result = compileScheme(scheme);
  assert(!result.ok, 'Acceptance with wrong linkedPurposeId should fail');
  assertError(result, CompilerErrorCode.ACCEPTANCE_PURPOSE_MISLINK);
  console.log('✓ ACCEPTANCE_PURPOSE_MISLINK detected\n');
}

// Test 10: EVIDENCE_UNBOUND
console.log('Test 10: EVIDENCE_UNBOUND');
{
  const scheme = createScheme();
  const purposeCard = createPurposeCard(scheme.id, 'classify');
  scheme.purposeCard = purposeCard;
  const item = addPurposeItem(purposeCard, '孔洞计数', 'numeric', [
    { type: 'document', ref: 'blueprint-rev3.dwg', note: '孔位图' }
  ]);
  const constraintCard = createImagingConstraintCard(scheme.id, purposeCard.id);
  scheme.imagingConstraintCard = constraintCard;
  const acceptanceCard = createAcceptanceCard(scheme.id, purposeCard.id);
  scheme.acceptanceCard = acceptanceCard;
  // 无 EvidenceBinding
  const result = compileScheme(scheme);
  assert(!result.ok, 'Purpose item without evidence binding should fail');
  assertError(result, CompilerErrorCode.EVIDENCE_UNBOUND);
  console.log('✓ EVIDENCE_UNBOUND detected\n');
}

// Test 11: MOCK_PLACEHOLDER
console.log('Test 11: MOCK_PLACEHOLDER');
{
  const scheme = createScheme();
  const purposeCard = createPurposeCard(scheme.id, 'classify');
  scheme.purposeCard = purposeCard;
  addPurposeItem(purposeCard, 'TBD', 'ok_ng', [
    { type: 'document', ref: '待补充' }
  ]);
  const result = compileScheme(scheme);
  assert(!result.ok, 'Scheme with mock placeholder should fail');
  assertError(result, CompilerErrorCode.MOCK_PLACEHOLDER);
  console.log('✓ MOCK_PLACEHOLDER detected\n');
}

// Formal execution cannot be enabled by loose policy or by an empty graph.
{
  const scheme=createScheme();
  const result=compileScheme(scheme,{policy:'loose'});
  assertError(result,'EXECUTABLE_GRAPH_MISSING');
  assertError(result,CompilerErrorCode.CONSTRAINT_MISSING);
  assertError(result,CompilerErrorCode.ACCEPTANCE_MISSING);
}

// Test 14: Draft mode - missing purpose is warning not error
console.log('Test 14: Draft mode - missing purpose is warning not error');
{
  const scheme = createScheme();
  const result = compileScheme(scheme, { mode: 'draft' });
  
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);
  console.log(`Mode: ${result.mode}, isDraft: ${result.isDraft}`);
  
  assertNoError(result, CompilerErrorCode.PURPOSE_MISSING);
  assert(result.warnings.some(w => w.code === CompilerErrorCode.PURPOSE_MISSING), 
    'Draft mode should have PURPOSE_MISSING as warning');
  assert(result.isDraft === true, 'isDraft should be true');
  assert(result.mode === 'draft', 'mode should be draft');
  assert(result.ok, 'Draft without purpose should still be ok (warnings only)');
  console.log('✓ Draft mode allows missing purpose\n');
}

// Test 15: Draft mode - missing sources is warning
console.log('Test 15: Draft mode - missing sources is warning');
{
  const scheme = createScheme();
  const purposeCard = createPurposeCard(scheme.id, 'classify');
  scheme.purposeCard = purposeCard;
  const item = addPurposeItem(purposeCard, '临时探测', 'ok_ng', []); // 无 sources
  item.rule.pass_when = 'condition'; // 填充 rule
  const result = compileScheme(scheme, { mode: 'draft' });
  
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);
  result.errors.forEach(e => console.log(`  Error: ${e.code} - ${e.message}`));
  
  assertNoError(result, CompilerErrorCode.PURPOSE_ITEM_NO_SOURCE);
  assert(result.warnings.some(w => w.code === CompilerErrorCode.PURPOSE_ITEM_NO_SOURCE), 
    'Draft mode should have PURPOSE_ITEM_NO_SOURCE as warning');
  assert(result.ok || result.errors.every(e => e.code !== CompilerErrorCode.PURPOSE_ITEM_NO_SOURCE), 
    'Draft with item without sources should not have PURPOSE_ITEM_NO_SOURCE as hard error');
  console.log('✓ Draft mode allows missing sources\n');
}

// Test 16: Draft mode - missing acceptance is warning
console.log('Test 16: Draft mode - missing acceptance is warning');
{
  const scheme = createScheme();
  const purposeCard = createPurposeCard(scheme.id, 'measure');
  scheme.purposeCard = purposeCard;
  const item = addPurposeItem(purposeCard, '临时测量', 'numeric', [
    { type: 'human', ref: '只量这张图某一个数' }
  ]);
  item.rule.nominal = 100;
  item.rule.tol_abs = 1;
  addEvidenceBinding(scheme, item.id, 'measure', 'result');
  // 无 AcceptanceCard, 无 ImagingConstraintCard (draft 允许)
  const result = compileScheme(scheme, { mode: 'draft' });
  
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);
  
  assertNoError(result, CompilerErrorCode.ACCEPTANCE_MISSING);
  assert(result.warnings.some(w => w.code === CompilerErrorCode.ACCEPTANCE_MISSING), 
    'Draft mode should have ACCEPTANCE_MISSING as warning');
  assert(result.ok || result.errors.every(e => e.code !== CompilerErrorCode.ACCEPTANCE_MISSING), 
    'Draft without acceptance should not have ACCEPTANCE_MISSING as hard error');
  console.log('✓ Draft mode allows missing acceptance\n');
}

// Test 17: Scheme mode - missing purpose is still error
console.log('Test 17: Scheme mode - missing purpose is still error');
{
  const scheme = createScheme();
  const result = compileScheme(scheme, { mode: 'scheme' });
  
  assert(!result.ok, 'Scheme mode without purpose should fail');
  assertError(result, CompilerErrorCode.PURPOSE_MISSING);
  assert(result.mode === 'scheme', 'mode should be scheme');
  assert(result.isDraft === false, 'isDraft should be false');
  console.log('✓ Scheme mode enforces purpose requirement\n');
}

console.log('All tests passed! ✓');

// Missing measured fields must remain unknown instead of producing a false NG.
assert(evaluatePurposeRule({all:[{metric:'inliers',min:12},{metric:'coverage',min:.15}]},{inliers:75})===null,'Missing metric stays unknown');
assert(evaluatePurposeRule({metric:'coverage',min:.15},{coverage:null})===null,'Null is not a measurement');
