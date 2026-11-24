import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { NextResponse } from "next/server";

import { actorFromBearer } from "@/lib/api-tokens";
import { createJijiServer } from "@/lib/mcp/server";
import { UNAUTHORIZED_RESPONSE } from "@/lib/require-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The MCP endpoint (Streamable HTTP, stateless). Each request authenticates
 * with `Authorization: Bearer jiji_...`, gets a fresh server acting as that
 * token's owner, and is answered with plain JSON — no MCP sessions, no
 * server-sent events.
 */
async function handle(request: Request) {
  const actor = await actorFromBearer(request.headers.get("authorization"));
  if (!actor) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }

  const server = createJijiServer(actor);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as DELETE, handle as GET, handle as POST };
