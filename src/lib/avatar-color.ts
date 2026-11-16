/** Avatar chip colours, picked for legibility against white text. */
const PALETTE = [
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
  "#8b5cf6",
  "#0ea5e9",
  "#ef4444",
  "#10b981",
] as const;

/**
 * Stable colour for a user, derived from their id. Google logins have no colour
 * of their own, and hashing avoids adding a column the UI never lets anyone edit.
 */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}
