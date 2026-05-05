import { execSync } from "child_process";
import crypto from "crypto";
import path from "path";

// ── SQL / shell-safety helpers ──────────────────────────────────
/** Escape a value for inclusion inside a single-quoted SQL literal (doubles single quotes). */
function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/** Validate that a slug contains only lowercase alphanumeric characters and hyphens. */
function assertValidSlug(slug: string): void {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Invalid slug: "${slug}" — only [a-z0-9-] allowed`);
  }
}

// In Docker: cwd is /app, ac is at /app/ac, clients/ and templates/ mounted under /app
// In dev: cwd is dashboard/, ac is at ../ac
const INFRA_DIR = process.env.NODE_ENV === "production"
  ? process.cwd()
  : path.resolve(process.cwd(), "..");
const AC_PATH = path.join(INFRA_DIR, "ac");

function run(command: string, timeout = 30_000, env?: Record<string, string>): string {
  try {
    return execSync(command, {
      cwd: INFRA_DIR,
      timeout,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: env ? { ...process.env, ...env } : undefined,
    }).trim();
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    throw new Error([e.stderr, e.stdout].filter(Boolean).join("\n") || e.message || "Command failed");
  }
}

export function createClient(slug: string, name?: string, version?: string): string {
  const nameFlag = name ? ` --name "${name.replace(/"/g, '\\"')}"` : "";
  const versionFlag = version ? ` --version ${version}` : "";
  return run(`${AC_PATH} create ${slug}${nameFlag}${versionFlag}`, 120_000);
}

export function deleteClient(slug: string): string {
  return run(`${AC_PATH} delete ${slug} --confirm`, 30_000);
}

export function restartClient(slug: string): string {
  return run(`${AC_PATH} restart ${slug}`, 30_000);
}

export function getContainerStatus(slug: string): "running" | "stopped" | "not found" {
  try {
    const out = run(`docker inspect --format='{{.State.Status}}' agentcenter-app-${slug}-1 2>/dev/null`);
    return out === "running" ? "running" : "stopped";
  } catch {
    return "not found";
  }
}

export function getContainerLogs(slug: string, lines = 100): string {
  try {
    return run(`docker logs agentcenter-app-${slug}-1 --tail ${lines} 2>&1`, 10_000);
  } catch {
    return "No logs available";
  }
}

export function getContainerStats(slug: string): { memory: string } | null {
  try {
    const mem = run(
      `docker stats agentcenter-app-${slug}-1 --no-stream --format '{{.MemUsage}}' 2>/dev/null`,
      10_000
    );
    return { memory: mem };
  } catch {
    return null;
  }
}

export function upgradeClient(slug: string, version: string): string {
  return run(`${AC_PATH} upgrade ${slug} --version ${version}`, 120_000);
}

export function fixMigrations(slug: string): string {
  assertValidSlug(slug);
  return run(`${AC_PATH} fix-migrations ${slug}`, 180_000);
}

export function refreshEnv(slug: string): string {
  return run(`${AC_PATH} refresh-env ${slug}`, 60_000);
}

export function refreshEnvAll(): string {
  return run(`${AC_PATH} refresh-env --all`, 120_000);
}

export interface VersionInfo {
  tag: string;
  createdAt: string;
  message?: string;
}

