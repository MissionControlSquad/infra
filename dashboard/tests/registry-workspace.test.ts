import { describe, it, expect, vi } from "vitest";

// Fixture registry: two hosted tenants (each bound to a workspace), one self-hosted, and a deleted_
// entry that reuses ws_alice's id (must be skipped). Mirrors the shape ac writes.
const REGISTRY = {
  "alice-a1b2": {
    name: "alice",
    type: "hosted",
    workspaceId: "ws_alice",
    email: "alice@example.com",
    authSecret: "a",
    cronSecret: "c",
    createdAt: "2026-01-01T00:00:00Z",
  },
  "bob-c3d4": {
    name: "bob",
    type: "hosted",
    workspaceId: "ws_bob",
    email: "bob@example.com",
    authSecret: "a",
    cronSecret: "c",
    createdAt: "2026-01-01T00:00:00Z",
  },
  "selfy-1": {
    name: "selfy",
    type: "self-hosted",
    workspaceId: "ws_self",
    email: "self@example.com",
    authSecret: "a",
    cronSecret: "c",
    createdAt: "2026-01-01T00:00:00Z",
  },
  // Deleted entry reusing ws_alice — must be ignored by lookups.
  deleted_old_zzz: {
    name: "old",
    type: "hosted",
    workspaceId: "ws_alice",
    authSecret: "a",
    cronSecret: "c",
    createdAt: "2026-01-01T00:00:00Z",
  },
  // Legacy entry with NO workspaceId — must never match a workspaceId lookup.
  "legacy-e5f6": {
    name: "legacy",
    type: "hosted",
    email: "legacy@example.com",
    authSecret: "a",
    cronSecret: "c",
    createdAt: "2026-01-01T00:00:00Z",
  },
};

vi.mock("fs", () => {
  const readFileSync = vi.fn(() => JSON.stringify(REGISTRY));
  return { default: { readFileSync }, readFileSync };
});

import { findClientByWorkspaceId, findClientByEmailAndType } from "@/lib/registry";

describe("findClientByWorkspaceId (workspace-per-tenant primary key)", () => {
  it("finds a hosted tenant by its workspaceId", () => {
    expect(findClientByWorkspaceId("ws_alice", "hosted")?.slug).toBe("alice-a1b2");
    expect(findClientByWorkspaceId("ws_bob", "hosted")?.slug).toBe("bob-c3d4");
  });

  it("respects deployment type (hosted vs self-hosted)", () => {
    expect(findClientByWorkspaceId("ws_self", "hosted")).toBeNull();
    expect(findClientByWorkspaceId("ws_self", "self-hosted")?.slug).toBe("selfy-1");
  });

  it("skips deleted_ entries even when their workspaceId matches", () => {
    // ws_alice is on BOTH alice-a1b2 and deleted_old_zzz — must return the live one, never the deleted.
    expect(findClientByWorkspaceId("ws_alice", "hosted")?.slug).toBe("alice-a1b2");
  });

  it("never matches a legacy entry that has no workspaceId", () => {
    expect(findClientByWorkspaceId("", "hosted")).toBeNull();
    // The legacy tenant (no workspaceId) is found only by email, never by a workspaceId lookup.
    expect(findClientByEmailAndType("legacy@example.com", "hosted")?.slug).toBe("legacy-e5f6");
    expect(findClientByWorkspaceId("ws_alice", "hosted")?.slug).not.toBe("legacy-e5f6");
  });

  it("returns null for an unknown workspaceId", () => {
    expect(findClientByWorkspaceId("ws_nope", "hosted")).toBeNull();
  });

  it("email lookup still works alongside (parity)", () => {
    expect(findClientByEmailAndType("alice@example.com", "hosted")?.slug).toBe("alice-a1b2");
    expect(findClientByEmailAndType("nobody@example.com", "hosted")).toBeNull();
  });
});
