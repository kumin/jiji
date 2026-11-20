import { Board } from "@/components/Board";
import { NoDashboards } from "@/components/NoDashboards";
import { listIssues, resolveDashboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BoardPage({ searchParams }: PageProps) {
  const dashboard = await resolveDashboard((await searchParams).dashboard);
  if (!dashboard) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Board</h1>
        <NoDashboards />
      </div>
    );
  }

  const issues = await listIssues({ dashboardId: dashboard.id });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          {dashboard.name} <span className="font-normal text-slate-400">/ Board</span>
        </h1>
        <p className="text-sm text-slate-500">
          Drag a card to move it. Columns the workflow forbids are disabled while dragging.
        </p>
      </div>
      {/* One render timestamp for the whole tree, so the client's hydration of the
          due-date labels matches what the server produced. */}
      <Board issues={issues} now={new Date().toISOString()} />
    </div>
  );
}
