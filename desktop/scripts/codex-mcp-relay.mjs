import {JsonRpcPeer} from './json-rpc-peer.mjs';

// Session-scoped capability. The bridge validates the token and tool allowlist.
const endpoint = process.env.AGENTCV_MCP_ENDPOINT;
const token = process.env.AGENTCV_MCP_TOKEN;
new JsonRpcPeer(process.stdin, process.stdout, {
  async request(method, params) {
    const response = await fetch(endpoint, {
      method:'POST', headers:{authorization:`Bearer ${token}`, 'content-type':'application/json'},
      body:JSON.stringify({method, params}), signal:AbortSignal.timeout(120000),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || `MCP relay HTTP ${response.status}`);
    return result;
  },
});
