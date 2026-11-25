import { notFound } from "next/navigation";

import { TokenManager } from "@/components/TokenManager";
import { API_TOKEN_SELECT, toApiTokenDTO } from "@/lib/api-tokens";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

/** Your personal access tokens for using Jiji from Claude over MCP. Every role has one. */
export default async function ApiTokensPage() {
  // currentUser, not currentUserId: a session can outlive its user row (a
  // re-seeded database), and the token's foreign key would then fail.
  const userId = (await currentUser())?.id;
  if (!userId) notFound();

  const rows = await prisma.apiToken.findMany({
    where: { userId },
    select: API_TOKEN_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-lg font-semibold tracking-tight text-slate-900">API tokens</h1>
      <p className="mb-5 text-sm text-slate-500">
        Tokens let Claude use Jiji as you, through the MCP endpoint at{" "}
        <span className="font-mono">/api/mcp</span>. They have your role, work nowhere else, and
        always expire.
      </p>
      <TokenManager tokens={rows.map(toApiTokenDTO)} />
    </div>
  );
}
