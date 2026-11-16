"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

/** Auth.js error codes that are actually actionable for this form. */
const ERROR_COPY: Record<string, string> = {
  CredentialsSignin: "That name and email were not accepted. Both are required.",
  OAuthAccountNotLinked:
    "That Google account is already registered under a different sign-in method.",
  AccessDenied:
    "Sign-in was declined. With Google, check that your account is listed as a test user. With dev login, it means that email already belongs to a seeded account — use a different one.",
  OAuthCallback: "Google sign-in failed. Check the OAuth credentials in .env.",
  Configuration: "The server is not configured for sign-in. See the README.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.3v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
      />
    </svg>
  );
}

export function SignInButtons({
  googleEnabled,
  devLoginEnabled,
  error,
}: {
  googleEnabled: boolean;
  devLoginEnabled: boolean;
  error?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  if (!googleEnabled && !devLoginEnabled) {
    return (
      <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold">No sign-in provider configured.</p>
        <p className="mt-1">
          Set <code className="font-mono">AUTH_GOOGLE_ID</code>,{" "}
          <code className="font-mono">AUTH_GOOGLE_SECRET</code> and{" "}
          <code className="font-mono">AUTH_SECRET</code> in <code className="font-mono">.env</code>,
          then restart the server. See the README for the Google Cloud setup.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
        >
          {ERROR_COPY[error] ?? "Sign-in failed. Please try again."}
        </p>
      ) : null}

      {googleEnabled ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void signIn("google", { callbackUrl: "/" });
          }}
          className="flex w-full items-center justify-center gap-2.5 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        >
          <GoogleMark />
          {pending ? "Redirecting…" : "Sign in with Google"}
        </button>
      ) : null}

      {devLoginEnabled ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            void signIn("dev-login", { name, email, callbackUrl: "/" });
          }}
          className="space-y-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Dev login (local only)
          </p>
          <p className="text-xs text-slate-500">
            No password. Anyone who can reach this server can sign in as anyone, so it only
            works on the dev server — never in a deployed build.
          </p>
          <div className="space-y-2">
            <input
              aria-label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              required
              maxLength={80}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <input
              aria-label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
