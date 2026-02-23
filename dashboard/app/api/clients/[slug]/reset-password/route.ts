import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { isAuthenticated } from "@/lib/auth";
import { getClient } from "@/lib/registry";
import { getAdminUsers, insertResetToken } from "@/lib/shell";

const RESET_TOKEN_PREFIX = "reset_";
const TOKEN_EXPIRY_MINUTES = 30;

/** GET — list admin users for this client */
export async function GET(
  _req: NextRequest,
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

  const adminUsers = getAdminUsers(slug);
  return NextResponse.json({ adminUsers });
}

/** POST — generate a password reset link for a client's admin user */
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

  let body: { adminUserId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { adminUserId } = body;
  if (!adminUserId) {
    return NextResponse.json({ error: "adminUserId is required" }, { status: 400 });
  }

  // Verify admin user exists
  const adminUsers = getAdminUsers(slug);
  const targetUser = adminUsers.find((u) => u.id === adminUserId);
  if (!targetUser) {
    return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
  }

  // Generate token (same algorithm as the main app)
  const hex = crypto.randomBytes(32).toString("hex");
  const plainToken = `${RESET_TOKEN_PREFIX}${hex}`;
  const tokenHash = crypto.createHash("sha256").update(plainToken).digest("hex");

  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  try {
    insertResetToken(slug, tokenHash, adminUserId, expiresAt.toISOString());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create reset token";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Build client URL — use custom domain if available, otherwise default subdomain
  const domain = client.domains?.[0] || `${slug}.app.agentcenter.cloud`;
  const resetUrl = `https://${domain}/reset-password?token=${plainToken}`;

  return NextResponse.json({
    resetUrl,
    expiresAt: expiresAt.toISOString(),
    username: targetUser.username,
  });
}
