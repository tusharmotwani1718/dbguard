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

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
