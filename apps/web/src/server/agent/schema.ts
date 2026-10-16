import type { McpClient } from "./mcp-client";
import { mcpResultText } from "./sandbox-tools";

type TableDescription = {
  table: string;
  columns: { name: string; type: string; primary_key: boolean }[];
  foreignKeys: { column: string; references_table: string; references_column: string }[];
};

async function callJson<T>(mcp: McpClient, name: string, args: Record<string, unknown>) {
  return JSON.parse(mcpResultText(await mcp.callTool({ name, arguments: args }))) as T;
}

// Fetched by our own code, not by the agent: table and column names only, never
// row data. The planner sees this, so attacker-controlled rows can't reach it.
export async function describeSchema(mcp: McpClient) {
  const tables = await callJson<{ table: string }[]>(mcp, "list_tables", {});
  const lines = [];
  for (const { table } of tables) {
    const { columns, foreignKeys } = await callJson<TableDescription>(mcp, "describe_table", { table });
    const cols = columns.map((c) => `${c.name} ${c.type}${c.primary_key ? " pk" : ""}`);
    const fks = foreignKeys.map((f) => `${f.column} → ${f.references_table}.${f.references_column}`);
    lines.push(`- ${table}(${cols.join(", ")})${fks.length ? `; foreign keys: ${fks.join(", ")}` : ""}`);
  }
  return lines.join("\n");
}
