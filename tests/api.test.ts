import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

/**
 * End-to-end checks against a running dev server. Skipped automatically when
 * nothing is listening, so `npm test` still works on a bare checkout.
 *
 *   npm run dev            # in one shell
 *   npm test               # in another
 */
const BASE = process.env.JIJI_TEST_BASE_URL ?? "http://localhost:3000";

/** Every test user's email starts with this, so the cleanup can find them all. */
const TEST_EMAIL_PREFIX = "e2e-";
const unique = () => `${TEST_EMAIL_PREFIX}${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/** Every issue the suite creates goes into this dashboard (named with the e2e- prefix). */
let testDashboardId = "";
const TEST_DASHBOARD_PREFIX = "e2e-";

let reachable = false;
/** The dev-login provider is deliberately off in a production build, so the
 *  authenticated tests have nothing to sign in with there. */
let devLoginAvailable = false;

before(async () => {
  reachable = await fetch(`${BASE}/api/auth/session`)
    .then((response) => response.ok)
    .catch(() => false);
  if (!reachable) {
    console.log(`  (skipping: no server at ${BASE})`);
    return;
  }

  const probe = createClient();
  const response = await probe.devLogin("Probe", `${TEST_EMAIL_PREFIX}probe@example.com`);
  devLoginAvailable = response.status === 302 && Boolean((await probe.session())?.user);
  if (!devLoginAvailable) {
    console.log("  (skipping signed-in tests: the dev-login provider is disabled here)");
  }
  if (!devLoginAvailable) return;

  // Created here rather than in a second top-level `before`: this must run after
  // the dev-login probe above has set `devLoginAvailable`.
  const { prisma } = await import("@/lib/prisma");
  const dashboard = await prisma.dashboard.create({
    data: { name: `${TEST_DASHBOARD_PREFIX}${process.pid}-${Date.now()}` },
  });
  testDashboardId = dashboard.id;
});

/**
 * Whether the signed-in tests can run. Called inline as
 * `if (!canAuth()) return t.skip(...)` — `t.skip()` only aborts the test body
 * when it is reached in the test's own call stack.
 */
function canAuth() {
  return reachable && devLoginAvailable;
}

/** Minimal cookie jar: enough for one signed-in session. */
function createClient() {
  const jar = new Map<string, string>();

  function cookieHeader() {
    return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  function absorb(response: Response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair!.indexOf("=");
      const name = pair!.slice(0, index);
      const value = pair!.slice(index + 1);
      if (value === "") jar.delete(name);
      else jar.set(name, value);
    }
  }

  return {
    async request(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      if (jar.size) headers.set("cookie", cookieHeader());
      // Only default to JSON; the sign-in POST sends a form body and needs its
      // own content-type or Auth.js cannot read the CSRF token.
      if (init.body && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      const response = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
      absorb(response);
      return response;
    },
    get: (path: string) => fetch(`${BASE}${path}`, { headers: { cookie: cookieHeader() } }),
    /** Sign in through the dev-login credentials provider. */
    async devLogin(name: string, email: string) {
      const csrf = await (await this.request("/api/auth/csrf")).json();
      const body = new URLSearchParams({ csrfToken: csrf.csrfToken, name, email });
      const response = await this.request("/api/auth/callback/dev-login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      return response;
    },
    async session() {
      return (await (await this.request("/api/auth/session")).json()) as {
        user?: { id: string; email: string };
      } | null;
    },
  };
}


type TestRole = "ADMIN" | "MEMBER" | "VIEWER";
type Client = ReturnType<typeof createClient>;

/**
 * Sign a fresh dev user in and give them `role`. The role is set through
 * Prisma because nothing in the API lets a user promote themselves.
 * Returns the user's id.
 */
async function signInAs(client: Client, name: string, role: TestRole = "MEMBER") {
  await client.devLogin(name, `${unique()}@example.com`);
  const id = (await client.session())?.user?.id;
  assert.ok(id, `expected ${name} to be signed in`);
  const { prisma } = await import("@/lib/prisma");
  await prisma.user.update({ where: { id }, data: { role } });
  return id;
}

const created: string[] = [];

after(async () => {
  if (!reachable) return;
  const { prisma } = await import("@/lib/prisma");
  // Through Prisma, not the API: most test users are Members, who may not
  // delete issues someone else reported.
  await prisma.issue.deleteMany({ where: { id: { in: created } } });

  // Case-insensitive: the case-only rename test upper-cases names to "E2E-...".
  const testDashboards = {
    name: { startsWith: TEST_DASHBOARD_PREFIX, mode: "insensitive" as const },
  };
  await prisma.issue.deleteMany({ where: { dashboard: testDashboards } });
  await prisma.dashboard.deleteMany({ where: testDashboards });

  // Signing in provisions a User row, so the suite would otherwise pile up a
  // stray dev user on every run. Reporter/assignee links are SetNull on delete.
  const { count } = await prisma.user.deleteMany({
    where: { id: { startsWith: `dev-${TEST_EMAIL_PREFIX}` } },
  });
  if (count) console.log(`  (cleaned up ${count} test user(s))`);
});

describe("authentication", () => {
  it("returns no session for an anonymous visitor", async (t) => {
    if (!reachable) return t.skip("no server");
    const response = await fetch(`${BASE}/api/auth/session`);
    assert.equal(response.status, 200);
    assert.equal(await response.json(), null);
  });

  it("refuses anonymous API access with 401", async (t) => {
    if (!reachable) return t.skip("no server");
    for (const [method, path] of [
      ["GET", "/api/issues"],
      ["POST", "/api/issues"],
      ["DELETE", "/api/issues/whatever"],
      ["PATCH", "/api/issues/whatever"],
    ] as const) {
      const response = await fetch(`${BASE}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "GET" || method === "DELETE" ? undefined : "{}",
        redirect: "manual",
      });
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.deepEqual(await response.json(), { error: "Unauthorized" });
    }
  });

  it("redirects anonymous page visits to the login page", async (t) => {
    if (!reachable) return t.skip("no server");
    for (const path of ["/", "/board", "/issues/new", "/dashboards"]) {
      const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
      assert.equal(response.status, 307, path);
      assert.match(response.headers.get("location") ?? "", /\/login/, path);
    }
  });

  it("signs a dev user in and provisions their row", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const client = createClient();
    const email = `${unique()}@example.com`;
    const response = await client.devLogin("E2E User", email);
    assert.equal(response.status, 302);

    const session = await client.session();
    assert.ok(session?.user, "expected a session");
    assert.equal(session.user.email, email);
    // The session id must address a real row, or every write fails on a foreign key.
    const created2 = await client.request("/api/issues", {
      method: "POST",
      body: JSON.stringify({ dashboardId: testDashboardId, title: "provisioning check" }),
    });
    assert.equal(created2.status, 201, "a dev session must be able to create an issue");
    const { issue } = (await created2.json()) as { issue: { id: string } };
    created.push(issue.id);
  });
});