export function listAvailableVersions(): VersionInfo[] {
  const owner = process.env.GHCR_OWNER;
  const token = process.env.GHCR_TOKEN;
  if (!owner || !token) return [];

  try {
    const raw = run(
      `curl -sf -H "Authorization: Bearer $GHCR_AUTH_TOKEN" ` +
      `"https://api.github.com/orgs/${owner}/packages/container/agentcenter-app/versions?per_page=50" 2>/dev/null || ` +
      `curl -sf -H "Authorization: Bearer $GHCR_AUTH_TOKEN" ` +
      `"https://api.github.com/users/${owner}/packages/container/agentcenter-app/versions?per_page=50"`,
      15_000,
      { GHCR_AUTH_TOKEN: token }
    );
    const data = JSON.parse(raw);
    const versions: VersionInfo[] = [];
    for (const entry of data) {
      const entryTags = entry.metadata?.container?.tags ?? [];
      const createdAt = entry.created_at || "";
      for (const tag of entryTags) {
        if (tag && tag !== "latest") {
          versions.push({ tag, createdAt });
        }
      }
    }

    // Try to enrich with release messages from GitHub Releases API
    const releaseMessages = fetchReleaseMessages(owner, token);
    for (const v of versions) {
      if (releaseMessages[v.tag]) {
        v.message = releaseMessages[v.tag];
      }
    }

    return versions;
  } catch {
    return [];
  }
}

