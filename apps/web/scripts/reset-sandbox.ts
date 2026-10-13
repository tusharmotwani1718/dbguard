import { sql } from "../src/server/db";
import { resetSandbox } from "../src/server/sandbox";
import { listTables } from "../src/server/sandbox-ops";

await resetSandbox();
console.log("Sandbox reset.");
console.table(await listTables());
await sql.end();