describe("issue lifecycle", () => {
  const client = createClient();

  before(async () => {
    if (!reachable || !devLoginAvailable) return;
    await signInAs(client, "E2E CRUD");
  });

  it("creates, reads, updates and deletes an issue", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");

    const create = await client.request("/api/issues", {
      method: "POST",
      body: JSON.stringify({ dashboardId: testDashboardId,
        title: "  Round trip  ",
        description: "  spaced  ",
        priority: "HIGH",
        dueDate: "2026-06-01",
      }),
    });
    assert.equal(create.status, 201);
    const { issue } = (await create.json()) as {
      issue: { id: string; title: string; description: string; status: string; number: number };
    };
    created.push(issue.id);
    assert.equal(issue.title, "Round trip", "title should be trimmed");
    assert.equal(issue.status, "TODO", "status should default");
    assert.ok(issue.number > 0);

    const read = await client.request(`/api/issues/${issue.id}`);
    assert.equal(read.status, 200);
    assert.equal(((await read.json()) as { issue: { title: string } }).issue.title, "Round trip");

    const patch = await client.request(`/api/issues/${issue.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Renamed" }),
    });
    assert.equal(patch.status, 200);
    const patched = ((await patch.json()) as { issue: { title: string; status: string } }).issue;
    assert.equal(patched.title, "Renamed");
    assert.equal(patched.status, "TODO", "a patch must not reset status");

    const remove = await client.request(`/api/issues/${issue.id}`, { method: "DELETE" });
    assert.equal(remove.status, 204);
    created.splice(created.indexOf(issue.id), 1);

    assert.equal((await client.request(`/api/issues/${issue.id}`)).status, 404);
  });

  it("404s on an unknown issue and 400s on bad input", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    assert.equal((await client.request("/api/issues/does-not-exist")).status, 404);
    assert.equal(
      (await client.request("/api/issues/does-not-exist", { method: "PATCH", body: "{}" })).status,
      400,
      "validation runs before the existence check",
    );
    assert.equal(
      (await client.request("/api/issues", { method: "POST", body: JSON.stringify({ dashboardId: testDashboardId, title: "" }) }))
        .status,
      400,
    );
  });

  it("requires an existing dashboard", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    for (const body of [{ title: "no dashboard" }, { title: "bad dashboard", dashboardId: "nope" }]) {
      const response = await client.request("/api/issues", {
        method: "POST",
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, JSON.stringify(body));
      const json = (await response.json()) as { fields?: Record<string, string> };
      assert.ok(json.fields?.dashboardId, "expected fields.dashboardId");
    }
  });

  it("returns the issue's dashboard", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const response = await client.request("/api/issues", {
      method: "POST",
      body: JSON.stringify({ dashboardId: testDashboardId, title: "dashboard check" }),
    });
    assert.equal(response.status, 201);
    const { issue } = (await response.json()) as {
      issue: { id: string; dashboard: { id: string; name: string } };
    };
    created.push(issue.id);
    assert.equal(issue.dashboard.id, testDashboardId);
    assert.match(issue.dashboard.name, new RegExp(`^${TEST_DASHBOARD_PREFIX}`));
  });

  it("never lets the client forge the reporter", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const response = await client.request("/api/issues", {
      method: "POST",
      body: JSON.stringify({ dashboardId: testDashboardId, title: "forged reporter", reporterId: "someone-else" }),
    });
    assert.equal(response.status, 201);
    const { issue } = (await response.json()) as {
      issue: { id: string; reporter: { id: string } | null };
    };
    created.push(issue.id);
    const session = await client.session();
    assert.equal(issue.reporter?.id, session!.user!.id);
  });
});

describe("workflow enforcement", () => {
  const client = createClient();
  let issueId = "";

  before(async () => {
    if (!reachable || !devLoginAvailable) return;
    await signInAs(client, "E2E Flow");
    const response = await client.request("/api/issues", {
      method: "POST",
      body: JSON.stringify({ dashboardId: testDashboardId, title: "workflow check" }),
    });
    issueId = ((await response.json()) as { issue: { id: string } }).issue.id;
    created.push(issueId);
  });

  it("rejects a move the workflow forbids", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const response = await client.request(`/api/issues/${issueId}/transition`, {
      method: "POST",
      body: JSON.stringify({ status: "DONE" }),
    });
    // 409, not 400: the request is well-formed, the workflow just forbids it.
    assert.equal(response.status, 409, "To Do cannot jump straight to Done");
  });

  it("accepts a legal move and reflects it in the issue", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const response = await client.request(`/api/issues/${issueId}/transition`, {
      method: "POST",
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    assert.equal(response.status, 200);
    assert.equal(
      ((await response.json()) as { issue: { status: string } }).issue.status,
      "IN_PROGRESS",
    );
  });

  it("rejects an unknown status", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    for (const status of ["ARCHIVED", "constructor", "toString", ""]) {
      const response = await client.request(`/api/issues/${issueId}/transition`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      assert.equal(response.status, 400, status);
    }
  });
});

describe("filters and sorting", () => {
  const client = createClient();

  before(async () => {
    if (!reachable || !devLoginAvailable) return;
    await signInAs(client, "E2E Filters");
  });

  it("ignores inherited Object.prototype keys instead of 500ing", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    // Regression: these reached Prisma as enum/column values and threw.
    for (const query of [
      "status=constructor",
      "status=toString",
      "status=__proto__",
      "priority=valueOf",
      "sort=constructor",
      "sort=toString",
      "sort=hasOwnProperty",
      "direction=constructor&sort=title",
    ]) {
      const response = await client.request(`/api/issues?${query}`);
      assert.equal(response.status, 200, query);
    }
  });

  it("treats a wildcard-only search as matching nothing", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const response = await client.request("/api/issues?q=%25");
    const { total } = (await response.json()) as { total: number };
    assert.equal(total, 0, "'%' must not match every issue");

    const all = await client.request("/api/issues");
    assert.ok(((await all.json()) as { total: number }).total > 0, "sanity: there are issues");
  });

  it("filters by a real status and by the unassigned sentinel", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    for (const status of ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]) {
      const response = await client.request(`/api/issues?status=${status}`);
      assert.equal(response.status, 200);
      const { issues } = (await response.json()) as { issues: { status: string }[] };
      for (const issue of issues) assert.equal(issue.status, status);
    }
    const unassigned = await client.request("/api/issues?assigneeId=none");
    assert.equal(unassigned.status, 200);
  });
});

describe("assignee handling", () => {
  const client = createClient();

  before(async () => {
    if (!reachable || !devLoginAvailable) return;
    await signInAs(client, "E2E Assignee");
  });

  it("rejects an assignee that is not a user, with 400 not 500", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const create = await client.request("/api/issues", {
      method: "POST",
      body: JSON.stringify({ dashboardId: testDashboardId, title: "assignee check" }),
    });
    const id = ((await create.json()) as { issue: { id: string } }).issue.id;
    created.push(id);

    // Regression: assigneeId is a foreign key, so an unknown id used to surface
    // as a Postgres constraint violation and a 500.
    for (const assigneeId of ["does-not-exist", "constructor", "__proto__", "toString"]) {
      const response = await client.request(`/api/issues/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ assigneeId }),
      });
      assert.equal(response.status, 400, assigneeId);
      const body = (await response.json()) as { fields?: Record<string, string> };
      assert.ok(body.fields?.assigneeId, "expected a field-level message");
    }
  });

  it("accepts both ways of clearing an assignee", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const create = await client.request("/api/issues", {
      method: "POST",
      body: JSON.stringify({ dashboardId: testDashboardId, title: "clear assignee", assigneeId: "" }),
    });
    const id = ((await create.json()) as { issue: { id: string; assignee: unknown } }).issue;
    created.push(id.id);
    assert.equal(id.assignee, null, "an empty string means unassigned");

    // "none" is the sentinel the filter UI uses; writes should accept it too.
    const patched = await client.request(`/api/issues/${id.id}`, {
      method: "PATCH",
      body: JSON.stringify({ assigneeId: "none" }),
    });
    assert.equal(patched.status, 200);
  });
});

