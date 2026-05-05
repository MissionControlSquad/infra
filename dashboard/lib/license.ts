import crypto from "crypto";
import fs from "fs";
import path from "path";
import { syncRefreshTokenToRegistry } from "./registry";
import { LicensePlan, PLAN_META } from "./constants";
export type { LicensePlan };

// ── RSA Key Management ─────────────────────────────────────────

const KEYS_DIR = process.env.NODE_ENV === "production"
  ? path.join(process.cwd(), "keys")
  : path.resolve(process.cwd(), "../keys");

function ensureKeysDir() {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }
}

function getKeyPaths() {
  return {
    privateKey: path.join(KEYS_DIR, "license-private.pem"),
    publicKey: path.join(KEYS_DIR, "license-public.pem"),
  };
}

export function ensureKeyPair(): { publicKey: string; privateKey: string } {
  ensureKeysDir();
  const paths = getKeyPaths();

  if (fs.existsSync(paths.privateKey) && fs.existsSync(paths.publicKey)) {
    return {
      privateKey: fs.readFileSync(paths.privateKey, "utf-8"),
      publicKey: fs.readFileSync(paths.publicKey, "utf-8"),
    };
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  fs.writeFileSync(paths.privateKey, privateKey, { mode: 0o600 });
  fs.writeFileSync(paths.publicKey, publicKey, { mode: 0o644 });

  return { publicKey, privateKey };
}

export function getPublicKey(): string {
  const paths = getKeyPaths();
  if (!fs.existsSync(paths.publicKey)) {
    ensureKeyPair();
  }
  return fs.readFileSync(paths.publicKey, "utf-8");
}

function getPrivateKey(): string {
  const paths = getKeyPaths();
  if (!fs.existsSync(paths.privateKey)) {
    ensureKeyPair();
  }
  return fs.readFileSync(paths.privateKey, "utf-8");
}

// ── Token Types ─────────────────────────────────────────────────

/** Access token payload — short-lived (24h), contains permissions */
export interface AccessTokenPayload {
  typ: "access";
  lid: string;       // license ID
  sub: string;       // client slug
  org: string;
  plan: LicensePlan;
  maxAgents: number;
  maxProjects: number;
  maxSeats: number;
  features: string[];
  iat: number;
  exp: number;
  iss: string;
}

/** Refresh token payload — long-lived, used to get new access tokens */
export interface RefreshTokenPayload {
  typ: "refresh";
  lid: string;       // license ID
  sub: string;       // client slug
  iat: number;
  iss: string;
  // No exp — valid as long as subscription is active in registry
}

// ── Plan Defaults (loaded from central plan-config.json) ────────

interface PlanDefaults {
  maxAgents: number;
  maxProjects: number;
  maxSeats: number;
  features: string[];
}

interface PlanConfig {
  plans: Record<string, PlanDefaults>;
  allFeatures: { key: string; description: string; managedBy: string }[];
}

function loadPlanConfig(): PlanConfig {
  // In production (Docker): mounted at /app/scripts/plan-config.json
  // In dev: at ../scripts/plan-config.json
  const configPath = process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), "scripts/plan-config.json")
    : path.resolve(process.cwd(), "../scripts/plan-config.json");

  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    // Fallback: derive from PLAN_META (single source within the dashboard codebase)
    return {
      plans: Object.fromEntries(
        Object.entries(PLAN_META).map(([key, m]) => [
          key,
          { maxAgents: m.agents, maxProjects: m.projects, maxSeats: m.seats, features: m.features },
        ])
      ),
      allFeatures: [],
    };
  }
}

let _planConfig: PlanConfig | null = null;
function getPlanConfig(): PlanConfig {
  if (!_planConfig) _planConfig = loadPlanConfig();
  return _planConfig;
}

export function getPlanDefaults(plan: string): PlanDefaults {
  const config = getPlanConfig();
  return config.plans[plan] ?? config.plans.starter;
}

export function getAllPlanNames(): string[] {
  return Object.keys(getPlanConfig().plans);
}

export function getAllFeatureDefinitions() {
  return getPlanConfig().allFeatures;
}

// ── Token Signing & Verification ────────────────────────────────

function b64url(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function b64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function signToken(payload: Record<string, unknown>): string {
  const header = { alg: "RS256", typ: "LICENSE" };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKey = getPrivateKey();
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKey, "base64url");

  return `${signingInput}.${signature}`;
}

export function verifyToken<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  try {
    const publicKey = getPublicKey();
    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(signingInput);
    if (!verify.verify(publicKey, signature, "base64url")) return null;
    return JSON.parse(b64urlDecode(payloadB64)) as T;
  } catch {
    return null;
  }
}

const ACCESS_TOKEN_TTL = 24 * 60 * 60; // 24 hours in seconds

