import type { AgentEvent, AgentMode, ChatTurn } from "@/lib/agent-events";

export type AssistantTurnState = {
  role: "assistant";
  mode: AgentMode;
  events: AgentEvent[];
  pending: boolean;
};
export type Turn = { role: "user"; content: string } | AssistantTurnState;

// Only user prompts and final answers go back to the model; tool traffic stays per-turn.
export function toHistory(turns: Turn[]): ChatTurn[] {
  return turns.flatMap((turn): ChatTurn[] => {
    if (turn.role === "user") return [turn];
    const answer = turn.events.findLast((e) => e.type === "answer");
    return answer ? [{ role: "assistant", content: answer.content }] : [];
  });
}

export async function* readEvents(response: Response): AsyncGenerator<AgentEvent> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as AgentEvent;
  }
}

export type ActivityEntry = {
  id: string;
  mode: AgentMode;
  tool: string;
  args: Record<string, unknown>;
  status: "running" | "allowed" | "blocked" | "unguarded" | "error";
  reason?: string;
};

// Flattens every tool call in the session into one list, newest first.
export function activityFromTurns(turns: Turn[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const turn of turns) {
    if (turn.role !== "assistant") continue;
    for (const event of turn.events) {
      if (event.type !== "tool_call") continue;
      const result = turn.events.find((e) => e.type === "tool_result" && e.id === event.id);
      const blocked = turn.events.find((e) => e.type === "tool_blocked" && e.id === event.id);
      let status: ActivityEntry["status"] = "running";
      let reason: string | undefined;
      if (blocked?.type === "tool_blocked") {
        status = "blocked";
        reason = blocked.reason;
      } else if (result?.type === "tool_result") {
        status = !result.ok ? "error" : turn.mode === "guarded" ? "allowed" : "unguarded";
      }
      entries.push({ id: event.id, mode: turn.mode, tool: event.name, args: event.args, status, reason });
    }
  }
  return entries.reverse();
}
