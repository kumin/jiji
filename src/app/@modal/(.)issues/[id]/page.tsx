import { IssueDetail } from "@/components/IssueDetail";
import { IssueModal } from "@/components/IssueModal";
import { getIssue, listDashboards, listUsers } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Clicking an issue in the list or board soft-navigates to /issues/[id]; this
 * intercepted route shows it as a popup over the current page instead. A
 * refresh or a shared link renders the full page at app/issues/[id].
 */
export default async function IssuePopup({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [issue, users, dashboards] = await Promise.all([
    getIssue(id),
    listUsers(),
    listDashboards(),
  ]);

  // No popup rather than a 404: this slot keeps its last route on soft
  // navigation, so after the issue is deleted (and the app navigates to the
  // list) a refresh re-renders it with an issue that no longer exists.
  if (!issue) return null;

  return (
    <IssueModal fullPageHref={`/issues/${issue.id}?dashboard=${issue.dashboard.id}`}>
      <IssueDetail issue={issue} users={users} dashboards={dashboards} titleId="issue-popup-title" />
    </IssueModal>
  );
}
