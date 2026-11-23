import { DashboardManager } from "@/components/DashboardManager";
import { can } from "@/lib/permissions";
import { listDashboards } from "@/lib/queries";
import { currentUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export default async function DashboardsPage() {
  const [dashboards, actor] = await Promise.all([listDashboards(), currentUser()]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Dashboards</h1>
        <p className="text-sm text-slate-500">
          Each issue belongs to one dashboard, e.g. one per project or team.
        </p>
      </div>
      <DashboardManager dashboards={dashboards} canManage={can(actor, "dashboard:manage")} />
    </div>
  );
}
