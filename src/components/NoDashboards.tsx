import Link from "next/link";

/** Shown wherever issues need a dashboard but none exist yet. */
export function NoDashboards({ canManage }: { canManage: boolean }) {
  if (!canManage) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
        <p className="font-medium text-slate-700">No dashboards yet</p>
        <p className="mt-1">Every issue lives in a dashboard. Ask an Admin to create one.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
      <p className="font-medium text-slate-700">Create a dashboard first</p>
      <p className="mt-1">Every issue lives in a dashboard.</p>
      <Link
        href="/dashboards"
        className="mt-4 inline-block rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white transition hover:bg-blue-700"
      >
        Go to dashboards
      </Link>
    </div>
  );
}
