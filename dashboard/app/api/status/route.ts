import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSystemStats } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = getSystemStats();
    return NextResponse.json(stats);
  } catch {
    return NextResponse.json({ error: "Failed to get stats" }, { status: 500 });
  }
}
