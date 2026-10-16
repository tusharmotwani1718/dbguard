"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRightIcon, LoaderCircleIcon, LockIcon, ShieldOffIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AgentEvent, AgentMode, BlockKind } from "@/lib/agent-events";

type ToolCall = Extract<AgentEvent, { type: "tool_call" }>;
type ToolResult = Extract<AgentEvent, { type: "tool_result" }>;
type ToolBlocked = Extract<AgentEvent, { type: "tool_blocked" }>;
type PlanLocked = Extract<AgentEvent, { type: "plan_locked" }>;

const BLOCK_LABELS: Record<BlockKind, string> = {
  intent: "blocked · not in plan",
  policy: "blocked · policy",
  hold: "held · needs approval",
};

function PlanCard({ plan }: { plan: PlanLocked }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <LockIcon className="size-4" />
        Plan locked by ArmorIQ
        {plan.token && (
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            token {plan.token.id.slice(0, 8)}
          </span>
        )}
      </div>
      <p className="mt-1 text-muted-foreground">{plan.goal}</p>
      {plan.steps.length > 0 ? (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5">
          {plan.steps.map((step, i) => (
            <li key={i}>
              <code className="font-mono">{step.tool}</code>
              <span className="text-muted-foreground"> — {step.reason}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-muted-foreground">No tools needed; the agent runs without database access.</p>
      )}
    </div>
  );
}

function ToolCard({
  call,
  result,
  blocked,
}: {
  call: ToolCall;
  result?: ToolResult;
  blocked?: ToolBlocked;
}) {
  const status = blocked
    ? BLOCK_LABELS[blocked.kind]
    : !result
      ? "running"
      : result.ok
        ? "ok"
        : "error";
  const danger = blocked || (result && !result.ok);
  return (
    <Collapsible
      className={`rounded-lg border text-sm ${blocked ? "border-destructive/50 bg-destructive/5" : ""}`}
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-left">
        <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
        <code className="font-mono font-medium">{call.name}</code>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {JSON.stringify(call.args)}
        </span>
        <Badge variant={danger ? "destructive" : "secondary"} className="ml-auto shrink-0">
          {status === "running" && <LoaderCircleIcon className="animate-spin" />}
          {status}
        </Badge>
      </CollapsibleTrigger>
      {blocked && <p className="px-3 pb-2 text-xs text-destructive">ArmorIQ: {blocked.reason}</p>}
      <CollapsibleContent className="space-y-2 border-t px-3 py-2">
        <Section label="Input" text={JSON.stringify(call.args, null, 2)} />
        {result && <Section label="Output" text={result.output} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-xs">{text}</pre>
    </div>
  );
}

export function AssistantTurn({
  mode,
  events,
  pending,
}: {
  mode: AgentMode;
  events: AgentEvent[];
  pending: boolean;
}) {
  const results = new Map(
    events.filter((e): e is ToolResult => e.type === "tool_result").map((e) => [e.id, e])
  );
  const blocks = new Map(
    events.filter((e): e is ToolBlocked => e.type === "tool_blocked").map((e) => [e.id, e])
  );

  return (
    <div className="space-y-2">
      {mode === "unguarded" && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <ShieldOffIcon className="size-3.5" /> Unguarded: tools run without ArmorIQ
        </p>
      )}
      {events.map((event, i) => {
        switch (event.type) {
          case "thought":
            return <p key={i} className="text-sm text-muted-foreground">{event.content}</p>;
          case "plan_locked":
            return <PlanCard key={i} plan={event} />;
          case "tool_call":
            return (
              <ToolCard
                key={event.id}
                call={event}
                result={results.get(event.id)}
                blocked={blocks.get(event.id)}
              />
            );
          case "answer":
            return (
              <div key={i} className="markdown text-sm">
                <Markdown remarkPlugins={[remarkGfm]}>{event.content}</Markdown>
              </div>
            );
          case "error":
            return (
              <p key={i} className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {event.message}
              </p>
            );
          default:
            return null;
        }
      })}
      {pending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-4 animate-spin" />
          {mode === "guarded" && !events.some((e) => e.type === "plan_locked")
            ? "Planning and locking intent with ArmorIQ…"
            : "Working…"}
        </p>
      )}
    </div>
  );
}
