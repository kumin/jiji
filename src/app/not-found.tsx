import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-16 text-center">
      <p className="text-sm font-semibold text-slate-400">404</p>
      <h1 className="mt-1 text-lg font-semibold text-slate-900">Issue not found</h1>
      <p className="mt-1 text-sm text-slate-500">
        It may have been deleted, or the link is wrong.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        Back to issues
      </Link>
    </div>
  );
}
