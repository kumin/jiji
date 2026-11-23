import Link from "next/link";

import { AssigneeChip } from "@/components/Avatar";
import { AssigneeSelect } from "@/components/AssigneeSelect";
import { DeleteIssueButton } from "@/components/DeleteIssueButton";
import { EditIssueSection } from "@/components/EditIssueSection";
import { PriorityLabel } from "@/components/Priority";
import { StatusSelect } from "@/components/StatusSelect";
import { describeDue, formatDate } from "@/lib/dates";
import { type Actor, can } from "@/lib/permissions";
import type { DashboardDTO, IssueDTO, UserDTO } from "@/lib/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

/**
 * The body of an issue: used by the full page (/issues/[id]) and by the popup
 * opened from the list or board (the intercepted @modal route).
 */
export function IssueDetail({
  issue,
  users,
  dashboards,
  actor,
  titleId,
}: {
  issue: IssueDTO;
  users: UserDTO[];
  dashboards: DashboardDTO[];
  /** The signed-in user; controls they may not use are hidden or disabled. */
  actor: Actor | null;
  /** id for the title, so a dialog can point aria-labelledby at it. */
  titleId?: string;
}) {
  const due = describeDue(issue.dueDate, issue.status);
  // The API enforces these too; hiding them just avoids offering a dead end.
  const canEdit = can(actor, "issue:edit");
  const canDelete = can(actor, "issue:delete", { reporterId: issue.reporter?.id ?? null });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-1 font-mono text-sm text-slate-500">{issue.key}</span>
        <h1 id={titleId} className="text-xl font-semibold tracking-tight text-slate-900">
          {issue.title}
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Description</h2>
            {issue.description ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {issue.description}
              </p>
            ) : (
              <p className="text-sm italic text-slate-400">No description.</p>
            )}
          </section>

          {canEdit ? (
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Edit</h2>
              <EditIssueSection issue={issue} users={users} dashboards={dashboards} />
            </section>
          ) : null}
        </div>

        <aside className="space-y-5">
          <dl className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
            <Field label="Status">
              <StatusSelect issue={issue} disabled={!canEdit} />
            </Field>
            <Field label="Assignee">
              <AssigneeSelect issue={issue} users={users} disabled={!canEdit} />
            </Field>
            <Field label="Dashboard">
              <Link
                href={`/?dashboard=${issue.dashboard.id}`}
                className="text-blue-700 hover:underline"
              >
                {issue.dashboard.name}
              </Link>
            </Field>
            <Field label="Priority">
              <PriorityLabel priority={issue.priority} />
            </Field>
            <Field label="Reporter">
              <AssigneeChip user={issue.reporter} />
            </Field>
            <Field label="Due date">
              {issue.dueDate ? (
                <span className={due?.className}>
                  {formatDate(issue.dueDate)}
                  {due ? ` · ${due.label}` : ""}
                </span>
              ) : (
                <span className="text-slate-400">No due date</span>
              )}
            </Field>
            <Field label="Created">{formatDate(issue.createdAt)}</Field>
            <Field label="Updated">{formatDate(issue.updatedAt)}</Field>
          </dl>

          {canDelete ? (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <DeleteIssueButton
                id={issue.id}
                issueKey={issue.key}
                dashboardId={issue.dashboard.id}
              />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
