import { DashboardManager } from "@/components/DashboardManager";
import { listDashboards } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardsPage() {
  const dashboards = await listDashboards();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Dashboards</h1>
        <p className="text-sm text-slate-500">
          Each issue belongs to one dashboard, e.g. one per project or team.
        </p>
      </div>
      <DashboardManager dashboards={dashboards} />
    </div>
  );
}
