"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";

import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER } from "@/lib/issue";
import { toDateInputValue } from "@/lib/dates";
import type { IssueDTO, UserDTO } from "@/lib/types";

const fieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

type Props = {
  users: UserDTO[];
  /** Omit to render a create form; pass an issue to render the edit form. */
  issue?: IssueDTO;
};

type Errors = Record<string, string>;

export function IssueForm({ users, issue }: Props) {
  const router = useRouter();
  const editing = Boolean(issue);

  const [title, setTitle] = useState(issue?.title ?? "");
  const [description, setDescription] = useState(issue?.description ?? "");
  const [status, setStatus] = useState<IssueStatus>(issue?.status ?? IssueStatus.TODO);
  const [priority, setPriority] = useState<IssuePriority>(issue?.priority ?? IssuePriority.MEDIUM);
  const [assigneeId, setAssigneeId] = useState(issue?.assignee?.id ?? "");
  const [dueDate, setDueDate] = useState(toDateInputValue(issue?.dueDate ?? null));

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);

    const payload = {
      title,
      description,
      status,
      priority,
      assigneeId,
      dueDate,
    };

    try {
      const response = await fetch(
        editing ? `/api/issues/${issue!.id}` : "/api/issues",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const fields = (data?.fields as Errors | undefined) ?? {};
        setErrors(fields);
        setFormError(fields._form ?? data?.error ?? `Request failed with status ${response.status}`);
        setSaving(false);
        return;
      }

      const data = await response.json();
      router.push(`/issues/${data.issue.id}`);
      router.refresh();
    } catch {
      setFormError("Could not reach the server. Is the database running?");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {formError ? (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {formError}
        </p>
      ) : null}

      <div>
        <label htmlFor="title" className={labelClass}>
          Summary
        </label>
        <input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs to be done?"
          className={fieldClass}
          aria-invalid={Boolean(errors.title)}
          autoFocus
        />
        {errors.title ? <p className="mt-1 text-sm text-rose-600">{errors.title}</p> : null}
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={5}
          placeholder="Add context, acceptance criteria, links…"
          className={`${fieldClass} resize-y`}
        />
        {errors.description ? (
          <p className="mt-1 text-sm text-rose-600">{errors.description}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as IssueStatus)}
            className={fieldClass}
          >
            {STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {STATUS_META[value].label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as IssuePriority)}
            className={fieldClass}
          >
            {PRIORITY_ORDER.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_META[value].label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="assigneeId" className={labelClass}>
            Assignee
          </label>
          <select
            id="assigneeId"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            className={fieldClass}
          >
            <option value="">Unassigned</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="dueDate" className={labelClass}>
            Due date
          </label>
          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className={fieldClass}
          />
          {errors.dueDate ? <p className="mt-1 text-sm text-rose-600">{errors.dueDate}</p> : null}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Create issue"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
