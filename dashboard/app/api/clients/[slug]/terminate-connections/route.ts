import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getClient } from "@/lib/registry";
import { terminateIdleConnections } from "@/lib/shell";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await params;
  if (!getClient(slug)) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  try {
    const output = terminateIdleConnections(slug);
    return NextResponse.json({ ok: true, output });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to terminate connections";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
