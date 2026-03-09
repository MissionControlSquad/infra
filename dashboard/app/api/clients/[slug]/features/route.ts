import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getFeatureFlags, setFeatureFlag, triggerLicenseRefresh } from "@/lib/shell";
import { getLicense, updateLicenseFeatures } from "@/lib/license";
import { getClient } from "@/lib/registry";
import { logAudit } from "@/lib/audit";

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
    // 1. Update DB feature flag
    setFeatureFlag(slug, key, enabled);

    // 2. Sync license features to match
    const license = getLicense(slug);
    if (license && license.active) {
      const currentFeatures = new Set(license.features);
      if (enabled) {
        currentFeatures.add(key);
      } else {
        currentFeatures.delete(key);
      }
      updateLicenseFeatures(slug, Array.from(currentFeatures));

      // 3. Push refresh to client so it picks up the new features
      const client = getClient(slug);
      if (client) {
        triggerLicenseRefresh(slug, client.cronSecret);
      }

      logAudit("feature.toggled", slug, { key, enabled, licenseSynced: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to set feature flag";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
