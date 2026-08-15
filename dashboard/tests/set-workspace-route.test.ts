import { describe, it, expect, vi, beforeEach } from "vitest";

// The set-workspace route is the migration primitive. Its safety property is BIND-ONCE: it must refuse
// to move a tenant that is already bound to a *different* workspace (409), while staying idempotent for
// the same id. These tests drive POST directly with the auth/registry/shell deps mocked (no Docker).

let clientFixture: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", () => ({
  isAuthenticated: vi.fn(async () => false),
  isApiKeyAuthenticated: vi.fn(() => true), // API-key path authenticated
}));

const setClientWorkspaceId = vi.fn((_slug: string, _workspaceId: string) => {});
vi.mock("@/lib/registry", () => ({
  getClient: vi.fn(() => clientFixture),
  setClientWorkspaceId: (slug: string, workspaceId: string) =>
    setClientWorkspaceId(slug, workspaceId),
}));

const setWorkspace = vi.fn((_slug: string, _workspaceId: string) => "ok");
const addDomain = vi.fn((_slug: string, _domain: string) => "ok");
vi.mock("@/lib/shell", () => ({
  setWorkspace: (slug: string, workspaceId: string) => setWorkspace(slug, workspaceId),
  addDomain: (slug: string, domain: string) => addDomain(slug, domain),
}));

import { POST } from "@/app/api/clients/[slug]/set-workspace/route";

function req(body: unknown) {
  return {
    json: async () => body,
    headers: { get: () => "k" },
  } as never;
}
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("POST /api/clients/[slug]/set-workspace — bind-once migration guard", () => {
  beforeEach(() => {
    clientFixture = null;
    setClientWorkspaceId.mockClear();
    setWorkspace.mockClear();
    addDomain.mockClear();
  });

  it("404s when the client does not exist", async () => {
    clientFixture = null;
    const res = await POST(req({ workspaceId: "ws_a" }), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("400s for a self-hosted tenant (no workspace-id URL alias)", async () => {
    clientFixture = { name: "s", type: "self-hosted" };
    const res = await POST(req({ workspaceId: "ws_a" }), ctx("selfy"));
    expect(res.status).toBe(400);
  });

  it("400s when workspaceId is missing", async () => {
    clientFixture = { name: "h", type: "hosted" };
    const res = await POST(req({}), ctx("h"));
    expect(res.status).toBe(400);
  });

  it("409s (bind-once) when already bound to a DIFFERENT workspace", async () => {
    clientFixture = { name: "h", type: "hosted", workspaceId: "ws_first" };
    const res = await POST(req({ workspaceId: "ws_second" }), ctx("h"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.boundWorkspaceId).toBe("ws_first");
    // Must NOT have rebound anything.
    expect(setClientWorkspaceId).not.toHaveBeenCalled();
  });

  it("binds an unbound tenant (200) and records the workspaceId", async () => {
    clientFixture = { name: "h", type: "hosted" }; // no workspaceId yet
    const res = await POST(req({ workspaceId: "ws_a" }), ctx("h"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toBe("https://ws_a.app.agentcenter.cloud");
    // Dev (non-prod) path writes the registry directly, no ac shell-out.
    expect(setClientWorkspaceId).toHaveBeenCalledWith("h", "ws_a");
  });

  it("is idempotent for the SAME workspace (200, no rebind write)", async () => {
    clientFixture = { name: "h", type: "hosted", workspaceId: "ws_a" };
    const res = await POST(req({ workspaceId: "ws_a" }), ctx("h"));
    expect(res.status).toBe(200);
    // Already bound to this id → skip the write.
    expect(setClientWorkspaceId).not.toHaveBeenCalled();
  });
});