/** Generate a short-lived access token (24h) */
export function generateAccessToken(license: LicenseEntry): string {
  const defaults = getPlanDefaults(license.plan);
  const now = Math.floor(Date.now() / 1000);

  const payload: AccessTokenPayload = {
    typ: "access",
    lid: license.id,
    sub: license.slug,
    org: license.org,
    plan: license.plan,
    maxAgents: license.maxAgents ?? defaults.maxAgents,
    maxProjects: license.maxProjects ?? defaults.maxProjects,
    maxSeats: license.maxSeats ?? defaults.maxSeats,
    features: license.features.length > 0 ? license.features : defaults.features,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL,
    iss: "agentcenter.cloud",
  };

  return signToken(payload as unknown as Record<string, unknown>);
}

/** Generate a long-lived refresh token (no expiry — valid while subscription active) */
export function generateRefreshToken(licenseId: string, slug: string): string {
  const now = Math.floor(Date.now() / 1000);

  const payload: RefreshTokenPayload = {
    typ: "refresh",
    lid: licenseId,
    sub: slug,
    iat: now,
    iss: "agentcenter.cloud",
  };

  return signToken(payload as unknown as Record<string, unknown>);
}

// ── Activation Tracking ─────────────────────────────────────────

export interface LicenseActivation {
  instanceId: string;
  licenseId: string;
  fingerprint: string;
  ipAddress: string;
  appVersion: string;
  activatedAt: string;
  lastHeartbeatAt: string;
  status: "active" | "inactive";
}

const ACTIVATIONS_PATH = process.env.NODE_ENV === "production"
  ? path.join(process.cwd(), "data/license-activations.json")
  : path.resolve(process.cwd(), "../data/license-activations.json");

