"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Role } from "@/generated/prisma/enums";

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

/** Change a user's role in place. The API refuses to demote the last Admin. */
export function RoleSelect({ userId, userName, role }: { userId: string; userName: string; role: Role }) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: Role) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.fields?.role ?? data?.error ?? `Could not change role (status ${response.status}).`);
        setValue(previous);
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. The change was not saved.");
      setValue(previous);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <select
        aria-label={`Role for ${userName}`}
        value={value}
        disabled={pending}
        onChange={(event) => void change(event.target.value as Role)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
      >
        {Object.values(Role).map((option) => (
          <option key={option} value={option}>
            {ROLE_LABELS[option]}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
