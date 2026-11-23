"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DashboardDTO } from "@/lib/types";

const fieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const primaryButton =
  "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50";
const secondaryButton =
  "rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50";

type ApiError = { error?: string; fields?: Record<string, string> };

/** The most specific message the API gave, for showing inline. */
function messageFrom(body: ApiError | null, fallback: string): string {
  return body?.fields?.name ?? body?.fields?.description ?? body?.error ?? fallback;
}

async function send(url: string, method: string, payload?: unknown): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (response.ok) return null;
    const body = (await response.json().catch(() => null)) as ApiError | null;
    return messageFrom(body, `Request failed (${response.status})`);
  } catch {
    return "Network error. Try again.";
  }
}

export function DashboardManager({ dashboards }: { dashboards: DashboardDTO[] }) {
  return (
    <div className="space-y-4">
      <CreateDashboardForm />
      {dashboards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No dashboards yet. Create one above.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {dashboards.map((dashboard) => (
            <DashboardRow key={dashboard.id} dashboard={dashboard} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateDashboardForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const failure = await send("/api/dashboards", "POST", { name, description });
    setSaving(false);
    setError(failure);
    if (!failure) {
      // Only clear on success, so a rejected name stays in the box to fix.
      setName("");
      setDescription("");
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New dashboard name"
          aria-label="New dashboard name"
          className={`${fieldClass} min-w-48 flex-1`}
        />
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description (optional)"
          aria-label="New dashboard description"
          className={`${fieldClass} min-w-48 flex-[2]`}
        />
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? "Creating…" : "Create dashboard"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

function DashboardRow({ dashboard }: { dashboard: DashboardDTO }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dashboard.name);
  const [description, setDescription] = useState(dashboard.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasIssues = dashboard.issueCount > 0;
  const issueLabel = `${dashboard.issueCount} ${dashboard.issueCount === 1 ? "issue" : "issues"}`;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const failure = await send(`/api/dashboards/${dashboard.id}`, "PATCH", { name, description });
    setBusy(false);
    setError(failure);
    if (!failure) {
      setEditing(false);
      router.refresh();
    }
  }

  async function remove() {
    if (!confirm(`Delete the dashboard "${dashboard.name}"? This cannot be undone.`)) return;
    setBusy(true);
    const failure = await send(`/api/dashboards/${dashboard.id}`, "DELETE");
    setBusy(false);
    setError(failure);
    if (!failure) router.refresh();
  }

  if (editing) {
    return (
      <li className="p-4">
        <form onSubmit={save} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Dashboard name"
              className={`${fieldClass} min-w-48 flex-1`}
              autoFocus
            />
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description (optional)"
              aria-label="Dashboard description"
              className={`${fieldClass} min-w-48 flex-[2]`}
            />
            <button type="submit" disabled={busy} className={primaryButton}>
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              className={secondaryButton}
              onClick={() => {
                setEditing(false);
                setError(null);
                setName(dashboard.name);
                setDescription(dashboard.description ?? "");
              }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start gap-3 p-4">
      <div className="min-w-0 flex-1">
        <Link
          href={`/?dashboard=${dashboard.id}`}
          className="font-medium text-slate-900 hover:text-blue-700"
        >
          {dashboard.name}
        </Link>
        {dashboard.description && (
          <p className="mt-0.5 text-sm text-slate-500">{dashboard.description}</p>
        )}
        <p className="mt-1 text-xs text-slate-500">{issueLabel}</p>
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-1">
          <button type="button" disabled={busy} className={secondaryButton} onClick={() => setEditing(true)}>
            Rename
          </button>
          <button
            type="button"
            disabled={busy || hasIssues}
            onClick={remove}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
          >
            Delete
          </button>
        </div>
        {hasIssues && (
          <p className="text-xs text-slate-500">Move or delete its {issueLabel} first</p>
        )}
      </div>
    </li>
  );
}
