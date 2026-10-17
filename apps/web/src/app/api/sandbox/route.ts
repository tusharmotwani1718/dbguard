import { sandboxSnapshot } from "@/server/sandbox";

// Read-only admin view for the demo UI; not an agent action, so it bypasses MCP/ArmorIQ.
export async function GET() {
  return Response.json(await sandboxSnapshot());
}
