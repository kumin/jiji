# Jiji

A small, self-hosted issue tracker in the Jira mould: issues, a workflow with
enforced status transitions, priorities, assignees, a filterable list, a Kanban
board, and Google sign-in.

Built with Next.js 15 (App Router), TypeScript, Auth.js 5, Prisma 7 and Postgres.

## Features

- **Google sign-in** — every page requires a session. Users are created on first
  login; there is no local password anywhere.
- **Issues** — create, edit, view, delete. Summary, description, priority,
  assignee and due date. The reporter is whoever is signed in.
- **Workflow** — `To Do → In Progress → In Review → Done`. Illegal moves are
  rejected by the API with a `409`, and the board greys out columns a dragged
  card cannot legally reach.
- **List view** — search across summary and description, filter by status,
  priority and assignee. Filters live in the URL, so views are shareable.
- **Board view** — drag cards between columns, with optimistic updates.
- **Keys** — issues are numbered automatically and addressed as `JIJI-1`,
  `JIJI-2`, …

## Stack notes

| Choice | Why |
| --- | --- |
| Next.js 15 App Router | One process serves the UI and the API. |
| Auth.js (`next-auth` v5) | App Router-native `auth()` API and middleware. |
| Prisma 7 + `@prisma/adapter-pg` | Prisma 7 talks to Postgres via a driver adapter instead of a bundled engine. |
| Podman (aliased as `docker`) | Docker-compatible CLI, no Docker Desktop needed. |
| Zod 4 | Request validation shared by API routes and the form. |

## Requirements

- Node.js 20+
- Podman, with a running machine

## Setup

### 1. Start the database

```bash
podman machine init    # first run only
podman machine start   # every session
```

The repo assumes `docker` is aliased to `podman`:

```bash
ln -sf "$(which podman)" /opt/homebrew/bin/docker
```

Then create the Postgres container (port 5432, credentials `jira`/`jira`):

```bash
docker run -d --name jira-postgres \
  -e POSTGRES_USER=jira -e POSTGRES_PASSWORD=jira -e POSTGRES_DB=jira \
  -p 5432:5432 \
  --restart=unless-stopped \
  -v jira-pgdata:/var/lib/postgresql/data \
  docker.io/library/postgres:16-alpine
```

### 2. Install and configure

```bash
npm install
cp .env.example .env
```

`DATABASE_URL` should point at the container above.

### 3. Configure Google sign-in

**In Google Cloud Console:**

1. Create (or pick) a project, then enable the **Google People API** — Auth.js
   requests `openid email profile`, and the People API serves those claims.
2. Set up the consent screen under **Google Auth Platform → Branding** (called
   *OAuth consent screen* in the older console, still reachable via
   **APIs & Services → OAuth consent screen**).
   While the app is in *Testing*, add your own Google account under **Test users**,
   or sign-in will fail with `access_denied`.
3. Under **Google Auth Platform → Clients → Create client** (older console:
   **APIs & Services → Credentials → Create credentials → OAuth client ID**),
   choose **Web application** and set:

   | Field | Value |
   | --- | --- |
   | Authorised redirect URIs | `http://localhost:3000/api/auth/callback/google` |
   | Authorised JavaScript origins | `http://localhost:3000` |

   For anything other than localhost, use the app's real HTTPS origin — Google
   refuses plain HTTP on non-localhost hosts, so you will need a tunnel or a
   reverse proxy with TLS. (localhost is exempt from the HTTPS rule.)

   Changes can take a few minutes to propagate; a `redirect_uri_mismatch` right
   after saving usually means you have not waited yet, or the trailing slash or
   port does not match exactly.

**In `.env`:**

```bash
npx auth secret                 # generates AUTH_SECRET
```

```dotenv
AUTH_SECRET="<paste>"
AUTH_GOOGLE_ID="<client id>.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="<client secret>"
AUTH_ALLOWED_DOMAINS="gmail.com"
```

Restart the server. The login page will now offer **Sign in with Google**.

#### Restricting who can sign in

`AUTH_ALLOWED_DOMAINS` is a comma-separated list of bare domains, checked
server-side when Google calls back:

