"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRightIcon, LoaderCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AgentEvent } from "@/lib/agent-events";

type ToolCall = Extract<AgentEvent, { type: "tool_call" }>;
type ToolResult = Extract<AgentEvent, { type: "tool_result" }>;

function ToolCard({ call, result }: { call: ToolCall; result?: ToolResult }) {
  const status = !result ? "running" : result.ok ? "ok" : "error";
  return (
    <Collapsible className="rounded-lg border text-sm">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-left">
        <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
        <code className="font-mono font-medium">{call.name}</code>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {JSON.stringify(call.args)}
        </span>
        <Badge
          variant={status === "error" ? "destructive" : "secondary"}
          className="ml-auto shrink-0"
        >
          {status === "running" && <LoaderCircleIcon className="animate-spin" />}
          {status}
        </Badge>
      </CollapsibleTrigger>
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

export function AssistantTurn({ events, pending }: { events: AgentEvent[]; pending: boolean }) {
  const results = new Map(
    events.filter((e): e is ToolResult => e.type === "tool_result").map((e) => [e.id, e])
  );

  return (
    <div className="space-y-2">
      {events.map((event, i) => {
        switch (event.type) {
          case "thought":
            return <p key={i} className="text-sm text-muted-foreground">{event.content}</p>;
          case "tool_call":
            return <ToolCard key={event.id} call={event} result={results.get(event.id)} />;
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
          <LoaderCircleIcon className="size-4 animate-spin" /> Working…
        </p>
      )}
    </div>
  );
}
