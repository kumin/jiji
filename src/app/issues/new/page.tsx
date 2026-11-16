import { IssueForm } from "@/components/IssueForm";
import { listUsers } from "@/lib/queries";

export default async function NewIssuePage() {
  const users = await listUsers();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold tracking-tight text-slate-900">Create issue</h1>
      <p className="mb-5 text-sm text-slate-500">
        Tickets are numbered automatically, e.g. <span className="font-mono">JIJI-13</span>.
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <IssueForm users={users} />
      </div>
    </div>
  );
}