function ensureDataDir() {
  const dir = path.dirname(ACTIVATIONS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readActivations(): Record<string, LicenseActivation> {
  try {
    const data = fs.readFileSync(ACTIVATIONS_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function writeActivations(activations: Record<string, LicenseActivation>) {
  ensureDataDir();
  fs.writeFileSync(ACTIVATIONS_PATH, JSON.stringify(activations, null, 2));
}

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export function activateLicense(
  licenseId: string,
  fingerprint: string,
  ipAddress: string,
  appVersion: string,
): { instanceId: string; activated: boolean; message: string } {
  const activations = readActivations();

  const existing = Object.values(activations).find(
    (a) => a.licenseId === licenseId && a.status === "active"
  );

  if (existing) {
    // Same fingerprint — simple re-activation (same container restarted)
    if (existing.fingerprint === fingerprint) {
      existing.lastHeartbeatAt = new Date().toISOString();
      existing.ipAddress = ipAddress;
      existing.appVersion = appVersion;
      writeActivations(activations);
      return { instanceId: existing.instanceId, activated: true, message: "Re-activated on same instance" };
    }

    // Same IP (Docker network) — likely a container rebuild/upgrade, allow it
    if (existing.ipAddress === ipAddress) {
      existing.status = "inactive";
    } else {
      // Different IP — enforce stale threshold to prevent concurrent use
      const lastBeat = new Date(existing.lastHeartbeatAt).getTime();
      const now = Date.now();
      if (now - lastBeat < STALE_THRESHOLD_MS) {
        return {
          instanceId: "",
          activated: false,
          message: `License already active on another instance (${existing.instanceId}). Last heartbeat ${Math.round((now - lastBeat) / 60_000)}min ago.`,
        };
      }
      existing.status = "inactive";
    }
  }

  const instanceId = `inst_${crypto.randomBytes(8).toString("hex")}`;
  activations[instanceId] = {
    instanceId,
    licenseId,
    fingerprint,
    ipAddress,
    appVersion,
    activatedAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    status: "active",
  };

  writeActivations(activations);
  return { instanceId, activated: true, message: "Activated successfully" };
}

export function processHeartbeat(
  instanceId: string,
  licenseId: string,
): { valid: boolean; message: string } {
  const activations = readActivations();
  const activation = activations[instanceId];

  if (!activation) return { valid: false, message: "Instance not found. Re-activation required." };
  if (activation.licenseId !== licenseId) return { valid: false, message: "License mismatch." };
  if (activation.status !== "active") return { valid: false, message: "Instance has been deactivated." };

  activation.lastHeartbeatAt = new Date().toISOString();
  writeActivations(activations);
  return { valid: true, message: "OK" };
}

export function deactivateAllForLicense(licenseId: string): number {
  const activations = readActivations();
  let count = 0;
  for (const a of Object.values(activations)) {
    if (a.licenseId === licenseId && a.status === "active") {
      a.status = "inactive";
      count++;
    }
  }
  writeActivations(activations);
  return count;
}

export function getActivationForLicense(licenseId: string): LicenseActivation | null {
  const activations = readActivations();
  return Object.values(activations).find(
    (a) => a.licenseId === licenseId && a.status === "active"
  ) ?? null;
}

// ── License Registry ────────────────────────────────────────────

export interface LicenseEntry {
  id: string;
  slug: string;
  org: string;
  plan: LicensePlan;
  refreshToken: string;
  maxAgents: number;
  maxProjects: number;
  maxSeats: number;
  features: string[];
  issuedAt: string;
  active: boolean;       // subscription active?
  revokedReason?: string;
}

const LICENSE_REGISTRY_PATH = process.env.NODE_ENV === "production"
  ? path.join(process.cwd(), "data/license-registry.json")
  : path.resolve(process.cwd(), "../data/license-registry.json");

function readLicenseRegistry(): Record<string, LicenseEntry> {
  try {
    const data = fs.readFileSync(LICENSE_REGISTRY_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function writeLicenseRegistry(registry: Record<string, LicenseEntry>) {
  ensureDataDir();
  fs.writeFileSync(LICENSE_REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

/**
 * Issue a new license for a client.
 * Returns the refresh token (client enters this once) + first access token.
 */
export function issueLicense(
  slug: string,
  org: string,
  plan: LicensePlan,
  overrides?: Partial<{ maxAgents: number; maxProjects: number; maxSeats: number; features: string[] }>,
): { entry: LicenseEntry; refreshToken: string; accessToken: string } {
  const registry = readLicenseRegistry();

  // Deactivate existing license for this slug
  if (registry[slug] && registry[slug].active) {
    registry[slug].active = false;
    registry[slug].revokedReason = "Replaced by new license";
    deactivateAllForLicense(registry[slug].id);
  }

  const defaults = getPlanDefaults(plan);
  const licenseId = `lic_${crypto.randomBytes(8).toString("hex")}`;
  const refreshToken = generateRefreshToken(licenseId, slug);

  const entry: LicenseEntry = {
    id: licenseId,
    slug,
    org,
    plan,
    refreshToken,
    maxAgents: overrides?.maxAgents ?? defaults.maxAgents,
    maxProjects: overrides?.maxProjects ?? defaults.maxProjects,
    maxSeats: overrides?.maxSeats ?? defaults.maxSeats,
    features: overrides?.features ?? defaults.features,
    issuedAt: new Date().toISOString(),
    active: true,
  };

  registry[slug] = entry;
  writeLicenseRegistry(registry);

  // Keep host registry in sync so compose files get the new token
  syncRefreshTokenToRegistry(slug, refreshToken);

  const accessToken = generateAccessToken(entry);

  return { entry, refreshToken, accessToken };
}

/** Find license by its ID (from token payload) */
export function getLicenseById(licenseId: string): LicenseEntry | null {
  const registry = readLicenseRegistry();
  return Object.values(registry).find((e) => e.id === licenseId) ?? null;
}

/** Find license by client slug */
export function getLicense(slug: string): LicenseEntry | null {
  const registry = readLicenseRegistry();
  return registry[slug] ?? null;
}

/** Revoke (deactivate subscription) */
export function revokeLicense(slug: string, reason: string): boolean {
  const registry = readLicenseRegistry();
  if (!registry[slug]) return false;

  registry[slug].active = false;
  registry[slug].revokedReason = reason;
  deactivateAllForLicense(registry[slug].id);
  writeLicenseRegistry(registry);
  return true;
}

/** Re-activate a revoked license (e.g. payment resumed) */
export function reactivateLicense(slug: string): boolean {
  const registry = readLicenseRegistry();
  if (!registry[slug]) return false;

  registry[slug].active = true;
  delete registry[slug].revokedReason;
  writeLicenseRegistry(registry);
  return true;
}

/** Update plan/limits for an existing license */
export function updateLicensePlan(
  slug: string,
  plan: LicensePlan,
  overrides?: Partial<{ maxAgents: number; maxProjects: number; maxSeats: number; features: string[] }>,
): LicenseEntry | null {
  const registry = readLicenseRegistry();
  if (!registry[slug]) return null;

  const defaults = getPlanDefaults(plan);
  registry[slug].plan = plan;
  registry[slug].maxAgents = overrides?.maxAgents ?? defaults.maxAgents;
  registry[slug].maxProjects = overrides?.maxProjects ?? defaults.maxProjects;
  registry[slug].maxSeats = overrides?.maxSeats ?? defaults.maxSeats;
  registry[slug].features = overrides?.features ?? defaults.features;

  writeLicenseRegistry(registry);
  return registry[slug];
}

/** Update just the features array on an existing license */
export function updateLicenseFeatures(slug: string, features: string[]): LicenseEntry | null {
  const registry = readLicenseRegistry();
  if (!registry[slug]) return null;

  registry[slug].features = features;
  writeLicenseRegistry(registry);
  return registry[slug];
}

/** Re-issue a new refresh token for an existing active license */
export function reissueRefreshToken(slug: string): { refreshToken: string; licenseId: string } | null {
  const registry = readLicenseRegistry();
  const entry = registry[slug];
  if (!entry || !entry.active) return null;

  const refreshToken = generateRefreshToken(entry.id, slug);
  entry.refreshToken = refreshToken;
  writeLicenseRegistry(registry);

  // Keep host registry in sync so compose files get the new token
  syncRefreshTokenToRegistry(slug, refreshToken);

  // Old token shouldn't work anymore — deactivate all instances so client must re-activate
  deactivateAllForLicense(entry.id);

  return { refreshToken, licenseId: entry.id };
}

export function listLicenses(): LicenseEntry[] {
  const registry = readLicenseRegistry();
  return Object.values(registry);
}
