import { tool, type ToolInputParameters } from "@openai/agents";
import type { AgentEvent } from "@/lib/agent-events";
import type { McpClient } from "./mcp-client";

export type ToolOutcome = { ok: boolean; output: string };

// How a tool call is actually executed. Unguarded mode calls the MCP server
// directly; guarded mode (layer 5) routes the same call through ArmorIQ.
export type CallTool = (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>;

export function callViaMcp(mcp: McpClient): CallTool {
  return async (name, args) => {
    const result = await mcp.callTool({ name, arguments: args });
    const content = (result.content ?? []) as { type: string; text?: string }[];
    const output = content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
    return { ok: !result.isError, output };
  };
}

// Exposes the MCP server's tools to the agent, with our own handler in between so
// every call can be reported to the UI and (later) checked by ArmorIQ.
export async function sandboxTools(
  mcp: McpClient,
  callTool: CallTool,
  emit: (event: AgentEvent) => void
) {
  const { tools } = await mcp.listTools();
  return tools.map((mcpTool) => {
    const parameters = { ...(mcpTool.inputSchema as Record<string, unknown>) };
    delete parameters.$schema;

    return tool({
      name: mcpTool.name,
      description: mcpTool.description ?? "",
      parameters: parameters as Extract<ToolInputParameters, { additionalProperties: true }>,
      strict: false,
      execute: async (input, _context, details) => {
        const id = details?.toolCall?.callId ?? crypto.randomUUID();
        const args = (input ?? {}) as Record<string, unknown>;
        emit({ type: "tool_call", id, name: mcpTool.name, args });
        const { ok, output } = await callTool(mcpTool.name, args);
        emit({ type: "tool_result", id, ok, output });
        return output;
      },
    });
  });
}
