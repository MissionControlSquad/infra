import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, isApiKeyAuthenticated } from "@/lib/auth";
import { getClient, setClientWorkspaceId } from "@/lib/registry";
import { setWorkspace, addDomain } from "@/lib/shell";
import { HOSTED_APP_DOMAIN, CLIENT_TYPE } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Bind an EXISTING hosted tenant to a buildbase workspace AND expose it at
 * `<workspaceId>.<HOSTED_APP_DOMAIN>` — the migration primitive (email-slug → workspace-id URL).
 *
 * DECOUPLE-ONLY (no data move): keeps the internal slug (container `app-<slug>`, DB `client_<slug>`,
 * volume, R2 prefix, registry key) and only (1) backfills `workspaceId` + injects `TENANT_WORKSPACE_ID`
 * (`ac set-workspace` regenerates compose + restarts) and (2) adds the workspace-id host as a second
 * Traefik alias (`ac add-domain`). Idempotent — safe to re-run. The old `<slug>.app…` URL keeps working
 * (cookies survive via `AUTH_COOKIE_DOMAIN=.agentcenter.cloud`). Called by the website migration driver
 * (only holder of buildbase creds, which resolves owner email → workspace). INFRA_API_KEY-guarded.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isAuthenticated()) && !isApiKeyAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const client = getClient(slug);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  if ((client.type ?? CLIENT_TYPE.HOSTED) === CLIENT_TYPE.SELF_HOSTED) {
    return NextResponse.json(
      { error: "Self-hosted tenants have no workspace-id URL alias" },
      { status: 400 },
    );
  }

  let workspaceId: string;
  try {
    const body = (await req.json()) as { workspaceId?: string };
    workspaceId = (body.workspaceId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  // Bind-once: refuse to REBIND a tenant already bound to a DIFFERENT workspace. This stops the website
  // migration self-heal from MOVING a tenant when a multi-workspace owner opens a second workspace (the
  // legacy tenant belongs to the first workspace it was bound to; the second gets a fresh tenant). Same
  // id = idempotent no-op below. (An operator can still rebind manually via `ac set-workspace`.)
  const existingWs = (client.workspaceId ?? "").trim();
  if (existingWs && existingWs !== workspaceId) {
    return NextResponse.json(
      { error: "Tenant already bound to a different workspace", boundWorkspaceId: existingWs, slug },
      { status: 409 },
    );
  }

  const output: string[] = [];
  const isProd = process.env.NODE_ENV === "production";

  // 1. Bind the workspace (idempotent — skip if already bound to this id).
  if ((client.workspaceId ?? "").trim() !== workspaceId) {
    if (isProd) {
      output.push(setWorkspace(slug, workspaceId)); // ac set-workspace → regen compose + restart
    } else {
      setClientWorkspaceId(slug, workspaceId); // local dev: registry only (no Docker)
    }
  }

  // 2. Expose the tenant at <workspaceId>.app.agentcenter.cloud (idempotent — skip if alias exists).
  const wsHost = `${workspaceId}.${HOSTED_APP_DOMAIN}`;
  if (!(client.domains ?? []).includes(wsHost) && isProd) {
    output.push(addDomain(slug, wsHost)); // ac add-domain → adds a second Traefik Host alias
  }

  return NextResponse.json({
    ok: true,
    slug,
    workspaceId,
    url: `https://${wsHost}`,
    output: output.join("\n"),
  });
}
