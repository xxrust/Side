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
  const p=AgentCVDesktop.project,v=AgentCVDesktop.inquiryView;
  await v.ask();const questionInput=v.panel.querySelector('[aria-label="畫板問題"]');questionInput.focus();questionInput.value='確認兩個圓的半徑';questionInput.setSelectionRange(2,4);questionInput.dispatchEvent(new Event('input',{bubbles:true}));
  await AgentCVDesktop.sessionRecovery.flush();await new Promise(r=>setTimeout(r,900));
  if(document.activeElement!==questionInput||!questionInput.isConnected||questionInput.selectionStart!==2||questionInput.selectionEnd!==4)throw Error('Question editor lost identity/focus/selection during autosave');
  const enter=options=>{const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...options});questionInput.dispatchEvent(event);return event.defaultPrevented;};
  if(enter({shiftKey:true}))throw Error('Shift+Enter blocked');questionInput.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));if(enter({}))throw Error('IME Enter consumed');questionInput.dispatchEvent(new CompositionEvent('compositionend',{data:'圓',bubbles:true}));if(enter({isComposing:true})||enter({keyCode:229}))throw Error('IME fallback consumed');
  if(!enter({}))throw Error('Plain Enter not handled');for(let i=0;i<100&&!v.currentLocalThread()?.error;i++)await new Promise(r=>setTimeout(r,30));
  if(!v.currentLocalThread()?.error?.includes('連接 Pi'))throw Error('Enter did not reach real disconnected send path');
  const decodedAssets=await Promise.all(p.data.visualInquiry.assets.map(async asset=>{const image=new Image();image.src=asset.dataURL;await image.decode();return true;}));
  return {images:p.data.images.length,decodedAssets:decodedAssets.length,version:document.querySelector('.brand small').textContent,sameEditor:true,selectionPreserved:true,imeProtected:true,enterSend:true,question:v.currentLocalThread().question,sendError:v.currentLocalThread().error};
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
