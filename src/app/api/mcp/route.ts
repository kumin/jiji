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
export async function POST(request: Request) {
  const actor = await actorFromBearer(request.headers.get("authorization"));
  if (!actor) return unauthorized();

  const server = createJijiServer(actor);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

/**
 * GET (a standalone event stream) and DELETE (ending a session) only mean
 * something with MCP sessions. This endpoint is stateless, so it answers 405,
 * as the spec allows; otherwise a client's GET stream would stay open forever.
 * The token is still checked first, so an anonymous caller learns nothing.
 */
async function notAllowed(request: Request) {
  if (!(await actorFromBearer(request.headers.get("authorization")))) return unauthorized();
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function unauthorized() {
  return NextResponse.json(UNAUTHORIZED_RESPONSE, {
    status: 401,
    headers: { "WWW-Authenticate": "Bearer" },
  });
}

export { notAllowed as DELETE, notAllowed as GET };
