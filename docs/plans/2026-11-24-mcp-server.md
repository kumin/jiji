# Plan: MCP server

Spec: docs/specs/2026-11-24-mcp-server.md
Branch: feat/mcp-server (from `main` after PR #2's merge)
Commands:
- test: `npm test`, with `AUTH_DEV_LOGIN=true npm run dev` running in the background so the signed-in API tests don't skip
- full check: `npm run check` (typecheck, lint and test)
- build: `npm run build`. Stop the dev server first, then `rm -rf .next` and restart it.

Notes for whoever runs this plan:
- After `prisma migrate dev`, run `npx prisma generate` and restart the dev server, because it keeps the old Prisma client.
- Running `next typegen` or `next build` while the dev server is up corrupts `.next`. Stop the server first.
- No Prettier. Keep lines to about 100 characters.
- **Where the MCP and token tests go:** they are added to `tests/api.test.ts`, not a new file.
  - `node --test` runs separate files in parallel processes, so a second file's cleanup (which deletes `dev-e2e-*` users) would race with the first file.
  - Keeping them in one file also reuses `createClient`, `signInAs`, `canAuth` and `testDashboardId`.
- **SDK pieces** (`@modelcontextprotocol/sdk` 1.32.x, checked on 2026-11-24):
  - `McpServer` from `/server/mcp.js`, with `registerTool(name, { description, inputSchema, annotations }, handler)`. `inputSchema` is a zod raw shape and zod v4 is supported.
  - `WebStandardStreamableHTTPServerTransport` from `/server/webStandardStreamableHttp.js`, created with `{ sessionIdGenerator: undefined, enableJsonResponse: true }`; `transport.handleRequest(request)` returns a `Response`.
  - For tests: `Client` from `/client/index.js` and `StreamableHTTPClientTransport` from `/client/streamableHttp.js`, created with `{ requestInit: { headers: { Authorization } } }`.

## Task 0: Baseline
- [ ] `git checkout -b feat/mcp-server`, then commit the approved spec and this plan (`docs: spec and plan for the MCP server`).
- [x] Start `AUTH_DEV_LOGIN=true npm run dev` in the background and run `npm run check`. Record the counts; expect 154 passing and 0 skipped.
- Result: 154 pass, 0 fail, 0 skipped.

## Task 1: Move issue creation into issue-actions
- Files:
  - `src/lib/issue-actions.ts` (new)
  - `src/app/api/issues/route.ts`
- Test first: none new. This is a pure refactor, and the existing "issues", "issue permissions" and validation API tests are the guard. Run them before the change and confirm they're green.
- Change:
  - Add `export type ActionError = { ok: false; status: number; body: { error: string; reason?: string; fields?: Record<string, string>; from?: IssueStatus; allowed?: readonly IssueStatus[] } }` and `export type ActionResult<T> = { ok: true; value: T } | ActionError`.
  - Add `createIssue(actor: Actor, input: unknown): Promise<ActionResult<IssueDTO>>`, moving every check from `POST` in order:
    1. `denyReason(actor, "issue:create")` gives 403 `{ error: "Forbidden", reason }`.
    2. The schema check gives 400.
    3. The dashboard check gives 400.
    4. The assignee check gives 400.
    5. A missing reporter row gives 401.
    6. The create itself, where a foreign-key race gives 400.
  - `POST` becomes:
    1. `const actor = await currentUser()`, returning 401 when it's null.
    2. `createIssue(actor, await request.json().catch(() => null))`.
    3. Respond with `NextResponse.json(result.value-wrapper, 201)` on success, or `NextResponse.json(error.body, { status })` on failure.
  - Add a small helper, `actionResponse(result, okStatus, wrap)`, in `issue-actions.ts`, or inline it if it's only used twice.
  - **Order stays:** 401, then 403, then validation.
- Verify: `npm test` shows everything green and 0 skipped. `npm run typecheck`.
- Covers: AC 11
- [x] Done

## Task 2: Move issue update and delete into issue-actions
- Files: `src/lib/issue-actions.ts`, `src/app/api/issues/[id]/route.ts`
- Test first: none new (refactor). The existing PATCH and DELETE tests, including "Members can only delete issues they reported", are the guard.
- Change:
  - `updateIssue(actor, id, input)`: `issue:edit` gives 403, the schema gives 400, then the assignee gives 400, the dashboard gives 400, a missing issue gives 404, and a foreign-key race gives 400. Same order as the current route.
  - `deleteIssue(actor, id)`: `issue:edit` gives 403, a missing issue gives 404, then `denyReason(actor, "issue:delete", existing)` gives 403. On success it returns `{ ok: true, value: { key } }`, where `key` is the deleted issue's key (load `number` along with `reporterId`).
  - The `PATCH` and `DELETE` routes call these the same way as Task 1. `DELETE` still returns 204 with an empty body.
- Verify: `npm test` shows everything green.
- Covers: AC 11
- [x] Done

## Task 3: Move transitions into issue-actions
- Files: `src/lib/issue-actions.ts`, `src/app/api/issues/[id]/transition/route.ts`
- Test first: none new (refactor). The existing workflow tests (409 with `from` and `allowed`, and same-status no-op) are the guard.
- Change: `transitionIssue(actor, id, input)` copies the route's logic exactly, including the 409 body `{ error, from, allowed }`. The route becomes a thin wrapper around it.
- Verify: `npm test` shows everything green, and `npm run check`.
- Covers: AC 11
- [ ] Done

## Task 4: Add the ApiToken model and token helpers
- Files:
  - `prisma/schema.prisma` and a new migration `api_tokens`
  - `src/lib/api-tokens.ts` (new) and `tests/api-tokens.test.ts` (new)
- Test first (unit, pure functions):
  - `generateToken()` matches `/^jiji_[A-Za-z0-9_-]{43}$/`, and two calls differ.
  - `hashToken(t)` is 64 lowercase hex characters, always the same for the same input, and different for a different token.
  - `tokenPrefix(t)` is the first 9 characters.
  - `parseBearer("Bearer jiji_x")` returns `"jiji_x"`. The scheme is case-insensitive (`"bearer jiji_x"`), and surrounding spaces are trimmed. `null`, `""`, `"Basic abc"`, `"Bearer"`, `"Bearer "` and `"Bearer abc"` (no `jiji_` prefix) return null.
  - `expiresAtFrom(now, 30)` is `now` plus 30×24 hours.
  - `isExpired({ expiresAt }, now)` is true when `expiresAt <= now`.
- Change:
  - **Schema:** add the `ApiToken` model exactly as in the spec, and `apiTokens ApiToken[]` on `User`.
  - **Migration:** `npx prisma migrate dev --name api_tokens`, then `npx prisma generate`, then restart the dev server.
  - **Helpers:** implement them with `node:crypto`: `randomBytes(32).toString("base64url")` and `createHash("sha256")`.
- Verify: `npm test` (the new unit tests pass) and `npm run typecheck`.
- Covers: AC 1 (hashing), AC 4 (parsing and expiry)
- [ ] Done

## Task 5: Add the token management API
- Files:
  - `src/lib/validation.ts` and `tests/validation.test.ts`
  - `src/app/api/tokens/route.ts` (new) and `src/app/api/tokens/[id]/route.ts` (new)
  - `src/lib/types.ts` (`ApiTokenDTO`)
  - `tests/api.test.ts`
- Test first:
  - **Unit:** `apiTokenCreateSchema`:
    - `{name:" cli "}` gives `{name:"cli", expiresInDays:30}`.
    - `expiresInDays` of 7, 30, 90 and 365 pass.
    - 0, 14, 3650, `null` and `"30"` fail on `expiresInDays`.
    - `""` and 81 characters fail on `name`.
  - **API**, in `describe("api tokens")`:
    - POST returns 201 with `token` matching `jiji_`, and `apiToken.expiresAt` is about 30 days ahead (allow ±1 minute). With `expiresInDays:7` it's about 7 days ahead.
    - Through Prisma, the stored `tokenHash` equals `sha256(token)`, and no column holds the token itself.
    - GET lists the token without a `token` field.
    - Bad name or bad `expiresInDays` gives 400 with `fields.name` or `fields.expiresInDays`.
    - User B's DELETE of A's token gives 404 and the row still exists. A's DELETE gives 204 and the row is gone. An unknown id gives 404.
    - Anonymous requests get 401 on all three routes.
- Change:
  - `apiTokenCreateSchema = z.object({ name: trimmed 1–80 with the messages "Name is required" / "Name must be 80 characters or fewer", expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)], "Expiry must be 7, 30, 90 or 365 days").default(30) })`.
  - Add `ApiTokenDTO = { id, name, prefix, createdAt, lastUsedAt, expiresAt }` (ISO strings) and `toApiTokenDTO()`.
  - The routes use `currentUserId()`, returning 401 when it's null. They only ever read or delete rows `where: { userId }`. `DELETE` uses `deleteMany({ where: { id, userId } })` and returns 404 when the count is 0. `GET` sorts by `createdAt desc`.
- Verify: `npm test`, then `npm run check`.
- Covers: AC 1, 2 (management side)
- [ ] Done

## Task 6: Add the /api/mcp endpoint with token auth and whoami
- Files:
  - `package.json` (`npm install @modelcontextprotocol/sdk@^1.32.2`)
  - `src/lib/api-tokens.ts`
  - `src/lib/mcp/server.ts` (new) and `src/app/api/mcp/route.ts` (new)
  - `src/middleware.ts`
  - `tests/api.test.ts`
- Test first, in `describe("mcp auth")`:
  - Add helpers:
    - `createToken(client, body?)`: POSTs to `/api/tokens` and returns `token`.
    - `mcp(token)`: connects an SDK `Client` over `StreamableHTTPClientTransport` to `${BASE}/api/mcp` with the Bearer header, and returns `{ client, call(name, args) }`. `call` returns `{ isError, data }`, where `data` is the parsed JSON text, or the raw text when parsing fails. Close clients in `after`.
  - Raw `fetch` POSTs of an `initialize` JSON-RPC body each get 401 with `WWW-Authenticate: Bearer` and `{error:"Unauthorized"}`, in these cases:
    - No header.
    - `Basic x`.
    - `Bearer jiji_unknown`.
    - A real token whose `expiresAt` was set to the past through Prisma.
    - A revoked token (deleted through the API).
    - A signed-in client's cookie with no Bearer header.
  - With a valid token, `client.connect` succeeds and `whoami` returns the owner's `{id, name, email, role}`. Afterwards `lastUsedAt` is set in the database.
  - Using a token on REST is refused: `GET /api/issues` and `POST /api/tokens` with only the Bearer header get 401.
- Change:
  - **`actorFromBearer(header, now = new Date())`:**
    1. Run `parseBearer`, then `findUnique({ where: { tokenHash }, include: { user: { select: { id, role } } } })`.
    2. Return null when the token is missing or `isExpired`.
    3. Otherwise `update` `lastUsedAt: now` (awaited, since it's a cheap primary-key write) and return `{ id, role }`.
  - **`createJijiServer(actor)`:** `new McpServer({ name: "jiji", version: <package.json version> })`. For now it registers only `whoami` (`readOnlyHint: true`), which reads the user's name and email from Prisma. It returns the server.
  - **`route.ts`:**
    - Export `POST`, `GET` and `DELETE`, all handled by one `handle(request)`:
      1. Call `actorFromBearer(request.headers.get("authorization"))`.
      2. When it's null, return 401 JSON with `WWW-Authenticate: Bearer`.
      3. Otherwise create `server = createJijiServer(actor)` and the transport `new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`, run `await server.connect(transport)`, and return `transport.handleRequest(request)`.
    - Add `export const dynamic = "force-dynamic"` and `runtime = "nodejs"`.
  - **Middleware:** add `pathname === "/api/mcp"` to the paths that skip the session check, so the route answers 401 itself with the header.
  - **Helper for later tasks:** add `toolJson(value)`, which returns `{ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] }`, and `toolError(message)`, which returns `{ isError: true, content: [{ type: "text", text: message }] }`.
- Verify: `npm test`, then `npm run check`.
- Covers: AC 2 (a revoked token gets 401), 3, 4 (auth half)
- [ ] Done

## Task 7: Add the read tools
- Files:
  - `src/lib/issue.ts` and `tests/issue.test.ts`
  - `src/lib/mcp/server.ts`
  - `tests/api.test.ts`
- Test first:
  - **Unit:** `parseIssueRef`:
    - `"JIJI-12"`, `"jiji-12"` and `" JIJI-12 "` give `{ number: 12 }`.
    - `"JIJI-0"`, `"JIJI-"` and `"JIJI-1x"` fall back to `{ id: <input trimmed> }`.
    - Any other string gives `{ id }`.
  - **API**, in `describe("mcp read tools")`, as a Viewer token:
    - `list_dashboards` includes the test dashboard with `issueCount`.
    - `list_users` includes the owner with `role: "VIEWER"`.
    - Create three issues in the test dashboard through REST as a Member, one assigned to the Viewer.
    - `search_issues` returns the right subset for `dashboardId`, `status`, `priority`, `q`, `assignee:"me"` and `assignee:"none"`. `limit:1` returns 1 issue with `total` ≥ 3, and each summary has exactly the spec's fields.
    - `get_issue` returns the same issue for its key and for its id. `"JIJI-999999"` gives an error result "Issue JIJI-999999 not found".
- Change:
  - `parseIssueRef(ref)` lives in `issue.ts` next to `issueKey`.
  - A shared `findIssue(ref)` loads by `number` or `id` with `ISSUE_INCLUDE`.
  - **Tools**, all with `readOnlyHint: true` and zod input shapes using `z.enum(IssueStatus)` and so on:
    - `list_dashboards`: `listDashboards()` mapped to `{id, name, description, issueCount}`.
    - `list_users`: `listUsers()` mapped to `{id, name, email, role}`.
    - `search_issues`: map `assignee:"me"` to `actor.id`, build the filters with `buildIssueWhere`, then `findMany({ where, include, orderBy: { number: "desc" }, take: limit })` and `count({ where })` for `total`, mapping each issue to a summary. `limit` is `z.number().int().min(1).max(200).default(50)`.
    - `get_issue`: `toIssueDTO`, or `toolError("Issue <ref> not found")`.
  - The not-found message uses the ref as the user typed it, trimmed.
- Verify: `npm test`, then `npm run check`.
- Covers: AC 5
- [ ] Done

## Task 8: Add the write tools
- Files: `src/lib/mcp/server.ts`, `src/lib/mcp/errors.ts` (new), `tests/mcp-errors.test.ts` (new), `tests/api.test.ts`
- Test first:
  - **Unit:** `formatActionError(error)`:
    - A 403 gives `"Forbidden: <reason>"`.
    - A 400 with `fields` gives `"Validation failed: title: Title is required; dueDate: Expected YYYY-MM-DD"`.
    - A 409 with `allowed` gives `"<error> (allowed: IN_PROGRESS)"`.
    - Anything else gives `error`.
  - **API**, in `describe("mcp write tools")`:
    - **tools/list:** returns exactly the nine names. `update_issue`'s input schema has no `status`. Read tools have `readOnlyHint` and `delete_issue` has `destructiveHint`.
    - **Member:**
      - `create_issue` works, and the reporter is the token owner.
      - `update_issue` by key changes `title` and `priority`.
      - `update_issue` with only `{issue}` is a validation error result.
      - `transition_issue` moves TODO to IN_PROGRESS.
      - `transition_issue` from TODO to DONE (on a fresh issue) is an error result containing "allowed", and the status is unchanged.
      - `create_issue` with an empty title, an unknown dashboard, an unknown assignee, or `dueDate:"tomorrow"` gives an error result whose message matches the REST API's error or field message.
    - **Viewer:** each of the four write tools gives an error result containing "Forbidden" and the reason, and the target issue is unchanged (checked through REST GET).
    - **Delete:**
      - A Member deletes their own issue and gets `{ deleted: "JIJI-n" }`.
      - Deleting someone else's issue gives Forbidden, and the issue still exists.
      - An Admin token deletes someone else's issue.
    - **Role change:**
      - A Member token creates an issue.
      - An Admin's `PATCH /api/users/{id}` demotes that user to VIEWER.
      - The same token's next `update_issue` gives Forbidden.
- Change:
  - `formatActionError` lives in `errors.ts`.
  - Register `create_issue`, `update_issue`, `transition_issue` and `delete_issue`. Each resolves `issue` through `findIssue` first, where relevant: a missing issue gives "Issue <ref> not found".
  - Each passes the `id` and the zod-parsed args to the Task 1–3 `issue-actions` functions with the server's `actor`.
  - Success gives `toolJson(issue)`, or `{ deleted: key }` for delete. Failure gives `toolError(formatActionError(error))`.
  - **Permission before lookup:** for Viewers, check `can(actor, "issue:edit")` before the issue lookup, so they get Forbidden rather than not-found. This matches REST, which checks the role first.
  - **`update_issue` input:** `issue` plus the optional `title`, `description`, `priority`, `assigneeId`, `dueDate` and `dashboardId`, with no `status`. The tool passes them through as the PATCH body, so `issuePatchSchema` gives the same validation, and `{}` gives "Provide at least one field to update".
  - **Annotations:** `delete_issue` gets `destructiveHint: true`. The other write tools get `destructiveHint: false`.
  - **Tool descriptions** should tell Claude the workflow (TODO → IN_PROGRESS → IN_REVIEW → DONE, one step at a time, backwards allowed one step), and that `issue` accepts `JIJI-n` or an id.
- Verify: `npm test`, then `npm run check`.
- Covers: AC 4 (tools/list), 6, 7, 8, 9, 10
- [ ] Done

## Task 9: Add the API tokens page
- Files:
  - `src/app/settings/tokens/page.tsx` (new)
  - `src/components/TokenManager.tsx` (new, client component)
  - `src/components/UserMenu.tsx`
  - `tests/api.test.ts`
- Test first, in `describe("api tokens page")`:
  - As a Viewer, `/settings/tokens` returns 200 and lists a token's name and `prefix`.
  - A token whose `expiresAt` is in the past (set through Prisma) shows "Expired".
  - The HTML never contains the full token.
  - The shared layout's user menu has `href="/settings/tokens"` for a Viewer, a Member and an Admin.
  - Anonymous visitors are redirected to `/login`.
- Change:
  - **Page:** a server component. It loads the user's tokens by `currentUserId()` and renders `<TokenManager initialTokens={...} />`.
  - **`TokenManager`:**
    - **List:** a table of name, prefix, created, last used ("Never"), and expires (the date, or an "Expired" badge when it's past), with a Revoke button per row. Revoke runs `DELETE` and then `router.refresh()`.
    - **Create form:** a name input and an expiry `<select>` (7, 30, 90 or 365 days; default 30). On success it shows a one-time box with the full token, a Copy button, the warning "You won't see this again", and a ready-made `claude mcp add --transport http jiji <origin>/api/mcp --header "Authorization: Bearer <token>"` line. Errors show inline per field.
  - **`UserMenu`:** add an "API tokens" `<Link>` before "Sign out", with the same button styling.
  - **Styling:** follow `DashboardManager`'s look.
- Verify: `npm test`, then `npm run check`. In the browser:
  - Create a token and see it once.
  - Copy the `claude mcp add` line.
  - Reload, and the full token is gone.
  - Revoke it.
  - An expired token shows "Expired".
- Covers: AC 12
- [ ] Done

## Task 10: Document using Jiji from Claude
- Files: `README.md`
- Test first: none (docs).
- Change: add a "Use Jiji from Claude (MCP)" section covering:
  - Creating a token, and its expiry options.
  - The `claude mcp add` command.
  - A Claude Desktop `claude_desktop_config.json` example using `npx mcp-remote <url>/api/mcp --header "Authorization: Bearer ${JIJI_TOKEN}"` with `env`.
  - The nine tools, and that roles apply.
  - That tokens only work at `/api/mcp`.
  - That expired or revoked tokens get 401.
  - That tokens should never be committed.
  - Also add `/api/mcp` and `/api/tokens` rows to the API table.
- Verify: actually run `claude mcp add` against the dev server with a fresh token, then `claude mcp list` shows `jiji` as connected. Remove it afterwards with `claude mcp remove jiji`.
- Covers: (docs for AC 4, 12)
- [ ] Done

## Task 11: Final check
- [ ] With `AUTH_DEV_LOGIN=true npm run dev` running, `npm run check` shows everything green and 0 skipped.
- [ ] Stop the server, `rm -rf .next`, then run `npm run build` and confirm it passes.
- [ ] On a scratch database, `migrate deploy` and then `db seed` apply cleanly.
- Covers: AC 13

## Acceptance criteria coverage
| AC | Task(s) |
|----|---------|
| 1  | 4, 5 |
| 2  | 5, 6 |
| 3  | 6 |
| 4  | 4, 6, 8 |
| 5  | 7 |
| 6  | 8 |
| 7  | 8 |
| 8  | 8 |
| 9  | 2, 8 |
| 10 | 8 |
| 11 | 1, 2, 3 |
| 12 | 9 |
| 13 | 11 |
