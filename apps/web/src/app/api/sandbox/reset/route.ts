import { resetSandbox, sandboxSnapshot } from "@/server/sandbox";

export async function POST() {
  await resetSandbox();
  return Response.json(await sandboxSnapshot());
}
