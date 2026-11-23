# Authorization (roles)

Ticket: none (feature request in chat, 2026-11-23)
Status: Approved

## Problem
Any signed-in user can do anything in Jiji: create, rename and delete any dashboard, and create, edit, move or delete any issue. The only check on a write is "is someone signed in". A team needs read-only users, a few people who manage dashboards, and protection against one member deleting another member's work.

## Scope
- In: one global role per user (Admin, Member or Viewer), enforced in every write endpoint. A new user starts as a Member. Emails listed in `ADMIN_EMAILS` become Admins on sign-in. Admins can change anyone's role on a new Users page. The UI hides or disables controls the user isn't allowed to use.
- Out (not doing now): per-dashboard membership or roles, hiding dashboards from some users, custom roles, an audit log of role changes, inviting users who haven't signed in yet, removing users.

## Design
### Permissions
| Action | Viewer | Member | Admin |
|---|---|---|---|
| See dashboards, issues and users | ✓ | ✓ | ✓ |
| Create an issue | ✗ | ✓ | ✓ |
| Edit an issue (fields, status, assignee, move dashboard) | ✗ | ✓ any issue | ✓ |
| Delete an issue | ✗ | only issues they reported | ✓ |
| Create, rename or delete a dashboard | ✗ | ✗ | ✓ |
| Change a user's role | ✗ | ✗ | ✓ |

### Components touched
- `prisma/schema.prisma` plus a migration: `Role` enum and `User.role`.
- `src/lib/permissions.ts` (new): a pure `can(user, action, issue?)` function holding the table above, so the API and the UI share one source of truth.
- `src/lib/require-user.ts`: a new `currentUser()` returns `{ id, role }`, read from the database on each request, so a role change takes effect immediately instead of waiting for the session to expire. `currentUserId()` stays for existing callers.
- `src/lib/auth.ts`: on sign-in (Google and dev-login), an `events.signIn` handler promotes an email in `ADMIN_EMAILS` to Admin.
- Write endpoints check `can(...)` and return 403: `POST /api/issues`; `PATCH` and `DELETE /api/issues/{id}`; `POST /api/issues/{id}/transition`; `POST /api/dashboards`; `PATCH` and `DELETE /api/dashboards/{id}`.
- `src/app/api/users/[id]/route.ts` (new): `PATCH` to change a role. `GET /api/users` adds `role`.
- UI: `src/app/users/page.tsx` (new, Admins only), a "Users" nav link for Admins, and hidden or disabled controls in `layout.tsx` ("Create issue"), `IssueDetail` (Edit, Delete, `StatusSelect`, `AssigneeSelect`), `Board` (drag), and `DashboardManager` (create, rename, delete).
- `.env.example` and `README.md`: document `ADMIN_EMAILS`.

### API / interface
A forbidden write returns **403** `{ "error": "Forbidden", "reason": "..." }`, for example `"reason": "Viewers can't edit issues"`. The 401 response for "not signed in" is unchanged. The permission check runs after the 401 check and before validation, so a Viewer can't probe which inputs would be valid.

`PATCH /api/users/{id}` (Admins only)
```json
// request
{ "role": "VIEWER" }
// 200
{ "user": { "id": "u2", "name": "Grace", "email": "grace@example.com", "role": "VIEWER", "...": "..." } }
```
- `role` must be `ADMIN`, `MEMBER` or `VIEWER`; anything else returns 400 `fields.role`.
- An unknown id returns 404.
- Demoting the last Admin, including yourself, returns 409 `{ "error": "At least one Admin is required" }`.

`GET /api/users` adds `role` to each user, and `UserDTO` gains `role`.

### Data
```prisma
enum Role {
  ADMIN
  MEMBER
  VIEWER
}

model User {
  // ...existing fields...
  role Role @default(MEMBER)
}
```
The migration adds the column with default `MEMBER`, so every existing user becomes a Member, and nothing else changes. `ADMIN_EMAILS` is a comma-separated list of emails compared without regard to case, for example `ADMIN_EMAILS="you@gmail.com"`. Listed users are promoted on each sign-in; removing an email from the list does **not** demote anyone, which is done on the Users page. In the seed data, Ada Lovelace is an Admin.

