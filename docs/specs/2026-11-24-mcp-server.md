# MCP server

Ticket: none (feature request in chat, 2026-11-24)
Status: Approved

## Problem
Claude (Claude Code, Claude Desktop) can't work with Jiji. To find, file or move an issue, someone has to copy details between the chat and the web app. Jiji needs a Model Context Protocol (MCP) server so Claude can search, read and change issues directly. It must act as a specific user and follow that user's role, just like the web app does.

## Scope
- In:
  - A Streamable HTTP MCP endpoint at `/api/mcp` inside the Next.js app.
  - Personal API tokens for signing in to it: each user creates and revokes their own on a new **API tokens** page.
  - Every token expires. The user picks 7, 30, 90 or 365 days when creating it (default 30), and there is no "never" option.
  - Tools to search, read, create, update, transition and delete issues; to list dashboards and users; and to show who you are.
  - Every tool enforces the same role rules as the REST API.
- Out (not doing now):
  - OAuth. This means Claude.ai web connectors that require OAuth won't work.
  - Using tokens on the REST API (`/api/issues`, ...). Tokens work only at `/api/mcp`.
  - Dashboard management and role changes over MCP.
  - MCP resources and prompts. Only tools.
  - Token scopes, renewing a token in place (create a new one instead), rate limiting, and an audit log.

## Design
### Components touched
- **`prisma/schema.prisma`** plus a migration: a new `ApiToken` model.
- **`src/lib/issue-actions.ts`** (new): the create, update, transition and delete logic moves out of the route handlers into functions that take an `actor` and return either `{ ok: true, issue }` or `{ ok: false, status, error, fields? }`.
  - The REST routes and the MCP tools both call these functions, so validation, the workflow and permissions can't drift apart.
  - The routes keep their current responses; the existing API tests check this.
- **`src/lib/api-tokens.ts`** (new):
  - `generateToken()` returns `jiji_` plus 32 random bytes as base64url.
  - `hashToken()` is SHA-256 hex.
  - `actorFromBearer(header)` returns the `Actor` or null. It looks the token up by its hash, rejects it if `expiresAt` has passed, reads the user's current role and sets `lastUsedAt`.
- **`src/app/api/tokens/route.ts`** (`GET`, `POST`) and **`src/app/api/tokens/[id]/route.ts`** (`DELETE`) (new): manage your own tokens. These routes need a browser session; a token can't create tokens.
- **`src/app/settings/tokens/page.tsx`** (new) and a "API tokens" link in the user menu:
  - The page lists your tokens (name, the first 9 characters, created, last-used and expiry dates). Expired tokens are marked "Expired" and can still be revoked.
  - It has a form to create a token, with a name and an expiry choice (7, 30, 90 or 365 days; default 30). The full token is shown once, with copy instructions.
  - Each token has a Revoke button.
  - Every role can create tokens. A Viewer's token is effectively read-only.
- **`src/app/api/mcp/route.ts`** (new): `POST` (and `GET` and `DELETE` as the SDK requires).
  - It authenticates the Bearer token, then builds an MCP server for that actor and handles the request.
  - It uses `@modelcontextprotocol/sdk`'s web-standard Streamable HTTP transport in stateless mode, with a new server and transport per request and JSON responses with no sessions.
- **`src/lib/mcp/server.ts`** (new): `createJijiServer(actor)` registers the tools below.
- **`src/middleware.ts`**: let `/api/mcp` through without a session cookie. The route authenticates the token itself.
- **`README.md`**: a "Use Jiji from Claude" section. It explains creating a token, shows `claude mcp add --transport http jiji http://localhost:3000/api/mcp --header "Authorization: Bearer jiji_..."`, and gives the Claude Desktop config.

