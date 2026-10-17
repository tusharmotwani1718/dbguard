import type { NextRequest } from "next/server";
import { SandboxError, readRows } from "@/server/sandbox-ops";

export async function GET(request: NextRequest) {
  const table = request.nextUrl.searchParams.get("table") ?? "";
  try {
    return Response.json(await readRows({ table, limit: 20, orderBy: { column: "id" } }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: error instanceof SandboxError ? 404 : 500 });
  }
}
