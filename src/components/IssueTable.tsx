import Link from "next/link";

import { describeDue } from "@/lib/dates";
import type { IssueDTO } from "@/lib/types";

import { AssigneeChip } from "@/components/Avatar";
import { PriorityGlyph } from "@/components/Priority";
import { StatusBadge } from "@/components/StatusBadge";

export function IssueTable({ issues }: { issues: IssueDTO[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-3 py-2 font-semibold">
              Key
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Summary
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Status
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Priority
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Assignee
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Due
            </th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => {
            const due = describeDue(issue.dueDate, issue.status);
            return (
              <tr key={issue.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">
                  {issue.key}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/issues/${issue.id}`}
                    className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
                  >
                    {issue.title}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={issue.status} />
                </td>
                <td className="px-3 py-2">
                  <PriorityGlyph priority={issue.priority} />
                </td>
                <td className="px-3 py-2">
                  <AssigneeChip user={issue.assignee} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-sm">
                  {due ? <span className={due.className}>{due.label}</span> : <span className="text-slate-400">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
