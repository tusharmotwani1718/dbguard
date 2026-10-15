import type { AgentEvent, ChatTurn } from "@/lib/agent-events";
import { connectMcp } from "@/server/agent/mcp-client";
import { runAgent } from "@/server/agent/run-agent";

export const maxDuration = 300;

// Streams AgentEvents as newline-delimited JSON so the UI can show each tool call live.
export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages: ChatTurn[] };
  const mcpUrl = new URL(process.env.MCP_SERVER_URL ?? "/api/mcp", request.url);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      const mcp = await connectMcp(mcpUrl).catch((error: Error) => {
        send({ type: "error", message: `Couldn't reach the MCP server: ${error.message}` });
        return null;
      });
      try {
        if (mcp) for await (const event of runAgent(messages, mcp)) send(event);
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : String(error) });
      } finally {
        await mcp?.close();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
