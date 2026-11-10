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
  let mode=true
  let importCode="""
  for(let i=0;i<100;i++){if(globalThis.AgentCVDesktop)break;await new Promise(r=>setTimeout(r,50));}
  if(!globalThis.AgentCVDesktop)throw Error('Application did not initialize');
  await AgentCVDesktop.startupReady;
  if(document.querySelectorAll('.canvas-project-source').length!==1||document.querySelectorAll('.canvas-project-reference').length!==1)throw Error('New project is not an empty source/reference canvas');
  if(document.querySelector('#steps').getBoundingClientRect().height!==0)throw Error('Legacy wizard still visible');
  const split=dataURL.indexOf(','),mime=dataURL.slice(5,dataURL.indexOf(';')),bytes=Uint8Array.from(atob(dataURL.slice(split+1)),char=>char.charCodeAt(0)),transfer=new DataTransfer();transfer.items.add(new File([bytes],'actual-opencv-source.jpg',{type:mime}));
  const input=document.getElementById('browserImages');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  for(let i=0;i<150;i++){if(AgentCVDesktop.project.data.images.length)break;await new Promise(r=>setTimeout(r,50));}
  const cards=AgentCVDesktop.inquiryView.projectCards,source=cards.spaces().sources[0],image=AgentCVDesktop.project.data.images[0];
  if(!source.imageIds.includes(image?.id))throw Error('Imported real file is not bound to image source');
  await cards.addOriginal(source,image);
  const v=AgentCVDesktop.inquiryView,decoded=await Promise.all(v.board().items.map(item=>v.loadImage(v.asset(item))));
  return {images:1,decodedAssets:decoded.length,version:document.querySelector('.brand small').textContent,canvasSources:cards.spaces().sources.length,canvasReferences:cards.spaces().references.length,relations:cards.spaces().relations.length,imageBound:true,scope:'Real production frontend under WKWebView and CSP; native dialogs/model are not substituted or assessed'};
  """

  let fingerprintCode="const {decode}=await import('/src/image.js'); const raster=await decode(dataURL); return {width:raster.width,height:raster.height,sha256:raster.sha256,contentSha256:raster.contentSha256};"
  webView.callAsyncJavaScript(mode ? importCode : fingerprintCode, arguments:["dataURL":dataURL,"projectJSON":String(data:try! Data(contentsOf:URL(fileURLWithPath:path)),encoding:.utf8)!], in:nil, in:.page) { result in
   switch result { case .success(let value):
    var actual=value as! [String:Any]
    if let saved=actual.removeValue(forKey:"serialized") as? String, let index=CommandLine.arguments.firstIndex(of:"--save-workspace"), index+1<CommandLine.arguments.count {try! saved.write(toFile:CommandLine.arguments[index+1],atomically:true,encoding:.utf8)}
    let expectedImages=1
    let expectedAssets=1
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
