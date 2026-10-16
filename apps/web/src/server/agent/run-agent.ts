import { Agent, MaxTurnsExceededError, assistant, run, user } from "@openai/agents";
import type { AgentEvent, AgentMode, ChatTurn } from "@/lib/agent-events";
import { callViaArmorIQ, lockPlan } from "@/server/armoriq";
import type { McpClient } from "./mcp-client";
import { planRequest } from "./planner";
import { callViaMcp, sandboxTools, type CallTool } from "./sandbox-tools";
import { describeSchema } from "./schema";

export const MAX_TURNS = 10;

// Identical in both modes, so the only difference between guarded and unguarded
// runs is whether ArmorIQ sits in front of the tools.
const INSTRUCTIONS = `You are DBGuard's database assistant. You operate on a Postgres database through tools.
Use the tools to answer the user's request; don't guess data you haven't read.
Keep final answers short and readable. Use markdown tables for tabular results.`;

// Minimal async queue: work running in the background pushes events, and the
// generator below drains them to the HTTP stream as they arrive.
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

function errorMessage(error: unknown) {
  if (error instanceof MaxTurnsExceededError) return `Stopped after ${MAX_TURNS} turns.`;
  return error instanceof Error ? error.message : String(error);
}

export async function* runAgent(
  history: ChatTurn[],
  mcp: McpClient,
  mode: AgentMode
): AsyncGenerator<AgentEvent> {
  const queue = eventQueue();
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const work = (async () => {
    const { tools: mcpTools } = await mcp.listTools();
    const schema = await describeSchema(mcp);
    let callTool: CallTool = callViaMcp(mcp);
    let agentTools = mcpTools;

    if (mode === "guarded") {
      // Phase 1: plan from the user's words alone, then sign the plan with ArmorIQ
      // before the agent reads any data.
      const userMessages = history.filter((t) => t.role === "user").map((t) => t.content);
      const plan = await planRequest({
        model,
        userMessages,
        schema,
        tools: mcpTools.map((t) => ({ name: t.name, description: t.description ?? "" })),
      });
      if (plan.steps.length === 0) {
        agentTools = [];
        queue.push({ type: "plan_locked", ...plan });
      } else {
        const token = await lockPlan(model, userMessages.at(-1)!, plan.goal, plan.steps);
        callTool = callViaArmorIQ(token);
        queue.push({
          type: "plan_locked",
          ...plan,
          token: { id: token.tokenId, planHash: token.planHash, expiresAt: token.expiresAt },
        });
      }
    }

    // Phase 2 (or the whole run, unguarded): the agent sees every tool either way;
    // in guarded mode each call it makes is checked by ArmorIQ.
    const agent = new Agent({
      name: "DBGuard database assistant",
      model,
      instructions: `${INSTRUCTIONS}\n\nDatabase schema:\n${schema}`,
      tools: sandboxTools(agentTools, callTool, queue.push),
    });
    const input = history.map((turn) =>
      turn.role === "user" ? user(turn.content) : assistant(turn.content)
    );
    const result = await run(agent, input, { maxTurns: MAX_TURNS });
    queue.push({ type: "answer", content: String(result.finalOutput ?? "") });
  })()
    .catch((error: unknown) => queue.push({ type: "error", message: errorMessage(error) }))
    .finally(queue.close);

  yield* queue.drain();
  await work;
}
