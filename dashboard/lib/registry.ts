import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  CLIENT_TYPE,
  ClientType,
  PROVISIONING_STATUS,
  ProvisioningStatus,
} from "./constants";

const REGISTRY_PATH = process.env.NODE_ENV === "production"
  ? path.join(process.cwd(), "clients/registry.json")
  : path.resolve(process.cwd(), "../clients/registry.json");

export interface ClientEntry {
  name: string;
  type: ClientType;
  authSecret: string;
  cronSecret: string;
  createdAt: string;
  domains?: string[];
  version?: string;
  licenseRefreshToken?: string;
  email?: string;
  /** Explicit provisioning state so callers know whether creation is still in progress. */
  provisioningStatus?: ProvisioningStatus;
  provisioningAttempts?: number;
  /**
   * The buildbase workspace this tenant's container is bound to (id passed in by
   * the caller at provision time). Empty/undefined ⇒ the tenant runs
   * single-tenant (no cross-tenant gate); set later via
   * `ac set-workspace <slug> --workspace-id <id>`.
   */
  workspaceId?: string;
}

export type Registry = Record<string, ClientEntry>;

export function readRegistry(): Registry {
  try {
    const data = fs.readFileSync(REGISTRY_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/** Returns only active (non-deleted) entries — excludes keys prefixed with "deleted_". */
export function listActiveClients(): Array<{ slug: string; entry: ClientEntry }> {
  const reg = readRegistry();
  return Object.entries(reg)
    .filter(([key]) => !key.startsWith("deleted_"))
    .map(([slug, entry]) => ({ slug, entry }));
}

export interface DeletedClientEntry {
  slug: string;
  deletedAt: string;
  entry: ClientEntry;
}

/**
 * Returns archived (soft-deleted) entries.
 * Keys are stored as "deleted_<slug>_<YYYYMMDDHHMMSS>" by cmd_delete in ac.
 */
export function listDeletedClients(): DeletedClientEntry[] {
  const reg = readRegistry();
  const results: DeletedClientEntry[] = [];
  for (const [key, entry] of Object.entries(reg)) {
    const match = key.match(/^deleted_(.+)_(\d{14})$/);
    if (!match) continue;
    const [, slug, ts] = match;
    // Parse YYYYMMDDHHMMSS → ISO string
    const deletedAt = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
    results.push({ slug, deletedAt, entry });
  }
  return results.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export function getClient(slug: string): ClientEntry | null {
  const reg = readRegistry();
  return reg[slug] ?? null;
}

/**
 * Sync the license refresh token to the host registry so compose files
 * can inject it as LICENSE_REFRESH_TOKEN env var into client containers.
 */
export function syncRefreshTokenToRegistry(slug: string, refreshToken: string): void {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
    const registry = JSON.parse(raw);
    if (!registry[slug]) return;
    registry[slug].licenseRefreshToken = refreshToken;
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch {
    // Non-fatal — compose regeneration will pick up the token from license registry
  }
}

export function registerClient(
  slug: string,
  name: string,
  type: ClientType,
  email?: string
): ClientEntry {
  const registry = readRegistry();

  if (registry[slug]) {
    throw new Error(`Client "${slug}" already exists`);
  }

  const entry: ClientEntry = {
    name,
    type,
    authSecret: crypto.randomBytes(32).toString("hex"),
    cronSecret: crypto.randomBytes(32).toString("hex"),
    createdAt: new Date().toISOString(),
    // Self-hosted clients manage their own infra — no container to wait for
    provisioningStatus: type === CLIENT_TYPE.SELF_HOSTED ? PROVISIONING_STATUS.ACTIVE : PROVISIONING_STATUS.PROVISIONING,
    provisioningAttempts: type === CLIENT_TYPE.SELF_HOSTED ? undefined : 1,
    ...(email ? { email } : {}),
  };

  registry[slug] = entry;
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  return entry;
}

export function setClientEmail(slug: string, email: string): void {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
    const registry = JSON.parse(raw) as Registry;
    if (!registry[slug]) return;
    registry[slug].email = email.toLowerCase().trim();
    // `ac create` writes its own entry without provisioningStatus — backfill it
    // Only apply to hosted entries; self-hosted are already active by definition
    if (!registry[slug].provisioningStatus && registry[slug].type !== CLIENT_TYPE.SELF_HOSTED) {
      registry[slug].provisioningStatus = PROVISIONING_STATUS.PROVISIONING;
    }
    if (registry[slug].provisioningAttempts === undefined && registry[slug].type !== CLIENT_TYPE.SELF_HOSTED) {
      registry[slug].provisioningAttempts = 1;
    }
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch {
    // non-fatal
  }
}

/**
 * Persist the buildbase workspace id for a tenant so `ac`/compose regeneration
 * can inject it as TENANT_WORKSPACE_ID. Non-fatal on failure.
 */
export function setClientWorkspaceId(slug: string, workspaceId: string): void {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
    const registry = JSON.parse(raw) as Registry;
    if (!registry[slug]) return;
    registry[slug].workspaceId = workspaceId;
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch {
    // non-fatal — the container falls back to single-tenant until re-bound
  }
}

export function setClientActive(slug: string): void {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
    const registry = JSON.parse(raw) as Registry;
    if (!registry[slug]) return;
    registry[slug].provisioningStatus = PROVISIONING_STATUS.ACTIVE;
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch {
    // non-fatal
  }
}

export function setClientFailed(slug: string): void {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
    const registry = JSON.parse(raw) as Registry;
    if (!registry[slug]) return;
    registry[slug].provisioningStatus = PROVISIONING_STATUS.FAILED;
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch {
    // non-fatal
  }
}

export function incrementProvisioningAttempts(slug: string): number {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
    const registry = JSON.parse(raw) as Registry;
    if (!registry[slug]) return 0;
    const next = (registry[slug].provisioningAttempts ?? 1) + 1;
    registry[slug].provisioningAttempts = next;
    registry[slug].provisioningStatus = PROVISIONING_STATUS.PROVISIONING;
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    return next;
  } catch {
    return 0;
  }
}

export function deleteClient(slug: string): void {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
    const registry = JSON.parse(raw) as Registry;
    if (!registry[slug]) return;
    delete registry[slug];
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch {
    // non-fatal
  }
}

export function findClientByEmail(email: string): { slug: string; entry: ClientEntry } | null {
  const normalized = email.toLowerCase().trim();
  const registry = readRegistry();
  for (const [slug, entry] of Object.entries(registry)) {
    if (slug.startsWith("deleted_")) continue;
    if (entry.email && entry.email.toLowerCase().trim() === normalized) {
      return { slug, entry };
    }
  }
  return null;
}

/**
 * Find a registry entry by email AND deployment type.
 * A single user may have one hosted entry and one self-hosted entry (but never
 * both active at the same time). Using (email + type) ensures the lookup
 * returns the entry that matches the user's current subscription plan.
 */
export function findClientByEmailAndType(
  email: string,
  type: ClientType
): { slug: string; entry: ClientEntry } | null {
  const normalized = email.toLowerCase().trim();
  const registry = readRegistry();
  for (const [slug, entry] of Object.entries(registry)) {
    if (slug.startsWith("deleted_")) continue;
    if (
      entry.email &&
      entry.email.toLowerCase().trim() === normalized &&
      (entry.type ?? CLIENT_TYPE.HOSTED) === type
    ) {
      return { slug, entry };
    }
  }
  return null;
}
