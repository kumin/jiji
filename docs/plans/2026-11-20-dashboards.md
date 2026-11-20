# Plan: Multiple dashboards

Spec: docs/specs/2026-11-20-dashboards.md
Branch: feat/dashboards
Commands: test `npm test` · full check `npm run check` (typecheck + lint + tests) · build `npm run build` · migrations `npm run db:migrate`, `npm run db:deploy`, `npm run db:reset`

**Running the API tests.** `tests/api.test.ts` needs a dev server with dev-login on, or it silently skips every signed-in test:

```bash
AUTH_DEV_LOGIN=true npm run dev     # shell 1 (overrides the "false" in .env)
npm test                            # shell 2
```

A green run must show the signed-in tests as passing, not skipped. Postgres runs in the `jira-postgres` Podman container (`podman machine start && podman start jira-postgres`).

**Conventions to follow:**
- API error shapes: `{error:"Unauthorized"}` 401, `{error:"Validation failed", fields}` 400, `{error:"... not found"}` 404. Copy them from `src/app/api/issues/[id]/route.ts`.
- Prisma errors come from `@/generated/prisma/client` (`Prisma.PrismaClientKnownRequestError`). `P2002` is a unique violation; `P2003` is a foreign-key violation.
- API tests use the `createClient()` and `devLogin()` helpers. Every test row is cleaned up in `after()`. Test dashboards are named with the `e2e-` prefix so cleanup can find them.

## Task 0: Baseline
- [x] Commit or stash the uncommitted work on `feat/issue-tracker` (the menu-bar change, `.claude/launch.json`, the spec, and the deleted `.agents/skills` files). Ask the user which.
- [x] `git switch -c feat/dashboards`
- [x] Start the dev server with `AUTH_DEV_LOGIN=true`, then run `npm run check`. Record the pass, fail and skip counts in this file under "Baseline result".

Baseline result: 2026-11-20, `npm run check` with the dev server on (`AUTH_DEV_LOGIN=true`): typecheck and lint clean; 84 tests, 84 pass, 0 fail, 0 skipped.

## Task 1: Dashboard validation schemas
- Files: `src/lib/validation.ts`, `tests/validation.test.ts`
- Test first, in `describe("dashboardCreateSchema")` and `describe("dashboardPatchSchema")`:
  - A name is trimmed. A missing name, `""`, `"   "` or 81 characters fail; exactly 80 characters passes.
  - A description of `""` or whitespace becomes `null`. 501 characters fails; 500 passes.
  - The patch schema rejects `{}` and accepts `{name}`, `{description}`, or both. A patch with `{description: undefined}` leaves the key absent.
- Change: add `dashboardCreateSchema = z.object({ name, description: optionalText.pipe(...) })` with the limits above. Add `dashboardPatchSchema = z.object({...}).partial().refine(non-empty)`, using the same pattern as `issuePatchSchema`. The description limit applies after trimming.
- Verify: `npm test` → the new validation tests pass, and nothing else changes.
- Covers: AC 2 (schema level)
- Note: the "`{description: undefined}` leaves the key absent" case was changed to "a missing key stays absent". `optionalText` turns an explicit `undefined` into `null`, the same as the issue schema. JSON bodies can't carry `undefined`, so this can't happen over HTTP.
- [x] Done

