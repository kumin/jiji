import { NextResponse } from "next/server";

import { listUsers } from "@/lib/queries";

/**
 * Everyone, with only their public fields (via `toUserDTO`). Returning raw rows
 * would hand every signed-in user any column added to User later.
 */
export async function GET() {
  return NextResponse.json({ users: await listUsers() });
}
