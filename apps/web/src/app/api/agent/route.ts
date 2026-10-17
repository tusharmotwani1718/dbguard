import type { AgentEvent, AgentMode, ChatTurn } from "@/lib/agent-events";
import { connectMcp } from "@/server/agent/mcp-client";
import { runAgent } from "@/server/agent/run-agent";
import { clientKey, rateLimit } from "@/server/rate-limit";

export const maxDuration = 300;

const RUNS_PER_MINUTE = 6;

// Streams AgentEvents as newline-delimited JSON so the UI can show each tool call live.
export async function POST(request: Request) {
  const limit = rateLimit(`agent:${clientKey(request)}`, RUNS_PER_MINUTE, 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: `Rate limit reached: try again in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { messages, mode = "guarded" } = (await request.json()) as {
    messages: ChatTurn[];
    mode?: AgentMode;
  };
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
        if (mcp) for await (const event of runAgent(messages, mcp, mode)) send(event);
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
