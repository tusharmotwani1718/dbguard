import { sql } from "../src/server/db";
import { resetSandbox, sandboxRowCounts } from "../src/server/sandbox";

await resetSandbox();
console.log("Sandbox reset.");
console.table(await sandboxRowCounts());
await sql.end();
