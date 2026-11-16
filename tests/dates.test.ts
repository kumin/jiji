import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { IssueStatus } from "@/generated/prisma/enums";
import { describeDue, formatDate, toDateInputValue } from "@/lib/dates";

const at = (iso: string) => new Date(iso);

/** Due dates are stored at UTC midnight, so pin "now" to a fixed instant. */
const NOW = at("2026-03-17T12:00:00.000Z"); // 17 Mar 2026

describe("formatDate", () => {
  it("formats a UTC date consistently regardless of string or Date input", () => {
    assert.equal(formatDate("2026-03-18T00:00:00.000Z"), "18 Mar 2026");
    assert.equal(formatDate(new Date("2026-03-18T00:00:00.000Z")), "18 Mar 2026");
  });

  it("is stable across repeated calls (same locale and time zone every time)", () => {
    const results = new Set(
      Array.from({ length: 50 }, () => formatDate("2026-12-25T00:00:00.000Z")),
    );
    assert.equal(results.size, 1, "formatDate must be deterministic for SSR/hydration");
    assert.equal([...results][0], "25 Dec 2026");
  });

  it("does not shift the day for a late-UTC timestamp", () => {
    assert.equal(formatDate("2026-03-18T23:30:00.000Z"), "18 Mar 2026");
  });
});

describe("toDateInputValue", () => {
  it("keeps only the date part, as <input type=date> needs", () => {
    assert.equal(toDateInputValue("2026-03-18T00:00:00.000Z"), "2026-03-18");
    assert.equal(toDateInputValue(null), "");
  });
});

describe("describeDue", () => {
  it("returns null when there is no due date", () => {
    assert.equal(describeDue(null, IssueStatus.TODO, NOW), null);
  });

  it("does not nag about a date a finished issue can no longer miss", () => {
    const overdue = describeDue("2026-03-01T00:00:00.000Z", IssueStatus.DONE, NOW);
    assert.equal(overdue?.label, "16 days overdue");
    assert.equal(overdue?.className, "text-slate-500", "a Done issue should not be red");
    // The same date on an open issue still is urgent.
    assert.match(
      describeDue("2026-03-01T00:00:00.000Z", IssueStatus.TODO, NOW)!.className,
      /rose/,
    );
  });

  it("counts a single overdue day in the singular", () => {
    const due = describeDue("2026-03-16T00:00:00.000Z", IssueStatus.TODO, NOW);
    assert.equal(due?.label, "1 day overdue");
    assert.match(due!.className, /rose/);
  });

  it("reports an earlier date as overdue", () => {
    const due = describeDue("2026-03-10T00:00:00.000Z", IssueStatus.TODO, NOW);
    assert.equal(due?.label, "7 days overdue");
  });

  it("reports today and tomorrow", () => {
    assert.equal(
      describeDue("2026-03-17T00:00:00.000Z", IssueStatus.TODO, NOW)?.label,
      "Due today",
    );
    assert.equal(
      describeDue("2026-03-18T00:00:00.000Z", IssueStatus.TODO, NOW)?.label,
      "Due tomorrow",
    );
  });

  it("falls back to an absolute date further out", () => {
    assert.equal(
      describeDue("2026-04-01T00:00:00.000Z", IssueStatus.TODO, NOW)?.label,
      "Due 01 Apr 2026",
    );
  });

  it("uses the supplied instant rather than reading the clock itself", () => {
    // The exact case that broke hydration: the server rendered at 23:59:59 and
    // the client hydrated at 00:00:01 the next day. Passing one `now` to both
    // keeps the label identical.
    const dueDate = "2026-03-18T00:00:00.000Z";
    const snapshot = at("2026-03-17T23:59:59.000Z");
    assert.equal(
      describeDue(dueDate, IssueStatus.TODO, snapshot)?.label,
      describeDue(dueDate, IssueStatus.TODO, snapshot)?.label,
    );
    assert.equal(describeDue(dueDate, IssueStatus.TODO, snapshot)?.label, "Due tomorrow");
  });

  it("is a pure function of its arguments", () => {
    const dueDate = "2026-03-18T00:00:00.000Z";
    const first = describeDue(dueDate, IssueStatus.TODO, NOW);
    const second = describeDue(dueDate, IssueStatus.TODO, NOW);
    assert.deepEqual(first, second);
  });

  it("de-emphasises a completed issue's upcoming dates", () => {
    const done = describeDue("2026-04-01T00:00:00.000Z", IssueStatus.DONE, NOW);
    assert.equal(done?.className, "text-slate-500");
  });

  it("uses the due date's UTC calendar day, not the elapsed hours", () => {
    // A due date of 23:59 today is 0.999 days out, which a rounded millisecond
    // difference would report as "Due tomorrow".
    assert.equal(
      describeDue("2026-03-17T23:59:00.000Z", IssueStatus.TODO, NOW)?.label,
      "Due today",
    );
    // And 00:01 yesterday is -0.999 days, which would read as overdue.
    assert.equal(
      describeDue("2026-03-16T00:01:00.000Z", IssueStatus.TODO, NOW)?.label,
      "1 day overdue",
    );
    // Exact UTC midnight is the normal case and must not shift.
    assert.equal(
      describeDue("2026-03-18T00:00:00.000Z", IssueStatus.TODO, NOW)?.label,
      "Due tomorrow",
    );
  });
});
