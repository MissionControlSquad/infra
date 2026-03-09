import { NextResponse } from "next/server";
import { getPublicKey } from "@/lib/license";

export const dynamic = "force-dynamic";

/**
 * GET /api/license/public-key
 * Public endpoint — returns the RSA public key for offline license verification.
 * This key is also bundled into the app Docker image during build.
 */
export async function GET() {
  try {
    const publicKey = getPublicKey();
    return NextResponse.json({ publicKey });
  } catch {
    return NextResponse.json(
      { error: "Public key not available" },
      { status: 500 }
    );
  }
}
