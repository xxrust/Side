/**
 * A small, declarative risk registry for the AgentCV host-tool contract.
 *
 * The registry deliberately lives beside the host dispatcher rather than in a
 * skill. It is therefore available to the browser host, tests and generated
 * MCP contract without changing user-authored instructions.
 */
export const TOOL_RISK = Object.freeze({
  READ: 'read',
  DISPLAY: 'display',
  COMPUTE: 'compute',
  PROJECT_WRITE: 'project-write',
  ENVIRONMENT: 'environment',
  UNKNOWN: 'unknown',
});

const risks = Object.freeze({
  install_algorithm_packages: TOOL_RISK.ENVIRONMENT,
  run_dataset_scheme: TOOL_RISK.COMPUTE,
  run_workpiece_scheme: TOOL_RISK.COMPUTE,
  run_acceptance_baseline: TOOL_RISK.COMPUTE,
  run_pipeline_batch: TOOL_RISK.COMPUTE,
  run_pipeline: TOOL_RISK.COMPUTE,
  run_purpose_scheme: TOOL_RISK.COMPUTE,
  run_algorithm: TOOL_RISK.COMPUTE,
  set_purpose_scheme: TOOL_RISK.PROJECT_WRITE,
  adopt_purpose_scheme: TOOL_RISK.PROJECT_WRITE,
  reject_purpose_scheme: TOOL_RISK.PROJECT_WRITE,
  set_node_documentation: TOOL_RISK.PROJECT_WRITE,
  rename_flow_node: TOOL_RISK.PROJECT_WRITE,
  create_pipeline: TOOL_RISK.PROJECT_WRITE,
  set_pipeline_graph: TOOL_RISK.PROJECT_WRITE,
  set_workpiece_info: TOOL_RISK.PROJECT_WRITE,
  add_part: TOOL_RISK.PROJECT_WRITE,
  set_target_note: TOOL_RISK.PROJECT_WRITE,
  add_relation: TOOL_RISK.PROJECT_WRITE,
  propose_region: TOOL_RISK.PROJECT_WRITE,
  propose_check: TOOL_RISK.PROJECT_WRITE,
  propose_label: TOOL_RISK.PROJECT_WRITE,
  apply_canvas_consultation: TOOL_RISK.PROJECT_WRITE,
  tune_geometry_tool: TOOL_RISK.PROJECT_WRITE,
  adopt_algorithm_output: TOOL_RISK.PROJECT_WRITE,
  write_skill: TOOL_RISK.ENVIRONMENT,
  search_visual_assets: TOOL_RISK.READ,
  set_canvas_image_mode: TOOL_RISK.DISPLAY,
  save_visual_asset: TOOL_RISK.PROJECT_WRITE,
  revise_algorithm_evidence: TOOL_RISK.PROJECT_WRITE,
  get_canvas_artifact_groups: TOOL_RISK.READ,
  group_canvas_artifacts: TOOL_RISK.PROJECT_WRITE,
  set_canvas_artifact_group: TOOL_RISK.DISPLAY,
  add_canvas_image_label: TOOL_RISK.PROJECT_WRITE,
  create_linked_canvas_board: TOOL_RISK.PROJECT_WRITE,
  connect_visual_images: TOOL_RISK.PROJECT_WRITE,
  present_algorithm_result: TOOL_RISK.PROJECT_WRITE,
  set_algorithm_presentation: TOOL_RISK.DISPLAY,
  adopt_algorithm_output: TOOL_RISK.PROJECT_WRITE,
  trial_edge_search: TOOL_RISK.COMPUTE,
  select_image: TOOL_RISK.DISPLAY,
  verify_pipeline_delivery: TOOL_RISK.READ,
  build_recipe: TOOL_RISK.PROJECT_WRITE,
  suggest_foreground: TOOL_RISK.COMPUTE,
  set_workpiece_info: TOOL_RISK.PROJECT_WRITE,
  add_part: TOOL_RISK.PROJECT_WRITE,
  set_target_note: TOOL_RISK.PROJECT_WRITE,
  add_relation: TOOL_RISK.PROJECT_WRITE,
  propose_project_acceptance: TOOL_RISK.PROJECT_WRITE,
  compare_acceptance_runs: TOOL_RISK.READ,
  rebind_canvas_card: TOOL_RISK.PROJECT_WRITE,
  add_canvas_card: TOOL_RISK.PROJECT_WRITE,
  add_visual_image: TOOL_RISK.PROJECT_WRITE,
  annotate_visual_board: TOOL_RISK.PROJECT_WRITE,
  get_canvas_layers: TOOL_RISK.READ,
  reference_canvas_layer: TOOL_RISK.DISPLAY,
  set_canvas_layer_visibility: TOOL_RISK.DISPLAY,
  run_current: TOOL_RISK.COMPUTE,
});

const displayTools = new Set([
  'show_visual_image', 'show_visual_asset', 'show_algorithm_run',
  'set_pipeline_view', 'set_inspection_view', 'go_to_step',
]);

export function toolRisk(name) {
  if (risks[name]) return risks[name];
  if (displayTools.has(name)) return TOOL_RISK.DISPLAY;
  if (/^(get_|read_|validate_|compile_)/.test(name)) return TOOL_RISK.READ;
  return TOOL_RISK.UNKNOWN;
}

/**
 * Compute and environment operations can be expensive or mutate external
 * state. The UI may use this result to request a human approval before
 * dispatch. Draft Python experiments remain explicitly non-approval work.
 */
export function toolPolicy(name, args = {}) {
  const risk = toolRisk(name);
  const draft = name === 'run_algorithm' && (args?.mode === 'draft' || (args?.mode == null && !args?.scheme_node_id));
  const requiresHumanApproval = risk === TOOL_RISK.UNKNOWN
    || risk === TOOL_RISK.ENVIRONMENT
    || (risk === TOOL_RISK.COMPUTE && !draft)
    || (risk === TOOL_RISK.PROJECT_WRITE && ['set_purpose_scheme','adopt_purpose_scheme','apply_canvas_consultation'].includes(name));
  return Object.freeze({
    name,
    risk,
    requiresHumanApproval,
    approvalReason: requiresHumanApproval
      ? (risk === TOOL_RISK.UNKNOWN
        ? '這個工具尚未完成風險註冊，宿主先阻止其執行，需由人明確批准。'
        : risk === TOOL_RISK.ENVIRONMENT
        ? '這會修改專案執行環境或安裝依賴。'
        : risk === TOOL_RISK.COMPUTE
          ? '這會啟動實際檢測或批量運算。'
          : name==='apply_canvas_consultation'
            ? '這會把人類回答寫入正式檢測規格並使既有結果需要回歸，請先核對回執。'
            : '這會提出方案修改，需先由人採用。')
      : null,
  });
}

export function agentToolRiskRegistry(names = []) {
  return Object.fromEntries(names.map(name => [name, toolPolicy(name)]));
}
