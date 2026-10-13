import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  COLUMN_TYPES,
  FILTER_OPS,
  MAX_READ_LIMIT,
  SandboxError,
  addColumn,
  createTable,
  deleteRows,
  describeTable,
  dropColumn,
  dropTable,
  insertRows,
  listTables,
  readRows,
  updateRows,
} from "@/server/sandbox-ops";

const table = z.string().describe("Table name in the sandbox schema, e.g. \"orders\".");
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const row = z.record(z.string(), scalar);
const column = z.object({
  name: z.string().describe("Lowercase column name."),
  type: z.enum(COLUMN_TYPES),
  nullable: z.boolean().optional().describe("Defaults to true."),
});
const filters = z
  .array(
    z.object({
      column: z.string(),
      op: z.enum(FILTER_OPS),
      value: z
        .union([scalar, z.array(scalar)])
        .optional()
        .describe("Array for \"in\"; omit for \"is_null\" / \"not_null\"."),
    })
  )
  .describe("Conditions combined with AND.");

async function run(fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    // Sandbox validation errors and Postgres errors (e.g. constraint violations)
    // go back to the agent as tool errors it can reason about.
    const message =
      error instanceof SandboxError || error instanceof Error
        ? error.message
        : String(error);
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }
}

const readOnly = { readOnlyHint: true, destructiveHint: false } as const;
const write = { readOnlyHint: false, destructiveHint: false } as const;
const destructive = { readOnlyHint: false, destructiveHint: true } as const;

export function registerSandboxTools(server: McpServer) {
  // ---------- table-level ----------

  server.registerTool(
    "list_tables",
    {
      title: "List tables",
      description: "List all tables in the sandbox database with their row counts.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    () => run(listTables)
  );

  server.registerTool(
    "describe_table",
    {
      title: "Describe table",
      description: "Show a table's columns, types, primary key and foreign keys.",
      inputSchema: z.object({ table }),
      annotations: readOnly,
    },
    ({ table }) => run(() => describeTable(table))
  );

  server.registerTool(
    "create_table",
    {
      title: "Create table",
      description:
        "Create a new table. An auto-increment \"id\" primary key is added automatically.",
      inputSchema: z.object({ table, columns: z.array(column).min(1) }),
      annotations: write,
    },
    ({ table, columns }) => run(() => createTable(table, columns))
  );

  server.registerTool(
    "drop_table",
    {
      title: "Drop table",
      description: "Permanently delete a table and all of its data.",
      inputSchema: z.object({ table }),
      annotations: destructive,
    },
    ({ table }) => run(() => dropTable(table))
  );

  server.registerTool(
    "add_column",
    {
      title: "Add column",
      description: "Add a column to an existing table.",
      inputSchema: z.object({ table, column }),
      annotations: write,
    },
    ({ table, column }) => run(() => addColumn(table, column))
  );

  server.registerTool(
    "drop_column",
    {
      title: "Drop column",
      description: "Permanently remove a column and its data from a table.",
      inputSchema: z.object({ table, column: z.string() }),
      annotations: destructive,
    },
    ({ table, column }) => run(() => dropColumn(table, column))
  );

  // ---------- row-level ----------

  server.registerTool(
    "read_rows",
    {
      title: "Read rows",
      description: `Read rows from a table, optionally filtered and sorted. Returns at most ${MAX_READ_LIMIT} rows.`,
      inputSchema: z.object({
        table,
        columns: z.array(z.string()).optional().describe("Columns to return; all if omitted."),
        filters: filters.optional(),
        order_by: z
          .object({ column: z.string(), direction: z.enum(["asc", "desc"]).optional() })
          .optional(),
        limit: z.number().int().min(1).max(MAX_READ_LIMIT).optional().describe("Defaults to 50."),
      }),
      annotations: readOnly,
    },
    ({ table, columns, filters, order_by, limit }) =>
      run(() => readRows({ table, columns, filters, orderBy: order_by, limit }))
  );

  server.registerTool(
    "insert_rows",
    {
      title: "Insert rows",
      description:
        "Insert one or more rows. All rows must have the same columns; don't pass \"id\".",
      inputSchema: z.object({ table, rows: z.array(row).min(1) }),
      annotations: write,
    },
    ({ table, rows }) => run(() => insertRows(table, rows))
  );

  server.registerTool(
    "update_rows",
    {
      title: "Update rows",
      description: "Update rows matching the filters. At least one filter is required.",
      inputSchema: z.object({ table, values: row, filters: filters.min(1) }),
      annotations: write,
    },
    ({ table, values, filters }) => run(() => updateRows(table, values, filters))
  );

  server.registerTool(
    "delete_rows",
    {
      title: "Delete rows",
      description: "Delete rows matching the filters. At least one filter is required.",
      inputSchema: z.object({ table, filters: filters.min(1) }),
      annotations: destructive,
    },
    ({ table, filters }) => run(() => deleteRows(table, filters))
  );
}
