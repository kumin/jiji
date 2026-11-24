"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

import { avatarColor } from "@/lib/avatar-color";
import type { UserDTO } from "@/lib/types";

export function UserMenu({ user }: { user: Omit<UserDTO, "role"> }) {
  const [pending, setPending] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-2 text-sm text-slate-700">
        {user.image ? (
          // Google-hosted avatar, so a plain <img> avoids an image proxy setup.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" width={26} height={26} className="rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span
            className="grid size-6 place-items-center rounded-full text-[10px] font-semibold text-white"
            style={{ backgroundColor: user.color || avatarColor(user.id) }}
            aria-hidden="true"
          >
            {user.name?.slice(0, 1).toUpperCase() ?? "?"}
          </span>
        )}
        <span className="hidden sm:inline">{user.name ?? user.email}</span>
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true);
          void signOut({ callbackUrl: "/login" });
        }}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200 disabled:opacity-60"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
