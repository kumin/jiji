"use client";

import { useState } from "react";

import { IssueForm } from "@/components/IssueForm";
import type { IssueDTO, UserDTO } from "@/lib/types";

export function EditIssueSection({
  issue,
  users,
}: {
  issue: IssueDTO;
  users: UserDTO[];
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        Edit issue
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <IssueForm users={users} issue={issue} />
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
      >
        Close editor
      </button>
    </div>
  );
}