describe("pages render", () => {
  const client = createClient();

  before(async () => {
    if (!reachable || !devLoginAvailable) return;
    await signInAs(client, "E2E Pages");
  });

  it("serves the main pages to a signed-in user", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    for (const path of ["/", "/board", "/issues/new", "/login"]) {
      const response = await client.get(path);
      assert.equal(response.status, 200, path);
    }
  });

  it("serves an issue detail page", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const list = (await (await client.request("/api/issues")).json()) as {
      issues: { id: string; number: number }[];
    };
    const issue = list.issues[0];
    assert.ok(issue, "expected at least one seeded issue");
    const response = await client.get(`/issues/${issue.id}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), new RegExp(`JIJI-${issue.number}`));
  });
});

describe("dashboards", () => {
  const client = createClient();
  /** Unique per run so names never collide with real dashboards or earlier runs. */
  const tag = () => `${TEST_DASHBOARD_PREFIX}${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  type DashboardBody = {
    dashboard: { id: string; name: string; description: string | null; issueCount: number };
  };

  before(async () => {
    if (!reachable || !devLoginAvailable) return;
    await signInAs(client, "E2E Dashboards", "ADMIN");
  });

  it("creates a dashboard and lists it, sorted by name", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const name = `${tag()} Website`;
    const response = await client.request("/api/dashboards", {
      method: "POST",
      body: JSON.stringify({ name, description: "Marketing site" }),
    });
    assert.equal(response.status, 201);
    const { dashboard } = (await response.json()) as DashboardBody;
    assert.equal(dashboard.name, name);
    assert.equal(dashboard.description, "Marketing site");
    assert.equal(dashboard.issueCount, 0);

    const list = await client.request("/api/dashboards");
    assert.equal(list.status, 200);
    const { dashboards } = (await list.json()) as { dashboards: { id: string; name: string }[] };
    assert.ok(dashboards.some((d) => d.id === dashboard.id), "new dashboard is listed");
    const names = dashboards.map((d) => d.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
  });

  it("rejects invalid input with 400 and stores nothing", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const before = ((await (await client.request("/api/dashboards")).json()) as { dashboards: unknown[] })
      .dashboards.length;
    for (const [body, field] of [
      [{}, "name"],
      [{ name: "   " }, "name"],
      [{ name: "a".repeat(81) }, "name"],
      [{ name: `${tag()} long`, description: "a".repeat(501) }, "description"],
    ] as const) {
      const response = await client.request("/api/dashboards", {
        method: "POST",
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, JSON.stringify(body));
      const json = (await response.json()) as { fields?: Record<string, string> };
      assert.ok(json.fields?.[field], `expected fields.${field}`);
    }
    const after = ((await (await client.request("/api/dashboards")).json()) as { dashboards: unknown[] })
      .dashboards.length;
    assert.equal(after, before);
  });

  it("rejects a duplicate name regardless of case with 409", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const name = `${tag()} Web`;
    const first = await client.request("/api/dashboards", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    assert.equal(first.status, 201);
    const second = await client.request("/api/dashboards", {
      method: "POST",
      body: JSON.stringify({ name: name.toUpperCase() }),
    });
    assert.equal(second.status, 409);
    const json = (await second.json()) as { error: string; fields?: Record<string, string> };
    assert.equal(json.error, "Name already in use");
    assert.ok(json.fields?.name);
  });

  it("lets exactly one of several concurrent same-name creates win", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const name = `${tag()} Race`;
    const statuses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        client
          .request("/api/dashboards", {
            method: "POST",
            body: JSON.stringify({ name: i % 2 ? name.toUpperCase() : name }),
          })
          .then((response) => response.status),
      ),
    );
    assert.deepEqual(
      statuses.toSorted(),
      [201, 409, 409, 409, 409],
      `got ${statuses.join(", ")}: a 500 means the unique violation was not mapped`,
    );
  });

  async function createDashboard(name = `${tag()} dash`) {
    const response = await client.request("/api/dashboards", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    assert.equal(response.status, 201);
    return ((await response.json()) as DashboardBody).dashboard;
  }

  async function createIssueIn(dashboardId: string, title = "dashboard member") {
    const response = await client.request("/api/issues", {
      method: "POST",
      body: JSON.stringify({ dashboardId, title }),
    });
    assert.equal(response.status, 201);
    const { issue } = (await response.json()) as { issue: { id: string } };
    created.push(issue.id);
    return issue;
  }

  it("renames a dashboard and validates the patch", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const dashboard = await createDashboard();
    const newName = `${tag()} Site`;

    const patch = await client.request(`/api/dashboards/${dashboard.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: newName }),
    });
    assert.equal(patch.status, 200);
    assert.equal(((await patch.json()) as DashboardBody).dashboard.name, newName);

    const read = await client.request(`/api/dashboards/${dashboard.id}`);
    assert.equal(read.status, 200);
    assert.equal(((await read.json()) as DashboardBody).dashboard.name, newName);

    const empty = await client.request(`/api/dashboards/${dashboard.id}`, {
      method: "PATCH",
      body: "{}",
    });
    assert.equal(empty.status, 400);

    const unknown = await client.request("/api/dashboards/does-not-exist", {
      method: "PATCH",
      body: JSON.stringify({ name: `${tag()} x` }),
    });
    assert.equal(unknown.status, 404);
    assert.equal((await client.request("/api/dashboards/does-not-exist")).status, 404);
  });

  it("409s a rename onto another dashboard's name but allows a case-only rename", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const a = await createDashboard();
    const b = await createDashboard();

    const clash = await client.request(`/api/dashboards/${b.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: a.name.toUpperCase() }),
    });
    assert.equal(clash.status, 409);

    const recase = await client.request(`/api/dashboards/${b.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: b.name.toUpperCase() }),
    });
    assert.equal(recase.status, 200);
  });

  it("deletes an empty dashboard", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const dashboard = await createDashboard();
    const remove = await client.request(`/api/dashboards/${dashboard.id}`, { method: "DELETE" });
    assert.equal(remove.status, 204);
    assert.equal((await client.request(`/api/dashboards/${dashboard.id}`)).status, 404);
  });

  it("refuses to delete a dashboard that still has issues", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const dashboard = await createDashboard();
    const issues = [await createIssueIn(dashboard.id), await createIssueIn(dashboard.id)];

    const remove = await client.request(`/api/dashboards/${dashboard.id}`, { method: "DELETE" });
    assert.equal(remove.status, 409);
    assert.deepEqual(await remove.json(), { error: "Dashboard still has issues", issueCount: 2 });

    const read = await client.request(`/api/dashboards/${dashboard.id}`);
    assert.equal(read.status, 200);
    assert.equal(((await read.json()) as DashboardBody).dashboard.issueCount, 2);
    for (const issue of issues) {
      assert.equal((await client.request(`/api/issues/${issue.id}`)).status, 200);
    }
  });

  it("moves an issue to another dashboard and keeps its key", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const a = await createDashboard();
    const b = await createDashboard();
    const original = await createIssueIn(a.id);
    const before = (await (await client.request(`/api/issues/${original.id}`)).json()) as {
      issue: { key: string; number: number };
    };

    const move = await client.request(`/api/issues/${original.id}`, {
      method: "PATCH",
      body: JSON.stringify({ dashboardId: b.id }),
    });
    assert.equal(move.status, 200);
    const { issue } = (await move.json()) as {
      issue: { key: string; number: number; dashboard: { id: string; name: string } };
    };
    assert.equal(issue.dashboard.id, b.id);
    assert.equal(issue.dashboard.name, b.name);
    assert.equal(issue.key, before.issue.key, "moving must not change the key");
    assert.equal(issue.number, before.issue.number);

    const reread = (await (await client.request(`/api/issues/${original.id}`)).json()) as {
      issue: { dashboard: { id: string } };
    };
    assert.equal(reread.issue.dashboard.id, b.id);

    const listA = (await (await client.request(`/api/issues?dashboardId=${a.id}`)).json()) as {
      issues: { id: string }[];
    };
    assert.ok(!listA.issues.some((i) => i.id === original.id), "no longer listed in the old dashboard");
    const listB = (await (await client.request(`/api/issues?dashboardId=${b.id}`)).json()) as {
      issues: { id: string }[];
    };
    assert.ok(listB.issues.some((i) => i.id === original.id), "listed in the new dashboard");

    const bad = await client.request(`/api/issues/${original.id}`, {
      method: "PATCH",
      body: JSON.stringify({ dashboardId: "nope" }),
    });
    assert.equal(bad.status, 400);
    const json = (await bad.json()) as { fields?: Record<string, string> };
    assert.ok(json.fields?.dashboardId, "expected fields.dashboardId");
  });

  it("lists only one dashboard's issues, with counts scoped to it", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const a = await createDashboard();
    const b = await createDashboard();
    const todo = await createIssueIn(a.id);
    const done = await createIssueIn(a.id);
    const other = await createIssueIn(b.id);

    // Walk `done` through the workflow to DONE.
    for (const status of ["IN_PROGRESS", "IN_REVIEW", "DONE"]) {
      const step = await client.request(`/api/issues/${done.id}/transition`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      assert.equal(step.status, 200, status);
    }

    const response = await client.request(`/api/issues?dashboardId=${a.id}`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      issues: { id: string }[];
      counts: Record<string, number>;
      total: number;
    };
    assert.deepEqual(body.issues.map((i) => i.id).sort(), [todo.id, done.id].sort());
    assert.equal(body.total, 2);
    assert.deepEqual(body.counts, { TODO: 1, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 1 });

    const all = (await (await client.request("/api/issues")).json()) as { issues: { id: string }[] };
    const ids = new Set(all.issues.map((i) => i.id));
    assert.ok(ids.has(todo.id) && ids.has(other.id), "no parameter means every dashboard");
  });

  it("scopes the list and board pages to the selected dashboard", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const a = await createDashboard();
    const b = await createDashboard();
    const titleA = `${tag()} only-in-A`;
    const titleB = `${tag()} only-in-B`;
    await createIssueIn(a.id, titleA);
    await createIssueIn(b.id, titleB);

    for (const path of ["/", "/board"]) {
      const response = await client.get(`${path}?dashboard=${a.id}`);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.ok(html.includes(titleA), `${path} shows A's issue`);
      assert.ok(!html.includes(titleB), `${path} hides B's issue`);
    }
  });

  it("puts the issue's own dashboard in the issue page URL", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const a = await createDashboard();
    const b = await createDashboard();
    const issue = await createIssueIn(a.id);

    for (const query of ["", `?dashboard=${b.id}`]) {
      const response = await client.request(`/issues/${issue.id}${query}`);
      assert.equal(response.status, 307, `redirects for "${query}"`);
      assert.equal(
        new URL(response.headers.get("location")!, BASE).search,
        `?dashboard=${a.id}`,
        `canonical URL for "${query}"`,
      );
    }

    const canonical = await client.request(`/issues/${issue.id}?dashboard=${a.id}`);
    assert.equal(canonical.status, 200);
  });

  it("offers status and assignee dropdowns on the issue page", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const dashboard = await createDashboard();
    const issue = await createIssueIn(dashboard.id);
    // Move to IN_PROGRESS, whose allowed moves are TODO and IN_REVIEW (not DONE).
    const step = await client.request(`/api/issues/${issue.id}/transition`, {
      method: "POST",
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    assert.equal(step.status, 200);

    const html = await (await client.get(`/issues/${issue.id}?dashboard=${dashboard.id}`)).text();
    const select = (label: string) =>
      html.match(new RegExp(`<select[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</select>`))?.[1];

    const status = select("Status");
    assert.ok(status, "expected a Status dropdown");
    const values = [...status.matchAll(/value="([A-Z_]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(values, ["IN_PROGRESS", "IN_REVIEW", "TODO"], "current status plus allowed moves only");

    const assignee = select("Assignee");
    assert.ok(assignee, "expected an Assignee dropdown");
    assert.match(assignee, /Unassigned/);
  });

  it("404s a page for an unknown dashboard", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    for (const path of ["/", "/board"]) {
      const response = await client.get(`${path}?dashboard=does-not-exist`);
      assert.equal(response.status, 404, path);
    }
  });

  it("serves the dashboards page with names and issue counts", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const dashboard = await createDashboard();
    await createIssueIn(dashboard.id);
    await createIssueIn(dashboard.id);

    const response = await client.get("/dashboards");
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(dashboard.name), "lists the dashboard");
    // React may split text nodes with <!-- --> comments, so strip them first.
    const text = html.replace(/<!-- -->/g, "");
    assert.match(text, /2 issues/, "shows the issue count");
    assert.match(text, /Move or delete its 2 issues first/, "explains why delete is blocked");
  });

  it("404s when deleting an unknown dashboard", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const response = await client.request("/api/dashboards/does-not-exist", { method: "DELETE" });
    assert.equal(response.status, 404);
  });

  it("refuses anonymous writes with 401", async (t) => {
    if (!reachable) return t.skip("no server");
    for (const [method, path] of [
      ["POST", "/api/dashboards"],
      ["PATCH", "/api/dashboards/whatever"],
      ["DELETE", "/api/dashboards/whatever"],
    ] as const) {
      const response = await fetch(`${BASE}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify({ name: "anon" }),
        redirect: "manual",
      });
      assert.equal(response.status, 401, `${method} ${path}`);
    }
  });
});

describe("issue permissions", () => {
  const admin = createClient();
  const memberA = createClient();
  const memberB = createClient();
  const viewer = createClient();
  let memberAId = "";
  let otherDashboardId = "";

  type IssueBody = { issue: { id: string; title: string; status: string; dashboard: { id: string } } };

  before(async () => {
    if (!reachable || !devLoginAvailable) return;
    await signInAs(admin, "E2E Perm Admin", "ADMIN");
    memberAId = await signInAs(memberA, "E2E Perm Member A");
    await signInAs(memberB, "E2E Perm Member B");
    await signInAs(viewer, "E2E Perm Viewer", "VIEWER");
    const { prisma } = await import("@/lib/prisma");
    const other = await prisma.dashboard.create({
      data: { name: `${TEST_DASHBOARD_PREFIX}${process.pid}-perm-${Date.now()}` },
    });
    otherDashboardId = other.id;
  });

  /** An issue reported by `reporterId` (null for none), made through Prisma. */
  async function seedIssue(reporterId: string | null, title = "permission target") {
    const { prisma } = await import("@/lib/prisma");
    const issue = await prisma.issue.create({
      data: { title, dashboardId: testDashboardId, reporterId },
    });
    created.push(issue.id);
    return issue.id;
  }

  async function readIssue(id: string) {
    const response = await admin.request(`/api/issues/${id}`);
    return response.status === 200 ? ((await response.json()) as IssueBody).issue : null;
  }

  async function assertForbidden(response: Response, label: string) {
    assert.equal(response.status, 403, label);
    const body = (await response.json()) as { error: string; reason: string };
    assert.equal(body.error, "Forbidden", label);
    assert.ok(body.reason, `${label}: expected a reason`);
  }

  it("refuses every issue write from a Viewer and changes nothing", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const id = await seedIssue(memberAId, "viewer target");

    await assertForbidden(
      await viewer.request("/api/issues", {
        method: "POST",
        body: JSON.stringify({ dashboardId: testDashboardId, title: "viewer create" }),
      }),
      "POST",
    );
    await assertForbidden(
      await viewer.request(`/api/issues/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "viewer edit" }),
      }),
      "PATCH",
    );
    await assertForbidden(
      await viewer.request(`/api/issues/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      }),
      "transition",
    );
    await assertForbidden(
      await viewer.request(`/api/issues/${id}`, { method: "DELETE" }),
      "DELETE",
    );

    const after = await readIssue(id);
    assert.ok(after, "the issue must still exist");
    assert.equal(after.title, "viewer target");
    assert.equal(after.status, "TODO");

    const { prisma } = await import("@/lib/prisma");
    assert.equal(await prisma.issue.count({ where: { title: "viewer create" } }), 0);
  });

  it("checks the role before validating the body", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const id = await seedIssue(memberAId);
    await assertForbidden(
      await viewer.request(`/api/issues/${id}`, { method: "PATCH", body: "{}" }),
      "PATCH {}",
    );
    await assertForbidden(
      await viewer.request("/api/issues", { method: "POST", body: "{}" }),
      "POST {}",
    );
  });

  it("lets a Viewer read issues", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const id = await seedIssue(memberAId);
    assert.equal((await viewer.request("/api/issues")).status, 200);
    assert.equal((await viewer.request(`/api/issues/${id}`)).status, 200);
  });

  it("lets a Member edit, assign, move and transition someone else's issue", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const id = await seedIssue(memberAId);

    const patch = await memberB.request(`/api/issues/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "edited by B", assigneeId: memberAId, dashboardId: otherDashboardId }),
    });
    assert.equal(patch.status, 200);
    const patched = ((await patch.json()) as IssueBody).issue;
    assert.equal(patched.title, "edited by B");
    assert.equal(patched.dashboard.id, otherDashboardId);

    const move = await memberB.request(`/api/issues/${id}/transition`, {
      method: "POST",
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    assert.equal(move.status, 200);
  });

  it("lets a Member delete only issues they reported", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const othersIssue = await seedIssue(memberAId, "A's issue");
    const orphan = await seedIssue(null, "no reporter");

    await assertForbidden(
      await memberB.request(`/api/issues/${othersIssue}`, { method: "DELETE" }),
      "B deletes A's issue",
    );
    await assertForbidden(
      await memberB.request(`/api/issues/${orphan}`, { method: "DELETE" }),
      "B deletes an issue with no reporter",
    );
    assert.ok(await readIssue(othersIssue), "A's issue must still exist");
    assert.ok(await readIssue(orphan), "the orphan must still exist");

    const own = await memberA.request(`/api/issues/${othersIssue}`, { method: "DELETE" });
    assert.equal(own.status, 204);
  });

  it("lets an Admin delete any issue", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const othersIssue = await seedIssue(memberAId);
    const orphan = await seedIssue(null);
    assert.equal((await admin.request(`/api/issues/${othersIssue}`, { method: "DELETE" })).status, 204);
    assert.equal((await admin.request(`/api/issues/${orphan}`, { method: "DELETE" })).status, 204);
  });

  it("still returns 401, not 403, without a session", async (t) => {
    if (!reachable) return t.skip("no server");
    const anon = createClient();
    for (const [method, path] of [
      ["POST", "/api/issues"],
      ["PATCH", "/api/issues/whatever"],
      ["POST", "/api/issues/whatever/transition"],
      ["DELETE", "/api/issues/whatever"],
    ] as const) {
      const response = await anon.request(path, {
        method,
        body: method === "DELETE" ? undefined : "{}",
      });
      assert.equal(response.status, 401, `${method} ${path}`);
    }
  });
});

