import { notFound } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { RoleSelect } from "@/components/RoleSelect";
import { can } from "@/lib/permissions";
import { listUsers } from "@/lib/queries";
import { currentUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

/** Admins only. Everyone else gets a 404, so the page's existence isn't revealed. */
export default async function UsersPage() {
  const actor = await currentUser();
  if (!can(actor, "user:manageRoles")) notFound();

  const users = await listUsers();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Users</h1>
        <p className="text-sm text-slate-500">
          Viewers can only read. Members can create and edit issues, and delete the ones they
          reported. Admins can do everything, including managing dashboards and roles.
        </p>
      </div>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {users.map((user) => (
          <li key={user.id} className="flex flex-wrap items-center gap-3 p-4">
            <Avatar user={user} size={32} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">
                {user.name}
                {user.id === actor!.id ? <span className="ml-1.5 text-xs text-slate-500">(you)</span> : null}
              </p>
              <p className="truncate text-sm text-slate-500">{user.email}</p>
            </div>
            <RoleSelect userId={user.id} userName={user.name} role={user.role} />
          </li>
        ))}
      </ul>
    </div>
  );
}
