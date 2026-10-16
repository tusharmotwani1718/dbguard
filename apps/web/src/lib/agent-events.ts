// Shared between the /api/agent route (which streams these as NDJSON) and the chat UI.

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AgentMode = "guarded" | "unguarded";

export type PlanStep = { tool: string; reason: string };

// intent: the tool isn't in the locked plan. policy: a dashboard policy denied it.
// hold: a policy requires human approval.
export type BlockKind = "intent" | "policy" | "hold";

export type AgentEvent =
  | { type: "thought"; content: string }
  // token is absent when the plan has no steps: nothing to sign, and the agent gets no tools.
  | { type: "plan_locked"; goal: string; steps: PlanStep[]; token?: { id: string; planHash: string; expiresAt: number } }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; ok: boolean; output: string }
  | { type: "tool_blocked"; id: string; kind: BlockKind; reason: string }
  | { type: "answer"; content: string }
  | { type: "error"; message: string };
