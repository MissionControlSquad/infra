import { execSync } from "child_process";
import path from "path";

// In Docker: cwd is /app, ac is at /app/ac, clients/ and templates/ mounted under /app
// In dev: cwd is dashboard/, ac is at ../ac
const INFRA_DIR = process.env.NODE_ENV === "production"
  ? process.cwd()
  : path.resolve(process.cwd(), "..");
const AC_PATH = path.join(INFRA_DIR, "ac");

function run(command: string, timeout = 30_000): string {
  try {
    return execSync(command, {
      cwd: INFRA_DIR,
      timeout,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    throw new Error(e.stderr || e.stdout || e.message || "Command failed");
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

export function listAvailableVersions(): string[] {
  const owner = process.env.GHCR_OWNER;
  const token = process.env.GHCR_TOKEN;
  if (!owner || !token) return [];

  try {
    const raw = run(
      `curl -sf -H "Authorization: Bearer ${token}" ` +
      `"https://api.github.com/orgs/${owner}/packages/container/agentcenter-app/versions?per_page=50" 2>/dev/null || ` +
      `curl -sf -H "Authorization: Bearer ${token}" ` +
      `"https://api.github.com/users/${owner}/packages/container/agentcenter-app/versions?per_page=50"`,
      15_000
    );
    const data = JSON.parse(raw);
    const tags: string[] = [];
    for (const entry of data) {
      const entryTags = entry.metadata?.container?.tags ?? [];
      for (const tag of entryTags) {
        if (tag && tag !== "latest") tags.push(tag);
      }
    }
    return tags;
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
