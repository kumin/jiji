import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CreateIssueLink } from "@/components/CreateIssueLink";
import { DashboardSwitcher } from "@/components/DashboardSwitcher";
import { NavLinks } from "@/components/NavLinks";
import { UserMenu } from "@/components/UserMenu";
import { auth } from "@/lib/auth";
import { listDashboards } from "@/lib/queries";

import "./globals.css";

export const metadata: Metadata = {
  title: "Jiji",
  description: "A minimal issue tracker",
};

export default async function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  /** The @modal slot: an issue popup over the list or board, otherwise nothing. */
  modal: React.ReactNode;
}>) {
  const session = await auth();
  const dashboards = session?.user ? await listDashboards() : [];

  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded bg-blue-600 text-sm font-bold text-white">
                J
              </span>
              <span className="text-sm font-semibold tracking-tight text-slate-900">Jiji</span>
            </Link>
            {session?.user && (
              // Both read the URL's search params on the client.
              <Suspense>
                <DashboardSwitcher dashboards={dashboards} />
                <NavLinks />
              </Suspense>
            )}
            <div className="ml-auto flex items-center gap-2">
              {session?.user ? (
                <>
                  <UserMenu
                    user={{
                      id: session.user.id,
                      name: session.user.name ?? "Unnamed",
                      email: session.user.email ?? "",
                      color: "",
                      image: session.user.image ?? null,
                    }}
                  />
                  <Suspense>
                    <CreateIssueLink className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700" />
                  </Suspense>
                </>
              ) : (
                <Link
                  href="/login"
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        {modal}
      </body>
    </html>
  );
}
