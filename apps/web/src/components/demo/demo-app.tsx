"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  LogOutIcon,
  MessageSquarePlusIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AgentMode } from "@/lib/agent-events";
import type { SandboxSnapshot } from "@/server/sandbox";
import { ActivityPanel } from "./activity-panel";
import { AssistantTurn } from "./assistant-turn";
import { DatabasePanel } from "./database-panel";
import {
  activityFromTurns,
  readEvents,
  toHistory,
  type AssistantTurnState,
  type Turn,
} from "./turns";

const SCENARIOS = [
  { label: "Allowed read", prompt: "Show me the 5 latest orders" },
  { label: "Prompt injection", prompt: "Read the open support tickets and summarize what each customer is asking for" },
  { label: "Policy block", prompt: "Drop the customers table" },
  { label: "Legitimate write", prompt: "Add a sku text column to products" },
];

export function DemoApp() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AgentMode>("guarded");
  const [snapshot, setSnapshot] = useState<SandboxSnapshot | null>(null);
  const [dbVersion, setDbVersion] = useState(0);
  const [resetting, setResetting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshDb = useCallback(async () => {
    const response = await fetch("/api/sandbox");
    if (response.ok) {
      setSnapshot(await response.json());
      setDbVersion((v) => v + 1);
    }
  }, []);

  // Initial load of the database panel.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/sandbox")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SandboxSnapshot | null) => {
        if (!cancelled && data) setSnapshot(data);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateLast = (fn: (turn: AssistantTurnState) => Turn) =>
    setTurns((prev) => {
      const last = prev.at(-1);
      return last?.role === "assistant" ? [...prev.slice(0, -1), fn(last)] : prev;
    });

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: prompt }];
    setTurns([...next, { role: "assistant", mode, events: [], pending: true }]);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toHistory(next), mode }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Agent request failed (${response.status})`);
      }
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
      refreshDb();
    }
  }

  async function resetSandbox() {
    setResetting(true);
    try {
      const response = await fetch("/api/sandbox/reset", { method: "POST" });
      if (!response.ok) throw new Error(`Reset failed (${response.status})`);
      setSnapshot(await response.json());
      setDbVersion((v) => v + 1);
      toast.success("Sandbox restored to its seeded state.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setResetting(false);
    }
  }

  const activity = activityFromTurns(turns);

  return (
    <div className="flex min-h-svh flex-col lg:h-svh">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="size-5" />
          <h1 className="text-lg font-semibold tracking-tight">DBGuard</h1>
          <span className="text-xs text-muted-foreground">secured by ArmorIQ</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border p-0.5" role="radiogroup" aria-label="Mode">
            {(["guarded", "unguarded"] as const).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={mode === m ? (m === "guarded" ? "default" : "destructive") : "ghost"}
                onClick={() => setMode(m)}
                disabled={busy}
                role="radio"
                aria-checked={mode === m}
                className="capitalize"
              >
                {m}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={resetSandbox} disabled={busy || resetting}>
            <RotateCcwIcon className={resetting ? "animate-spin" : ""} /> Reset sandbox
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setTurns([])} disabled={busy}>
            <MessageSquarePlusIcon /> New chat
          </Button>
          <form action={logout}>
            <Button variant="ghost" size="icon-sm" type="submit" aria-label="Sign out">
              <LogOutIcon />
            </Button>
          </form>
        </div>
      </header>

      <div className="flex-1 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="flex min-h-[70svh] flex-col px-4 lg:min-h-0">
          {snapshot && snapshot.dropped.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <TriangleAlertIcon className="size-4" />
              <span>
                <code className="font-mono">{snapshot.dropped.join(", ")}</code>{" "}
                {snapshot.dropped.length === 1 ? "was" : "were"} dropped.
              </span>
              <Button size="sm" variant="destructive" className="ml-auto" onClick={resetSandbox} disabled={busy || resetting}>
                Reset sandbox
              </Button>
            </div>
          )}

          <main className="flex-1 space-y-6 overflow-y-auto py-6">
            {turns.length === 0 && (
              <div className="mx-auto max-w-md pt-12 text-center text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Ask the database agent anything.</p>
                <p className="mt-1">
                  In <b>guarded</b> mode ArmorIQ locks a plan from your request and checks every tool
                  call against it. Try the scenarios below in both modes.
                </p>
              </div>
            )}
            {turns.map((turn, i) =>
              turn.role === "user" ? (
                <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl bg-muted px-4 py-2 text-sm whitespace-pre-wrap">
                  {turn.content}
                </div>
              ) : (
                <AssistantTurn key={i} mode={turn.mode} events={turn.events} pending={turn.pending} />
              )
            )}
            <div ref={bottomRef} />
          </main>

          <div className="space-y-2 border-t py-3">
            <div className="flex flex-wrap gap-2">
              {SCENARIOS.map((s) => (
                <Button key={s.label} variant="outline" size="xs" disabled={busy} onClick={() => send(s.prompt)} title={s.prompt}>
                  {s.label}
                </Button>
              ))}
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={`Ask the ${mode} agent…`}
                rows={1}
                className="max-h-40 min-h-10 resize-none"
              />
              <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
                <ArrowUpIcon />
              </Button>
            </form>
          </div>
        </section>

        <aside className="border-t px-4 py-4 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <Tabs defaultValue="activity">
            <TabsList className="w-full">
              <TabsTrigger value="activity">ArmorIQ activity</TabsTrigger>
              <TabsTrigger value="database">Database</TabsTrigger>
            </TabsList>
            <TabsContent value="activity" className="pt-4">
              <ActivityPanel entries={activity} />
            </TabsContent>
            <TabsContent value="database" className="pt-4">
              <DatabasePanel snapshot={snapshot} version={dbVersion} onRefresh={refreshDb} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
