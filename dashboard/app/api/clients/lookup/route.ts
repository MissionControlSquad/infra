import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, isApiKeyAuthenticated } from "@/lib/auth";
import { findClientByEmail, setClientActive, setClientFailed } from "@/lib/registry";
import { getContainerStatus } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated()) && !isApiKeyAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get("email");
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const result = findClientByEmail(email);
  if (!result) {
    return NextResponse.json({ found: false });
  }

  const { slug, entry } = result;
  const isHosted = (entry.type ?? "hosted") === "hosted";
  const containerStatus = isHosted ? getContainerStatus(slug) : null;

  // Entries without provisioningStatus predate this tracking — treat them as
  // already active (legacy). Only mutate state for entries explicitly set to
  // "provisioning" by our creation flow.
  let provisioningStatus = entry.provisioningStatus;

  if (isHosted) {
    if (containerStatus === "running" && provisioningStatus !== "active") {
      // Container confirmed running — promote to active regardless of previous state
      setClientActive(slug);
      provisioningStatus = "active";
    } else if (provisioningStatus === "provisioning") {
      // Explicitly in-progress — only check for timeout failure in production.
      // In local dev Docker is unavailable so container status is always "not found",
      // which must not trigger failure detection for real entries.
      if (process.env.NODE_ENV === "production") {
        const ageMs = Date.now() - new Date(entry.createdAt).getTime();
        const TEN_MINUTES = 10 * 60 * 1000;
        if (ageMs > TEN_MINUTES) {
          setClientFailed(slug);
          provisioningStatus = "failed";
        }
      }
    }
  }

  return NextResponse.json({
    found: true,
    slug,
    url: `https://${slug}.app.agentcenter.cloud`,
    name: entry.name,
    type: entry.type ?? "hosted",
    status: containerStatus,
    // Omitted when undefined so status.ts can distinguish legacy (no field) from
    // explicit "provisioning" / "active" / "failed"
    ...(provisioningStatus !== undefined ? { provisioningStatus } : {}),
    ...(entry.provisioningAttempts !== undefined ? { provisioningAttempts: entry.provisioningAttempts } : {}),
    createdAt: entry.createdAt,
  });
}
