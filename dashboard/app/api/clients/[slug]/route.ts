import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, isApiKeyAuthenticated, verifyPassword } from "@/lib/auth";
import { getClient, setClientEmail } from "@/lib/registry";
import { deleteClient, getContainerStatus, getContainerStats, getTableStats, getClientUsage } from "@/lib/shell";
import { getLicense, getActivationForLicense } from "@/lib/license";
import { CLIENT_TYPE, HOSTED_APP_DOMAIN, PROVISIONING_STATUS } from "@/lib/constants";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthenticated()) && !isApiKeyAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const client = getClient(slug);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const isHosted = (client.type || CLIENT_TYPE.HOSTED) === CLIENT_TYPE.HOSTED;
  const license = getLicense(slug);
  const activation = license ? getActivationForLicense(license.id) : null;

  return NextResponse.json({
    slug,
    name: client.name,
    type: client.type || CLIENT_TYPE.HOSTED,
    status: isHosted ? getContainerStatus(slug) : null,
    stats: isHosted ? getContainerStats(slug) : null,
    url: `https://${slug}.${HOSTED_APP_DOMAIN}`,
    database: isHosted ? `client_${slug}` : null,
    createdAt: client.createdAt,
    provisioningStatus: client.provisioningStatus ?? PROVISIONING_STATUS.ACTIVE,
    domains: client.domains ?? [],
    version: client.version || "latest",
    tables: isHosted ? getTableStats(slug) : [],
    usage: isHosted ? getClientUsage(slug) : null,
    license: license
      ? {
          id: license.id,
          plan: license.plan,
          active: license.active,
          maxAgents: license.maxAgents,
          maxProjects: license.maxProjects,
          maxSeats: license.maxSeats,
          features: license.features,
          issuedAt: license.issuedAt,
          revokedReason: license.revokedReason,
        }
      : null,
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isApiKeyAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const client = getClient(slug);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    const { email } = await req.json() as { email?: string };
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    // Only write email if the entry doesn't already have one — never overwrite
    if (!client.email) {
      setClientEmail(slug, email);
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update client";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { password } = await req.json();
    if (!verifyPassword(password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const { slug } = await params;
  try {
    const output = deleteClient(slug);
    return NextResponse.json({ ok: true, output });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete client";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
