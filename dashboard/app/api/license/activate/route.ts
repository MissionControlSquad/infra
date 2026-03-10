import { NextRequest, NextResponse } from "next/server";
import {
  verifyToken,
  generateAccessToken,
  activateLicense,
  getLicenseById,
  type RefreshTokenPayload,
} from "@/lib/license";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

// 5 requests per minute per IP
const rateLimiter = createRateLimiter(5, 60_000);

export const dynamic = "force-dynamic";

/**
 * POST /api/license/activate
 * Public endpoint — called by client app on first activation.
 * Validates the refresh token, activates the instance, and returns first access token.
 *
 * Body: { refreshToken: string, fingerprint: string, appVersion?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { limited, remaining } = rateLimiter.check(ip);
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "Retry-After": "60", "X-RateLimit-Remaining": "0" },
        },
      );
    }

    const body = await req.json();
    const { refreshToken, fingerprint, appVersion } = body;

    if (!refreshToken || !fingerprint) {
      return NextResponse.json(
        { error: "refreshToken and fingerprint are required" },
        { status: 400 },
      );
    }

    // 1. Verify refresh token signature
    const payload = verifyToken<RefreshTokenPayload>(refreshToken);
    if (!payload || payload.typ !== "refresh") {
      return NextResponse.json(
        { error: "Invalid license key", code: "INVALID_TOKEN" },
        { status: 401 },
      );
    }

    // 2. Look up license in registry
    const license = getLicenseById(payload.lid);
    if (!license) {
      return NextResponse.json(
        { error: "License not found", code: "LICENSE_NOT_FOUND" },
        { status: 404 },
      );
    }

    // 3. Verify this is the current refresh token (not a replaced/reissued one)
    if (license.refreshToken !== refreshToken) {
      return NextResponse.json(
        { error: "This license key has been replaced — please use the new key", code: "TOKEN_SUPERSEDED" },
        { status: 401 },
      );
    }

    // 4. Check subscription active
    if (!license.active) {
      return NextResponse.json(
        {
          error: license.revokedReason || "Subscription is no longer active",
          code: "SUBSCRIPTION_INACTIVE",
        },
        { status: 403 },
      );
    }

    // 5. Activate instance (one-instance enforcement)
    const result = activateLicense(
      payload.lid,
      fingerprint,
      ip,
      appVersion || "unknown",
    );

    if (!result.activated) {
      return NextResponse.json(
        { error: result.message, code: "ALREADY_ACTIVE" },
        { status: 409 },
      );
    }

    // 6. Generate first access token
    const accessToken = generateAccessToken(license);

    return NextResponse.json({
      activated: true,
      instanceId: result.instanceId,
      message: result.message,
      accessToken,
      expiresIn: 24 * 60 * 60,
      license: {
        plan: license.plan,
        org: license.org,
        features: license.features,
        maxAgents: license.maxAgents,
        maxProjects: license.maxProjects,
        maxSeats: license.maxSeats,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Activation failed" },
      { status: 500 },
    );
  }
}
