import Cocoa
import WebKit
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("13-cv")
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let configuration = WKWebViewConfiguration()
configuration.userContentController.addUserScript(WKUserScript(source: "window.__errors=[];window.addEventListener('error',e=>__errors.push(e.message));window.addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));", injectionTime: .atDocumentStart, forMainFrameOnly: true))
let view = WKWebView(frame: NSRect(x:0,y:0,width:1440,height:900), configuration:configuration)
let window = NSWindow(contentRect:view.frame,styleMask:[.borderless],backing:.buffered,defer:false)
window.contentView=view
final class Delegate:NSObject,WKNavigationDelegate {
 func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!) {
  DispatchQueue.main.asyncAfter(deadline:.now()+2) {
   let script = (try? String(contentsOf:root.appendingPathComponent("qa/browser-check.js"),encoding:.utf8)) ?? "JSON.stringify({title:document.title,errors:window.__errors})"
   webView.evaluateJavaScript(script) { result,error in
    print(error.map{String(describing:$0)} ?? String(describing:result ?? "nil"))
    webView.takeSnapshot(with:nil) { image,error in
     if let image=image,let data=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:data),let png=bitmap.representation(using:.png,properties:[:]) {try? png.write(to:root.appendingPathComponent("qa/workbench-1440.png"))}
     exit(error == nil ? 0:1)
    }
   }
  }
 }
 func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error){print(error);exit(1)}
}
let delegate=Delegate();view.navigationDelegate=delegate
view.loadFileURL(root.appendingPathComponent("workbench.html"),allowingReadAccessTo:root)
DispatchQueue.main.asyncAfter(deadline:.now()+25){print("WebKit timed out");exit(2)}
app.run()
