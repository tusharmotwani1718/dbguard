import postgres from "postgres";

// Connects as the restricted `dbguard_agent` role through Supabase's transaction
// pooler, which doesn't support prepared statements.
export const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
