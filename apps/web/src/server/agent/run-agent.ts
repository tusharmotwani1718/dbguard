import { Agent, MaxTurnsExceededError, assistant, run, user } from "@openai/agents";
import type { AgentEvent, ChatTurn } from "@/lib/agent-events";
import type { McpClient } from "./mcp-client";
import { callViaMcp, sandboxTools } from "./sandbox-tools";

export const MAX_TURNS = 10;

const INSTRUCTIONS = `You are DBGuard's database assistant. You operate on a Postgres database through tools.
Use the tools to answer the user's request; don't guess data you haven't read.
If you're unsure of a table's columns, call describe_table first.
Keep final answers short and readable. Use markdown tables for tabular results.`;

// Minimal async queue: tool handlers push events while the run is in flight,
// and the generator below drains them to the HTTP stream as they arrive.
function eventQueue() {
  const items: AgentEvent[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  return {
    push(event: AgentEvent) {
      items.push(event);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async *drain() {
      while (true) {
        while (items.length) yield items.shift()!;
        if (closed) return;
        await new Promise<void>((resolve) => (wake = resolve));
      }
    },
  };
}

// Unguarded agent: the model picks tools and every call goes straight to the MCP server.
export async function* runAgent(history: ChatTurn[], mcp: McpClient): AsyncGenerator<AgentEvent> {
  const queue = eventQueue();
  const agent = new Agent({
    name: "DBGuard database assistant",
    instructions: INSTRUCTIONS,
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    tools: await sandboxTools(mcp, callViaMcp(mcp), queue.push),
  });
  const input = history.map((turn) =>
    turn.role === "user" ? user(turn.content) : assistant(turn.content)
  );

  const finished = run(agent, input, { maxTurns: MAX_TURNS })
    .then((result) => queue.push({ type: "answer", content: String(result.finalOutput ?? "") }))
    .catch((error: unknown) =>
      queue.push({
        type: "error",
        message:
          error instanceof MaxTurnsExceededError
            ? `Stopped after ${MAX_TURNS} turns.`
            : error instanceof Error
              ? error.message
              : String(error),
      })
    )
    .finally(queue.close);

  yield* queue.drain();
  await finished;
}
