"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { href: "/", label: "Issues", scoped: true },
  { href: "/board", label: "Board", scoped: true },
  { href: "/dashboards", label: "Dashboards", scoped: false },
];

export function NavLinks() {
  const pathname = usePathname();
  // Keep the selected dashboard when hopping between the list and the board.
  const dashboard = useSearchParams().get("dashboard");
  const suffix = dashboard ? `?dashboard=${encodeURIComponent(dashboard)}` : "";

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.scoped ? `${link.href}${suffix}` : link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
