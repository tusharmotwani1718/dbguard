// Layer 3 spike: real ArmorIQ enforcement against our deployed MCP server, with a
// hard-coded plan (no LLM yet). Run with `bun run armoriq:spike`.
//
//   1. ALLOWED  — read_rows is in the plan → proxy forwards it to /api/mcp.
//   2. BLOCKED  — drop_table is not in the plan → SDK refuses (IntentMismatchException).
//   3. BLOCKED  — a tampered token claims step 0 is drop_table → the ArmorIQ proxy
//                 must reject it, proving enforcement happens server-side too.

import { ArmorIQClient, type IntentToken } from "@armoriq/sdk";

const MCP = process.env.ARMORIQ_MCP_NAME ?? "dbGuard";

const client = new ArmorIQClient({
  apiKey: process.env.ARMORIQ_API_KEY,
  agentId: "dbguard-agent",
  mcpCredentials: {
    [MCP]: { authType: "bearer", token: process.env.MCP_API_KEY! },
  }
});

// ARMORIQ_DEBUG=1 logs every raw ArmorIQ HTTP exchange. The SDK flattens error bodies
// to "[object Object]", so this is the only way to see what the proxy actually said.
if (process.env.ARMORIQ_DEBUG) {
  type Exchange = { status?: number; data?: unknown; config?: { method?: string; url?: string } };
  const log = (r: Exchange | undefined) =>
    console.log(
      `[http] ${r?.config?.method?.toUpperCase()} ${r?.config?.url} → ${r?.status}\n`,
      JSON.stringify(r?.data, null, 2)?.slice(0, 3000)
    );
  // httpClient is private in the SDK's types but is a plain axios instance.
  const http = (client as unknown as { httpClient: { interceptors: { response: { use: (ok: (r: Exchange) => Exchange, err: (e: { response?: Exchange }) => never) => void } } } }).httpClient;
  http.interceptors.response.use(
    (r) => (log(r), r),
    (e) => {
      log(e.response);
      throw e;
    }
  );
}

const readParams = {
  table: "orders",
  filters: [{ column: "status", op: "eq", value: "pending" }],
  order_by: { column: "created_at", direction: "desc" },
  limit: 3,
};

const prompt = "Show me the 3 most recent pending orders";
const captured = client.capturePlan("hardcoded", prompt, {
  goal: prompt,
  steps: [{ action: "read_rows", mcp: MCP, params: readParams }],
});
const token = await client.getIntentToken(captured, undefined, 300);
console.log("\nIntent token:", {
  tokenId: token.tokenId,
  planHash: token.planHash,
  steps: token.totalSteps,
  expiresAt: new Date(token.expiresAt * 1000).toISOString(),
});

async function check(label: string, fn: () => Promise<unknown>) {
  console.log(`\n=== ${label} ===`);
  try {
    const result = await fn();
    console.log("RESULT: allowed\n", JSON.stringify(result, null, 2).slice(0, 1500));
  } catch (error) {
    const e = error as Error & { response?: { status?: number; data?: unknown } };
    console.log(`RESULT: blocked — ${e.name}: ${JSON.stringify(e.message)}`);
    console.error(JSON.stringify(e.cause));
    console.error(e);
    if (e.response) console.log("proxy response:", e.response.status, JSON.stringify(e.response.data));
  }
}

await check("1. read_rows (in plan)", () => client.invoke(MCP, "read_rows", token, readParams));

await check("2. drop_table (not in plan)", () =>
  client.invoke(MCP, "drop_table", token, { table: "customers" })
);

await check("3. drop_table via tampered token (proxy-side check)", () => {
  const tampered: IntentToken = structuredClone(token);
  tampered.rawToken.plan.steps[0].action = "drop_table";
  return client.invoke(MCP, "drop_table", tampered, { table: "customers" });
});

client.close();
