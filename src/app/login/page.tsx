import { SignInButtons } from "@/components/SignInButtons";
import { devLoginEnabled, googleEnabled } from "@/lib/auth.config";

export const dynamic = "force-dynamic";

/** Auth.js bounces failed sign-ins back here with `?error=<code>`. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const error = first((await searchParams).error);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded bg-blue-600 text-sm font-bold text-white">
            J
          </span>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-900">Sign in to Jiji</h1>
            <p className="text-xs text-slate-500">Your Google account is your Jiji account.</p>
          </div>
        </div>

        <SignInButtons
          googleEnabled={googleEnabled}
          devLoginEnabled={devLoginEnabled}
          error={error}
        />
      </div>
    </div>
  );
}
