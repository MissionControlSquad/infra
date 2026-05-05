import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for shell.ts that exercise the real module (not a mock).
 * child_process is mocked so no Docker / execSync calls happen.
 *
 * Kept in a separate file from fix-migrations.test.ts because that file
 * mocks @/lib/shell wholesale — mixing a full-module mock with real-module
 * tests in the same file causes the imports to clash.
 */

vi.mock("child_process", () => ({
  execSync: vi.fn().mockReturnValue("done"),
}));

import { execSync } from "child_process";
import { fixMigrations, setFeatureFlag, getFeatureFlags } from "@/lib/shell";

describe("shell.ts fixMigrations — slug validation", () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReturnValue("done" as never);
  });

  it("runs without error for a valid slug", () => {
    expect(() => fixMigrations("my-client-01")).not.toThrow();
    expect(execSync).toHaveBeenCalled();
  });

  it("throws for a slug with uppercase letters", () => {
    expect(() => fixMigrations("MyClient")).toThrow(/Invalid slug/);
  });

  it("throws for a slug with spaces", () => {
    expect(() => fixMigrations("my client")).toThrow(/Invalid slug/);
  });

  it("throws for path traversal attempt", () => {
    expect(() => fixMigrations("../../etc/passwd")).toThrow(/Invalid slug/);
  });

  it("throws for shell metacharacters in slug", () => {
    expect(() => fixMigrations("acme; rm -rf /")).toThrow(/Invalid slug/);
  });

  it("does not call execSync when slug is invalid", () => {
    vi.mocked(execSync).mockClear();
    try { fixMigrations("INVALID"); } catch { /* expected */ }
    expect(execSync).not.toHaveBeenCalled();
  });

  it("passes the slug through to the ac command", () => {
    fixMigrations("acme-test");
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("fix-migrations acme-test");
  });
});

describe("shell.ts setFeatureFlag — key validation", () => {
  beforeEach(() => {
    vi.mocked(execSync).mockClear();
    vi.mocked(execSync).mockReturnValue("ok" as never);
  });

  it("allows a valid snake_case key", () => {
    expect(() => setFeatureFlag("acme", "my_feature", true)).not.toThrow();
  });

  it("throws for a key starting with underscore", () => {
    expect(() => setFeatureFlag("acme", "_hidden", true)).toThrow(/Invalid feature key/);
  });

  it("throws for a key with uppercase letters", () => {
    expect(() => setFeatureFlag("acme", "MyFeature", true)).toThrow(/Invalid feature key/);
  });

  it("throws for a key with numbers", () => {
    expect(() => setFeatureFlag("acme", "feature1", true)).toThrow(/Invalid feature key/);
  });

  it("calls ac enable for enabled=true", () => {
    setFeatureFlag("acme", "my_flag", true);
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("enable acme my_flag");
  });

  it("calls ac disable for enabled=false", () => {
    setFeatureFlag("acme", "my_flag", false);
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("disable acme my_flag");
  });
});

describe("shell.ts getFeatureFlags — output parsing", () => {
  it("returns an empty array when there are no flags", () => {
    vi.mocked(execSync).mockReturnValue("" as never);
    expect(getFeatureFlags("acme")).toEqual([]);
  });

  it("parses a single enabled flag", () => {
    vi.mocked(execSync).mockReturnValue("my_flag|t|system|Some feature" as never);
    const flags = getFeatureFlags("acme");
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ key: "my_flag", enabled: true, managedBy: "system", description: "Some feature" });
  });

  it("parses a disabled user-managed flag", () => {
    vi.mocked(execSync).mockReturnValue("beta_mode|f|user|Beta access" as never);
    const flags = getFeatureFlags("acme");
    expect(flags[0]).toMatchObject({ key: "beta_mode", enabled: false, managedBy: "user" });
  });

  it("returns empty array on execSync error (container not running)", () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error("no such container"); });
    expect(getFeatureFlags("acme")).toEqual([]);
  });
});
