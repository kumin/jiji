import type { ActionError } from "@/lib/issue-actions";

/**
 * Turns an issue-action failure into one sentence Claude can act on: who may
 * not do what, which fields are wrong, or which statuses an issue may move to.
 */
export function formatActionError({ body }: ActionError): string {
  if (body.reason) return `${body.error}: ${body.reason}`;
  if (body.fields) {
    const fields = Object.entries(body.fields).map(([field, message]) => `${field}: ${message}`);
    return `${body.error}: ${fields.join("; ")}`;
  }
  if (body.allowed) return `${body.error} (allowed: ${body.allowed.join(", ")})`;
  return body.error;
}
