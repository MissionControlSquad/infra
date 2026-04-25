import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, isApiKeyAuthenticated } from "@/lib/auth";
import { findClientByEmailAndType, setClientActive, setClientFailed } from "@/lib/registry";
import { getContainerStatus } from "@/lib/shell";
import { getLicense } from "@/lib/license";
import {
  SELF_HOST_PLAN_NAME,
  HOSTED_APP_DOMAIN,
  CLIENT_TYPE,
  PROVISIONING_STATUS,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated()) && !isApiKeyAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get("email");
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  // Determine the deployment type the caller cares about from the plan name.
  // A user may have one hosted entry and one self-hosted entry in the registry;
  // planName selects which one is relevant for their current subscription.
  const planName = req.nextUrl.searchParams.get("planName") ?? undefined;
  const targetType =
    planName === SELF_HOST_PLAN_NAME ? CLIENT_TYPE.SELF_HOSTED : CLIENT_TYPE.HOSTED;

  const result = findClientByEmailAndType(email, targetType);
  if (!result) {
    return NextResponse.json({ found: false });
  }

  const { slug, entry } = result;
  const isHosted = (entry.type ?? CLIENT_TYPE.HOSTED) === CLIENT_TYPE.HOSTED;
  const containerStatus = isHosted ? getContainerStatus(slug) : null;

  // Entries without provisioningStatus predate this tracking — treat them as
  // already active (legacy). Only mutate state for entries explicitly set to
  // "provisioning" by our creation flow.
  let provisioningStatus = entry.provisioningStatus;

  if (isHosted) {
    if (containerStatus === "running" && provisioningStatus !== PROVISIONING_STATUS.ACTIVE) {
      // Container confirmed running — promote to active regardless of previous state
      setClientActive(slug);
      provisioningStatus = PROVISIONING_STATUS.ACTIVE;
    } else if (provisioningStatus === PROVISIONING_STATUS.PROVISIONING) {
      // Explicitly in-progress — only check for timeout failure in production.
      // In local dev Docker is unavailable so container status is always "not found",
      // which must not trigger failure detection for real entries.
      if (process.env.NODE_ENV === "production") {
        const ageMs = Date.now() - new Date(entry.createdAt).getTime();
        const TEN_MINUTES = 10 * 60 * 1000;
        if (ageMs > TEN_MINUTES) {
          setClientFailed(slug);
          provisioningStatus = PROVISIONING_STATUS.FAILED;
        }
      }
    }
  }

  // For self-hosted tenants: look up their active license to get the key they
  // need to activate their instance on first launch.
  const clientType = entry.type ?? CLIENT_TYPE.HOSTED;
  const licenseEntry = clientType === CLIENT_TYPE.SELF_HOSTED ? getLicense(slug) : null;
  const licenseKey =
    licenseEntry?.active ? licenseEntry.refreshToken : undefined;

  // Self-hosted clients use their own domain — no agentcenter.cloud URL
  const url =
    clientType === CLIENT_TYPE.SELF_HOSTED
      ? (entry.domains?.[0] ?? null)
      : `https://${slug}.${HOSTED_APP_DOMAIN}`;

  return NextResponse.json({
    found: true,
    slug,
    url,
    name: entry.name,
    type: clientType,
    status: containerStatus,
    // Omitted when undefined so status.ts can distinguish legacy (no field) from
    // explicit "provisioning" / "active" / "failed"
    ...(provisioningStatus !== undefined ? { provisioningStatus } : {}),
    ...(entry.provisioningAttempts !== undefined ? { provisioningAttempts: entry.provisioningAttempts } : {}),
    ...(licenseKey !== undefined ? { licenseKey } : {}),
    createdAt: entry.createdAt,
  });
}
