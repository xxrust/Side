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
  const p=AgentCVDesktop.project,v=AgentCVDesktop.inquiryView,run=p.data.algorithmRuns.at(-1).runId,otsu=run+'::otsu#1',components=run+'::components#1';
  await v.programFlow.openNode(otsu);if(v.board()?.programBinding?.nodeId!==otsu)throw Error('Cannot open actual Otsu node');
  const toggle=document.querySelector('[aria-label="展開相關步驟"]');if(!toggle)throw Error('Local graph missing');toggle.click();
  const outgoing=[...document.querySelectorAll('.program-local-column.after [data-program-local-node]')].map(n=>n.dataset.programLocalNode),expected=v.programFlow.flow.edges.filter(e=>e.kind==='dependency'&&e.from===otsu).map(e=>e.to);
  if(JSON.stringify(outgoing)!==JSON.stringify(expected)||!outgoing.includes(components))throw Error('Local graph does not match actual dependencies');
  [...document.querySelectorAll('[data-program-local-node]')].find(n=>n.dataset.programLocalNode===components).click();for(let i=0;i<100&&v.board()?.programBinding?.nodeId!==components;i++)await new Promise(r=>setTimeout(r,30));if(v.board()?.programBinding?.nodeId!==components)throw Error('Local node did not switch board');
  if(!document.querySelector('[aria-label="收合相關步驟"]'))throw Error('Local graph is not collapsible');await v.ask();const inputQuestion=v.panel.querySelector('[aria-label="畫板問題"]');if(!inputQuestion||inputQuestion.closest('.intent-question-bubble').getBoundingClientRect().width>281)throw Error('Compact question not shown');
  const decoded=await Promise.all(p.data.visualInquiry.assets.map(async asset=>{const image=new Image();image.src=asset.dataURL;await image.decode();return true;}));
  return {decodedAssets:decoded.length,images:p.data.images.length,version:document.querySelector('.brand small').textContent,actualDependencies:outgoing.length,nodeSwitch:true,compactQuestion:true};
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
