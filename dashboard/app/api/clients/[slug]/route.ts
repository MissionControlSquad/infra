import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getClient } from "@/lib/registry";
import { deleteClient, getContainerStatus, getContainerStats } from "@/lib/shell";

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
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
