// Only the prepared review page contains this inline, local project payload.
(async()=>{
  const payload=document.getElementById('preparedProject');if(!payload)return;
  try{
    await AgentCVFlow.openProject(new File([payload.textContent],'prepared.agentcv.json',{type:'application/json'}));
    if(!AgentCVFlow.projectData().images.length)throw Error('預載專案未成功開啟');
    AgentCVFlow.setStep('measure');document.querySelector('[data-measure-tab="list"]').click();
    document.getElementById('taskFeedback').textContent='這是你的原圖與四條意圖線。先核對藍色採用邊；寬高已量出，正式公差尚未填寫。';
  }catch(error){document.getElementById('actionStatus').textContent=`預載失敗：${error.message}。可用「開啟專案」手動載入 qa/user-replay/frame-measurement-ready.agentcv.json。`;}
})();
