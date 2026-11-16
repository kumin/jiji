"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { IssueStatus } from "@/generated/prisma/enums";

import { describeDue } from "@/lib/dates";
import { STATUS_META, STATUS_ORDER, TRANSITIONS } from "@/lib/issue";
import type { IssueDTO } from "@/lib/types";

import { Avatar, Unassigned } from "@/components/Avatar";
import { PriorityGlyph } from "@/components/Priority";

export function Board({ issues, now }: { issues: IssueDTO[]; now: string }) {
  const router = useRouter();

  // Fixed at SSR time and reused on hydration, so the due-date text matches.
  const renderTime = useMemo(() => new Date(now), [now]);

  // Optimistic local copy so a card lands in its new column before the
  // round-trip finishes; `router.refresh()` reconciles with the server.
  const [cards, setCards] = useState<IssueDTO[]>(issues);
  const [dragging, setDragging] = useState<{ id: string; from: IssueStatus } | null>(null);
  const [dropTarget, setDropTarget] = useState<IssueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `useState(issues)` only reads the *initial* value, so every later render
  // (a `router.refresh()` after a drop, or a change made by another user)
  // would otherwise be ignored. Re-seed when the server sends a new array.
  const [syncedFrom, setSyncedFrom] = useState(issues);
  if (syncedFrom !== issues) {
    setSyncedFrom(issues);
    setCards(issues);
  }

  const byStatus = useMemo(() => {
    const grouped = new Map<IssueStatus, IssueDTO[]>(STATUS_ORDER.map((s) => [s, []]));
    for (const issue of cards) grouped.get(issue.status)?.push(issue);
    return grouped;
  }, [cards]);

  function onDragStart(issue: IssueDTO) {
    setError(null);
    setDragging({ id: issue.id, from: issue.status });
  }

  function onDragEnd() {
    setDragging(null);
    setDropTarget(null);
  }

  async function onDrop(target: IssueStatus) {
    if (!dragging || dragging.from === target) {
      onDragEnd();
      return;
    }

    const { id, from } = dragging;
    onDragEnd();

    if (!TRANSITIONS[from].includes(target)) {
      setError(`${STATUS_META[from].label} cannot move straight to ${STATUS_META[target].label}.`);
      return;
    }

    setError(null);
    setCards((current) =>
      current.map((issue) => (issue.id === id ? { ...issue, status: target } : issue)),
    );

    // A failed move must not leave the card sitting in a column the server
    // rejected, so put it back where it came from.
    const revert = () =>
      setCards((current) =>
        current.map((issue) => (issue.id === id ? { ...issue, status: from } : issue)),
      );

    try {
      const response = await fetch(`/api/issues/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? `Could not move issue (status ${response.status}).`);
        revert();
        return;
      }

      router.refresh();
    } catch {
      setError("Could not reach the server. The change was not saved.");
      revert();
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STATUS_ORDER.map((status) => {
          const column = byStatus.get(status) ?? [];
          // While dragging, columns the workflow forbids are dimmed and
          // refuse drops, so illegal moves are impossible rather than rejected.
          const reachable = dragging ? TRANSITIONS[dragging.from].includes(status) : true;
          const isTarget = dropTarget === status && reachable;

          return (
            <section
              key={status}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                if (reachable) setDropTarget(status);
              }}
              onDragLeave={() => setDropTarget((current) => (current === status ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                void onDrop(status);
              }}
              aria-label={STATUS_META[status].label}
              className={`flex min-h-64 flex-col rounded-lg border bg-slate-50/60 transition ${
                isTarget ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200"
              } ${dragging && !reachable ? "opacity-40" : ""}`}
            >
              <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                <span className={`size-2 rounded-full ${STATUS_META[status].dot}`} />
                <h2 className="text-sm font-semibold text-slate-700">
                  {STATUS_META[status].label}
                </h2>
                <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                  {column.length}
                </span>
              </header>

              <ul className="flex flex-1 flex-col gap-2 p-2">
                {column.map((issue) => {
                  const due = describeDue(issue.dueDate, issue.status, renderTime);
                  return (
                    <li
                      key={issue.id}
                      draggable
                      onDragStart={() => onDragStart(issue)}
                      onDragEnd={onDragEnd}
                      className={`cursor-grab rounded-md border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow active:cursor-grabbing ${
                        dragging?.id === issue.id ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5">
                          <PriorityGlyph priority={issue.priority} />
                        </span>
                        <Link
                          href={`/issues/${issue.id}`}
                          className="text-sm font-medium text-slate-900 hover:text-blue-700 hover:underline"
                        >
                          {issue.title}
                        </Link>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{issue.key}</span>
                        {due ? (
                          <span className={`text-xs ${due.className}`}>{due.label}</span>
                        ) : null}
                        <span className="ml-auto">
                          {issue.assignee ? <Avatar user={issue.assignee} size={22} /> : <Unassigned size={22} />}
                        </span>
                      </div>
                    </li>
                  );
                })}
                {column.length === 0 ? (
                  <li className="px-1 py-6 text-center text-xs text-slate-400">Empty</li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
