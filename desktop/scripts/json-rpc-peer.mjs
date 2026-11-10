import {createInterface} from 'node:readline';

/** Bidirectional newline-delimited JSON-RPC used by ACP and MCP stdio. */
export class JsonRpcPeer {
  constructor(input, output, {request, notification, closed} = {}) {
    this.output = output;
    this.pending = new Map();
    this.sequence = 0;
    this.reader = createInterface({input, crlfDelay: Infinity});
    this.reader.on('line', line => {
      this.receive(line, request, notification).catch(error => this.close(error));
    });
    this.reader.once('close', () => { this.close(new Error('RPC connection closed')); closed?.(); });
    output.on('error', error => this.close(error));
  }
  send(value) { this.output.write(JSON.stringify({jsonrpc:'2.0', ...value})+'\n'); }
  call(method, params, timeoutMs = 120000) {
    if (this.closedError) return Promise.reject(this.closedError);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`RPC timeout: ${method}`)); }, timeoutMs);
      this.pending.set(id, {resolve, reject, timer});
      try { this.send({id, method, params}); }
      catch(error) {clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }
  notify(method, params) { this.send({method, params}); }
  async receive(line, request, notification) {
    if (!line.trim()) return;
    const message = JSON.parse(line);
    if (!message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(Object.assign(new Error(message.error.message), message.error));
      else pending.resolve(message.result);
      return;
    }
    if (message.id === undefined) { await notification?.(message.method, message.params); return; }
    try {
      if (!request) throw Object.assign(new Error(`Unsupported RPC request: ${message.method}`), {code:-32601});
      this.send({id:message.id, result:await request(message.method, message.params)});
    } catch (error) {
      this.send({id:message.id, error:{code:error.code || -32603, message:error.message}});
    }
  }
  close(error = new Error('RPC closed')) {
    this.closedError = error;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
}
