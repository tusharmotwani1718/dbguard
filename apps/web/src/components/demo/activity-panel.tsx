"use client";

import { CheckIcon, LoaderCircleIcon, ShieldAlertIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import type { ActivityEntry } from "./turns";

const STATUS = {
  allowed: { icon: CheckIcon, label: "Allowed by ArmorIQ", className: "text-emerald-600 dark:text-emerald-400" },
  blocked: { icon: ShieldAlertIcon, label: "Blocked by ArmorIQ", className: "text-destructive" },
  unguarded: { icon: TriangleAlertIcon, label: "Ran unchecked (unguarded)", className: "text-amber-600 dark:text-amber-400" },
  error: { icon: XIcon, label: "Tool error", className: "text-muted-foreground" },
  running: { icon: LoaderCircleIcon, label: "Running", className: "text-muted-foreground" },
} as const;

function argsSummary(args: Record<string, unknown>) {
  const table = typeof args.table === "string" ? args.table : undefined;
  return table ? `table: ${table}` : JSON.stringify(args);
}

export function ActivityPanel({ entries }: { entries: ActivityEntry[] }) {
  const count = (status: ActivityEntry["status"]) => entries.filter((e) => e.status === status).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Allowed" value={count("allowed")} className={STATUS.allowed.className} />
        <Stat label="Blocked" value={count("blocked")} className={STATUS.blocked.className} />
        <Stat label="Unchecked" value={count("unguarded")} className={STATUS.unguarded.className} />
      </div>

      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Every tool call the agent makes shows up here.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const { icon: Icon, label, className } = STATUS[entry.status];
            return (
              <li key={entry.id} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Icon
                    className={`size-4 shrink-0 ${className} ${entry.status === "running" ? "animate-spin" : ""}`}
                    aria-label={label}
                  />
                  <code className="font-mono font-medium">{entry.tool}</code>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {argsSummary(entry.args)}
                  </span>
                </div>
                <p className={`mt-1 text-xs ${className}`}>
                  {label}
                  {entry.reason && <span className="text-muted-foreground"> · {entry.reason}</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-lg border py-2">
      <div className={`text-2xl font-semibold tabular-nums ${className}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
