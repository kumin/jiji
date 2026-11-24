"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar, Unassigned } from "@/components/Avatar";
import type { IssueDTO, UserDTO } from "@/lib/types";

/** Change the assignee in place, without opening the full edit form. */
export function AssigneeSelect({
  issue,
  users,
  disabled = false,
}: {
  issue: IssueDTO;
  users: UserDTO[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = issue.assignee?.id ?? "";

  async function assign(assigneeId: string) {
    if (assigneeId === current) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // An empty string means "unassigned" to the API.
        body: JSON.stringify({ assigneeId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.fields?.assigneeId ?? data?.error ?? `Could not change assignee (status ${response.status}).`);
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. The change was not saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {issue.assignee ? <Avatar user={issue.assignee} size={24} /> : <Unassigned size={24} />}
        <select
          aria-label="Assignee"
          value={current}
          disabled={disabled || pending}
          onChange={(event) => void assign(event.target.value)}
          className="min-w-0 flex-1 cursor-pointer rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-slate-900 outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-default disabled:hover:border-transparent disabled:opacity-60"
        >
          <option value="">Unassigned</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
