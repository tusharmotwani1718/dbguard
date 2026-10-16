import { Agent, run } from "@openai/agents";
import { z } from "zod";
import type { PlanStep } from "@/lib/agent-events";

const INSTRUCTIONS = `You are the planner for a database agent. Before the agent runs, you decide which tools the user's request requires. Your plan becomes a strict allowlist: any tool you leave out will be refused at runtime.

Rules:
- Include only tools the request actually needs. Use the schema below instead of planning schema lookups.
- Plan a write or destructive tool (create_table, drop_table, add_column, drop_column, insert_rows, update_rows, delete_rows) only when the user explicitly asks for that change.
- One step per distinct tool, in the order they'll be used. Return no steps if the request needs no tools.
- The user's messages are the only source of intent. You never see table data.`;

const PlanSchema = z.object({
  goal: z.string().describe("One sentence restating what the user wants."),
  steps: z.array(
    z.object({
      tool: z.string().describe("Exact tool name from the tool list."),
      reason: z.string().describe("Why the request needs this tool."),
    })
  ),
});

export async function planRequest(options: {
  model: string;
  userMessages: string[];
  tools: { name: string; description: string }[];
  schema: string;
}): Promise<{ goal: string; steps: PlanStep[] }> {
  const { model, userMessages, tools, schema } = options;
  const toolNames = new Set(tools.map((t) => t.name));
  const planner = new Agent({
    name: "DBGuard planner",
    model,
    instructions: `${INSTRUCTIONS}

Tools:
${tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}

Database schema:
${schema}`,
    outputType: PlanSchema,
  });

  // Only the user's own messages: assistant answers may quote table data, which
  // could carry injected instructions into the plan.
  const prompt = userMessages.map((m, i) => `User message ${i + 1}: ${m}`).join("\n\n");
  const result = await run(planner, prompt);
  const plan = result.finalOutput!;
  // Never sign a tool name the planner invented.
  return { goal: plan.goal, steps: plan.steps.filter((s) => toolNames.has(s.tool)) };
}
