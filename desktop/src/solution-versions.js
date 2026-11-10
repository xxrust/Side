// One host API for UI and headless callers. Trials and chosen checkpoints share
// the same immutable Git history and LFS objects.
export function createSolutionVersionApi(invoke){
 if(typeof invoke!=='function')throw new TypeError('A native invocation function is required');
 return {
 export:(projectPath,content)=>invoke('export_solution_project',{projectPath,content}),
 import:()=>invoke('import_solution_project'),
  create:(projectPath,content,message,{kind='checkpoint',runId=null}={})=>invoke('create_solution_version',{projectPath,content,message,kind,runId}),
  list:projectPath=>invoke('list_solution_versions',{projectPath}),
  read:(projectPath,commit)=>invoke('read_solution_version',{projectPath,commit}),
  ensure:(content,projectId=null)=>invoke('ensure_history_workspace',{content,projectId}),
  attach:(sourcePath,projectPath)=>invoke('attach_solution_history',{sourcePath,projectPath}),
  tag:(projectPath,commit,tag,enabled)=>invoke('set_solution_tag',{projectPath,commit,tag,enabled}),
  pendingCount:projectPath=>invoke('pending_history_count',{projectPath}),
  retry:projectPath=>invoke('retry_pending_history',{projectPath})
 };
}
