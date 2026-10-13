import { sql } from "./db";

export async function resetSandbox() {
  await sql`select public.reset_sandbox()`;
}
