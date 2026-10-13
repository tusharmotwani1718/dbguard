import type { Fragment } from "postgres";
import { sql } from "./db";

// Every operation is scoped to the `sandbox` schema. The `dbguard_agent` role can't
// reach anything else anyway; these checks just give the agent clear errors.

export class SandboxError extends Error {}

export const COLUMN_TYPES = [
  "text",
  "integer",
  "bigint",
  "numeric",
  "boolean",
  "date",
  "timestamptz",
  "jsonb",
  "uuid",
] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const FILTER_OPS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "in",
  "is_null",
  "not_null",
] as const;

export type Scalar = string | number | boolean | null;
export type Filter = {
  column: string;
  op: (typeof FILTER_OPS)[number];
  value?: Scalar | Scalar[];
};
export type ColumnDef = { name: string; type: ColumnType; nullable?: boolean };

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

function identifier(name: string, kind: string) {
  if (!IDENTIFIER.test(name)) {
    throw new SandboxError(
      `Invalid ${kind} name "${name}": use lowercase letters, digits and underscores.`
    );
  }
  return name;
}

const tableRef = (table: string) => sql(`sandbox.${table}`);

async function assertTable(table: string) {
  identifier(table, "table");
  const found = await sql`
    select 1 from information_schema.tables
    where table_schema = 'sandbox' and table_name = ${table}
  `;
  if (found.length === 0) {
    throw new SandboxError(`Table "${table}" does not exist in the sandbox.`);
  }
}

function joinFragments(parts: Fragment[], separator: Fragment) {
  return parts.reduce((acc, part) => sql`${acc}${separator}${part}`);
}

function condition({ column, op, value }: Filter): Fragment {
  const col = sql(identifier(column, "column"));
  const scalar = () => {
    if (Array.isArray(value) || value === undefined) {
      throw new SandboxError(`Filter "${op}" on "${column}" needs a single value.`);
    }
    return value;
  };
  switch (op) {
    case "eq": return sql`${col} = ${scalar()}`;
    case "neq": return sql`${col} <> ${scalar()}`;
    case "gt": return sql`${col} > ${scalar()}`;
    case "gte": return sql`${col} >= ${scalar()}`;
    case "lt": return sql`${col} < ${scalar()}`;
    case "lte": return sql`${col} <= ${scalar()}`;
    case "like": return sql`${col}::text like ${scalar()}`;
    case "ilike": return sql`${col}::text ilike ${scalar()}`;
    case "is_null": return sql`${col} is null`;
    case "not_null": return sql`${col} is not null`;
    case "in":
      if (!Array.isArray(value) || value.length === 0) {
        throw new SandboxError(`Filter "in" on "${column}" needs a non-empty array.`);
      }
      return sql`${col} in ${sql(value as (string | number | boolean)[])}`;
  }
}

function where(filters: Filter[] | undefined) {
  if (!filters?.length) return sql``;
  return sql`where ${joinFragments(filters.map(condition), sql` and `)}`;
}

function requireFilters(filters: Filter[] | undefined, action: string) {
  if (!filters?.length) {
    throw new SandboxError(`${action} requires at least one filter.`);
  }
}

// ---------- table-level ----------

export async function listTables() {
  const tables = await sql<{ table: string }[]>`
    select table_name as table from information_schema.tables
    where table_schema = 'sandbox' order by table_name
  `;
  const counts = [];
  for (const { table } of tables) {
    const [{ rows }] = await sql<{ rows: number }[]>`
      select count(*)::int as rows from ${tableRef(table)}
    `;
    counts.push({ table, rows });
  }
  return counts;
}

export async function describeTable(table: string) {
  await assertTable(table);
  const columns = await sql`
    select
      c.column_name as name,
      c.data_type as type,
      c.is_nullable = 'YES' as nullable,
      c.column_default as default,
      exists (
        select 1 from information_schema.table_constraints tc
        join information_schema.key_column_usage k
          on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
        where tc.table_schema = 'sandbox' and tc.table_name = c.table_name
          and tc.constraint_type = 'PRIMARY KEY' and k.column_name = c.column_name
      ) as primary_key
    from information_schema.columns c
    where c.table_schema = 'sandbox' and c.table_name = ${table}
    order by c.ordinal_position
  `;
  const foreignKeys = await sql`
    select k.column_name as column, ccu.table_name as references_table,
           ccu.column_name as references_column
    from information_schema.table_constraints tc
    join information_schema.key_column_usage k
      on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.table_schema = 'sandbox' and tc.table_name = ${table}
      and tc.constraint_type = 'FOREIGN KEY'
  `;
  return { table, columns, foreignKeys };
}

