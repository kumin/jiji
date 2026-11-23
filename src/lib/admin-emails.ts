/**
 * `ADMIN_EMAILS` lists the people who should always be Admins, so a fresh
 * install (or one where every Admin was demoted) has a way in. Listed users are
 * promoted on each sign-in; removing an address never demotes anyone.
 */
export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(
  email: string | null | undefined,
  list: string[] = parseAdminEmails(process.env.ADMIN_EMAILS),
): boolean {
  return Boolean(email) && list.includes(email!.trim().toLowerCase());
}
