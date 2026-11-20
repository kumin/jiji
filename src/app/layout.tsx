import type { Metadata } from "next";
import Link from "next/link";

import { NavLinks } from "@/components/NavLinks";
import { UserMenu } from "@/components/UserMenu";
import { auth } from "@/lib/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: "Jiji",
  description: "A minimal issue tracker",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

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
            {session?.user && <NavLinks />}
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
                  <Link
                    href="/issues/new"
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    Create issue
                  </Link>
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
      </body>
    </html>
  );
}
