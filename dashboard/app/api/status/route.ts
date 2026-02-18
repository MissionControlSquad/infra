import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSystemStats, listContainers } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = getSystemStats();
    const containers = listContainers();
    return NextResponse.json({ ...stats, containers });
  } catch {
    return NextResponse.json({ error: "Failed to get stats" }, { status: 500 });
  }
}
