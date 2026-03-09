import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readRegistry } from "@/lib/registry";
import { getContainerStatus, createClient } from "@/lib/shell";
import { getLicense, getActivationForLicense } from "@/lib/license";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const registry = readRegistry();
  const clients = Object.entries(registry).map(([slug, entry]) => {
    const license = getLicense(slug);
    const activation = license ? getActivationForLicense(license.id) : null;

    return {
      slug,
      name: entry.name,
      type: entry.type || "hosted",
      status: entry.type === "self-hosted" ? null : getContainerStatus(slug),
      url: `https://${slug}.app.agentcenter.cloud`,
      createdAt: entry.createdAt,
      domains: entry.domains ?? [],
      version: entry.version || "latest",
      license: license
        ? {
            plan: license.plan,
            active: license.active,
            issuedAt: license.issuedAt,
            revokedReason: license.revokedReason,
          }
        : null,
      lastActiveAt: activation?.lastHeartbeatAt ?? null,
    };
  });

  // Compute aggregate stats
  const stats = {
    total: clients.length,
    hosted: clients.filter((c) => c.type === "hosted").length,
    selfHosted: clients.filter((c) => c.type === "self-hosted").length,
    licensed: clients.filter((c) => c.license?.active).length,
    activeLicenses: clients.filter((c) => c.license?.active).length,
    revokedLicenses: clients.filter(
      (c) => c.license && !c.license.active
    ).length,
    byPlan: clients.reduce<Record<string, number>>((acc, c) => {
      if (c.license) {
        acc[c.license.plan] = (acc[c.license.plan] || 0) + 1;
      }
      return acc;
    }, {}),
  };

  return NextResponse.json({ clients, stats });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { slug, name, version, type } = await req.json();

    if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
      return NextResponse.json(
        { error: "Invalid slug. Use lowercase letters, numbers, and hyphens." },
        { status: 400 }
      );
    }

    const clientType = type === "self-hosted" ? "self-hosted" : "hosted";

    if (clientType === "self-hosted") {
      // Self-hosted: register in registry only, no container
      const { registerClient } = await import("@/lib/registry");
      registerClient(slug, name || slug, "self-hosted");
      return NextResponse.json({ ok: true, output: `Self-hosted client "${slug}" registered` });
    }

    const output = createClient(slug, name, version);
    return NextResponse.json({ ok: true, output });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create client";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
