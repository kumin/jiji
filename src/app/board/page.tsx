import { Board } from "@/components/Board";
import { listIssues } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const issues = await listIssues();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Board</h1>
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
