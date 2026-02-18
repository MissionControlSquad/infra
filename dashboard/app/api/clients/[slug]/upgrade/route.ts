import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getClient } from "@/lib/registry";
import { upgradeClient } from "@/lib/shell";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const client = getClient(slug);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    const { version } = await req.json();
    if (!version || typeof version !== "string") {
      return NextResponse.json({ error: "Version is required" }, { status: 400 });
    }

    const output = upgradeClient(slug, version);
    return NextResponse.json({ ok: true, output });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upgrade failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
