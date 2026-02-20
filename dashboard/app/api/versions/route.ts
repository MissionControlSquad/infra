import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readRegistry } from "@/lib/registry";
import { listAvailableVersions } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const versionInfos = listAvailableVersions();
  const registry = readRegistry();

  const clientsByVersion: Record<string, string[]> = {};
  for (const [slug, entry] of Object.entries(registry)) {
    const ver = entry.version || "latest";
    if (!clientsByVersion[ver]) clientsByVersion[ver] = [];
    clientsByVersion[ver].push(slug);
  }

  // Keep backward compat: versions as string[], plus new versionDetails map
  const versions = versionInfos.map((v) => v.tag);
  const versionDetails: Record<string, { createdAt: string; message?: string }> = {};
  for (const v of versionInfos) {
    versionDetails[v.tag] = { createdAt: v.createdAt, message: v.message };
  }

  return NextResponse.json({ versions, versionDetails, clientsByVersion });
}
