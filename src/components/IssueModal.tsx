"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Popup shell for an intercepted issue route. Closing goes back in history, so
 * the URL returns to the list or board the popup was opened from.
 */
export function IssueModal({
  children,
  fullPageHref,
}: {
  children: React.ReactNode;
  fullPageHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  // The @modal slot keeps its last route on soft navigation, so a link inside
  // the popup (e.g. the dashboard name) would leave it open over the new page.
  // Only show it while the URL is still an issue URL.
  const open = pathname.startsWith("/issues/");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.back();
    };
    document.addEventListener("keydown", onKey);
    // Keep the page behind from scrolling while the popup is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [router, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-10"
      onMouseDown={(event) => {
        // Only a click on the backdrop itself closes, not one inside the panel.
        if (event.target === event.currentTarget) router.back();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-popup-title"
        tabIndex={-1}
        className="w-full max-w-5xl rounded-xl bg-slate-50 p-6 shadow-2xl outline-none"
      >
        <div className="mb-4 flex items-center justify-end gap-2">
          {/* A plain <a> forces a full load, so the full page renders instead of the popup. */}
          <a
            href={fullPageHref}
            className="rounded-md px-2.5 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
          >
            Open full page
          </a>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Close"
            className="rounded-md px-2.5 py-1 text-lg leading-none text-slate-500 transition hover:bg-slate-200"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
