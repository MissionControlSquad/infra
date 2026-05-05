import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock auth — default: authenticated
vi.mock("@/lib/auth", () => ({
  isAuthenticated: vi.fn().mockResolvedValue(true),
}));

// Mock registry
vi.mock("@/lib/registry", () => ({
  getClient: vi.fn(),
}));

// Mock shell — no real execSync / Docker calls
vi.mock("@/lib/shell", () => ({
  fixMigrations: vi.fn(),
}));

import { isAuthenticated } from "@/lib/auth";
import { getClient } from "@/lib/registry";
import { fixMigrations } from "@/lib/shell";

const hostedClient = { slug: "acme", type: "hosted", name: "Acme" };
const selfHostedClient = { slug: "acme-sh", type: "self-hosted", name: "Acme SH" };
// Legacy entry — old registry rows written before the type field existed
const legacyClient = { slug: "legacy", name: "Legacy Corp" };

function makeRequest(slug: string) {
  return {
    req: new NextRequest(`http://localhost:4000/api/clients/${slug}/fix-migrations`, {
      method: "POST",
    }),
    params: Promise.resolve({ slug }),
  };
}

async function callRoute(slug: string) {
  const { POST } = await import("@/app/api/clients/[slug]/fix-migrations/route");
  const { req, params } = makeRequest(slug);
  return POST(req, { params });
}

// ── Route tests ──────────────────────────────────────────────────────────────

describe("POST /api/clients/[slug]/fix-migrations — auth & guards", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    vi.mocked(getClient).mockReturnValue(hostedClient as never);
    vi.mocked(fixMigrations).mockReturnValue("Migration fix complete for acme.");
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    const res = await callRoute("acme");
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  it("returns 404 when client does not exist", async () => {
    vi.mocked(getClient).mockReturnValue(undefined as never);
    const res = await callRoute("unknown");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Client not found");
  });

  it("returns 400 for self-hosted clients", async () => {
    vi.mocked(getClient).mockReturnValue(selfHostedClient as never);
    const res = await callRoute("acme-sh");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/hosted/i);
  });

  it("allows legacy clients with no type field (defaults to hosted)", async () => {
    // Old registry entries written before `type` was added have no type field.
    // The route treats them as hosted so they can be fixed.
    vi.mocked(getClient).mockReturnValue(legacyClient as never);
    vi.mocked(fixMigrations).mockReturnValue("done");
    const res = await callRoute("legacy");
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("does not call fixMigrations when auth fails", async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await callRoute("acme");
    expect(fixMigrations).not.toHaveBeenCalled();
  });

  it("does not call fixMigrations for self-hosted clients", async () => {
    vi.mocked(getClient).mockReturnValue(selfHostedClient as never);
    await callRoute("acme-sh");
    expect(fixMigrations).not.toHaveBeenCalled();
  });
});

describe("POST /api/clients/[slug]/fix-migrations — success & output", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    vi.mocked(getClient).mockReturnValue(hostedClient as never);
  });

  it("calls fixMigrations with the correct slug", async () => {
    vi.mocked(fixMigrations).mockReturnValue("ok");
    await callRoute("acme");
    expect(fixMigrations).toHaveBeenCalledWith("acme");
    expect(fixMigrations).toHaveBeenCalledTimes(1);
  });

  it("returns the shell output in the response body", async () => {
    const output = "Fixing migrations for acme...\nMigration fix complete for acme.";
    vi.mocked(fixMigrations).mockReturnValue(output);
    const res = await callRoute("acme");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.output).toBe(output);
  });

  it("returns ok:true with empty output when ac produces no output", async () => {
    vi.mocked(fixMigrations).mockReturnValue("");
    const res = await callRoute("acme");
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

describe("POST /api/clients/[slug]/fix-migrations — error handling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    vi.mocked(getClient).mockReturnValue(hostedClient as never);
  });

  it("returns 500 with the Error message when fixMigrations throws an Error", async () => {
    vi.mocked(fixMigrations).mockImplementation(() => {
      throw new Error("P3009: migration failed");
    });
    const res = await callRoute("acme");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("P3009");
  });

  it("returns 500 with fallback message when a non-Error is thrown", async () => {
    // execSync or ac can sometimes throw strings or unknown values
    vi.mocked(fixMigrations).mockImplementation(() => {
      throw "unexpected string error"; // eslint-disable-line no-throw-literal
    });
    const res = await callRoute("acme");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Migration fix failed");
  });

  it("returns 500 with fallback message when null is thrown", async () => {
    vi.mocked(fixMigrations).mockImplementation(() => {
      throw null; // eslint-disable-line no-throw-literal
    });
    const res = await callRoute("acme");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Migration fix failed");
  });
});

