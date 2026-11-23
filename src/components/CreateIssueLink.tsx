"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

/** "Create issue", preselecting the dashboard currently being viewed. */
export function CreateIssueLink({ className }: { className: string }) {
  const dashboard = useSearchParams().get("dashboard");
  const href = dashboard ? `/issues/new?dashboard=${encodeURIComponent(dashboard)}` : "/issues/new";

  return (
    <Link href={href} className={className}>
      Create issue
    </Link>
  );
}
