# Build Plan

DBGuard is built layer by layer. Each layer ends with a manual test. The next layer starts only after that test passes.

## Decisions so far

- **Database:** a hosted Supabase project (not local), seeded with fake data only.
- **MCP server:** our own, served from `apps/web` as a Next.js route (`/api/mcp`) and deployed publicly. ArmorIQ's proxy forwards each tool call to the registered MCP server URL, so localhost will not work.
- **Tools:** both table-level operations (create, drop, alter tables) and row-level operations (read, insert, update, delete rows).
- **Agent:** two phases. Mistral first produces a plan; we lock it with ArmorIQ (`capturePlan` → `getIntentToken`). Then Mistral runs it, and every tool call goes through `client.invoke`.
- **Blocked scenarios to demo:** prompt injection, a policy rule and an off-plan tool call.
- **Users:** a single demo user, no auth.
- **Env vars:** every new key is added to `apps/web/.env.example` in the layer that introduces it.
- **Restricted DB role:** the app and MCP server connect as `dbguard_agent`, a Postgres role that owns only the `sandbox` schema. Even in unguarded mode, the agent cannot touch `public`, `auth` or anything else.
- **Resettable sandbox:** `public.reset_sandbox()` drops the `sandbox` schema and rebuilds it with its seed data, including any tables the agent created. It is the one source of truth for the reset script, the UI button and the SQL editor.
- **Guarded/unguarded toggle:** the same prompt can run without ArmorIQ (the injection really drops a table) and with ArmorIQ (blocked). Then the sandbox is reset.
- **Table-level restrictions come from ArmorIQ policies (L6),** not from per-table tool names, because ArmorIQ checks only action names.

## What the ArmorIQ SDK actually does (`@armoriq/sdk` 0.6.10)

- `invoke(mcp, action, token, params)` sends a POST to `https://proxy.armoriq.ai`. The proxy verifies the token and the step's Merkle proof, then forwards the call to the registered MCP server.
- If an action is not in the plan, the SDK throws `IntentMismatchException` before the request leaves the client.
- `invokeWithPolicy(...)` also applies the policies set on the dashboard. It throws `PolicyBlockedException`, or `PolicyHoldException` when an action needs approval.
- The plan is checked against the **action name only**. Parameters are not part of the check. For example, if `read_rows` on `orders` is in the plan, `read_rows` on `customers` still passes the intent check. Restrictions on specific tables or parameters have to come from policies.
- Intent tokens expire after 60 seconds by default. We'll pass a longer validity.

## Layers

### L0: Monorepo scaffold ✅
Turborepo, bun, Next.js 16, shadcn and the Supabase CLI.

### L1: Database and seed data ✅
- Create the hosted Supabase project.
- Create the `dbguard_agent` role. Its password is set manually, never committed.
- Add all demo tables to one `sandbox` schema (for example `customers`, `orders`, `products`, `support_tickets`), with fake seed data managed by migrations.
- One `support_tickets` row carries a prompt-injection payload for the demo.
- Add a reset script that restores the sandbox to its seeded state, so the demo can be repeated.
- **Test:** run the reset script and check that the tables and rows appear in Supabase Studio. Change a row, reset again and check that it's restored.

### L2: MCP server
- Serve `/api/mcp` over streamable HTTP, protected by a bearer token.
- Table-level tools: `list_tables`, `describe_table`, `create_table`, `drop_table`, `add_column`, `drop_column`. `alter_table` is split into separate tools because ArmorIQ checks only the tool name, so one broad tool would let a plan to *add* a column also cover *dropping* one.
- Row-level tools: `read_rows`, `insert_rows`, `update_rows`, `delete_rows`. `update_rows` and `delete_rows` require at least one filter.
- Connect to Postgres directly, since DDL can't go through PostgREST. Every tool is restricted to the `sandbox` schema.
- **Test:** connect MCP Inspector to `localhost:3000/api/mcp` and call each tool. Check that a request without the bearer token is rejected.

### L3: Deploy and an ArmorIQ spike (the riskiest layer, so it comes early)
- Deploy to Vercel.
- Register the MCP server on the ArmorIQ dashboard.
- Write a script with a hard-coded plan that calls one action in the plan (allowed) and one action outside it (blocked).
- **Test:** run the script. Check that the allowed call changes or returns data and the blocked call throws. Both calls should show up in the ArmorIQ dashboard.

### L4: Mistral agent, unguarded
- A Mistral tool-calling loop that calls the MCP tools directly, without ArmorIQ.
- A basic chat UI.
- **Test:** ask for things like "show me the 5 latest orders" and "add a column to products". Check the answers and the database changes.

### L5: Guarded agent
- Phase 1: Mistral produces a structured plan, which we lock with ArmorIQ.
- Phase 2: Mistral executes it, with every tool call going through `invoke`.
- When a call is blocked, the result is returned to the model as a tool error, so the agent can explain what happened instead of crashing.
- **Test:** a normal request is allowed end to end. Ask the agent to summarize the support tickets: the injected ticket tries `drop_table` and gets blocked.

### L6: Policies
- Add dashboard policies, for example: `drop_table` and `delete_rows` are never allowed on `customers`, and some actions are held for approval.
- Switch the agent to `invokeWithPolicy`.
- **Test:** a request whose plan includes a forbidden action is blocked by the policy (`PolicyBlockedException`), even though the action is in the plan.

### L7: Demo UI
- Layout: the chat, a panel showing the locked plan, a timeline of tool calls marked allowed or blocked with the reason, a live database viewer and a "reset sandbox" button.
- Preset demo prompts for each scenario.
- A guarded/unguarded toggle.
- **Test:** run every scenario from the UI on the deployed URL.

### L8: Polish and submission
Write the README, the demo script and the recording checklist, and do a final deploy.

## Suggested timeline (5 days)
- Day 1: L1, L2
- Day 2: L3, L4
- Day 3: L5
- Day 4: L6, L7
- Day 5: L7 polish, L8, buffer
