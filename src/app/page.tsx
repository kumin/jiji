import type { Prisma } from "@/generated/prisma/client";

import Link from "next/link";

import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER } from "@/lib/issue";
import { buildIssueWhere, parseIssueFilters } from "@/lib/issue-filters";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getStatusCounts, listIssues, resolveDashboard } from "@/lib/queries";
import { currentUser } from "@/lib/require-user";

import { IssueTable } from "@/components/IssueTable";
import { NoDashboards } from "@/components/NoDashboards";

const inputClass =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SORTABLE = ["number", "title", "createdAt", "updatedAt"] as const;

function toOrderBy(raw: Record<string, string | string[] | undefined>) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const sort = first(raw.sort);
  const direction = first(raw.direction) === "asc" ? "asc" : "desc";
  const key = SORTABLE.find((candidate) => candidate === sort) ?? "number";
  return { [key]: direction } as Prisma.IssueOrderByWithRelationInput;
}

export default async function IssuesPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const dashboard = await resolveDashboard(raw.dashboard);
  if (!dashboard) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Issues</h1>
        <NoDashboards canManage={can(await currentUser(), "dashboard:manage")} />
      </div>
    );
  }

  // `dashboard` (from the URL) is the scope; the other params are filters.
  const filters = { ...parseIssueFilters(raw), dashboardId: dashboard.id };
  const scoped = (query: string) => `/?dashboard=${dashboard.id}${query ? `&${query}` : ""}`;
  const [issues, counts, users] = await Promise.all([
    listIssues(buildIssueWhere(filters), toOrderBy(raw)),
    getStatusCounts(dashboard.id),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  const activeCount = issues.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          {dashboard.name} <span className="font-normal text-slate-400">/ Issues</span>
        </h1>
        <span className="text-sm text-slate-500">
          {activeCount} {activeCount === 1 ? "issue" : "issues"}
        </span>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3"
      >
        <input type="hidden" name="dashboard" value={dashboard.id} />
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Search summary or description"
          aria-label="Search issues"
          className={`${inputClass} min-w-56 flex-1`}
        />

        <select
          name="status"
          defaultValue={filters.status ?? ""}
          aria-label="Filter by status"
          className={inputClass}
        >
          <option value="">All statuses</option>
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {STATUS_META[status].label}
            </option>
          ))}
        </select>

        <select
          name="priority"
          defaultValue={filters.priority ?? ""}
          aria-label="Filter by priority"
          className={inputClass}
        >
          <option value="">All priorities</option>
          {PRIORITY_ORDER.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_META[priority].label}
            </option>
          ))}
        </select>

        <select
          name="assigneeId"
          defaultValue={filters.assigneeId ?? ""}
          aria-label="Filter by assignee"
          className={inputClass}
        >
          <option value="">All assignees</option>
          <option value="none">Unassigned</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Apply
        </button>
        <Link
          href={scoped("")}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Reset
        </Link>
      </form>

      <div className="flex flex-wrap gap-2">
        {STATUS_ORDER.map((status) => {
          const active = filters.status === status;
          return (
            <Link
              key={status}
              href={scoped(`status=${status}`)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
                active ? STATUS_META[status].chip : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className={`size-1.5 rounded-full ${STATUS_META[status].dot}`} />
              {STATUS_META[status].label}
              <span className="font-semibold tabular-nums">{counts[status]}</span>
            </Link>
          );
        })}
      </div>

      {issues.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No issues match these filters.
        </p>
      ) : (
        <IssueTable issues={issues} />
      )}
    </div>
  );
}
