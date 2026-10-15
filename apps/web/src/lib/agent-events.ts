// Shared between the /api/agent route (which streams these as NDJSON) and the chat UI.

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AgentEvent =
  | { type: "thought"; content: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; ok: boolean; output: string }
  | { type: "answer"; content: string }
  | { type: "error"; message: string };
