import { sql } from "./db";

export async function resetSandbox() {
  await sql`select public.reset_sandbox()`;
}

export async function sandboxRowCounts() {
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'sandbox' order by table_name
  `;
  return Promise.all(
    tables.map(async ({ table_name }) => {
      const [{ count }] = await sql<{ count: number }[]>`
        select count(*)::int as count from ${sql("sandbox." + table_name)}
      `;
      return { table: table_name, rows: count };
    })
  );
}
