"use client";

import { useEffect, useState } from "react";
import { RefreshCwIcon, TableIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SandboxSnapshot } from "@/server/sandbox";

type Preview = { table: string; rows: Record<string, unknown>[] } | { table: string; error: string };

function cell(value: unknown) {
  if (value === null || value === undefined) return "—";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export function DatabasePanel({
  snapshot,
  version,
  onRefresh,
}: {
  snapshot: SandboxSnapshot | null;
  version: number;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  // Reload the open table whenever the snapshot changes (after a run or a reset).
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    fetch(`/api/sandbox/rows?table=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPreview(data.error ? { table: selected, error: data.error } : data);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, version]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Live view of the sandbox schema</p>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCwIcon /> Refresh
        </Button>
      </div>

      <ul className="space-y-1">
        {snapshot?.tables.map(({ table, rows }) => (
          <li key={table}>
            <button
              onClick={() => setSelected(table === selected ? null : table)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${
                table === selected ? "bg-muted" : ""
              }`}
            >
              <TableIcon className="size-4 text-muted-foreground" />
              <code className="font-mono">{table}</code>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{rows} rows</span>
            </button>
          </li>
        ))}
        {snapshot?.dropped.map((table) => (
          <li key={table} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm">
            <TableIcon className="size-4 text-destructive" />
            <code className="font-mono text-destructive line-through">{table}</code>
            <Badge variant="destructive" className="ml-auto">dropped</Badge>
          </li>
        ))}
        {!snapshot && <li className="px-3 py-2 text-sm text-muted-foreground">Loading…</li>}
      </ul>

      {selected && preview?.table === selected && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            First 20 rows of <code className="font-mono">{selected}</code>
          </p>
          {"error" in preview ? (
            <p className="text-sm text-destructive">{preview.error}</p>
          ) : preview.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rows.</p>
          ) : (
            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {Object.keys(preview.rows[0]).map((col) => (
                      <th key={col} className="px-2 py-1 text-left font-medium whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-t">
                      {Object.values(row).map((value, j) => (
                        <td key={j} className="px-2 py-1 whitespace-nowrap">{cell(value)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
