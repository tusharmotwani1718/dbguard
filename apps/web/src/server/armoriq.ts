import { ArmorIQClient, type IntentToken } from "@armoriq/sdk";
import type { BlockKind, PlanStep } from "@/lib/agent-events";
import { mcpResultText, type CallTool } from "./agent/sandbox-tools";

// Must match the MCP server's name on the ArmorIQ dashboard exactly.
const MCP = process.env.ARMORIQ_MCP_NAME ?? "dbguard-mcp";
const TOKEN_VALIDITY_SECONDS = 600;

let client: ArmorIQClient | undefined;

function armoriq() {
  client ??= new ArmorIQClient({
    apiKey: process.env.ARMORIQ_API_KEY,
    agentId: "dbguard-agent",
    mcpCredentials: { [MCP]: { authType: "bearer", token: process.env.MCP_API_KEY! } },
  });
  return client;
}

// Signs the plan with ArmorIQ. From here on, only these tools can be invoked.
export async function lockPlan(model: string, prompt: string, goal: string, steps: PlanStep[]) {
  const captured = armoriq().capturePlan(model, prompt, {
    goal,
    steps: steps.map((step) => ({ action: step.tool, mcp: MCP, params: {} })),
  });
  return armoriq().getIntentToken(captured, undefined, TOKEN_VALIDITY_SECONDS);
}

const BLOCK_KINDS: Record<string, BlockKind> = {
  IntentMismatchException: "intent",
  PolicyBlockedException: "policy",
  PolicyHoldException: "hold",
};

type ArmorIQError = Error & { response?: { data?: { message?: string; reason?: string } } };

// Every tool call goes through ArmorIQ: the plan check in the SDK, then the proxy's
// own plan + policy enforcement, then our MCP server.
export function callViaArmorIQ(token: IntentToken): CallTool {
  return async (name, args) => {
    try {
      const invocation = await armoriq().invoke(MCP, name, token, args);
      const result = invocation.result as { content?: unknown };
      const output = result.content ? mcpResultText(result) : JSON.stringify(result);
      return { ok: invocation.status === "success", output };
    } catch (error) {
      const e = error as ArmorIQError;
      const kind = BLOCK_KINDS[e.name];
      if (!kind) return { ok: false, output: `Tool call failed: ${e.message}` };
      const reason =
        kind === "intent"
          ? `"${name}" is not in the approved plan for this request.`
          : (e.response?.data?.message ?? e.message);
      return {
        ok: false,
        output: `Blocked by ArmorIQ: ${reason} Do not retry this action; tell the user it was blocked.`,
        blocked: { kind, reason },
      };
    }
  };
}