function fetchReleaseMessages(owner: string, token: string): Record<string, string> {
  try {
    const raw = run(
      `curl -sf -H "Authorization: Bearer $GHCR_AUTH_TOKEN" ` +
      `"https://api.github.com/repos/${owner}/agentcenter-app/releases?per_page=50"`,
      15_000,
      { GHCR_AUTH_TOKEN: token }
    );
    const releases = JSON.parse(raw);
    const map: Record<string, string> = {};
    for (const rel of releases) {
      const tag = rel.tag_name;
      if (tag) {
        map[tag] = rel.name || rel.body?.split("\n")[0] || "";
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function getClientUsage(slug: string): { agents: number; projects: number; seats: number } | null {
  assertValidSlug(slug);
  const db = `client_${slug}`;
  try {
    const raw = run(
      `docker exec agentcenter-postgres-1 psql -U postgres -d ${db} -t -A -c "SELECT (SELECT COUNT(*) FROM agents), (SELECT COUNT(*) FROM projects), (SELECT COUNT(*) FROM admin_users)"`,
      10_000
    );
    const parts = raw.split("|");
    if (parts.length < 3) return null;
    return {
      agents: parseInt(parts[0], 10) || 0,
      projects: parseInt(parts[1], 10) || 0,
      seats: parseInt(parts[2], 10) || 0,
    };
  } catch {
    return null;
  }
}

export function listDatabases(): string[] {
  try {
    const raw = run(
      `docker exec agentcenter-postgres-1 psql -U postgres -t -A -c "SELECT datname FROM pg_database WHERE datname LIKE 'client_%' ORDER BY datname"`,
      10_000
    );
    return raw.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function getTableStats(slug: string): { table: string; count: number }[] {
  assertValidSlug(slug);
  const db = `client_${slug}`;
  try {
    const raw = run(
      `docker exec agentcenter-postgres-1 psql -U postgres -d ${db} -t -A -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC"`,
      10_000
    );
    return raw.split("\n").filter(Boolean).map((line) => {
      const [table, count] = line.split("|");
      return { table, count: parseInt(count, 10) || 0 };
    });
  } catch {
    return [];
  }
}

export function getAdminUsers(slug: string): { id: string; username: string }[] {
  assertValidSlug(slug);
  const db = `client_${slug}`;
  try {
    const raw = run(
      `docker exec agentcenter-postgres-1 psql -U postgres -d ${db} -t -A -c "SELECT id, username FROM admin_users ORDER BY \\"createdAt\\" ASC"`,
      10_000
    );
    return raw.split("\n").filter(Boolean).map((line) => {
      const [id, username] = line.split("|");
      return { id, username };
    });
  } catch {
    return [];
  }
}

export function insertResetToken(slug: string, tokenHash: string, adminUserId: string, expiresAt: string): void {
  assertValidSlug(slug);
  const db = `client_${slug}`;
  const id = crypto.randomUUID();
  const safeTokenHash = escapeSqlLiteral(tokenHash);
  const safeAdminUserId = escapeSqlLiteral(adminUserId);
  const safeExpiresAt = escapeSqlLiteral(expiresAt);
  // createdById = adminUserId (self-service from infra)
  run(
    `docker exec agentcenter-postgres-1 psql -U postgres -d ${db} -c "INSERT INTO password_reset_tokens (id, \\"tokenHash\\", \\"adminUserId\\", \\"createdById\\", \\"expiresAt\\", \\"createdAt\\") VALUES ('${id}', '${safeTokenHash}', '${safeAdminUserId}', '${safeAdminUserId}', '${safeExpiresAt}', NOW())"`,
    10_000
  );
}

// ── Feature Flags ───────────────────────────────────────────────

export interface FeatureFlagInfo {
  key: string;
  enabled: boolean;
  managedBy: "system" | "user";
  description: string;
}

export function getFeatureFlags(slug: string): FeatureFlagInfo[] {
  assertValidSlug(slug);
  const db = `client_${slug}`;
  try {
    const raw = run(
      `docker exec agentcenter-postgres-1 psql -U postgres -d ${db} -t -A -c "SELECT key, enabled, COALESCE(\\\"managedBy\\\", 'system'), COALESCE(description, '') FROM feature_flags ORDER BY key"`,
      10_000
    );
    return raw.split("\n").filter(Boolean).map((line) => {
      const [key, enabled, managedBy, description] = line.split("|");
      return {
        key,
        enabled: enabled === "t",
        managedBy: (managedBy === "user" ? "user" : "system") as "system" | "user",
        description: description || "",
      };
    });
  } catch {
    return [];
  }
}

export function setFeatureFlag(slug: string, key: string, enabled: boolean): string {
  assertValidSlug(slug);
  if (!/^[a-z][a-z_]*$/.test(key)) {
    throw new Error(`Invalid feature key: "${key}" — only [a-z_] allowed`);
  }
  const cmd = enabled ? "enable" : "disable";
  return run(`${AC_PATH} ${cmd} ${slug} ${key}`, 10_000);
}

export function setClientPlan(slug: string, plan: string): string {
  return run(`${AC_PATH} set-plan ${slug} ${plan}`, 30_000);
}

/**
 * Trigger an immediate license token refresh on a client's container.
 * Uses the client's CRON_SECRET for authentication (same internal secret).
 * The container is reachable via Docker network: agentcenter-app-{slug}-1:3000
 */
export function triggerLicenseRefresh(slug: string, cronSecret: string): { success: boolean; message: string } {
  try {
    const containerHost = `agentcenter-app-${slug}-1`;
    const result = run(
      `curl -sf -X POST "http://${containerHost}:3000/api/license/refresh" ` +
      `-H "Authorization: Bearer ${cronSecret}" ` +
      `-H "Content-Type: application/json"`,
      10_000
    );
    const data = JSON.parse(result);
    return { success: data.success ?? true, message: data.message || "Refreshed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to trigger refresh";
    return { success: false, message: msg };
  }
}

export function listContainers(): { name: string; status: string; image: string }[] {
  try {
    const raw = run("docker ps --format '{{.Names}}\t{{.Status}}\t{{.Image}}'", 10_000);
    if (!raw) return [];
    return raw.split("\n").filter(Boolean).map((line) => {
      const [name, status, image] = line.split("\t");
      return { name: name || "", status: status || "", image: image || "" };
    });
  } catch {
    return [];
  }
}

export function getSystemStats(): {
  memoryUsed: string;
  memoryTotal: string;
  diskUsed: string;
  diskTotal: string;
  containerCount: number;
} {
  const memInfo = run("free -h | awk '/^Mem:/ {print $3, $2}'");
  const [memUsed, memTotal] = memInfo.split(" ");

  const diskInfo = run("df -h / | awk 'NR==2 {print $3, $2}'");
  const [diskUsed, diskTotal] = diskInfo.split(" ");

  const containers = parseInt(run("docker ps -q | wc -l"), 10);

  return {
    memoryUsed: memUsed || "?",
    memoryTotal: memTotal || "?",
    diskUsed: diskUsed || "?",
    diskTotal: diskTotal || "?",
    containerCount: containers,
  };
}