function columnDefinition({ name, type, nullable = true }: ColumnDef) {
  identifier(name, "column");
  if (!COLUMN_TYPES.includes(type)) throw new SandboxError(`Unsupported type "${type}".`);
  return sql`${sql(name)} ${sql.unsafe(type)}${nullable ? sql`` : sql` not null`}`;
}

export async function createTable(table: string, columns: ColumnDef[]) {
  identifier(table, "table");
  if (columns.some((c) => c.name === "id")) {
    throw new SandboxError(`Don't define "id"; every table gets an auto-increment id.`);
  }
  const defs = [
    sql`id bigint generated always as identity primary key`,
    ...columns.map(columnDefinition),
  ];
  await sql`create table ${tableRef(table)} (${joinFragments(defs, sql`, `)})`;
  return describeTable(table);
}

export async function dropTable(table: string) {
  await assertTable(table);
  // CASCADE drops foreign keys pointing at this table, not the referencing tables.
  await sql`drop table ${tableRef(table)} cascade`;
  return { dropped: table };
}

export async function addColumn(table: string, column: ColumnDef) {
  await assertTable(table);
  await sql`alter table ${tableRef(table)} add column ${columnDefinition(column)}`;
  return describeTable(table);
}

export async function dropColumn(table: string, column: string) {
  await assertTable(table);
  identifier(column, "column");
  await sql`alter table ${tableRef(table)} drop column ${sql(column)} cascade`;
  return describeTable(table);
}

// ---------- row-level ----------

export const MAX_READ_LIMIT = 200;

export async function readRows(options: {
  table: string;
  columns?: string[];
  filters?: Filter[];
  orderBy?: { column: string; direction?: "asc" | "desc" };
  limit?: number;
}) {
  const { table, columns, filters, orderBy, limit = 50 } = options;
  await assertTable(table);
  const select = columns?.length
    ? sql(columns.map((c) => identifier(c, "column")))
    : sql`*`;
  const order = orderBy
    ? sql`order by ${sql(identifier(orderBy.column, "column"))} ${
        orderBy.direction === "desc" ? sql`desc` : sql`asc`
      }`
    : sql``;
  const rows = await sql`
    select ${select} from ${tableRef(table)} ${where(filters)} ${order}
    limit ${Math.min(Math.max(limit, 1), MAX_READ_LIMIT)}
  `;
  return { table, count: rows.length, rows };
}

export async function insertRows(table: string, rows: Record<string, Scalar>[]) {
  await assertTable(table);
  if (rows.length === 0) throw new SandboxError("Provide at least one row.");
  const columns = Object.keys(rows[0]).map((c) => identifier(c, "column"));
  const sameShape = rows.every(
    (r) => Object.keys(r).length === columns.length && columns.every((c) => c in r)
  );
  if (!sameShape) throw new SandboxError("All rows must have the same columns.");
  const inserted = await sql`
    insert into ${tableRef(table)} ${sql(rows, columns)} returning *
  `;
  return { table, inserted: inserted.length, rows: inserted };
}

export async function updateRows(
  table: string,
  values: Record<string, Scalar>,
  filters: Filter[]
) {
  await assertTable(table);
  requireFilters(filters, "update_rows");
  const columns = Object.keys(values).map((c) => identifier(c, "column"));
  if (columns.length === 0) throw new SandboxError("Provide at least one value to set.");
  const updated = await sql`
    update ${tableRef(table)} set ${sql(values, columns)} ${where(filters)} returning *
  `;
  return { table, updated: updated.length, rows: updated };
}

export async function deleteRows(table: string, filters: Filter[]) {
  await assertTable(table);
  requireFilters(filters, "delete_rows");
  const deleted = await sql`delete from ${tableRef(table)} ${where(filters)} returning *`;
  return { table, deleted: deleted.length, rows: deleted };
}