describe("dashboard permissions", () => {
  const member = createClient();
  const viewer = createClient();
  let targetId = "";
  let targetName = "";

  before(async () => {
    if (!reachable || !devLoginAvailable) return;
    await signInAs(member, "E2E Dash Member");
    await signInAs(viewer, "E2E Dash Viewer", "VIEWER");
    const { prisma } = await import("@/lib/prisma");
    targetName = `${TEST_DASHBOARD_PREFIX}${process.pid}-dashperm-${Date.now()}`;
    targetId = (await prisma.dashboard.create({ data: { name: targetName } })).id;
  });

  it("refuses dashboard writes from Members and Viewers and changes nothing", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    for (const [label, client] of [["member", member], ["viewer", viewer]] as const) {
      const writes: [string, string, string | undefined][] = [
        ["POST", "/api/dashboards", JSON.stringify({ name: `${targetName}-${label}-new` })],
        ["PATCH", `/api/dashboards/${targetId}`, JSON.stringify({ name: `${targetName}-${label}` })],
        ["DELETE", `/api/dashboards/${targetId}`, undefined],
      ];
      for (const [method, path, body] of writes) {
        const response = await client.request(path, { method, body });
        assert.equal(response.status, 403, `${label} ${method}`);
        const json = (await response.json()) as { error: string; reason: string };
        assert.equal(json.error, "Forbidden");
        assert.equal(json.reason, "Only Admins can manage dashboards");
      }
    }

    const { prisma } = await import("@/lib/prisma");
    const target = await prisma.dashboard.findUnique({ where: { id: targetId } });
    assert.equal(target?.name, targetName, "the dashboard must be unchanged");
    assert.equal(
      await prisma.dashboard.count({ where: { name: { startsWith: `${targetName}-` } } }),
      0,
      "no dashboard may be created",
    );
  });

  it("still lets Members and Viewers list dashboards", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    assert.equal((await viewer.request("/api/dashboards")).status, 200);
    assert.equal((await member.request(`/api/dashboards/${targetId}`)).status, 200);
  });
});

