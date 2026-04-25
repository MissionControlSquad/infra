import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, isApiKeyAuthenticated } from "@/lib/auth";
import { findClientByEmail } from "@/lib/registry";
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

  return NextResponse.json({
    found: true,
    slug,
    url: `https://${slug}.app.agentcenter.cloud`,
    name: entry.name,
    type: entry.type ?? "hosted",
    status: isHosted ? getContainerStatus(slug) : null,
    createdAt: entry.createdAt,
  });
}
