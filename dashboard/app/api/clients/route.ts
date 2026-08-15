import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, isApiKeyAuthenticated } from "@/lib/auth";
import { listActiveClients, listDeletedClients } from "@/lib/registry";
import { getContainerStatus, createClient } from "@/lib/shell";
import { getLicense, getActivationForLicense } from "@/lib/license";
import {
  SELF_HOST_PLAN_NAME,
  SELF_HOST_LICENSE_PLAN,
  HOSTED_APP_DOMAIN,
  CLIENT_TYPE,
  PROVISIONING_STATUS,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated()) && !isApiKeyAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = listActiveClients().map(({ slug, entry }) => {
    const license = getLicense(slug);
    const activation = license ? getActivationForLicense(license.id) : null;

    return {
      slug,
      name: entry.name,
      type: entry.type || CLIENT_TYPE.HOSTED,
      status: entry.type === CLIENT_TYPE.SELF_HOSTED ? null : getContainerStatus(slug),
      url: `https://${slug}.${HOSTED_APP_DOMAIN}`,
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
    hosted: clients.filter((c) => c.type === CLIENT_TYPE.HOSTED).length,
    selfHosted: clients.filter((c) => c.type === CLIENT_TYPE.SELF_HOSTED).length,
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

  const deletedClients = listDeletedClients().map(({ slug, deletedAt, entry }) => ({
    slug,
    name: entry.name,
    type: entry.type || CLIENT_TYPE.HOSTED,
    createdAt: entry.createdAt,
    deletedAt,
  }));

  return NextResponse.json({ clients, stats, deletedClients });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated()) && !isApiKeyAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { slug, name, version, type, email, planName, workspaceId } = await req.json() as {
      slug?: string;
      name?: string;
      version?: string;
      type?: string;
      email?: string;
      planName?: string;
      // buildbase workspace this tenant binds to. buildbase auto-creates each
      // user's workspace on signup, so the caller (the website) passes the
      // user's currentWorkspace id here. Omit ⇒ single-tenant / self-host.
      workspaceId?: string;
    };

    if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
      return NextResponse.json(
        { error: "Invalid slug. Use lowercase letters, numbers, and hyphens." },
        { status: 400 }
      );
    }

    // Treat self-hosting plan subscribers as self-hosted even if type field wasn't set explicitly
    const isSelfHosted =
      type === CLIENT_TYPE.SELF_HOSTED || planName === SELF_HOST_PLAN_NAME;
    const clientType = isSelfHosted ? CLIENT_TYPE.SELF_HOSTED : CLIENT_TYPE.HOSTED;

    if (clientType === CLIENT_TYPE.SELF_HOSTED) {
      const { registerClient, deleteClient } = await import("@/lib/registry");
      const { issueLicense } = await import("@/lib/license");
      registerClient(slug, name || slug, CLIENT_TYPE.SELF_HOSTED, email);
      let refreshToken: string;
      try {
        ({ refreshToken } = issueLicense(slug, email ?? slug, SELF_HOST_LICENSE_PLAN));
      } catch (licenseErr) {
        // Roll back the registry entry so the next attempt can retry cleanly
        deleteClient(slug);
        throw licenseErr;
      }
      return NextResponse.json({
        ok: true,
        output: `Self-hosted client "${slug}" registered`,
        type: CLIENT_TYPE.SELF_HOSTED,
        licenseKey: refreshToken,
      });
    }

    // Go-forward: hosted tenants are keyed by buildbase workspaceId (one workspace ⇒ one tenant); we no
    // longer dedup or key tenants by email. Dedup on workspaceId when the caller supplies one (the
    // website launcher always does → idempotent per workspace). An admin manual create without a
    // workspaceId still works — it just isn't workspace-bound yet (bind later via set-workspace). Email
    // lookup survives ONLY in the lookup route, for the migration self-heal that binds pre-existing
    // email-keyed tenants (see clients/lookup).
    if (workspaceId) {
      const { findClientByWorkspaceId } = await import("@/lib/registry");
      const existing = findClientByWorkspaceId(workspaceId, CLIENT_TYPE.HOSTED);
      if (existing) {
        return NextResponse.json(
          { error: "Client already exists", slug: existing.slug, provisioningStatus: existing.entry.provisioningStatus },
          { status: 409 }
        );
      }
    }

    let output: string;

    if (process.env.NODE_ENV !== "production") {
      // Local dev: skip Docker entirely, just write the registry entry and store
      // the caller-provided workspace id (buildbase auto-creates it on signup —
      // infra never creates one). Empty ⇒ single-tenant.
      const { registerClient, setClientWorkspaceId } = await import("@/lib/registry");
      registerClient(slug, name || slug, CLIENT_TYPE.HOSTED, email);
      if (workspaceId) setClientWorkspaceId(slug, workspaceId);
      output = `[local] Registered "${slug}" in registry (skipped Docker)` +
        (workspaceId ? ` — buildbase workspace ${workspaceId}` : " — single-tenant (no workspace id)");
    } else {
      // Production: run ac create — the single source of truth. It provisions the
      // container and binds the caller-provided --workspace-id (writing it into
      // the registry and TENANT_WORKSPACE_ID in the client env). Throws on
      // failure, caught by outer catch → 500.
      output = createClient(slug, name, version, email, workspaceId);
      if (email) {
        const { setClientEmail } = await import("@/lib/registry");
        setClientEmail(slug, email);
      }
      // Belt-and-suspenders: ensure the id is persisted even if provided post-hoc.
      if (workspaceId) {
        const { setClientWorkspaceId } = await import("@/lib/registry");
        setClientWorkspaceId(slug, workspaceId);
      }
    }

    return NextResponse.json({ ok: true, output });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create client";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
