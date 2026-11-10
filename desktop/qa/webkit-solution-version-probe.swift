import AppKit
import WebKit
import Foundation
import Darwin
let path = CommandLine.arguments[1]
let project = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as! [String: Any]
let first = (project["images"] as! [[String: Any]])[0]
let dataURL = first["dataURL"] as! String
let recorded = first["sha256"] as! String
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
class Probe: NSObject, WKNavigationDelegate {
 var web: WKWebView!
 func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
  let mode=CommandLine.arguments.contains("--import-entry")
  let importCode="""
  for(let i=0;i<100;i++){if(globalThis.AgentCVDesktop)break;await new Promise(r=>setTimeout(r,50));}
  if(!globalThis.AgentCVDesktop)throw Error('Application did not initialize');
  await AgentCVDesktop.startupReady;
  const input=document.getElementById('browserProject');
  AgentCVDesktop.project.dirty=false;
  const transfer=new DataTransfer(); transfer.items.add(new File([projectJSON],'actual-pi-workspace.agentcv.json',{type:'application/json'}));
  input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
  for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,50));if(AgentCVDesktop.project.data.images.length)break;}
  const p=AgentCVDesktop.project,v=AgentCVDesktop.inquiryView,run=p.data.algorithmRuns.at(-1).runId;
  await v.programFlow.openNode(run+'::otsu#1');await v.programFlow.map.ready;
  const choices=[];
  if(document.querySelector('select[aria-label="選擇執行紀錄"]'))throw Error('Obsolete execution dropdown remains');
  const entry=document.querySelector('button[aria-label="方案歷史"]');if(!entry)throw Error('History entry missing');entry.click();await new Promise(r=>setTimeout(r,100));const dialog=document.querySelector('dialog[aria-label="方案歷史"]');if(!dialog?.open)throw Error('History did not open');
  dialog.querySelector('[data-filter="all"]').click();
  for(const row of dialog.querySelectorAll('.solution-version-row'))choices.push(row.textContent);
  if(choices.length!==2||!choices.every(text=>text.includes('舊實算')))throw Error('Actual legacy runs missing or falsely presented as complete snapshots');
  const decoded=await Promise.all(p.data.visualInquiry.assets.map(async a=>{const image=new Image();image.src=a.dataURL;await image.decode();return true;}));
  return {decodedAssets:decoded.length,images:p.data.images.length,choices,version:document.querySelector('.brand small').textContent,versionEntry:true,scope:'WKWebView without native IPC; native Git verified separately'};
  """
  let fingerprintCode="const {decode}=await import('/src/image.js'); const raster=await decode(dataURL); return {width:raster.width,height:raster.height,sha256:raster.sha256,contentSha256:raster.contentSha256};"
  webView.callAsyncJavaScript(mode ? importCode : fingerprintCode, arguments:["dataURL":dataURL,"projectJSON":String(data:try! Data(contentsOf:URL(fileURLWithPath:path)),encoding:.utf8)!], in:nil, in:.page) { result in
   switch result { case .success(let value):
    var actual=value as! [String:Any]
    if let saved=actual.removeValue(forKey:"serialized") as? String, let index=CommandLine.arguments.firstIndex(of:"--save-workspace"), index+1<CommandLine.arguments.count {try! saved.write(toFile:CommandLine.arguments[index+1],atomically:true,encoding:.utf8)}
    let expectedImages=(project["images"] as! [[String:Any]]).count
    let expectedAssets=((project["visualInquiry"] as? [String:Any])?["assets"] as? [[String:Any]])?.count ?? 0
    let imported = !mode || ((actual["images"] as? Int)==expectedImages && (actual["decodedAssets"] as? Int ?? 0)>=expectedAssets)
    let output:[String:Any] = ["status":imported ? "PASS":"FAILED", "engine":"WKWebView", "actual":actual, "mode":mode ? "import-entry" : "fingerprint"]
    let bytes=try! JSONSerialization.data(withJSONObject:output,options:[.prettyPrinted,.sortedKeys]); print(String(data:bytes,encoding:.utf8)!)
    if !imported {fflush(stdout);Darwin.exit(1)}
   case .failure(let error): print("ERROR: \(error)");fflush(stdout);Darwin.exit(1) }
   app.terminate(nil)
  }
 }
}
let probe=Probe()
let configuration=WKWebViewConfiguration()
configuration.websiteDataStore = .nonPersistent()
probe.web=WKWebView(frame:NSRect(x:0,y:0,width:1200,height:800),configuration:configuration)
probe.web.navigationDelegate=probe
probe.web.load(URLRequest(url:URL(string:"http://127.0.0.1:1422")!))
DispatchQueue.main.asyncAfter(deadline:.now()+30) { print("TIMEOUT");fflush(stdout);Darwin.exit(1) }
app.run()
