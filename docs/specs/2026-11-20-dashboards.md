# Multiple dashboards

Ticket: none (feature description given in chat, 2026-11-20)
Status: Approved

## Problem
Every issue in Jiji lives in one implicit, global space: one list and one Kanban board. A team running several projects can't separate them, so unrelated work mixes on the same board. Users need to create their own dashboards and file each ticket under exactly one of them.

## Scope
- In: create, rename, and delete dashboards. Every issue belongs to exactly one dashboard and can be moved to another one through edit. The list and board views are scoped to the selected dashboard. A dashboard that still has issues can't be deleted. Existing issues are migrated into a default "Jiji" dashboard.
- Out (not doing now): per-dashboard issue keys or numbering (keys stay global `JIJI-N`), per-dashboard members or permissions, per-dashboard workflows, archiving dashboards, cross-dashboard search.

## Design
### Components touched
- `prisma/schema.prisma` plus a new migration: the `Dashboard` model and `Issue.dashboardId`.
- `src/lib/validation.ts`: `dashboardCreateSchema` and `dashboardPatchSchema`; `dashboardId` is added to `issueCreateSchema` (required) and to `issuePatchSchema` (optional).
- `src/lib/issue-service.ts` and `src/lib/types.ts`: `ISSUE_INCLUDE` adds `dashboard`; `IssueDTO` gains a `dashboard` field holding `{id, name}`; new `DashboardDTO` and `toDashboardDTO`.
- `src/app/api/dashboards/route.ts` (new): `GET` and `POST`.
- `src/app/api/dashboards/[id]/route.ts` (new): `GET`, `PATCH` and `DELETE`.
- `src/app/api/issues/route.ts` and `src/app/api/issues/[id]/route.ts`: filter by dashboard; require one on create; move on patch.
- `src/lib/queries.ts` and `src/lib/issue-filters.ts`: `dashboardId` filter; status counts scoped to a dashboard.
- UI: `src/app/dashboards/page.tsx` (new management page); a `DashboardSwitcher` component in the header; `src/app/page.tsx` and `src/app/board/page.tsx` read `?dashboard=<id>`; `IssueForm` gets a Dashboard select; `NavLinks` adds a "Dashboards" link.
- `prisma/seed.ts`: seeds two dashboards.

Issue keys (`issueKey`, `JIJI-N`) don't change.

### API / interface
These follow the existing conventions: 401 `{error:"Unauthorized"}` with no session, 400 `{error:"Validation failed", fields:{...}}` for bad input, and 404 `{error:"..."}` when something doesn't exist. Any signed-in user may manage dashboards.

`POST /api/dashboards`
```json
// request
{ "name": "Website", "description": "Marketing site" }
// 201
{ "dashboard": { "id": "d1", "name": "Website", "description": "Marketing site",
                 "issueCount": 0, "createdAt": "2026-11-20T10:00:00.000Z", "updatedAt": "..." } }
```
- `name`: trimmed, 1–80 characters, and unique regardless of case. A duplicate returns 409 `{error:"Name already in use", fields:{name:"..."}}`.
- `description`: optional, up to 500 characters (an empty value is stored as null).
- `GET /api/dashboards` returns 200 `{ "dashboards": [...] }`, ordered by name, with `issueCount` on each.
- `GET /api/dashboards/{id}` returns 200 `{ "dashboard": ... }`, or 404.
- `PATCH /api/dashboards/{id}` accepts `{name?, description?}` and returns 200. A name that's already used returns 409. An empty object returns 400.
- `DELETE /api/dashboards/{id}` returns 204 when the dashboard is empty. If it has issues, it returns 409 `{error:"Dashboard still has issues", issueCount: N}`. An unknown id returns 404.

Changes to the issue endpoints:
- `GET /api/issues?dashboardId=d1` returns only that dashboard's issues, and `counts` are scoped to it. Without the parameter, it returns every issue, which keeps the current behaviour for API clients.
- `POST /api/issues` requires `dashboardId`. A missing or unknown id returns 400 `fields.dashboardId`.
- `PATCH /api/issues/{id}` with `{ "dashboardId": "d2" }` moves the issue. Its key stays the same. An unknown id returns 400.
- `IssueDTO.dashboard` is `{id, name}`. `IssueDTO.key` stays `JIJI-<number>`.

### Data
```prisma
model Dashboard {
  id          String   @id @default(cuid())
  name        String   @unique
  description String?
  issues      Issue[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Issue {
  // ...existing fields; `number` stays @unique @default(autoincrement())...
  dashboardId String
  dashboard   Dashboard @relation(fields: [dashboardId], references: [id], onDelete: Restrict)

  @@index([dashboardId, status])
}
```
Making names unique regardless of case needs a unique index on `lower(name)`, added as raw SQL in the migration. The `@unique` on `name` above is a placeholder for that index.

