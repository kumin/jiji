"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { IssueStatus } from "@/generated/prisma/enums";

import { STATUS_META, TRANSITIONS } from "@/lib/issue";
import type { IssueDTO } from "@/lib/types";

/**
 * Status as a dropdown. Offers only the current status and the moves the
 * workflow allows from it, and saves through the transition endpoint, so the
 * dropdown and the server's TRANSITIONS rules cannot drift apart.
 */
export function StatusSelect({ issue }: { issue: IssueDTO }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = [issue.status, ...TRANSITIONS[issue.status]];

  async function move(target: IssueStatus) {
    if (target === issue.status) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/issues/${issue.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? `Could not change status (status ${response.status}).`);
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. The change was not saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="relative inline-flex items-center">
        <span
          className={`pointer-events-none absolute left-3 size-2 rounded-full ${STATUS_META[issue.status].dot}`}
        />
        <select
          aria-label="Status"
          value={issue.status}
          disabled={pending}
          onChange={(event) => void move(event.target.value as IssueStatus)}
          className={`cursor-pointer appearance-none rounded-md py-1.5 pl-7 pr-8 text-sm font-semibold ring-1 ring-inset outline-none transition focus:ring-2 focus:ring-blue-300 disabled:opacity-60 ${STATUS_META[issue.status].chip}`}
        >
          {options.map((status) => (
            <option key={status} value={status}>
              {STATUS_META[status].label}
            </option>
          ))}
        </select>
        <span aria-hidden className="pointer-events-none absolute right-2.5 text-xs text-slate-500">
          ▾
        </span>
      </div>
      {pending ? <p className="text-xs text-slate-500">Saving…</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
