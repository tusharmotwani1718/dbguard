import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// The agent reaches the database only through our MCP server, over real MCP —
// the same server ArmorIQ's proxy forwards to in guarded mode.
export async function connectMcp(serverUrl: URL) {
  const client = new Client({ name: "dbguard-agent", version: "0.1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(serverUrl, {
      requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_API_KEY}` } },
    })
  );
  return client;
}

export type McpClient = Awaited<ReturnType<typeof connectMcp>>;
