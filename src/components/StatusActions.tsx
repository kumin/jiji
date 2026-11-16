"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { IssueStatus } from "@/generated/prisma/enums";

import { STATUS_META, TRANSITIONS } from "@/lib/issue";
import type { IssueDTO } from "@/lib/types";

/**
 * Renders only the transitions the workflow allows from the current status, so
 * the buttons and the server's TRANSITIONS map cannot drift apart.
 */
export function StatusActions({ issue }: { issue: IssueDTO }) {
  const router = useRouter();
  const [pending, setPending] = useState<IssueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targets = TRANSITIONS[issue.status];

  async function move(target: IssueStatus) {
    setPending(target);
    setError(null);
    try {
      const response = await fetch(`/api/issues/${issue.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? `Could not move issue (status ${response.status}).`);
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. The change was not saved.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Move to
      </span>
      <div className="flex flex-wrap gap-2">
        {targets.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => void move(target)}
            disabled={pending !== null}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition disabled:opacity-60 ${STATUS_META[target].chip}`}
          >
            <span className={`size-1.5 rounded-full ${STATUS_META[target].dot}`} />
            {pending === target ? "Moving…" : STATUS_META[target].label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
