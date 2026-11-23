import { z } from "zod";

import { IssuePriority, IssueStatus } from "@/generated/prisma/enums";

/** `new Date("2026-01-01")` is UTC but `new Date("01/01/2026")` is local. Pin the
 *  interpretation so a due date never shifts a day because of the viewer's TZ. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Empty strings arrive from empty <select>/<input> controls; store them as NULL.
 * Left `.optional()` (rather than `.default(null)`) on purpose: a key the client
 * did not send must stay absent so a PATCH does not clobber the column.
 */
const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

const optionalDate = z
  .union([z.string().regex(ISO_DATE, "Expected YYYY-MM-DD"), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? new Date(`${value}T00:00:00.000Z`) : null));

const issueFields = {
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(255, "Title must be 255 characters or fewer"),
  description: optionalText,
  status: z.enum(IssueStatus),
  priority: z.enum(IssuePriority),
  assigneeId: optionalText,
  dueDate: optionalDate,
  dashboardId: z.string("Dashboard is required").trim().min(1, "Dashboard is required"),
};

/**
 * POST body. `status` and `priority` default to the start of the workflow.
 *
 * `reporterId` is deliberately absent: the reporter is whoever is signed in, so
 * the API sets it from the session and a client cannot forge it.
 */
export const issueCreateSchema = z.object({
  ...issueFields,
  status: issueFields.status.default(IssueStatus.TODO),
  priority: issueFields.priority.default(IssuePriority.MEDIUM),
});

/**
 * PATCH body. Deliberately *not* `issueCreateSchema.partial()`: in Zod 4
 * `.partial()` keeps `.default()` active, so every patch would silently reset
 * the issue's status to To Do and priority to Medium.
 */
export const issuePatchSchema = z.object(issueFields).partial().refine(
  // Guard against `{}`, which would otherwise be a silent no-op write.
  (data) => Object.keys(data).length > 0,
  { message: "Provide at least one field to update" },
);

const dashboardFields = {
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be 80 characters or fewer"),
  // Trim first (via optionalText), then measure, so surrounding whitespace never
  // pushes a valid description over the limit.
  description: optionalText.pipe(
    z.string().max(500, "Description must be 500 characters or fewer").nullable(),
  ),
};

/** POST /api/dashboards body. */
export const dashboardCreateSchema = z.object(dashboardFields);

/** PATCH /api/dashboards/{id} body. Same `.partial()` + non-empty pattern as issues. */
export const dashboardPatchSchema = z
  .object(dashboardFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const transitionSchema = z.object({
  status: z.enum(IssueStatus),
});

/** Flattens a ZodError into `{ fieldName: "message" }` for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    result[key] ??= issue.message;
  }
  return result;
}
