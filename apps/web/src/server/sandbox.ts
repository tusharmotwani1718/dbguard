import { sql } from "./db";
import { listTables } from "./sandbox-ops";

// Tables created by public.reset_sandbox(); any missing from a snapshot were dropped.
export const SEEDED_TABLES = ["customers", "orders", "products", "support_tickets"];

export async function resetSandbox() {
  await sql`select public.reset_sandbox()`;
}

export async function sandboxSnapshot() {
  const tables = await listTables();
  const present = new Set(tables.map((t) => t.table));
  return { tables, dropped: SEEDED_TABLES.filter((t) => !present.has(t)) };
}

export type SandboxSnapshot = Awaited<ReturnType<typeof sandboxSnapshot>>;