```dotenv
AUTH_ALLOWED_DOMAINS="gmail.com"                    # personal Gmail only
AUTH_ALLOWED_DOMAINS="gmail.com,acme.com"           # two domains
AUTH_ALLOWED_DOMAINS=""                             # any Google account
```

The check is an exact domain match, so `a@mail.gmail.com` is **not** `gmail.com`,
and the address is split on its last `@` so `a@gmail.com@evil.test` does not pass
as Gmail. It runs in the Auth.js `signIn` callback, which is the only place a
refusal is actually enforced — Google does not restrict the audience for you in
*Testing* mode, and the `hd` request parameter is a display hint, not a control.

A rejected sign-in lands on `/login?error=AccessDenied`.

#### Signing in without Google (local only)

Set `AUTH_DEV_LOGIN="true"` in `.env` and run the **dev** server to get a
name-and-email sign-in box. It is gated on `NODE_ENV !== "production"` as well,
so it cannot be reached from a production build.

Be clear about what this is: **it has no password**. Any name and email you type
will be accepted and will create that user, so it is a development convenience,
not an authentication mechanism. Anyone who can reach the dev server can sign in
as anyone. Leave it unset in any deployed environment.

If neither provider is configured, `/login` explains which variables are missing
instead of failing.

#### Roles and the first Admin

Every user has one role:

| | Viewer | Member | Admin |
| --- | --- | --- | --- |
| See dashboards, issues and users | ✓ | ✓ | ✓ |
| Create and edit issues (fields, status, assignee, dashboard) | | ✓ | ✓ |
| Delete an issue | | only ones they reported | ✓ |
| Create, rename or delete dashboards | | | ✓ |
| Change roles (the **Users** page) | | | ✓ |

New users start as Members. To get your first Admin, list their email in
`.env`:

```bash
ADMIN_EMAILS="you@gmail.com"            # comma-separated, case-insensitive
```

