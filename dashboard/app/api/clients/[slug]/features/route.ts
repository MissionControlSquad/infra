import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getFeatureFlags, setFeatureFlag } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  try {
    const flags = getFeatureFlags(slug);
    return NextResponse.json({ flags });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to get feature flags";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const { key, enabled } = await req.json();
  try {
    setFeatureFlag(slug, key, enabled);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to set feature flag";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
