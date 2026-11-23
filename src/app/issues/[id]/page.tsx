import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { IssueDetail } from "@/components/IssueDetail";
import { getIssue, listDashboards, listUsers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function IssueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [issue, users, dashboards] = await Promise.all([
    getIssue(id),
    listUsers(),
    listDashboards(),
  ]);

  if (!issue) notFound();

  // Keep the issue's own dashboard in the URL, so the header switcher, nav
  // links and "Create issue" all reflect it (they read `?dashboard=`). This also
  // corrects the URL after the issue is moved to another dashboard.
  if (query.dashboard !== issue.dashboard.id) {
    redirect(`/issues/${issue.id}?dashboard=${encodeURIComponent(issue.dashboard.id)}`);
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/?dashboard=${issue.dashboard.id}`}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← All issues
      </Link>
      <IssueDetail issue={issue} users={users} dashboards={dashboards} />
    </div>
  );
}