describe("ADMIN_EMAILS promotion", () => {
  // Listed in the jiji-test server's ADMIN_EMAILS (.claude/launch.json).
  const ADMIN_EMAIL = `${TEST_EMAIL_PREFIX}admin@example.com`;

  async function roleOf(id: string) {
    const { prisma } = await import("@/lib/prisma");
    return (await prisma.user.findUnique({ where: { id }, select: { role: true } }))?.role;
  }

  it("makes a listed email an Admin on first and later sign-ins", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const client = createClient();
    await client.devLogin("E2E Listed Admin", ADMIN_EMAIL);
    const id = (await client.session())?.user?.id;
    assert.ok(id);
    assert.equal(await roleOf(id), "ADMIN", "first sign-in");

    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({ where: { id }, data: { role: "MEMBER" } });
    await createClient().devLogin("E2E Listed Admin", ADMIN_EMAIL);
    assert.equal(await roleOf(id), "ADMIN", "signing in again re-promotes");
  });

  it("leaves other users' roles alone", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const fresh = createClient();
    await fresh.devLogin("E2E Unlisted", `${unique()}@example.com`);
    const freshId = (await fresh.session())?.user?.id;
    assert.ok(freshId);
    assert.equal(await roleOf(freshId), "MEMBER", "a new unlisted user is a Member");

    const viewer = createClient();
    const email = `${unique()}@example.com`;
    await viewer.devLogin("E2E Existing Viewer", email);
    const viewerId = (await viewer.session())?.user?.id;
    assert.ok(viewerId);
    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({ where: { id: viewerId }, data: { role: "VIEWER" } });
    await createClient().devLogin("E2E Existing Viewer", email);
    assert.equal(await roleOf(viewerId), "VIEWER", "an existing user keeps their role");
  });
});