Listed users are promoted to Admin every time they sign in. Taking an address off
the list does **not** demote anyone; do that on the Users page. The rules live in
`src/lib/permissions.ts`, shared by the API (which enforces them) and the UI
(which only hides what you can't use).

### 4. Create the schema and sample data

```bash
npm run db:migrate   # apply migrations
npm run db:seed      # 4 demo teammates, 12 issues
```

The seed's users exist so the board has assignees before anyone signs in. Real
Google users join them.

### 5. Run it

```bash
npm run dev          # http://localhost:3000
```

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Regenerate the Prisma client, then production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit + API tests (see below) |
| `npm run check` | typecheck + lint + tests |
| `npm run clean` | Delete `.next` (see troubleshooting below) |
| `npm run db:migrate` | Create/apply a migration |
| `npm run db:seed` | Reset and reseed sample data |
| `npm run db:reset` | Drop, re-migrate and reseed |
| `npm run db:studio` | Prisma Studio |
| `npm run db:psql` | `psql` inside the container |

If the Prisma client ever goes missing (it is gitignored), run
`npx prisma generate`.

## Tests

`npm test` runs two layers on Node's built-in test runner:

- **Unit** — `tests/issue`, `issue-filters`, `validation`, `dates`. Pure
  functions, no server: the workflow graph, the Zod schemas, filter parsing and
  the due-date maths.
- **API** — `tests/api.test.ts` drives a running server over HTTP: auth gating,
  the full CRUD lifecycle, workflow enforcement and input validation. It skips
  itself when nothing is listening, and cleans up the issues and users it makes.

For the API layer, run the server first:

```bash
npm run dev     # one shell
npm test        # another
```

## Troubleshooting

### `Cannot find module './NNN.js'` / chunk load errors

`next dev` and `next build` write to the same `.next/` directory. Running one
while the other is going leaves a half-overwritten build directory, and the
runtime then fails to find the chunks its `webpack-runtime.js` points at.

Recover with:

```bash
# stop the dev server first (Ctrl-C), then
npm run clean
npm run dev
```

The rule: pick one mode. `npm run dev` for development, or
`npm run build` + `npm start` for production — never both at once.

## API

Every route requires a session. Unauthenticated API calls get `401` with
`{"error":"Unauthorized"}`; unauthenticated page visits redirect to `/login`
with a `callbackUrl`.

A write the caller's role doesn't allow returns `403` with
`{"error":"Forbidden","reason":"..."}`. The role check runs before the body is
validated.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/issues` | Filters: `q`, `status`, `priority`, `assigneeId` (`none` = unassigned), `sort`, `direction` |
| `POST` | `/api/issues` | Creates an issue. Reporter comes from the session, not the body. |
| `GET` | `/api/issues/:id` | Single issue |
| `PATCH` | `/api/issues/:id` | Partial update; omitted fields are left untouched |
| `DELETE` | `/api/issues/:id` | `204` on success |
| `POST` | `/api/issues/:id/transition` | Workflow-guarded status change; `409` if the move is illegal |
| `GET` | `/api/users` | Every user, with their `role` |
| `PATCH` | `/api/users/:id` | `{ "role": "ADMIN" \| "MEMBER" \| "VIEWER" }`. Admins only; `409` when it would leave no Admin |
| `*` | `/api/auth/*` | Auth.js endpoints |

Validation failures return `400` with a `fields` map of `{ field: "message" }`.

## Authentication design

`src/lib/auth.config.ts` holds an **edge-safe** config — providers, pages and JWT
callbacks, but no database. `src/lib/auth.ts` spreads that and adds the Prisma
adapter. The split matters because `src/middleware.ts` runs on the edge runtime
and cannot import the Prisma client; sessions are JWTs so the middleware can
authorise a request without querying Postgres.

Three details worth knowing before you change this:

- **The reporter is never taken from the request body.** `POST /api/issues`
  overwrites `reporterId` with the session user, so a client cannot file issues
  in someone else's name.
- **The Credentials (dev login) provider bypasses the adapter**, so no `User`
  row is created for it. The `signIn` *callback* in `src/lib/auth.ts` upserts
  one explicitly — without it, anything foreign-keying to the user fails on the
  first write. `authorize` returns `null` unless both a name and a valid email
  are supplied, so an empty submission cannot mint a session.
- **Sign-in restrictions live in the `signIn` callback, not in `events`.** Auth.js
  only *logs* errors thrown by event handlers, so a rejection there would leave
  a denied sign-in looking successful. Returning `false` from the callback is
  what actually refuses. The callback also enforces `AUTH_ALLOWED_DOMAINS` and
  rejects Google addresses that come back with `email_verified: false`.

## Workflow rules

Defined once in `src/lib/issue.ts` as `TRANSITIONS`, and used by the board, the
issue detail buttons and the API — so the UI cannot offer a move the server
would reject.

```
To Do        → In Progress
In Progress  → To Do, In Review
In Review    → In Progress, Done
Done         → In Review
```

## Layout

```
prisma/schema.prisma        Data model (Issue, User, Account/Session/...)
prisma/seed.ts              Sample data
prisma7.config.ts           Prisma CLI config (datasource URL, seed command)
src/lib/auth.config.ts      Edge-safe Auth.js config (no database)
src/lib/auth.ts             Auth.js + Prisma adapter, sign-in event hooks
src/middleware.ts           Requires a session on every route
src/lib/issue.ts            Status/priority metadata + TRANSITIONS rules
src/lib/issue-service.ts    Prisma row → client DTO
src/lib/issue-filters.ts    URL params → Prisma where clause
src/lib/validation.ts       Zod schemas for create/patch/transition
src/app/login/page.tsx      Sign-in page
src/app/api/auth/[...nextauth]/  Auth.js route handler
src/app/api/                Issue + user route handlers
src/app/page.tsx            Issue list
src/app/board/page.tsx      Kanban board
src/app/issues/[id]/page.tsx Issue detail
src/components/Board.tsx    Drag-and-drop board (client)
```

## Possible next steps

Per-project issue keys and multiple boards, an activity/history timeline, bulk
edit from the list, soft delete with an archive view, CSV export, comments on
issues, and role-based permissions (today every signed-in user can do everything).
