import { NextResponse } from "next/server";

import type { IssueStatus } from "@/generated/prisma/enums";

import { resolveAssignee } from "@/lib/assignee";
import {
  DASHBOARD_NOT_FOUND_RESPONSE,
  isDashboardForeignKeyViolation,
} from "@/lib/dashboard-service";
import { issueKey } from "@/lib/issue";
import { ISSUE_INCLUDE, toIssueDTO } from "@/lib/issue-service";
import { type Actor, denyReason } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { IssueDTO } from "@/lib/types";
import { fieldErrors, issueCreateSchema, issuePatchSchema } from "@/lib/validation";

/**
 * Issue writes shared by the REST routes and the MCP tools, so permissions,
 * validation and the workflow can't drift apart between the two. Each takes
 * the acting user and returns either the result or the HTTP status and body the
 * REST API answers with; the MCP server turns the latter into a message.
 *
 * The order of checks is part of the contract: permission first (so a caller
 * who may not write can't probe which inputs are valid), then validation.
 */
export type ActionErrorBody = {
  error: string;
  reason?: string;
  fields?: Record<string, string>;
  from?: IssueStatus;
  allowed?: readonly IssueStatus[];
};

export type ActionError = { ok: false; status: number; body: ActionErrorBody };
export type ActionResult<T> = { ok: true; value: T } | ActionError;

function fail(status: number, body: ActionErrorBody): ActionError {
  return { ok: false, status, body };
}

function forbidden(reason: string): ActionError {
  return fail(403, { error: "Forbidden", reason });
}

function validationFailed(fields: Record<string, string>): ActionError {
  return fail(400, { error: "Validation failed", fields });
}

const DASHBOARD_NOT_FOUND = () => fail(400, DASHBOARD_NOT_FOUND_RESPONSE);
const ISSUE_NOT_FOUND = () => fail(404, { error: "Issue not found" });

/** The REST response for a failed action. */
export function errorResponse(error: ActionError) {
  return NextResponse.json(error.body, { status: error.status });
}

export async function createIssue(actor: Actor, input: unknown): Promise<ActionResult<IssueDTO>> {
  const reason = denyReason(actor, "issue:create");
  if (reason) return forbidden(reason);

  const parsed = issueCreateSchema.safeParse(input);
  if (!parsed.success) return validationFailed(fieldErrors(parsed.error));
  const data = parsed.data;

  const dashboard = await prisma.dashboard.findUnique({
    where: { id: data.dashboardId },
    select: { id: true },
  });
  if (!dashboard) return DASHBOARD_NOT_FOUND();

  if (data.assigneeId !== undefined) {
    const assignee = await resolveAssignee(data.assigneeId);
    if (!assignee.ok) return validationFailed({ assigneeId: assignee.message });
    data.assigneeId = assignee.value;
  }

  // The JWT outlives the row it names: a re-seeded database (or a deleted
  // account) leaves a valid cookie pointing at a user that no longer exists,
  // and the reporter foreign key would then fail. Say so instead of 500ing.
  const reporter = await prisma.user.findUnique({ where: { id: actor.id }, select: { id: true } });
  if (!reporter) return fail(401, { error: "Your account no longer exists. Sign in again." });

  try {
    const issue = await prisma.issue.create({
      // The reporter is always the acting user, never the request body.
      data: { ...data, reporterId: actor.id },
      include: ISSUE_INCLUDE,
    });
    return { ok: true, value: toIssueDTO(issue) };
  } catch (error) {
    // The dashboard was deleted after the check above.
    if (isDashboardForeignKeyViolation(error)) return DASHBOARD_NOT_FOUND();
    throw error;
  }
}

export async function updateIssue(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<ActionResult<IssueDTO>> {
  const reason = denyReason(actor, "issue:edit");
  if (reason) return forbidden(reason);

  const parsed = issuePatchSchema.safeParse(input);
  if (!parsed.success) return validationFailed(fieldErrors(parsed.error));

  // `issuePatchSchema` rejects an empty object, so `changes` is never a no-op.
  const changes = parsed.data;

  if (changes.assigneeId !== undefined) {
    const assignee = await resolveAssignee(changes.assigneeId);
    if (!assignee.ok) return validationFailed({ assigneeId: assignee.message });
    changes.assigneeId = assignee.value;
  }

  // Moving to another dashboard: an unknown id would otherwise surface as a
  // foreign-key violation and a 500.
  if (changes.dashboardId !== undefined) {
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: changes.dashboardId },
      select: { id: true },
    });
    if (!dashboard) return DASHBOARD_NOT_FOUND();
  }

  const existing = await prisma.issue.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return ISSUE_NOT_FOUND();

  try {
    const issue = await prisma.issue.update({ where: { id }, data: changes, include: ISSUE_INCLUDE });
    return { ok: true, value: toIssueDTO(issue) };
  } catch (error) {
    // Moving into a dashboard that was deleted after the check above.
    if (isDashboardForeignKeyViolation(error)) return DASHBOARD_NOT_FOUND();
    throw error;
  }
}

export async function deleteIssue(
  actor: Actor,
  id: string,
): Promise<ActionResult<{ key: string }>> {
  // Anyone who may edit may delete *something*, so this refuses Viewers before
  // the lookup; whether this particular issue is theirs is checked below.
  const reason = denyReason(actor, "issue:edit");
  if (reason) return forbidden(reason);

  const existing = await prisma.issue.findUnique({
    where: { id },
    select: { id: true, number: true, reporterId: true },
  });
  if (!existing) return ISSUE_NOT_FOUND();

  const deleteReason = denyReason(actor, "issue:delete", existing);
  if (deleteReason) return forbidden(deleteReason);

  await prisma.issue.delete({ where: { id } });
  return { ok: true, value: { key: issueKey(existing.number) } };
}
