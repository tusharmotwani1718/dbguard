import { tool, type ToolInputParameters } from "@openai/agents";
import type { AgentEvent, BlockKind } from "@/lib/agent-events";
import type { McpClient } from "./mcp-client";

export type ToolOutcome = {
  ok: boolean;
  output: string;
  blocked?: { kind: BlockKind; reason: string };
};

// How a tool call is actually executed. Unguarded mode calls the MCP server
// directly; guarded mode routes the same call through ArmorIQ.
export type CallTool = (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>;

export function mcpResultText(result: { content?: unknown }) {
  const content = (result.content ?? []) as { type: string; text?: string }[];
  return content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
}

export function callViaMcp(mcp: McpClient): CallTool {
  return async (name, args) => {
    const result = await mcp.callTool({ name, arguments: args });
    return { ok: !result.isError, output: mcpResultText(result) };
  };
}

export type McpTool = Awaited<ReturnType<McpClient["listTools"]>>["tools"][number];

// Exposes the MCP server's tools to the agent, with our own handler in between so
// every call is reported to the UI and, in guarded mode, checked by ArmorIQ.
export function sandboxTools(
  mcpTools: McpTool[],
  callTool: CallTool,
  emit: (event: AgentEvent) => void
) {
  return mcpTools.map((mcpTool) => {
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
        const { ok, output, blocked } = await callTool(mcpTool.name, args);
        emit(blocked ? { type: "tool_blocked", id, ...blocked } : { type: "tool_result", id, ok, output });
        return output;
      },
    });
  });
}
