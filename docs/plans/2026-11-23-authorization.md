# Plan: Authorization (roles)

Spec: docs/specs/2026-11-23-authorization.md
Branch: feat/authorization
Commands: test `npm test` (with the `jiji-test` preview server running, so the signed-in API tests don't skip) · full check `npm run check` (typecheck + lint + test) · build `npm run build` (stop the dev server first, then restart `jiji-dev`)

Conventions used below:
- **Actor**: `{ id: string; role: Role }`, the signed-in user as permissions see them. It's not called "Viewer", which would clash with the VIEWER role.
- API tests live in `tests/api.test.ts` and sign in through dev-login. A dev-login user's id is read from `client.session()`.
- Commits use the repo identity, with no AI attribution trailers.

## Task 0: Baseline
- [x] `git switch -c feat/authorization` from an up-to-date `main`. Commit the approved spec as the first commit.
- [x] Start the `jiji-test` preview and run `npm run check`. Record the pass, fail and skip counts; expect 117 passing and 0 skipped.

## Task 1: Add the Role enum and User.role
- Files: `prisma/schema.prisma`, `prisma/migrations/<ts>_user_roles/migration.sql` (generated), `prisma/seed.ts`, `src/lib/types.ts`, and the `toUserDTO` helper.
- Test first: in `tests/validation.test.ts` (or a new `tests/user-dto.test.ts`), `toUserDTO` copies `role` onto the DTO.
- Change:
  - Add `enum Role { ADMIN MEMBER VIEWER }` and `role Role @default(MEMBER)` to `User`, then run `npx prisma migrate dev --name user_roles`.
  - The generated SQL must only create the type and add the column with a default; check that before committing.
  - Seed: Ada Lovelace gets `role: "ADMIN"`; the other users keep the default.
  - `UserDTO` gains `role: Role`, and `toUserDTO` copies it.
  - `GET /api/users` returns Prisma rows directly, so `role` appears there with no further change.
- Verify:
  - `npx prisma migrate status` reports the database is up to date.
  - `podman exec jira-postgres psql -U jira -d jira -c 'select role, count(*) from "User" group by role'` shows only MEMBER rows (before re-seeding).
  - `npm run check` is green.
- Covers: AC 1
- [x] Done (note: Prisma 7's `migrate dev` doesn't regenerate the client, so run `npx prisma generate` after it; `UserMenu` takes `Omit<UserDTO, "role">` since the session has no role)

## Task 2: Write the `can()` permission table
- Files: `src/lib/permissions.ts` (new), `tests/permissions.test.ts` (new).
- Test first: `tests/permissions.test.ts` has a table-driven test covering every cell of the spec's table for each role.
  - The cells are see; issue:create; issue:edit; issue:delete on an own issue, another user's issue and an issue with no reporter; dashboard:manage; user:manageRoles.
  - It also checks that `denyReason` returns a non-empty string exactly when `can` is false.
- Change (the module is pure and imports nothing from Prisma at runtime; it only imports the `Role` type from `@/generated/prisma/enums`):
  ```ts
  export type Action = "issue:create" | "issue:edit" | "issue:delete" | "dashboard:manage" | "user:manageRoles";
  export type Actor = { id: string; role: Role };
  export function denyReason(actor: Actor, action: Action, issue?: { reporterId: string | null }): string | null;
  export const can = (actor, action, issue?) => denyReason(actor, action, issue) === null;
  ```
  - The reasons are "Viewers can't create issues", "Viewers can't edit issues", "Viewers can't delete issues", "Members can only delete issues they reported", "Only Admins can manage dashboards" and "Only Admins can change roles".
  - `issue:delete` for a Member without an `issue` argument is denied.
- Verify: `npm test -- --test-name-pattern=permissions` passes, then `npm run check`.
- Covers: AC 13 (unit part)
- [x] Done

## Task 3: Add the `currentUser()` and `authorize()` helpers
- Files: `src/lib/require-user.ts`.
- Test first: none at the unit level, because it needs `auth()` and the database. It's exercised by the API tests in Tasks 5–8, which are written before those routes change.
- Change:
  - `currentUser(): Promise<Actor | null>` reads the session id, then `prisma.user.findUnique({ where: { id }, select: { id: true, role: true } })`, and returns null when there's no session or no row.
  - `authorize(action, issue?)` returns `{ actor }` or a `NextResponse`.
    - With no actor it returns 401 `{ error: "Unauthorized" }`.
    - When `denyReason` gives a reason, it returns 403 `{ error: "Forbidden", reason }`.
  - Keep `currentUserId()` unchanged.
- Verify: `npm run typecheck`, then `npm run check`.
- Covers: groundwork for AC 3–10
- [x] Done

## Task 4: Add role-aware sign-in helpers to the API tests
- Files: `tests/api.test.ts`.
- Test first: this task *is* test code. The suite must stay green with no route changes yet.
- Change:
  - Add `async function signInAs(client, name, role: "ADMIN" | "MEMBER" | "VIEWER" = "MEMBER")`.
    - It dev-logs in with a `unique()` email, reads `session().user.id` and sets the role with `prisma.user.update`. It returns the id.
    - It sets the role through Prisma because nothing in the API can promote yourself, which is the point of this feature.
  - Switch every `describe`'s `before` to `signInAs`:
    - `"dashboards"` signs in as `ADMIN`.
    - Everything else stays `MEMBER`, because the issue tests delete only issues they created themselves.
  - Change the top-level `after` cleanup to delete the `created` issues with `prisma.issue.deleteMany({ where: { id: { in: created } } })` instead of an API call by a fresh Member, who will soon be refused.
- Verify: `npm test` shows the same counts as the baseline, with 0 skipped.
- [x] Done

## Task 5: Enforce permissions on the issue endpoints
- Files:
  - `src/app/api/issues/route.ts` (POST)
  - `src/app/api/issues/[id]/route.ts` (PATCH, DELETE)
  - `src/app/api/issues/[id]/transition/route.ts`
  - `tests/api.test.ts`
- Test first: a new `describe("issue permissions")` signs in three clients (`ADMIN`, `MEMBER`, `VIEWER`) and a second Member. The setup creates one issue as Member A and one with `reporterId: null` via Prisma, both in `testDashboardId`. The tests:
  - Viewer:
    - POST, PATCH, `/transition` and DELETE each return 403 with `error: "Forbidden"` and a `reason`.
    - Afterwards a GET shows the issue unchanged.
    - `GET /api/issues` and `GET /api/issues/{id}` return 200.
    - A Viewer PATCH with an invalid body still returns 403, not 400, which proves the check runs before validation.
  - Member B:
    - Can PATCH Member A's issue fields, assignee and `dashboardId` (with a second dashboard made via Prisma), and POST `/transition` on it.
    - DELETE on A's issue returns 403, as does DELETE on the issue with no reporter. Both issues still exist.
  - Member A gets 204 deleting their own issue.
  - Admin gets 204 deleting the issue with no reporter and another Member's issue.
  - With no session, all four endpoints return 401, as today. The existing "authentication" test already covers this; keep it passing.
- Change:
  - POST, PATCH and transition call `authorize("issue:create"/"issue:edit")` first, before parsing the body.
  - POST keeps using `actor.id` as the `reporterId`.
  - DELETE:
    - First calls `authorize("issue:edit")`. Only a Viewer fails this, so a Viewer gets 403 before any lookup.
    - Then loads `{ reporterId }` and returns 404 if the issue is missing.
    - Then checks `denyReason(actor, "issue:delete", issue)` and returns 403 with that reason if it's denied.
- Verify: `npm test` with the new tests failing before the change and passing after it; then `npm run check`.
- Covers: AC 3, 4, 5, 6, 10
- [x] Done (the dev server caches the Prisma client, so restart it after a migration)

## Task 6: Enforce permissions on the dashboard endpoints
- Files:
  - `src/app/api/dashboards/route.ts` (POST)
  - `src/app/api/dashboards/[id]/route.ts` (PATCH, DELETE)
  - `tests/api.test.ts`
- Test first: in `describe("dashboard permissions")`, Member and Viewer each get 403 on POST, PATCH and DELETE, and the target dashboard's name and existence are unchanged afterwards. The existing `"dashboards"` describe, now running as Admin, still passes, including its 409 cases.
- Change: replace the `currentUserId()` check with `authorize("dashboard:manage")` before parsing.
- Verify: `npm test`, then `npm run check`.
- Covers: AC 7, 10
- [x] Done

## Task 7: Promote ADMIN_EMAILS users to Admin on sign-in
- Files:
  - `src/lib/admin-emails.ts` (new) and `tests/admin-emails.test.ts` (new)
  - `src/lib/auth.ts`
  - `.claude/launch.json`
  - `.env.example`, `README.md`
  - `tests/api.test.ts`
- Test first:
  - Unit tests:
    - `parseAdminEmails(" A@x.com, b@y.com ,,")` returns `["a@x.com","b@y.com"]`.
    - `isAdminEmail("a@X.com", list)` is true.
    - An empty or unset variable gives `[]`.
  - API test:
    - Dev-login as `e2e-admin@example.com` gives role `ADMIN` in the database, both on the first sign-in and after setting it to MEMBER via Prisma and signing in again.
    - A different new user is `MEMBER`.
    - An existing Viewer who signs in again stays `VIEWER`.
- Change:
  - Add the helpers above. They read `process.env.ADMIN_EMAILS`.
  - In `auth.ts`, add `events.signIn({ user })`: if `isAdminEmail(user.email)`, run `prisma.user.updateMany({ where: { email: { equals: user.email, mode: "insensitive" } }, data: { role: "ADMIN" } })`.
    - This is an *event*, not the `signIn` callback the spec names. For a brand-new Google user the adapter creates the row only after the callback returns, so the callback has nothing to update yet. Events run after the row exists, for both Google and dev-login.
    - A failed promotion is only logged, which is acceptable because it never grants access by mistake.
    - Never demote.
  - Add `"ADMIN_EMAILS": "e2e-admin@example.com"` to the `jiji-test` env in `.claude/launch.json`.
  - Document `ADMIN_EMAILS` in `.env.example` and `README.md`. The user's real `.env` gets their own Gmail address, but only with their OK.
- Verify: restart `jiji-test`, run `npm test`, then `npm run check`.
- Covers: AC 2
- [x] Done (the real .env is left alone until Task 12)

## Task 8: Add PATCH /api/users/{id} to change a role
- Files:
  - `src/lib/validation.ts` (add `userRolePatchSchema = z.object({ role: z.enum(Role) })`) and `tests/validation.test.ts`
  - `src/app/api/users/[id]/route.ts` (new)
  - `tests/api.test.ts`
- Test first:
  - Unit test: the schema accepts each of the three roles and rejects `"OWNER"` and a missing role.
  - API tests:
    - Admin PATCH `{role:"VIEWER"}` on a Member returns 200 with `user.role === "VIEWER"`. That user's very next `POST /api/issues`, with no new sign-in, returns 403.
    - `{role:"OWNER"}` returns 400 with `fields.role`.
    - An unknown id returns 404.
    - Member and Viewer PATCH return 403.
    - Last-Admin guard:
      - Setup: in a `before`, demote every existing Admin to MEMBER via Prisma and remember them; the `after` restores them. Then the test Admin is the only Admin.
      - Demoting that Admin, including the Admin demoting themself, returns 409 `{ error: "At least one Admin is required" }`.
      - Setting an Admin to `ADMIN` again returns 200.
    - With no session, the endpoint returns 401.
- Change: the route does `authorize("user:manageRoles")`, then parses (400), then looks up the user (404).
  - If the target is an Admin and the new role isn't ADMIN, it counts the other Admins inside `prisma.$transaction` and returns 409 when there are none.
  - Otherwise it updates and returns `{ user: toUserDTO(row) }`.
- Verify: `npm test`, then `npm run check`.
- Covers: AC 8, 9
- [ ] Done

## Task 9: Gate the issue UI by role
- Files:
  - `src/app/layout.tsx`, `src/components/CreateIssueLink.tsx`
  - `src/components/IssueDetail.tsx`, `StatusSelect.tsx`, `AssigneeSelect.tsx`, `DeleteIssueButton.tsx` (callers), `EditIssueSection.tsx`
  - `src/app/issues/[id]/page.tsx`, `src/app/@modal/(.)issues/[id]/page.tsx`
  - `src/app/board/page.tsx`, `src/components/Board.tsx`
  - `src/app/issues/new/page.tsx`
  - `tests/api.test.ts`
- Test first: in `describe("role-aware pages")`, fetch HTML with each role's cookie:
  - Viewer:
    - The `/` HTML has no "Create issue" link.
    - `/issues/<id>` has no "Delete" or "Edit" button, and the Status and Assignee `<select>`s carry `disabled`.
    - The `/board` HTML has no `draggable="true"`.
    - `/issues/new` returns 404.
  - Member viewing another user's issue: no "Delete" button, but the Edit button and enabled selects are present.
  - Member on their own issue: "Delete" is present.
- Change:
  - Pages call `currentUser()` and pass an `actor` prop down.
  - `IssueDetail` takes `actor`:
    - Shows Edit when `can(actor,"issue:edit")`.
    - Shows Delete when `can(actor,"issue:delete",{ reporterId: issue.reporter?.id ?? null })`.
    - Passes `disabled={!canEdit}` to `StatusSelect` and `AssigneeSelect`. Both accept a `disabled` prop.
  - `layout.tsx` renders `CreateIssueLink` only when `can(actor,"issue:create")`.
  - `Board` takes `canEdit`. When it's false, cards render without `draggable` or drag handlers, and the drop handlers do nothing.
  - `/issues/new` calls `notFound()` when the actor can't create issues.
- Verify: `npm test` and `npm run check`. In the browser, check the list, board, popup and full page as Viewer and Member with screenshots.
- Covers: AC 11 (issues part)
- [ ] Done

## Task 10: Gate the dashboards page by role
- Files: `src/app/dashboards/page.tsx`, `src/components/DashboardManager.tsx`, `tests/api.test.ts`.
- Test first: the Member and Viewer `/dashboards` HTML has no "Create dashboard" form, Rename or Delete controls, but still lists the dashboards. The Admin HTML has all three.
- Change: the page passes `canManage = can(actor,"dashboard:manage")`, and `DashboardManager` hides its create form and per-row Rename and Delete when `canManage` is false.
- Verify: `npm test`, `npm run check`, and a browser check as Member and Admin.
- Covers: AC 11 (dashboards part)
- [ ] Done

## Task 11: Add the Users page and nav link
- Files:
  - `src/app/users/page.tsx` (new), `src/components/RoleSelect.tsx` (new)
  - `src/components/NavLinks.tsx`, `src/app/layout.tsx`
  - `tests/api.test.ts`
- Test first:
  - Member and Viewer get 404 on `/users`, and their layout HTML has no `href="/users"` link.
  - The Admin gets 200 from `/users`. The page lists every user's email and a `<select aria-label="Role for <name>">` with the current role selected, and the nav contains `href="/users"`.
- Change:
  - The page calls `notFound()` unless `can(actor,"user:manageRoles")`. It lists `listUsers()` in a table (avatar, name, email, role).
  - `RoleSelect` is a client component.
    - On change it does `PATCH /api/users/{id}`, then `router.refresh()`.
    - It shows the API's `error` inline on failure, for example the last-Admin 409, and reverts the select.
  - `NavLinks` takes `showUsers`, and `layout.tsx` passes `can(actor,"user:manageRoles")`.
- Verify: `npm test`, `npm run check`. In the browser as Admin: change a role, see it persist after a reload, and try to demote the last Admin to see the error.
- Covers: AC 12
- [ ] Done

## Task 12: Final check
- [ ] With `jiji-test` running, `npm run check` shows everything green and 0 skipped.
- [ ] Stop the server and run `npm run build`; it passes. Restart `jiji-dev`.
- [ ] Prove on a scratch database that the migration plus seed applies cleanly: `migrate deploy` then `db seed`, and Ada is ADMIN.
- [ ] Ask the user before adding their own email to `ADMIN_EMAILS` in `.env`, so they're an Admin locally.
- Covers: AC 13

## Acceptance criteria coverage
| AC | Task(s) |
|----|---------|
| 1  | 1 |
| 2  | 7 |
| 3  | 5 |
| 4  | 5 |
| 5  | 5 |
| 6  | 5 |
| 7  | 6 |
| 8  | 8 |
| 9  | 8 |
| 10 | 5, 6, 8 |
| 11 | 9, 10 |
| 12 | 11 |
| 13 | 2, 12 |

## Deviations from the spec
- The ADMIN_EMAILS promotion runs in `events.signIn` rather than the `signIn` callback (Task 7). The behaviour the spec describes is unchanged; only the hook differs, because a new Google user's row doesn't exist yet when the callback runs.
- `/issues/new` returns 404 for Viewers (Task 9). The spec only said to hide the link, and this follows the same rule as `/users`.
