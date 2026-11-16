"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteIssueButton({ id, issueKey }: { id: string; issueKey: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/issues/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? `Could not delete issue (status ${response.status}).`);
        setPending(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not reach the server. The issue was not deleted.");
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        Delete <span className="font-mono">{issueKey}</span>? This cannot be undone.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void onDelete()}
          disabled={pending}
          className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
