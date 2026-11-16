import Link from "next/link";
import { notFound } from "next/navigation";

import { AssigneeChip } from "@/components/Avatar";
import { DeleteIssueButton } from "@/components/DeleteIssueButton";
import { EditIssueSection } from "@/components/EditIssueSection";
import { PriorityLabel } from "@/components/Priority";
import { StatusActions } from "@/components/StatusActions";
import { StatusBadge } from "@/components/StatusBadge";
import { describeDue, formatDate } from "@/lib/dates";
import { getIssue, listUsers } from "@/lib/queries";

export const dynamic = "force-dynamic";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [issue, users] = await Promise.all([getIssue(id), listUsers()]);

  if (!issue) notFound();

  const due = describeDue(issue.dueDate, issue.status);

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
        ← All issues
      </Link>

      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-1 font-mono text-sm text-slate-500">{issue.key}</span>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{issue.title}</h1>
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

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Edit</h2>
            <EditIssueSection issue={issue} users={users} />
          </section>
        </div>

        <aside className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-4">
              <StatusBadge status={issue.status} />
            </div>
            <StatusActions issue={issue} />
          </div>

          <dl className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
            <Field label="Priority">
              <PriorityLabel priority={issue.priority} />
            </Field>
            <Field label="Assignee">
              <AssigneeChip user={issue.assignee} />
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

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <DeleteIssueButton id={issue.id} issueKey={issue.key} />
          </div>
        </aside>
      </div>
    </div>
  );
}
