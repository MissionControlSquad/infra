import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getClient } from "@/lib/registry";
import { fixMigrations } from "@/lib/shell";
import { CLIENT_TYPE } from "@/lib/constants";

export async function POST(
  _req: NextRequest,
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

  if ((client.type ?? CLIENT_TYPE.HOSTED) !== CLIENT_TYPE.HOSTED) {
    return NextResponse.json({ error: "Only hosted clients support migration fixes" }, { status: 400 });
  }

  try {
    const output = fixMigrations(slug);
    return NextResponse.json({ ok: true, output });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Migration fix failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
