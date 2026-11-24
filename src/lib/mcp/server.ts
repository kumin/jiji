import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { Actor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import packageJson from "../../../package.json";

/** A successful tool result: the value as pretty JSON text. */
export function toolJson(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** A failed tool result Claude can read and act on. */
export function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/**
 * The Jiji MCP server for one request, acting as `actor`. Built per request
 * because the endpoint is stateless: every tool call carries its own token.
 */
export function createJijiServer(actor: Actor): McpServer {
  const server = new McpServer({ name: "jiji", version: packageJson.version });

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "The Jiji user this token acts as, with their role (ADMIN, MEMBER or VIEWER).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const user = await prisma.user.findUnique({
        where: { id: actor.id },
        select: { id: true, name: true, email: true, role: true },
      });
      return user ? toolJson(user) : toolError("Your account no longer exists.");
    },
  );

  return server;
}