describe("changing roles", () => {
  const admin = createClient();
  const member = createClient();
  const viewer = createClient();
  let adminId = "";
  let memberId = "";
  /** Real Admins demoted for the last-Admin tests, restored afterwards. */
  let demoted: string[] = [];

  type UserBody = { user: { id: string; role: string; email: string } };

  before(async () => {
    if (!reachable || !devLoginAvailable) return;
    adminId = await signInAs(admin, "E2E Role Admin", "ADMIN");
    memberId = await signInAs(member, "E2E Role Member");
    await signInAs(viewer, "E2E Role Viewer", "VIEWER");
  });

  after(async () => {
    if (!demoted.length) return;
    const { prisma } = await import("@/lib/prisma");
    await prisma.user.updateMany({ where: { id: { in: demoted } }, data: { role: "ADMIN" } });
  });

  const patchRole = (client: Client, id: string, role: unknown) =>
    client.request(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ role }) });

  it("lets an Admin change a role, effective on the user's next request", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const target = createClient();
    const targetId = await signInAs(target, "E2E Role Target");

    const response = await patchRole(admin, targetId, "VIEWER");
    assert.equal(response.status, 200);
    const { user } = (await response.json()) as UserBody;
    assert.equal(user.id, targetId);
    assert.equal(user.role, "VIEWER");

    // Same session cookie as before the change: no new sign-in.
    const write = await target.request("/api/issues", {
      method: "POST",
      body: JSON.stringify({ dashboardId: testDashboardId, title: "after demotion" }),
    });
    assert.equal(write.status, 403);

    const list = (await (await viewer.request("/api/users")).json()) as {
      users: { id: string; role: string }[];
    };
    assert.equal(list.users.find((u) => u.id === targetId)?.role, "VIEWER", "GET /api/users has role");
  });

  it("validates the role and the user", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const bad = await patchRole(admin, memberId, "OWNER");
    assert.equal(bad.status, 400);
    assert.ok(((await bad.json()) as { fields: Record<string, string> }).fields.role);

    const missing = await patchRole(admin, "does-not-exist", "MEMBER");
    assert.equal(missing.status, 404);
  });

  it("refuses Members and Viewers", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    for (const client of [member, viewer]) {
      const response = await patchRole(client, memberId, "ADMIN");
      assert.equal(response.status, 403);
      assert.equal(((await response.json()) as { reason: string }).reason, "Only Admins can change roles");
    }
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.user.findUnique({ where: { id: memberId }, select: { role: true } });
    assert.equal(row?.role, "MEMBER");
  });

  it("never demotes the last Admin", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const { prisma } = await import("@/lib/prisma");
    const others = await prisma.user.findMany({
      where: { role: "ADMIN", id: { not: adminId } },
      select: { id: true },
    });
    demoted = others.map((user) => user.id);
    await prisma.user.updateMany({ where: { id: { in: demoted } }, data: { role: "MEMBER" } });

    for (const role of ["MEMBER", "VIEWER"]) {
      const response = await patchRole(admin, adminId, role);
      assert.equal(response.status, 409, `self-demotion to ${role}`);
      assert.deepEqual(await response.json(), { error: "At least one Admin is required" });
    }
    assert.equal((await patchRole(admin, adminId, "ADMIN")).status, 200, "a no-op is fine");

    // With a second Admin, demoting one is allowed again.
    assert.equal((await patchRole(admin, memberId, "ADMIN")).status, 200);
    assert.equal((await patchRole(admin, memberId, "MEMBER")).status, 200);
  });

  it("returns 401 without a session", async (t) => {
    if (!reachable) return t.skip("no server");
    const response = await patchRole(createClient(), "whatever", "ADMIN");
    assert.equal(response.status, 401);
  });
});

