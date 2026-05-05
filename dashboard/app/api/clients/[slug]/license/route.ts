import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  getLicense,
  issueLicense,
  revokeLicense,
  reactivateLicense,
  reissueRefreshToken,
  updateLicensePlan,
  getActivationForLicense,
} from "@/lib/license";
import { getClient } from "@/lib/registry";
import { triggerLicenseRefresh } from "@/lib/shell";
import { logAudit } from "@/lib/audit";
import { LICENSE_PLANS, PLAN_STARTER } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** GET — View license for a client */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const license = getLicense(slug);
  if (!license) {
    return NextResponse.json({ license: null, message: "No license issued" });
  }

  const activation = getActivationForLicense(license.id);

  return NextResponse.json({
    license: {
      id: license.id,
      slug: license.slug,
      org: license.org,
      plan: license.plan,
      maxAgents: license.maxAgents,
      maxProjects: license.maxProjects,
      maxSeats: license.maxSeats,
      features: license.features,
      issuedAt: license.issuedAt,
      active: license.active,
      revokedReason: license.revokedReason,
    },
    activation: activation
      ? {
          instanceId: activation.instanceId,
          fingerprint: activation.fingerprint,
          ipAddress: activation.ipAddress,
          appVersion: activation.appVersion,
          activatedAt: activation.activatedAt,
          lastHeartbeatAt: activation.lastHeartbeatAt,
          status: activation.status,
        }
      : null,
  });
}

/** POST — Issue a new license (returns refresh token for client to enter once) */
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

  const body = await req.json();
  const plan = body.plan || PLAN_STARTER;

  if (!(LICENSE_PLANS as readonly string[]).includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const { entry, refreshToken } = issueLicense(slug, client.name, plan, body.overrides);

  logAudit("license.issued", slug, { plan, licenseId: entry.id });

  return NextResponse.json({
    license: {
      id: entry.id,
      plan: entry.plan,
      features: entry.features,
      maxAgents: entry.maxAgents,
      maxProjects: entry.maxProjects,
      maxSeats: entry.maxSeats,
      issuedAt: entry.issuedAt,
    },
    // The refresh token — admin gives this to the client (they enter it once)
    refreshToken,
  });
}

/** PUT — Update plan or reactivate */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const body = await req.json();

  // Re-issue refresh token
  if (body.action === "reissue-token") {
    const result = reissueRefreshToken(slug);
    if (!result) return NextResponse.json({ error: "License not found or not active" }, { status: 404 });

    logAudit("license.token_reissued", slug, { licenseId: result.licenseId });

    return NextResponse.json({ ok: true, refreshToken: result.refreshToken, licenseId: result.licenseId });
  }

  // Reactivate
  if (body.action === "reactivate") {
    const ok = reactivateLicense(slug);
    if (!ok) return NextResponse.json({ error: "License not found" }, { status: 404 });

    logAudit("license.reactivated", slug, {});

    // Push refresh to client
    const pushResult = pushLicenseRefresh(slug);
    return NextResponse.json({ ok: true, message: "License reactivated", pushed: pushResult });
  }

  // Update plan
  if (body.plan) {
    const existing = getLicense(slug);
    const oldPlan = existing?.plan ?? "unknown";

    const updated = updateLicensePlan(slug, body.plan, body.overrides);
    if (!updated) return NextResponse.json({ error: "License not found" }, { status: 404 });

    logAudit("license.plan_updated", slug, { oldPlan, newPlan: body.plan });

    // Push refresh to client — they get the new plan immediately
    const pushResult = pushLicenseRefresh(slug);
    return NextResponse.json({ ok: true, license: updated, pushed: pushResult });
  }

  return NextResponse.json({ error: "Provide plan or action" }, { status: 400 });
}

/** Push a license refresh to the client container */
function pushLicenseRefresh(slug: string): { success: boolean; message: string } {
  const client = getClient(slug);
  if (!client) return { success: false, message: "Client not in registry" };

  return triggerLicenseRefresh(slug, client.cronSecret);
}

/** DELETE — Revoke a client's license (subscription cancelled) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = body.reason || "Subscription cancelled";

  const revoked = revokeLicense(slug, reason);
  if (!revoked) {
    return NextResponse.json({ error: "No license found" }, { status: 404 });
  }

  logAudit("license.revoked", slug, { reason });

  // Push revoke to client — triggers a token refresh that will get 403,
  // causing the client to immediately mark its license as revoked
  const pushResult = pushLicenseRefresh(slug);

  return NextResponse.json({ ok: true, message: `License revoked: ${reason}`, pushed: pushResult });
}
