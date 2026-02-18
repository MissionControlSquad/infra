import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readRegistry } from "@/lib/registry";
import { getContainerStatus, createClient } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const registry = readRegistry();
  const clients = Object.entries(registry).map(([slug, entry]) => ({
    slug,
    name: entry.name,
    status: getContainerStatus(slug),
    url: `https://${slug}.app.agentcenter.cloud`,
    createdAt: entry.createdAt,
    domains: entry.domains ?? [],
    version: entry.version || "latest",
  }));

  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { slug, name, version } = await req.json();

    if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
      return NextResponse.json(
        { error: "Invalid slug. Use lowercase letters, numbers, and hyphens." },
        { status: 400 }
      );
    }

    const output = createClient(slug, name, version);
    return NextResponse.json({ ok: true, output });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create client";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