describe("role-aware pages", () => {
  const viewer = createClient();
  const memberA = createClient();
  const memberB = createClient();
  let ownIssueId = ""; // reported by Member A

  before(async () => {
    if (!reachable || !devLoginAvailable) return;
    await signInAs(viewer, "E2E Page Viewer", "VIEWER");
    const memberAId = await signInAs(memberA, "E2E Page Member A");
    await signInAs(memberB, "E2E Page Member B");
    const { prisma } = await import("@/lib/prisma");
    const issue = await prisma.issue.create({
      data: { title: "page permissions", dashboardId: testDashboardId, reporterId: memberAId },
    });
    ownIssueId = issue.id;
    created.push(issue.id);
  });

  const html = async (client: Client, path: string) => {
    const response = await client.get(path);
    assert.equal(response.status, 200, path);
    return response.text();
  };
  const issuePath = () => `/issues/${ownIssueId}?dashboard=${testDashboardId}`;
  const DELETE_BUTTON = />Delete</;
  const EDIT_BUTTON = />Edit issue</;
  const disabledSelect = (label: string) => new RegExp(`<select[^>]*aria-label="${label}"[^>]*\\sdisabled=""`);
  const anySelect = (label: string) => new RegExp(`<select[^>]*aria-label="${label}"`);

  it("shows a Viewer no write controls", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const list = await html(viewer, `/?dashboard=${testDashboardId}`);
    assert.doesNotMatch(list, /href="\/issues\/new/, "no Create issue link");

    const page = await html(viewer, issuePath());
    assert.doesNotMatch(page, DELETE_BUTTON);
    assert.doesNotMatch(page, EDIT_BUTTON);
    assert.match(page, disabledSelect("Status"));
    assert.match(page, disabledSelect("Assignee"));

    const board = await html(viewer, `/board?dashboard=${testDashboardId}`);
    assert.match(board, /page permissions/, "the board still shows the card");
    assert.doesNotMatch(board, /draggable="true"/);

    assert.equal((await viewer.get("/issues/new")).status, 404);
  });

  it("hides Delete from a Member on someone else's issue", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const page = await html(memberB, issuePath());
    assert.doesNotMatch(page, DELETE_BUTTON);
    assert.match(page, EDIT_BUTTON);
    assert.match(page, anySelect("Status"));
    assert.doesNotMatch(page, disabledSelect("Status"));

    const board = await html(memberB, `/board?dashboard=${testDashboardId}`);
    assert.match(board, /draggable="true"/);
    assert.match(await html(memberB, `/?dashboard=${testDashboardId}`), /href="\/issues\/new/);
  });

  it("shows Delete to the Member who reported the issue", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    assert.match(await html(memberA, issuePath()), DELETE_BUTTON);
  });
});

