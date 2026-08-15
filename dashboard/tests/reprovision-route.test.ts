import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Reprovision (the website "retry" path) re-runs `ac create`, which UNCONDITIONALLY rewrites the
// registry's workspaceId and the container's TENANT_WORKSPACE_ID from the --workspace-id flag. So the
// route MUST pass the tenant's existing workspaceId (and email) back through, or a retry silently wipes
// the buildbase workspace binding and drops the tenant to single-tenant mode.

let clientFixture: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", () => ({
  isAuthenticated: vi.fn(async () => false),
  isApiKeyAuthenticated: vi.fn(() => true),
}));

const incrementProvisioningAttempts = vi.fn((_slug: string) => 2);
vi.mock("@/lib/registry", () => ({
  getClient: vi.fn(() => clientFixture),
  incrementProvisioningAttempts: (slug: string) => incrementProvisioningAttempts(slug),
}));

const createClient = vi.fn(
  (_slug: string, _name?: string, _version?: string, _email?: string, _workspaceId?: string) => "ok",
);
vi.mock("@/lib/shell", () => ({
  createClient: (
    slug: string,
    name?: string,
    version?: string,
    email?: string,
    workspaceId?: string,
  ) => createClient(slug, name, version, email, workspaceId),
}));

import { POST } from "@/app/api/clients/[slug]/reprovision/route";

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const req = () => ({ headers: { get: () => "k" } }) as never;

describe("POST /api/clients/[slug]/reprovision — preserves workspace binding", () => {
  beforeEach(() => {
    createClient.mockClear();
    incrementProvisioningAttempts.mockClear();
    vi.stubEnv("NODE_ENV", "production"); // the createClient call only runs in prod
  });
  afterEach(() => vi.unstubAllEnvs());

  it("passes the existing email + workspaceId back into ac create", async () => {
    clientFixture = {
      name: "acme",
      version: "1.2.0",
      email: "owner@example.com",
      workspaceId: "ws_acme",
      provisioningStatus: "failed",
      provisioningAttempts: 1,
    };
    const res = await POST(req(), ctx("wacme"));
    expect(res.status).toBe(200);
    // The load-bearing assertion: binding is preserved on retry.
    expect(createClient).toHaveBeenCalledWith("wacme", "acme", "1.2.0", "owner@example.com", "ws_acme");
  });

  it("409s (and never rebuilds) when the tenant is not in a failed state", async () => {
    clientFixture = { name: "acme", provisioningStatus: "active" };
    const res = await POST(req(), ctx("wacme"));
    expect(res.status).toBe(409);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("429s (and never rebuilds) once max attempts are reached", async () => {
    clientFixture = {
      name: "acme",
      workspaceId: "ws_acme",
      provisioningStatus: "failed",
      provisioningAttempts: 3,
    };
    const res = await POST(req(), ctx("wacme"));
    expect(res.status).toBe(429);
    expect(createClient).not.toHaveBeenCalled();
  });
});
