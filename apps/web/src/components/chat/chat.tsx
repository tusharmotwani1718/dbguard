"use client";

import { useRef, useState } from "react";
import { ArrowUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentEvent, ChatTurn } from "@/lib/agent-events";
import { AssistantTurn } from "./assistant-turn";

type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; events: AgentEvent[]; pending: boolean };

// Only user prompts and final answers go back to the model; tool traffic stays per-turn.
function toHistory(turns: Turn[]): ChatTurn[] {
  return turns.flatMap((turn): ChatTurn[] => {
    if (turn.role === "user") return [turn];
    const answer = turn.events.findLast((e) => e.type === "answer");
    return answer ? [{ role: "assistant", content: answer.content }] : [];
  });
}

async function* readEvents(response: Response): AsyncGenerator<AgentEvent> {
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

export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const updateLast = (fn: (turn: Extract<Turn, { role: "assistant" }>) => Turn) =>
    setTurns((prev) => {
      const last = prev.at(-1);
      return last?.role === "assistant" ? [...prev.slice(0, -1), fn(last)] : prev;
    });

  async function send() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: prompt }];
    setTurns([...next, { role: "assistant", events: [], pending: true }]);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toHistory(next) }),
      });
      if (!response.ok) throw new Error(`Agent request failed (${response.status})`);
      for await (const event of readEvents(response)) {
        updateLast((t) => ({ ...t, events: [...t.events, event] }));
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateLast((t) => ({ ...t, events: [...t.events, { type: "error", message }] }));
    } finally {
      updateLast((t) => ({ ...t, pending: false }));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-svh w-full max-w-3xl flex-col px-4">
      <header className="flex items-center gap-3 border-b py-4">
        <h1 className="text-lg font-semibold tracking-tight">DBGuard</h1>
        <Badge variant="outline">Unguarded</Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          Tools run directly, without ArmorIQ
        </span>
      </header>

      <main className="flex-1 space-y-6 overflow-y-auto py-6">
        {turns.length === 0 && (
          <p className="pt-16 text-center text-sm text-muted-foreground">
            Ask about the sandbox database, e.g. &ldquo;Show me the 5 latest orders&rdquo;.
          </p>
        )}
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl bg-muted px-4 py-2 text-sm whitespace-pre-wrap">
              {turn.content}
            </div>
          ) : (
            <AssistantTurn key={i} events={turn.events} pending={turn.pending} />
          )
        )}
        <div ref={bottomRef} />
      </main>

      <form
        className="flex items-end gap-2 border-t py-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask the database agent…"
          rows={1}
          className="max-h-40 min-h-10 resize-none"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
          <ArrowUpIcon />
        </Button>
      </form>
    </div>
  );
}
