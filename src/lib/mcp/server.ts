import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { z } from "zod";

import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";
import { buildIssueWhere } from "@/lib/issue-filters";
import { issueKey, parseIssueRef } from "@/lib/issue";
import { ISSUE_INCLUDE, toIssueDTO } from "@/lib/issue-service";
import {
  type ActionResult,
  createIssue,
  deleteIssue,
  transitionIssue,
  updateIssue,
} from "@/lib/issue-actions";
import { type Actor, denyReason } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listDashboards, listUsers } from "@/lib/queries";

import { formatActionError } from "./errors";

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

const WORKFLOW =
  "Statuses move one step at a time: TODO → IN_PROGRESS → IN_REVIEW → DONE, and back one step.";

/** Fields an issue can be created or edited with (status is separate; see transition_issue). */
const issueFieldShape = {
  title: z.string().describe("Up to 255 characters."),
  description: z.string().nullable().describe("Plain text; null or empty clears it."),
  priority: z.enum(IssuePriority),
  assigneeId: z.string().nullable().describe("A user id from list_users; null unassigns."),
  dueDate: z.string().nullable().describe("YYYY-MM-DD; null clears it."),
  dashboardId: z.string().describe("A dashboard id from list_dashboards."),
};

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

  server.registerTool(
    "create_issue",
    {
      title: "Create an issue",
      description:
        "File a new issue on a dashboard, reported by you. It starts in TODO. " +
        "Viewers can't create issues.",
      inputSchema: {
        dashboardId: issueFieldShape.dashboardId,
        title: issueFieldShape.title,
        description: issueFieldShape.description.optional(),
        priority: issueFieldShape.priority.optional().describe("Defaults to MEDIUM."),
        assigneeId: issueFieldShape.assigneeId.optional(),
        dueDate: issueFieldShape.dueDate.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      const result = await createIssue(actor, args);
      return result.ok ? toolJson(result.value) : toolError(formatActionError(result));
    },
  );

  server.registerTool(
    "update_issue",
    {
      title: "Update an issue",
      description:
        "Change an issue's fields, or move it to another dashboard. Pass only what changes. " +
        "To change its status, use transition_issue. Viewers can't edit issues.",
      inputSchema: {
        issue: z.string().min(1).describe(ISSUE_REF_DESCRIPTION),
        title: issueFieldShape.title.optional(),
        description: issueFieldShape.description.optional(),
        priority: issueFieldShape.priority.optional(),
        assigneeId: issueFieldShape.assigneeId.optional(),
        dueDate: issueFieldShape.dueDate.optional(),
        dashboardId: issueFieldShape.dashboardId.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ issue: ref, ...changes }) => {
      return withIssue(actor, ref, async (id) => updateIssue(actor, id, changes));
    },
  );

  server.registerTool(
    "transition_issue",
    {
      title: "Change an issue's status",
      description: `Move an issue to another status. ${WORKFLOW} Viewers can't edit issues.`,
      inputSchema: {
        issue: z.string().min(1).describe(ISSUE_REF_DESCRIPTION),
        status: z.enum(IssueStatus),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ issue: ref, status }) => {
      return withIssue(actor, ref, async (id) => transitionIssue(actor, id, { status }));
    },
  );

  server.registerTool(
    "delete_issue",
    {
      title: "Delete an issue",
      description:
        "Permanently delete an issue. Members may only delete issues they reported; " +
        "Admins may delete any; Viewers none.",
      inputSchema: { issue: z.string().min(1).describe(ISSUE_REF_DESCRIPTION) },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ issue: ref }) => {
      return withIssue(actor, ref, async (id) => {
        const result = await deleteIssue(actor, id);
        return result.ok ? { ok: true, value: { deleted: result.value.key } } : result;
      });
    },
  );

  return server;
}

/**
 * Runs an action on the issue `ref` names. The role is checked before the
 * lookup, as the REST API does, so a Viewer is told they can't write rather
 * than that an issue doesn't exist.
 */
async function withIssue<T>(
  actor: Actor,
  ref: string,
  action: (id: string) => Promise<ActionResult<T>>,
): Promise<CallToolResult> {
  const reason = denyReason(actor, "issue:edit");
  if (reason) return toolError(`Forbidden: ${reason}`);
  const issue = await prisma.issue.findUnique({ where: parseIssueRef(ref), select: { id: true } });
  if (!issue) return issueNotFound(ref);
  const result = await action(issue.id);
  return result.ok ? toolJson(result.value) : toolError(formatActionError(result));
}