### API / interface
**Token endpoints** (session cookie only)
```json
// POST /api/tokens  { "name": "Claude Code laptop", "expiresInDays": 30 }
// 201 — `token` is shown only in this response
{ "apiToken": { "id": "t1", "name": "Claude Code laptop", "prefix": "jiji_Ab3x", "createdAt": "...", "lastUsedAt": null,
                "expiresAt": "2026-12-24T10:00:00.000Z" },
  "token": "jiji_Ab3x...full" }
// GET /api/tokens → 200 { "apiTokens": [ ...same shape, no token... ] }
// DELETE /api/tokens/{id} → 204; someone else's or unknown id → 404
```
- `name` is required and must be 1–80 characters after trimming. Anything else returns 400 `fields.name`.
- `expiresInDays` must be 7, 30, 90 or 365 and defaults to 30 when omitted. Any other value, including `null` or `0`, returns 400 `fields.expiresInDays`.
- `expiresAt` is the creation time plus that many days.

**MCP endpoint**: `POST /api/mcp` with `Authorization: Bearer jiji_...`.
- A missing, unknown, revoked or expired token returns HTTP **401** `{ "error": "Unauthorized" }` with `WWW-Authenticate: Bearer`.
- A session cookie alone doesn't count.

**Tools.** An issue can be referred to by its key (`JIJI-12`) or its id.

| Tool | Input | Returns | Role rule |
|---|---|---|---|
| `whoami` | none | `{ id, name, email, role }` | all |
| `list_dashboards` | none | `[{ id, name, description, issueCount }]` | all |
| `list_users` | none | `[{ id, name, email, role }]` | all |
| `search_issues` | `dashboardId?`, `status?`, `priority?`, `assignee?` (user id, `"me"` or `"none"`), `q?`, `limit?` (1–200, default 50) | `{ total, issues: [summary] }`, newest first | all |
| `get_issue` | `issue` | the full issue (the same fields as `IssueDTO`) | all |
| `create_issue` | `dashboardId`, `title`, `description?`, `priority?`, `assigneeId?`, `dueDate?` (YYYY-MM-DD) | the created issue | `issue:create` |
| `update_issue` | `issue` plus at least one of `title`, `description`, `priority`, `assigneeId`, `dueDate`, `dashboardId` | the updated issue | `issue:edit` |
| `transition_issue` | `issue`, `status` | the updated issue | `issue:edit`, and must follow the workflow |
| `delete_issue` | `issue` | `{ deleted: "JIJI-12" }` | `issue:delete` (Members only on issues they reported) |

- A summary is `{ key, id, title, status, priority, assignee: name|null, dashboard: name, dueDate, updatedAt }`.
- `update_issue` deliberately has no `status`. Status changes go only through `transition_issue`, so Claude can't skip the workflow (TODO → IN_PROGRESS → IN_REVIEW → DONE, one step at a time).
- Read tools are marked `readOnlyHint`, and `delete_issue` is marked `destructiveHint`.
- Results are JSON text content. Failures are tool results with `isError: true` and a message Claude can act on:
  - `"Forbidden: Viewers can't edit issues"`
  - `"Issue JIJI-99 not found"`
  - `"Validation failed: title: Title is required"`
  - `"To Do cannot move straight to Done (allowed: IN_PROGRESS)"`
  - Input that doesn't match a tool's schema is rejected by the SDK before the tool runs.

### Data
```prisma
model ApiToken {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name       String
  tokenHash  String    @unique   // SHA-256 hex; the token itself is never stored
  prefix     String              // first 9 chars, e.g. "jiji_Ab3x", to recognise it in the list
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  expiresAt  DateTime            // required: every token expires
  @@index([userId])
}
```
- The model is additive: `User` gains `apiTokens ApiToken[]`, and no existing data changes.
- Revoking a token deletes its row. Expired rows stay until revoked, so the page can show them as "Expired". No background clean-up job.
- Deleting a user deletes their tokens.

### Flow
1. A user opens **API tokens** from the user menu, creates a token and copies it into `claude mcp add ... --header "Authorization: Bearer jiji_..."`.
2. Claude sends `POST /api/mcp`. The middleware lets the request through. The route hashes the Bearer token, finds the row, checks it hasn't expired, and loads the user's current role (so role changes apply immediately), then updates `lastUsedAt`. It returns 401 if any of this fails.
3. The route builds `createJijiServer(actor)` and handles the JSON-RPC request statelessly.
4. A tool call runs the same `issue-actions` function as the REST route, so `can()`/`denyReason()`, validation and the workflow behave identically. Its result, or the error message, goes back to Claude.