### Flow
1. A user signs in, and their row is created as usual (default `MEMBER`). Then the `events.signIn` handler sets `role = ADMIN` if their email is in `ADMIN_EMAILS`. It's an event, not the `signIn` callback, because a first-time Google user's row only exists after the callback returns.
2. On each write request, the route calls `currentUser()` (session, then a database lookup of the role). If there's no user it returns 401; if `can(user, action, issue)` is false it returns 403 with a reason.
3. Pages call `currentUser()` and pass `role` and `id` down; components use the same `can()` to hide or disable controls. The UI only hides controls; the API is what enforces the rules.
4. An Admin changes a role on `/users`. The change applies on the target user's next request, with no need to sign in again.

## Acceptance criteria
1. Given the migration runs on the existing database, then every existing user has role `MEMBER` and no other data changes.
2. Given `ADMIN_EMAILS="a@x.com"`, when `a@x.com` signs in for the first time or again, then their role is `ADMIN`. When another user signs in, their role is `MEMBER` (new user) or unchanged (existing user).
3. Given a Viewer, when they call `POST /api/issues`, `PATCH /api/issues/{id}`, `POST /api/issues/{id}/transition` or `DELETE /api/issues/{id}`, then each returns 403 and nothing changes. `GET /api/issues` and `GET /api/issues/{id}` return 200.
4. Given a Member, when they create an issue, edit any issue's fields, change its status or assignee, or move it to another dashboard, then each succeeds as it does today.
5. Given a Member, when they `DELETE` an issue they reported, then it returns 204. For an issue someone else reported, or one with no reporter, it returns 403 and the issue still exists.
6. Given an Admin, when they `DELETE` any issue, then it returns 204.
7. Given a Member or a Viewer, when they `POST /api/dashboards`, or `PATCH` or `DELETE /api/dashboards/{id}`, then each returns 403 and nothing changes. An Admin gets the current behaviour (201, 200 or 204, and 409 rules unchanged).
8. Given an Admin, when they `PATCH /api/users/{id}` with `{"role":"VIEWER"}`, then it returns 200, and that user's next write returns 403 without them signing in again.
9. Given a Member or a Viewer, when they `PATCH /api/users/{id}`, then it returns 403. Given an Admin, `{"role":"OWNER"}` returns 400, an unknown id returns 404, and demoting the only Admin returns 409.
10. Given no session, when any write endpoint is called, then it still returns 401, not 403.
11. Given a Viewer on the list, board, issue page or popup, then "Create issue", Edit and Delete are not shown, the status and assignee dropdowns are disabled, and board cards can't be dragged. Given a Member viewing someone else's issue, Delete is not shown. Given a non-Admin on `/dashboards`, the create, rename and delete controls are not shown.
12. Given a non-Admin, when they open `/users`, then they get a 404 page and the "Users" nav link is not shown. Given an Admin, `/users` lists every user with a role dropdown that saves on change.
13. The unit tests for `can()` cover every cell of the permission table. `npm run check` passes with no signed-in tests skipped, and `npm run build` passes.

## Risks and open questions
- Risk: the existing API tests create dashboards and delete issues as ordinary dev-login users, so they would start failing with 403 → the test helpers set test users' roles directly through Prisma (as the dashboard fixture already does), and new tests cover each role.
- Risk: a role lookup on every write adds a database query → it's a primary-key read; acceptable for this app.
- Risk: locking everyone out → the last-Admin guard (409) plus `ADMIN_EMAILS`, which re-promotes listed emails on sign-in, give a way back in.
- Decided with you: global roles; Members edit any issue but delete only their own; dashboards are Admin-only; new users are Members; the first Admins come from `ADMIN_EMAILS`.
- Assumption: Viewers can still see everything, including user names and emails in assignee lists. Nothing becomes hidden.
- Assumption: `/users` returns 404 rather than 403 for non-Admins, so the page's existence isn't revealed.
- Assumption: the role isn't stored in the session token, so role changes apply immediately. The middleware still only checks "signed in".
- Assumption: the role is never sent by the client. It's always read from the database.
