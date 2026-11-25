"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ApiTokenDTO } from "@/lib/types";

const fieldClass =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const primaryButton =
  "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50";
const secondaryButton =
  "rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50";

const EXPIRY_CHOICES = [7, 30, 90, 365] as const;

type ApiError = { error?: string; fields?: Record<string, string> };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TokenManager({ tokens }: { tokens: ApiTokenDTO[] }) {
  return (
    <div className="space-y-4">
      <CreateTokenForm />
      {tokens.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No tokens yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Token</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Last used</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tokens.map((token) => (
                <TokenRow key={token.id} token={token} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateTokenForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number>(30);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setCopied(false);
    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expiresInDays }),
      });
      const body = (await response.json().catch(() => null)) as
        | (ApiError & { token?: string })
        | null;
      if (!response.ok || !body?.token) {
        setErrors(body?.fields ?? { _form: body?.error ?? `Request failed (${response.status})` });
        return;
      }
      setErrors({});
      setName("");
      setCreated(body.token);
      router.refresh();
    } catch {
      setErrors({ _form: "Network error. Try again." });
    } finally {
      setSaving(false);
    }
  }

  const command = created
    ? `claude mcp add --transport http jiji ${window.location.origin}/api/mcp ` +
      `--header "Authorization: Bearer ${created}"`
    : "";

  async function copy(text: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
        <div className="min-w-48 flex-1">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Token name, e.g. Claude Code laptop"
            aria-label="Token name"
            className={`${fieldClass} w-full`}
          />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
        </div>
        <div>
          <select
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(Number(event.target.value))}
            aria-label="Expires in"
            className={fieldClass}
          >
            {EXPIRY_CHOICES.map((days) => (
              <option key={days} value={days}>
                Expires in {days} days
              </option>
            ))}
          </select>
          {errors.expiresInDays && (
            <p className="mt-1 text-sm text-red-600">{errors.expiresInDays}</p>
          )}
        </div>
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? "Creating…" : "Create token"}
        </button>
      </form>
      {errors._form && (
        <p role="alert" className="text-sm text-red-600">
          {errors._form}
        </p>
      )}
      {created && (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">
            Copy this token now. You won&apos;t see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-800">
              {created}
            </code>
            <button type="button" onClick={() => copy(created)} className={secondaryButton}>
              Copy
            </button>
          </div>
          <p className="text-amber-900">Add Jiji to Claude Code with:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-800">
              {command}
            </code>
            <button type="button" onClick={() => copy(command)} className={secondaryButton}>
              Copy
            </button>
          </div>
          {copied && <p className="text-xs text-amber-800">Copied.</p>}
          <button type="button" onClick={() => setCreated(null)} className={secondaryButton}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function TokenRow({ token }: { token: ApiTokenDTO }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expired = new Date(token.expiresAt).getTime() <= Date.now();

  async function revoke() {
    if (!confirm(`Revoke the token "${token.name}"? Anything using it will stop working.`)) return;
    setBusy(true);
    const response = await fetch(`/api/tokens/${token.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      router.refresh();
    } else {
      setError("Couldn't revoke the token. Try again.");
    }
  }

  return (
    <tr className={expired ? "text-slate-400" : "text-slate-700"}>
      <td className="px-4 py-2 font-medium">{token.name}</td>
      <td className="px-4 py-2 font-mono text-xs">{token.prefix}…</td>
      <td className="px-4 py-2">{formatDate(token.createdAt)}</td>
      <td className="px-4 py-2">{token.lastUsedAt ? formatDate(token.lastUsedAt) : "Never"}</td>
      <td className="px-4 py-2">
        {expired ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
            Expired
          </span>
        ) : (
          formatDate(token.expiresAt)
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <button type="button" onClick={revoke} disabled={busy} className={secondaryButton}>
          {busy ? "Revoking…" : "Revoke"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