describe("role-aware dashboards page", () => {
  const admin = createClient();
  const member = createClient();
  const viewer = createClient();

  before(async () => {
    if (!reachable || !devLoginAvailable) return;
    await signInAs(admin, "E2E DashPage Admin", "ADMIN");
    await signInAs(member, "E2E DashPage Member");
    await signInAs(viewer, "E2E DashPage Viewer", "VIEWER");
  });

  const html = async (client: Client) => {
    const response = await client.get("/dashboards");
    assert.equal(response.status, 200);
    return response.text();
  };

  it("lists dashboards without management controls for Members and Viewers", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    for (const client of [member, viewer]) {
      const page = await html(client);
      assert.match(page, /href="\/\?dashboard=default-dashboard"/, "the list is still shown");
      assert.doesNotMatch(page, />Create dashboard</);
      assert.doesNotMatch(page, />Rename</);
      assert.doesNotMatch(page, />Delete</);
    }
  });

  it("shows an Admin the create, rename and delete controls", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const page = await html(admin);
    assert.match(page, />Create dashboard</);
    assert.match(page, />Rename</);
    assert.match(page, />Delete</);
  });
});

describe("users page", () => {
  const admin = createClient();
  const member = createClient();
  const viewer = createClient();
  let memberId = "";

  before(async () => {
    if (!reachable || !devLoginAvailable) return;
    await signInAs(admin, "E2E UsersPage Admin", "ADMIN");
    memberId = await signInAs(member, "E2E UsersPage Member");
    await signInAs(viewer, "E2E UsersPage Viewer", "VIEWER");
  });

  it("is a 404, with no nav link, for Members and Viewers", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    for (const client of [member, viewer]) {
      assert.equal((await client.get("/users")).status, 404);
      const home = await (await client.get("/")).text();
      assert.doesNotMatch(home, /href="\/users"/);
    }
  });

  it("lists every user with a role dropdown for an Admin", async (t) => {
    if (!canAuth()) return t.skip("no dev-login provider");
    const response = await admin.get("/users");
    assert.equal(response.status, 200);
    const page = await response.text();
    assert.match(page, /href="\/users"/, "the nav has a Users link");

    const { prisma } = await import("@/lib/prisma");
    const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    assert.match(page, new RegExp(member.email.replace(/[.]/g, "\\.")));
    // The member's dropdown, with MEMBER selected.
    const select = new RegExp(
      `<select[^>]*aria-label="Role for ${member.name}"[^>]*>.*?</select>`,
    ).exec(page);
    assert.ok(select, "expected a role dropdown for the member");
    assert.match(select[0], /<option value="MEMBER" selected="">/);
    assert.equal(
      [...page.matchAll(/aria-label="Role for /g)].length,
      await prisma.user.count(),
      "one dropdown per user",
    );
  });
});