Migration (a single SQL migration that keeps existing data):
1. Create `Dashboard` and insert the default row `{name:"Jiji"}`.
2. Add `Issue.dashboardId` as nullable, set it to the default dashboard on every row, then make it `NOT NULL` and add the foreign key and index.

`onDelete: Restrict` means the database itself refuses to delete a dashboard that still has issues, on top of the API's check.

### Flow
Deleting a dashboard:
1. `DELETE /api/dashboards/{id}` counts the dashboard's issues. If there are any, it returns 409 with `issueCount`.
2. Otherwise it deletes the dashboard. If an issue was created in that dashboard in the meantime, the Restrict foreign key raises Prisma error `P2003`, which the API maps to the same 409.

Using the UI:
1. The header shows the `DashboardSwitcher`. Choosing a dashboard navigates to `/?dashboard=<id>` or `/board?dashboard=<id>`, depending on the current view.
2. With no `?dashboard=` parameter, the list and board default to the first dashboard by name. An unknown id shows the not-found page.
3. "Create issue" preselects the current dashboard.
4. `/dashboards` lists every dashboard with its issue count and has create, rename and delete controls. Delete asks for confirmation. On a dashboard with issues it shows "Move or delete its N issues first", and the 409 message appears inline if the request fails anyway.
5. With no dashboards at all, the list, board and create pages show "Create a dashboard first", with a link to `/dashboards`.

## Acceptance criteria
1. Given a signed-in user, when they POST `{"name":"Website"}` to `/api/dashboards`, then the response is 201 with `issueCount:0`, and `GET /api/dashboards` includes it.
2. Given a POST with a missing name, an empty or whitespace-only name, a name over 80 characters, or a description over 500 characters, then the response is 400 with the matching `fields` entry, and nothing is stored.
3. Given an existing dashboard "Website", when another dashboard is POSTed or PATCHed with the name "website", then the response is 409.
4. Given a dashboard, when it is PATCHed with `{"name":"Site"}`, then the response is 200 and GET returns the new name. Sending `{}` returns 400. An unknown id returns 404.
5. Given a dashboard with no issues, when it is DELETEd, then the response is 204 and GET for it returns 404.
6. Given a dashboard with 2 issues, when it is DELETEd, then the response is 409 with `issueCount: 2`, and the dashboard and its issues are unchanged.
7. Given no session, when any dashboard endpoint is called with POST, PATCH or DELETE, then the response is 401.
8. Given POST `/api/issues` without a `dashboardId`, or with an unknown one, then the response is 400 with `fields.dashboardId`.
9. Given issue `JIJI-7` in dashboard Website, when it is PATCHed with `{"dashboardId": <Mobile id>}`, then the response is 200, `dashboard.name` is "Mobile", the key is still `JIJI-7`, and `GET /api/issues?dashboardId=<Website id>` no longer lists it.
10. Given issues in Website and Mobile, when `GET /api/issues?dashboardId=<Website id>` is called, then only Website issues are returned, and `counts` only count Website issues.
11. Given a database with existing issues from before this change, when the migration runs, then every issue belongs to the "Jiji" dashboard and keeps its key, and new issues continue the global `JIJI-N` sequence.
12. Given the list and board pages with `?dashboard=<Website id>`, when they render, then only Website issues appear, and the switcher shows Website as selected. An unknown id shows the not-found page.
13. Given the `/dashboards` page, when a user creates, renames or deletes a dashboard, then the list updates. Delete is blocked, with the issue count shown, on a dashboard that has issues.
14. `npm run check` passes, and the migration applies cleanly both with `npm run db:deploy` on the current database and with `npm run db:reset`.

## Risks and open questions
- Risk: the migration adds a `NOT NULL` column to existing issues → it fills the column with the default dashboard before adding the constraint, all in one transactional migration.
- Decided with the user: issue keys stay global (`JIJI-N`), with no per-dashboard prefix or counter; issues can be moved between dashboards through edit.
- Assumption: any signed-in user can create, rename and delete any dashboard, because the app has no roles.
- Assumption: dashboard names are unique regardless of case, so the switcher never shows two dashboards with the same name.
- Assumption: the last dashboard can be deleted if it's empty; the UI then shows the "Create a dashboard first" state.
- Assumption: the selected dashboard is carried in the `?dashboard=<id>` URL parameter, not in a cookie or a user preference, so views stay shareable.
- Assumption: "dashboard" is the name for this grouping (in Jira terms, a project). It's distinct from the existing Kanban "Board" view, which becomes one view of a dashboard.
- Assumption: tests follow `tests/api.test.ts` (a live server with dev-login), plus unit tests for the schemas in `tests/validation.test.ts`.