## Task 2: Issues belong to a dashboard (schema, migration, create path) ⚠️ risky
This is one task because a required `Issue.dashboardId` breaks every issue create until the API and tests send it.
- Files: `prisma/schema.prisma`, `prisma/migrations/<ts>_dashboards/migration.sql`, `prisma/seed.ts`, `src/lib/validation.ts`, `src/lib/types.ts`, `src/lib/issue-service.ts`, `src/lib/queries.ts`, `src/app/api/issues/route.ts`, `src/components/IssueForm.tsx`, `src/app/issues/new/page.tsx`, `tests/api.test.ts`, `tests/validation.test.ts`
- Test first:
  - In `tests/validation.test.ts`, `issueCreateSchema` without `dashboardId` fails with `fields.dashboardId`. With `dashboardId: "d1"` it passes.
  - In `tests/api.test.ts`, add a top-level `before` that creates the dashboard `e2e-<pid>` through `prisma.dashboard.create` (the API doesn't exist yet) and exports `testDashboardId`. Every existing issue POST in the file sends it.
  - New test "requires a dashboard": POST `/api/issues` without `dashboardId` → 400 with `fields.dashboardId`; with `dashboardId: "nope"` → 400 with `fields.dashboardId`.
  - New test: a created issue's response has `dashboard: {id, name}` matching the test dashboard.
  - Extend `after()`: delete issues first, then `prisma.dashboard.deleteMany({ where: { name: { startsWith: "e2e-" } } })`.
- Change:
  - Schema: add the `Dashboard` model from the spec, without `@unique` on `name`. Add `Issue.dashboardId` and `Issue.dashboard` (`onDelete: Restrict`) and `@@index([dashboardId, status])`.
  - Migration: run `npx prisma migrate dev --create-only --name dashboards`, then hand-edit the SQL so that it:
    1. Creates `Dashboard`.
    2. Inserts the default dashboard: `INSERT INTO "Dashboard" (id, name, "updatedAt") VALUES ('default-dashboard', 'Jiji', now())`.
    3. Adds `"dashboardId" TEXT` as nullable, then runs `UPDATE "Issue" SET "dashboardId" = 'default-dashboard'`.
    4. Runs `ALTER COLUMN "dashboardId" SET NOT NULL`, then adds the foreign key (`ON DELETE RESTRICT`) and the index.
    5. Runs `CREATE UNIQUE INDEX "Dashboard_name_lower_key" ON "Dashboard" (lower(name))`.
  - Then `npm run db:migrate`, which must report no drift. If Prisma tries to drop the `lower(name)` index on a later `migrate dev`, note it in Risks and keep the index; Task 3 also checks for duplicates in the application, so uniqueness still holds.
  - Seed: after users, create dashboards "Jiji" and "Mobile". Spread the 12 sample issues across them (1–8 in Jiji, 9–12 in Mobile). `deleteMany` on dashboards runs after issues.
  - Validation: add `dashboardId: z.string().trim().min(1, "Dashboard is required")` to `issueFields` and make it required in `issueCreateSchema`. The patch schema gets it as optional through `.partial()`.
  - `POST /api/issues`: after validation, `prisma.dashboard.findUnique({where:{id}})`; if it's missing, return 400 `fields.dashboardId = "Dashboard not found"`.
  - `ISSUE_INCLUDE` adds `dashboard: { select: { id: true, name: true } }`. `IssueDTO` gets `dashboard: {id: string; name: string}`, and `toIssueDTO` maps it.
  - UI stopgap so creating issues keeps working: `IssueForm` takes an optional `dashboardId` prop and sends it in the payload. `issues/new/page.tsx` passes the first dashboard by name. Task 9 replaces this with a select.
- Verify:
  - `npm run db:migrate` → applies. `npm run db:psql` → `select count(*) from "Issue" where "dashboardId" is null;` returns `0`.
  - `npm run db:reset` → reseeds cleanly.
  - `npm run check` (dev server running) → all green, with the signed-in tests passing rather than skipped.
  - In the browser, "Create issue" still creates an issue.
- Covers: AC 8, 11, 14 (partly)
- Notes:
  - The test dashboard is created at the end of the existing top-level `before` in `tests/api.test.ts`, not in a second top-level `before`. Node runs those so the second one saw `devLoginAvailable` still false.
  - `prisma migrate dev` reports no drift for the raw `lower(name)` index. A follow-up `--create-only` produced an empty migration, which was deleted.
  - Prisma refuses `migrate reset` when Claude Code runs it, so the reset was checked on a throwaway database instead: `migrate deploy` plus `db seed`, twice. That gave 2 dashboards (Jiji 8, Mobile 4); the database was then dropped. Your local database was migrated in place (14 issues now in "Jiji", 0 without a dashboard).
  - Browser check: dev-login, then "Create issue" created `JIJI-130`. The test issue and user were removed afterwards.
- [x] Done

## Task 3: GET and POST /api/dashboards
- Files: `src/lib/types.ts`, `src/lib/dashboard-service.ts` (new), `src/app/api/dashboards/route.ts` (new), `tests/api.test.ts`
- Test first, in a new `describe("dashboards")`:
  - POST `{"name":"e2e-<id> Website"}` → 201, `issueCount: 0`. GET `/api/dashboards` lists it, and the list is sorted by name.
  - POST with a missing name, a blank name, 81 characters, or a description of 501 characters → 400 with the field set. GET afterwards doesn't list anything new.
  - Creating "e2e-X Web" twice, the second time as "E2E-x web" → 409 `{error:"Name already in use", fields:{name}}`.
  - No session: POST → 401.
- Change:
  - `DashboardDTO = {id, name, description, issueCount, createdAt, updatedAt}`.
  - `dashboard-service.ts`: `DASHBOARD_SELECT` with `_count: { select: { issues: true } }`; `toDashboardDTO`; `nameTaken(name, exceptId?)` using `findFirst({ where: { name: { equals: name, mode: "insensitive" }, id: { not: exceptId } } })`; and `isUniqueViolation(error)`, which checks for P2002.
  - POST: check auth, then validate, then `nameTaken` → 409; create, and also map P2002 → 409, which covers a concurrent duplicate hitting the `lower(name)` index.
  - GET: `findMany({ orderBy: { name: "asc" } })`, mapped through `toDashboardDTO`.
- Verify: `npm test` → the new tests pass.
- Covers: AC 1, 2, 3 (POST), 7 (POST)
- Notes:
  - GET sorts in JS with a case-insensitive `localeCompare` (`sortByName`) instead of `orderBy: { name: "asc" }`, because Postgres collation could put "Zeta" before "alpha". The helper `isForeignKeyViolation` was also added here, ready for Task 4.
  - Added a test that fires 5 concurrent same-name creates: exactly one 201 and four 409s, which proves the P2002 mapping.
- [x] Done

## Task 4: GET, PATCH and DELETE /api/dashboards/{id}
- Files: `src/app/api/dashboards/[id]/route.ts` (new), `tests/api.test.ts`
- Test first:
  - PATCH `{"name":"e2e-… Site"}` → 200, and GET returns the new name. PATCH `{}` → 400. PATCH on an unknown id → 404. PATCH to another dashboard's name in different case → 409. PATCH to its own name in different case → 200, so a case-only rename is allowed.
  - DELETE on an empty dashboard → 204, then GET → 404.
  - DELETE on a dashboard with 2 issues (created through the API) → 409 `{error:"Dashboard still has issues", issueCount: 2}`. GET still returns it, and both issues still read 200.
  - DELETE on an unknown id → 404.
  - No session: PATCH and DELETE → 401.
- Change:
  - GET: `findUnique` → DTO, or 404.
  - PATCH: check auth, then validate (`dashboardPatchSchema`), then existence → 404, then `nameTaken(name, id)` → 409, then update; P2002 → 409.
  - DELETE: check auth, then existence → 404, then `prisma.issue.count({where:{dashboardId:id}})` > 0 → 409 with `issueCount`. Otherwise delete, and catch P2003 → recount and return 409. That covers a concurrent issue create.
- Verify: `npm test` → green.
- Covers: AC 3 (PATCH), 4, 5, 6, 7
- Note: checked directly that deleting a dashboard that still has issues makes Prisma throw `P2003`, and that `isForeignKeyViolation` recognises it. Nothing was deleted.
- [x] Done

## Task 5: Move an issue between dashboards
- Files: `src/app/api/issues/[id]/route.ts`, `tests/api.test.ts`
- Test first: create dashboards A and B and an issue in A, then PATCH `{dashboardId: B}`:
  - The response is 200, `dashboard.id` is B, and `key` and `number` are unchanged.
  - `GET /api/issues?dashboardId=A` doesn't list it. This filter arrives in Task 6, so until then assert with `GET /api/issues/{id}`.
  - PATCH `{dashboardId: "nope"}` → 400 `fields.dashboardId`.
- Change: in PATCH, when `changes.dashboardId !== undefined`, check that the dashboard exists, or return 400 `fields.dashboardId = "Dashboard not found"`. Keep the existing order: validation, then existence check, then update.
- Verify: `npm test` → green.
- Covers: AC 9 (API)
- [x] Done

## Task 6: Filter issues and counts by dashboard
- Files: `src/lib/issue-filters.ts`, `src/lib/queries.ts`, `src/app/api/issues/route.ts`, `tests/issue-filters.test.ts`, `tests/api.test.ts`
- Test first:
  - Unit: `parseIssueFilters({dashboardId:"d1"})` → `{dashboardId:"d1"}`; `buildIssueWhere({dashboardId:"d1"})` includes `dashboardId: "d1"`. `isFiltered` ignores `dashboardId`, because a dashboard is a scope, not a filter.
  - API: with issues in A (1 TODO, 1 DONE) and B (1 TODO), `GET /api/issues?dashboardId=A` returns exactly A's 2 issues, with `counts.TODO = 1` and `counts.DONE = 1`. Without the parameter, the response still includes issues from both.
- Change: add `dashboardId?: string` to `IssueFilters`, `parseIssueFilters` and `buildIssueWhere`. `getStatusCounts(dashboardId?)` adds `where: { dashboardId }` to `groupBy`. The API's inline `groupBy` uses `getStatusCounts(filters.dashboardId)` instead of its own copy.
- Verify: `npm test` → green.
- Covers: AC 10, AC 9 (the list assertion from Task 5 can now be added)
- Note: the list check deferred from Task 5 (the moved issue leaves A's list and appears in B's) was added to the move test.
- [x] Done

## Task 7: Scope the list and board pages to a dashboard
- Files: `src/lib/queries.ts`, `src/components/DashboardSwitcher.tsx` (new), `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/board/page.tsx`, `tests/api.test.ts`
- Test first (page HTML through the signed-in client):
  - `GET /?dashboard=<A id>` → 200; the HTML contains A's issue title but not B's.
  - The same check for `/board?dashboard=<A id>`.
  - `GET /?dashboard=nope` → 404.
- Change:
  - `queries.ts`: `listDashboards()` returns DTOs sorted by name. `resolveDashboard(param)` returns the matching dashboard; with no parameter it returns the first by name, and it returns `null` when there are no dashboards. An unknown id calls `notFound()`.
  - `page.tsx` and `board/page.tsx`: resolve the dashboard and pass `dashboardId` into `buildIssueWhere` and `getStatusCounts`. Status-chip links, the filter form (a hidden `dashboard` input) and Reset keep `?dashboard=<id>`. With no dashboards, show "Create a dashboard first" with a link to `/dashboards`.
  - `DashboardSwitcher` (client component): a `<select>` of dashboards. On change it runs `router.push(\`${pathname}?dashboard=${id}\`)`, keeping `/` or `/board`, and shows the current one as selected (it reads `useSearchParams`, falling back to the first dashboard). `layout.tsx` renders it next to `NavLinks` for signed-in users, using `listDashboards()`.
  - `NavLinks`: the Issues and Board links carry the current `?dashboard=`.
- Verify: `npm test` → green. In the browser, switching dashboards changes both views, and filters stay inside the dashboard.
- Covers: AC 12
- Notes:
  - Added a shared `NoDashboards` empty-state component, used here and in Task 9.
  - `DashboardSwitcher` and `NavLinks` read search params, so `layout.tsx` wraps them in `<Suspense>`.
  - Fixed test cleanup: the case-only rename test upper-cases names, so cleanup now matches `e2e-` regardless of case. This run also removed leftovers from earlier runs.
  - Browser check: the switcher renders with the dashboards in order, and Issues/Board keep `?dashboard=`. Scoping itself is covered by the HTML tests.
- [x] Done

## Task 8: Dashboards management page
- Files: `src/app/dashboards/page.tsx` (new), `src/components/DashboardManager.tsx` (new), `src/components/NavLinks.tsx`, `tests/api.test.ts`
- Test first: `GET /dashboards` (signed in) → 200, and the HTML lists the test dashboard's name and its issue count. Signed out → 307 to `/login`; add this path to the existing redirect test.
- Change:
  - A server page that loads `listDashboards()` and renders `DashboardManager`.
  - The client component has a create form (name and description) and a row per dashboard with its name, description and issue count, and with Rename (inline edit) and Delete controls. Delete runs `confirm()` first, and is disabled with the text "Move or delete its N issues first" when `issueCount > 0`. A 400 or 409 response shows its message inline and keeps the input. Each action runs `router.refresh()` on success.
  - `NavLinks` adds `{ href: "/dashboards", label: "Dashboards" }`.
- Verify: `npm test` → green. In the browser, creating, renaming and deleting work; a duplicate name shows an error; delete is disabled on a dashboard that has issues.
- Covers: AC 13
- Notes:
  - The Dashboards nav link doesn't carry `?dashboard=`; only Issues and Board do.
  - Browser check: created "e2e-ui Website"; creating "E2E-UI WEBSITE" showed "Another dashboard already uses this name"; renamed it to "e2e-ui Site"; deleted it (the confirm dialog was auto-accepted for the test). Jiji's Delete is disabled, with "Move or delete its 14 issues first".
- [x] Done

## Task 9: Dashboard select on the issue form
- Files: `src/components/IssueForm.tsx`, `src/app/issues/new/page.tsx`, `src/components/EditIssueSection.tsx`, `src/app/issues/[id]/page.tsx`
- Test first: none at the API level (Tasks 2 and 5 already cover create and move). This task's check is in the browser.
- Change:
  - Replace the Task 2 stopgap with a `dashboards: DashboardDTO[]` prop and a required "Dashboard" `<select>`. On create it preselects `?dashboard=` from the URL (`issues/new/page.tsx` reads `searchParams`), falling back to the first dashboard. On edit it preselects the issue's dashboard.
  - The "Create issue" link in `layout.tsx` carries the current `?dashboard=`.
  - With no dashboards, the new-issue page shows "Create a dashboard first".
  - The detail page shows the dashboard name as a field.
- Verify: `npm run check` → green. In the browser: create from WEB with the select preselected; edit an issue and change its dashboard, so it leaves WEB's list, appears in the other one, and keeps its `JIJI-N` key.
- Covers: AC 9 (UI), spec flow step 3
- Notes:
  - "Create issue" in the header is now a small client component (`CreateIssueLink`) so it can read `?dashboard=`; the layout is a server component and can't. An unknown `?dashboard=` on the new-issue page falls back to the first dashboard instead of returning 404.
  - "← All issues" on the detail page goes back to the issue's dashboard.
  - Browser check: from the e2e-ui Mobile list, "Create issue" preselected e2e-ui Mobile and created `JIJI-346` there; Edit then moved it to Jiji, and the key stayed `JIJI-346`. Test data was removed afterwards.
  - Seen, not changed (existing behaviour): after Save the editor stays open because the page pushes to its own URL. A browser session whose user row was deleted gets "Your account no longer exists. Sign in again." on create.
- [x] Done

## Task 10: Final verification
- [ ] `npm run db:reset` → migrations plus seed apply from scratch.
- [ ] On a copy of the current data (`pg_dump` → a new database), `npm run db:deploy` applies the migration, every issue belongs to "Jiji", and the next created issue continues the `JIJI-N` sequence.
- [ ] `npm run check` with the dev server on (`AUTH_DEV_LOGIN=true`) → green, with no signed-in tests skipped.
- [ ] `npm run build` → succeeds.
- Covers: AC 11, 14
- [ ] Done

## Acceptance criteria coverage
| AC | Task(s) |
|----|---------|
| 1  | 3 |
| 2  | 1, 3 |
| 3  | 3, 4 |
| 4  | 4 |
| 5  | 4 |
| 6  | 4 |
| 7  | 3, 4 |
| 8  | 2 |
| 9  | 5, 6, 9 |
| 10 | 6 |
| 11 | 2, 10 |
| 12 | 7 |
| 13 | 8 |
| 14 | 2, 10 |

## Risks
- Task 2 is the largest task and changes live data. Run it on a fresh branch, check the null-count query, and keep `npm run db:reset` available.
- Prisma can't express the `lower(name)` unique index in `schema.prisma`, so `migrate dev` may report drift or try to drop it. If it does, record that here; the application-level `nameTaken` check (Tasks 3 and 4) still enforces uniqueness, and P2002 handling covers races.
- UI acceptance criteria (12, 13, 9 UI) are only partly provable by HTML assertions; the rest is manual browser checks, recorded with screenshots during `verify-work`.
- `AUTH_DEV_LOGIN` is `false` in `.env`, so a plain `npm test` skips the signed-in tests and looks green. Always start the dev server with `AUTH_DEV_LOGIN=true` for this feature.
