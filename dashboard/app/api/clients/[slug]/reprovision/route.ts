import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, isApiKeyAuthenticated } from "@/lib/auth";
import { getClient, incrementProvisioningAttempts } from "@/lib/registry";
import { createClient } from "@/lib/shell";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 3;

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
  if (client.provisioningStatus !== "failed") {
    return NextResponse.json(
      { error: "Client is not in a failed state", provisioningStatus: client.provisioningStatus },
      { status: 409 }
    );
  }

  // Guard 2: cap total provisioning attempts
  const currentAttempts = client.provisioningAttempts ?? 1;
  if (currentAttempts >= MAX_ATTEMPTS) {
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
      createClient(slug, client.name, client.version);
    } catch {
      // Non-fatal — status is already reset to "provisioning", failure detection
      // will flip it to "failed" again after the next timeout.
    }
  }

  return NextResponse.json({ ok: true, attempts: newAttempts });
}