## Acceptance criteria
1. Given a signed-in user, when they `POST /api/tokens` with `{"name":"cli"}`, then it returns 201 with a `token` starting with `jiji_` and an `expiresAt` 30 days later, and only a SHA-256 hash of it is stored. With `"expiresInDays": 7` the expiry is 7 days later. `GET /api/tokens` lists it without the token. An empty or 81-character name returns 400 `fields.name`, and `"expiresInDays"` of 0, 14, 3650 or `null` returns 400 `fields.expiresInDays`.
2. Given user A's token, when user B calls `DELETE /api/tokens/{id}` on it, then it returns 404 and the token still works. When A deletes it, it returns 204, and the next MCP call with it returns 401.
3. Given a token, when it's used on a REST route such as `GET /api/issues` without a session, then the response is still 401. A token can't call `/api/tokens`.
4. Given no `Authorization` header, a malformed one, an unknown token or a token whose `expiresAt` is in the past (set through Prisma in the test), when `/api/mcp` is called, then it returns 401 with `WWW-Authenticate: Bearer`. With a valid token, the MCP `initialize` handshake and `tools/list` succeed and list exactly the nine tools above.
5. Given any role, when it calls `whoami`, `list_dashboards`, `list_users`, `search_issues` or `get_issue`, then it gets results. `search_issues` honours each filter, `assignee: "me"` returns the token owner's issues, and `limit` caps the count. `get_issue` accepts both `JIJI-n` and an id, and an unknown issue is an error result saying it wasn't found.
6. Given a Member's token, when it calls `create_issue`, then the issue is created with the token owner as reporter. `update_issue` changes fields, and `transition_issue` moves one workflow step. An invalid input (an empty title, an unknown dashboard or assignee, or a bad date) returns an error result with the same message the REST API gives.
7. Given `transition_issue` from TODO to DONE, then it returns an error result naming the allowed statuses, and the status is unchanged.
8. Given a Viewer's token, when it calls `create_issue`, `update_issue`, `transition_issue` or `delete_issue`, then each returns an error result containing "Forbidden" and the reason, and nothing changes.
9. Given a Member's token, when it calls `delete_issue` on an issue they reported, then the issue is deleted. On someone else's issue it returns a Forbidden error result and the issue still exists. An Admin's token can delete any issue.
10. Given an Admin changes a user's role to Viewer, then that user's existing token is refused writes on its next call, without creating a new token.
11. After `issue-actions` is extracted, every existing REST API test passes unchanged.
12. The API tokens page lists your tokens with their expiry dates (expired ones marked "Expired") and creates one with a chosen expiry, showing the full token once. Revoke removes it. The user menu links to the page for every role.
13. `npm run check` passes with no signed-in tests skipped, and `npm run build` passes.

## Risks and open questions
- **Risk: the MCP SDK and Next.js App Router.** The SDK's Node transport expects Node `req`/`res`.
  - Mitigation: use its web-standard Streamable HTTP transport, which takes a `Request` and returns a `Response`, in stateless mode. If the installed version lacks it, stop and report before using an adapter.
- **Risk: a leaked token acts as the user.**
  - Mitigations:
    - Tokens are shown once and stored hashed.
    - Every token expires (at most 365 days), and tokens are revocable and limited to `/api/mcp`.
    - `lastUsedAt` makes unused or abused tokens visible.
  - The README warns against committing tokens, and suggests an environment variable in Claude Desktop config.
- **Risk: extracting `issue-actions` changes REST behaviour.**
  - Mitigation: the extraction happens before any MCP code, with the existing API tests as the guard (AC 11).
- **Decided with you:**
  - An in-app HTTP endpoint, not a stdio package.
  - Personal API tokens, not OAuth.
  - Issue tools plus read-only dashboards and users. No dashboard or role management.
- **Assumption:** tools are stateless. There are no MCP sessions or server-sent notifications, which keeps the endpoint simple and fine for serverless hosting.
- **Assumption:** `/api/mcp` is excluded from the session middleware only for its own path. Every other route still requires a session.
- **Assumption:** Claude Desktop connects through its config file with the Bearer header (via `npx mcp-remote`, or native HTTP support if the installed version has it). Claude.ai web connectors need OAuth, which is out of scope.
