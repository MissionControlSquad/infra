import { NextRequest, NextResponse } from "next/server";
import {
  verifyToken,
  generateAccessToken,
  getLicenseById,
  type RefreshTokenPayload,
} from "@/lib/license";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

// 10 requests per minute per IP
const rateLimiter = createRateLimiter(10, 60_000);

export const dynamic = "force-dynamic";

/**
 * POST /api/license/token
 * Public endpoint — called by client apps to exchange refresh token for access token.
 *
 * Body: { refreshToken: string, fingerprint?: string }
 *
 * Returns a new 24h access token if the subscription is still active.
 * This replaces the old heartbeat system — the app just refreshes its token.
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
    const { refreshToken } = body;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "refreshToken is required" },
        { status: 400 },
      );
    }

    // 1. Verify refresh token signature
    const payload = verifyToken<RefreshTokenPayload>(refreshToken);
    if (!payload || payload.typ !== "refresh") {
      return NextResponse.json(
        { error: "Invalid refresh token", code: "INVALID_TOKEN" },
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
        { error: "Refresh token has been superseded — please re-activate with the new token", code: "TOKEN_SUPERSEDED" },
        { status: 401 },
      );
    }

    // 4. Check subscription is still active
    if (!license.active) {
      return NextResponse.json(
        {
          error: license.revokedReason
            ? `Subscription inactive: ${license.revokedReason}`
            : "Subscription is no longer active",
          code: "SUBSCRIPTION_INACTIVE",
        },
        { status: 403 },
      );
    }

    // 5. Generate new access token (24h)
    const accessToken = generateAccessToken(license);

    return NextResponse.json({
      accessToken,
      expiresIn: 24 * 60 * 60, // 86400 seconds
      plan: license.plan,
      org: license.org,
      features: license.features,
      maxAgents: license.maxAgents,
      maxProjects: license.maxProjects,
      maxSeats: license.maxSeats,
    });
  } catch {
    return NextResponse.json(
      { error: "Token exchange failed" },
      { status: 500 },
    );
  }
}
