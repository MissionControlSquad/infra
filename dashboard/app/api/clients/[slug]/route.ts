import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, verifyPassword } from "@/lib/auth";
import { getClient } from "@/lib/registry";
import { deleteClient, getContainerStatus, getContainerStats, getTableStats } from "@/lib/shell";

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

  return NextResponse.json({
    slug,
    name: client.name,
    status: getContainerStatus(slug),
    stats: getContainerStats(slug),
    url: `https://${slug}.app.agentcenter.cloud`,
    database: `client_${slug}`,
    createdAt: client.createdAt,
    domains: client.domains ?? [],
    version: client.version || "latest",
    tables: getTableStats(slug),
  });
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
