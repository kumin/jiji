import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { z } from "zod";

import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import { buildIssueWhere } from "@/lib/issue-filters";
import { issueKey, parseIssueRef } from "@/lib/issue";
import { ISSUE_INCLUDE, toIssueDTO } from "@/lib/issue-service";
import type { Actor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listDashboards, listUsers } from "@/lib/queries";

import packageJson from "../../../package.json";

/** A successful tool result: the value as pretty JSON text. */
export function toolJson(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** A failed tool result Claude can read and act on. */
export function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

const ISSUE_REF_DESCRIPTION = "The issue's key (e.g. JIJI-12) or its id.";

/** Loads an issue by key or id, with its relations. */
export async function findIssue(ref: string) {
  const where = parseIssueRef(ref);
  return prisma.issue.findUnique({ where, include: ISSUE_INCLUDE });
}

export function issueNotFound(ref: string) {
  return toolError(`Issue ${ref.trim()} not found`);
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

  server.registerTool(
    "list_dashboards",
    {
      title: "List dashboards",
      description: "Every dashboard (project board), with how many issues it holds.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const dashboards = await listDashboards();
      return toolJson(
        dashboards.map(({ id, name, description, issueCount }) => ({
          id,
          name,
          description,
          issueCount,
        })),
      );
    },
  );

  server.registerTool(
    "list_users",
    {
      title: "List users",
      description: "Everyone in Jiji, with their role. Use an id as an issue's assigneeId.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const users = await listUsers();
      return toolJson(users.map(({ id, name, email, role }) => ({ id, name, email, role })));
    },
  );

  server.registerTool(
    "search_issues",
    {
      title: "Search issues",
      description:
        "Find issues, newest first. All filters are optional and combine. `q` matches the " +
        "title or description. Returns a summary per issue; use get_issue for the details.",
      inputSchema: {
        dashboardId: z.string().optional().describe("Only issues on this dashboard."),
        status: z.enum(IssueStatus).optional(),
        priority: z.enum(IssuePriority).optional(),
        assignee: z
          .string()
          .optional()
          .describe('A user id, "me" for the token\'s owner, or "none" for unassigned.'),
        q: z.string().optional().describe("Text to look for in the title or description."),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ dashboardId, status, priority, assignee, q, limit }) => {
      const where = buildIssueWhere({
        dashboardId,
        status,
        priority,
        assigneeId: assignee === "me" ? actor.id : assignee,
        q: q?.trim() || undefined,
      });
      const [issues, total] = await Promise.all([
        prisma.issue.findMany({
          where,
          include: ISSUE_INCLUDE,
          orderBy: { number: "desc" },
          take: limit,
        }),
        prisma.issue.count({ where }),
      ]);
      return toolJson({
        total,
        issues: issues.map((issue) => ({
          key: issueKey(issue.number),
          id: issue.id,
          title: issue.title,
          status: issue.status,
          priority: issue.priority,
          assignee: issue.assignee?.name ?? null,
          dashboard: issue.dashboard.name,
          dueDate: issue.dueDate?.toISOString() ?? null,
          updatedAt: issue.updatedAt.toISOString(),
        })),
      });
    },
  );

  server.registerTool(
    "get_issue",
    {
      title: "Get an issue",
      description: "One issue with all its fields, assignee, reporter and dashboard.",
      inputSchema: { issue: z.string().min(1).describe(ISSUE_REF_DESCRIPTION) },
      annotations: { readOnlyHint: true },
    },
    async ({ issue: ref }) => {
      const issue = await findIssue(ref);
      return issue ? toolJson(toIssueDTO(issue)) : issueNotFound(ref);
    },
  );

  return server;
}
