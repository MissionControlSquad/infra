import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, isApiKeyAuthenticated } from "@/lib/auth";
import { getClient, incrementProvisioningAttempts } from "@/lib/registry";
import { createClient } from "@/lib/shell";
import { PROVISIONING_STATUS, TENANT_MAX_RETRY_ATTEMPTS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(
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

  // Guard 1: only retry tenants that are explicitly in failed state
  if (client.provisioningStatus !== PROVISIONING_STATUS.FAILED) {
    return NextResponse.json(
      { error: "Client is not in a failed state", provisioningStatus: client.provisioningStatus },
      { status: 409 }
    );
  }

  // Guard 2: cap total provisioning attempts
  const currentAttempts = client.provisioningAttempts ?? 1;
  if (currentAttempts >= TENANT_MAX_RETRY_ATTEMPTS) {
    return NextResponse.json(
      { error: "Max provisioning attempts reached. Admin intervention required.", attempts: currentAttempts },
      { status: 429 }
    );
  }

  const newAttempts = incrementProvisioningAttempts(slug);

  // In production, re-run ac create to retry container provisioning.
  // In local dev, resetting the status is enough (no Docker).
  if (process.env.NODE_ENV === "production") {
    try {
      // Preserve the tenant's identity on retry: `ac create` unconditionally rewrites the registry's
      // workspaceId (and substitutes __WORKSPACE_ID__ into the container env) from the --workspace-id
      // flag, so omitting it would WIPE the buildbase workspace binding and drop the tenant to
      // single-tenant mode. Pass the existing email + workspaceId back through so the rebuild keeps the
      // exact same binding it had before it failed.
      createClient(slug, client.name, client.version, client.email, client.workspaceId);
    } catch {
      // Non-fatal — status is already reset to "provisioning", failure detection
      // will flip it to "failed" again after the next timeout.
    }
  }

  return NextResponse.json({ ok: true, attempts: newAttempts });
}
