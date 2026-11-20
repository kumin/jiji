"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { DashboardDTO } from "@/lib/types";

/** Views that are scoped to a dashboard; switching from anywhere else lands on the list. */
const SCOPED_VIEWS = ["/", "/board"];

export function DashboardSwitcher({ dashboards }: { dashboards: DashboardDTO[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (dashboards.length === 0) return null;

  // Same fallback as the pages: no param means the first dashboard by name.
  const current = searchParams.get("dashboard") ?? dashboards[0]!.id;

  return (
    <select
      aria-label="Dashboard"
      value={current}
      onChange={(event) => {
        const target = SCOPED_VIEWS.includes(pathname) ? pathname : "/";
        router.push(`${target}?dashboard=${encodeURIComponent(event.target.value)}`);
      }}
      className="max-w-48 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
    >
      {dashboards.map((dashboard) => (
        <option key={dashboard.id} value={dashboard.id}>
          {dashboard.name}
        </option>
      ))}
    </select>
  );
}
