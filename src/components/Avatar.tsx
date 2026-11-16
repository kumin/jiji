import type { UserDTO } from "@/lib/types";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function Avatar({ user, size = 24 }: { user: UserDTO; size?: number }) {
  return (
    <span
      title={user.name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: user.color,
        fontSize: size * 0.4,
      }}
    >
      {initials(user.name)}
    </span>
  );
}

export function Unassigned({ size = 24 }: { size?: number }) {
  return (
    <span
      title="Unassigned"
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      ?
    </span>
  );
}

export function AssigneeChip({ user }: { user: UserDTO | null }) {
  if (!user) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
        <Unassigned />
        Unassigned
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Avatar user={user} />
      {user.name}
    </span>
  );
}
