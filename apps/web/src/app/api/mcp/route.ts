import { timingSafeEqual } from "node:crypto";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerSandboxTools } from "@/server/mcp/tools";

const handler = createMcpHandler(registerSandboxTools, {
  serverInfo: { name: "dbguard-sandbox", version: "0.1.0" },
});

function isValidKey(token: string) {
  const expected = Buffer.from(process.env.MCP_API_KEY ?? "");
  const actual = Buffer.from(token);
  return expected.length > 0 && actual.length === expected.length && timingSafeEqual(actual, expected);
}

const authHandler = withMcpAuth(
  handler,
  (_req, token) =>
    token && isValidKey(token) ? { token, clientId: "dbguard", scopes: [] } : undefined,
  { required: true }
);

// MCP SDK v2 rejects JSON-RPC messages that carry any extra top-level member, but
// ArmorIQ's proxy forwards requests with its own additions. Strip anything outside
// the JSON-RPC envelope (and log it) so proxied calls reach the tools.
const JSONRPC_MEMBERS = new Set(["jsonrpc", "id", "method", "params", "result", "error"]);

function stripNonJsonRpc(message: unknown) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return message;
  const entries = Object.entries(message);
  const extra = entries.filter(([key]) => !JSONRPC_MEMBERS.has(key)).map(([key]) => key);
  if (extra.length === 0) return message;
  console.warn(`[mcp] stripped non-JSON-RPC members: ${extra.join(", ")}`);
  return Object.fromEntries(entries.filter(([key]) => JSONRPC_MEMBERS.has(key)));
}

async function normalizedRequest(request: Request, text: string) {
  if (process.env.MCP_DEBUG) {
    console.log("[mcp] incoming", request.headers.get("user-agent"), text.slice(0, 4000));
  }
  let body: string = text;
  try {
    const parsed: unknown = JSON.parse(text);
    body = JSON.stringify(
      Array.isArray(parsed) ? parsed.map(stripNonJsonRpc) : stripNonJsonRpc(parsed)
    );
  } catch {
    // Not JSON: pass through and let the MCP handler reject it.
  }
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request.url, { method: "POST", headers, body });
}

async function POST(request: Request) {
  const text = await request.text();
  const response = await authHandler(await normalizedRequest(request, text));
  // Always log rejected requests in full (except auth failures, which carry no useful
  // body) — this is how we debug what the ArmorIQ proxy actually forwards.
  if (response.status >= 400 && response.status !== 401) {
    const headers = Object.fromEntries(
      [...request.headers].filter(([key]) => key !== "authorization" && !key.startsWith("x-vercel"))
    );
    console.error(
      `[mcp] ${response.status} for request`,
      JSON.stringify({ headers, body: text.slice(0, 4000) }),
      "\n[mcp] response:",
      (await response.clone().text()).slice(0, 1000)
    );
  }
  return response;
}

export { authHandler as GET, POST, authHandler as DELETE };
