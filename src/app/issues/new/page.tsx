import { notFound } from "next/navigation";

import { IssueForm } from "@/components/IssueForm";
import { NoDashboards } from "@/components/NoDashboards";
import { can } from "@/lib/permissions";
import { listDashboards, listUsers } from "@/lib/queries";
import { currentUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewIssuePage({ searchParams }: PageProps) {
  // Viewers can't create issues, so for them this page doesn't exist.
  const actor = await currentUser();
  if (!can(actor, "issue:create")) notFound();

  const raw = (await searchParams).dashboard;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const [users, dashboards] = await Promise.all([listUsers(), listDashboards()]);

  // Preselect the dashboard being viewed; an unknown id just falls back to the first.
  const preselected = dashboards.find((dashboard) => dashboard.id === requested)?.id;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold tracking-tight text-slate-900">Create issue</h1>
      <p className="mb-5 text-sm text-slate-500">
        Tickets are numbered automatically, e.g. <span className="font-mono">JIJI-13</span>.
      </p>
      {dashboards.length === 0 ? (
        <NoDashboards canManage={can(actor, "dashboard:manage")} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <IssueForm users={users} dashboards={dashboards} defaultDashboardId={preselected} />
        </div>
      )}
    </div>
  );
}
