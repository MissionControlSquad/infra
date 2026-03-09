#!/usr/bin/env node
/**
 * CLI helper to issue/reissue a license for a client.
 * Runs inside the dashboard container where the license keys and registry live.
 *
 * Usage:
 *   node issue-license.js <slug> <org-name> <plan>
 *
 * Output (JSON):
 *   { "refreshToken": "...", "licenseId": "...", "plan": "..." }
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ── Paths ────────────────────────────────────────────────────────────

const KEYS_DIR = path.join(process.cwd(), "keys");
const DATA_DIR = path.join(process.cwd(), "data");
const REGISTRY_PATH = path.join(DATA_DIR, "license-registry.json");
const ACTIVATIONS_PATH = path.join(DATA_DIR, "license-activations.json");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Key Management ───────────────────────────────────────────────────

function ensureKeyPair() {
  ensureDir(KEYS_DIR);
  const privPath = path.join(KEYS_DIR, "license-private.pem");
  const pubPath = path.join(KEYS_DIR, "license-public.pem");

  if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
    return {
      privateKey: fs.readFileSync(privPath, "utf-8"),
      publicKey: fs.readFileSync(pubPath, "utf-8"),
    };
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  fs.writeFileSync(privPath, privateKey, { mode: 0o600 });
  fs.writeFileSync(pubPath, publicKey, { mode: 0o644 });
  return { publicKey, privateKey };
}

function getPrivateKey() {
  return ensureKeyPair().privateKey;
}

// ── Token Signing ────────────────────────────────────────────────────

function b64url(data) {
  return Buffer.from(data).toString("base64url");
}

function signToken(payload) {
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

// ── Plan Defaults (from central plan-config.json) ───────────────────

const PLAN_CONFIG_PATH = path.join(__dirname, "plan-config.json");
const PLAN_DEFAULTS = JSON.parse(fs.readFileSync(PLAN_CONFIG_PATH, "utf-8")).plans;

// ── Registry ─────────────────────────────────────────────────────────

function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeRegistry(reg) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

function readActivations() {
  try {
    return JSON.parse(fs.readFileSync(ACTIVATIONS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeActivations(acts) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(ACTIVATIONS_PATH, JSON.stringify(acts, null, 2));
}

function deactivateAllForLicense(licenseId) {
  const acts = readActivations();
  for (const a of Object.values(acts)) {
    if (a.licenseId === licenseId && a.status === "active") {
      a.status = "inactive";
    }
  }
  writeActivations(acts);
}

// ── Main ─────────────────────────────────────────────────────────────

const [,, slug, org, plan] = process.argv;

if (!slug || !org || !plan) {
  console.error("Usage: node issue-license.js <slug> <org-name> <plan>");
  process.exit(1);
}

if (!PLAN_DEFAULTS[plan]) {
  console.error(`Invalid plan: ${plan}. Use: starter, pro, enterprise`);
  process.exit(1);
}

const registry = readRegistry();

// Deactivate existing license for this slug
if (registry[slug] && registry[slug].active) {
  registry[slug].active = false;
  registry[slug].revokedReason = "Replaced by new license";
  deactivateAllForLicense(registry[slug].id);
}

const defaults = PLAN_DEFAULTS[plan];
const licenseId = `lic_${crypto.randomBytes(8).toString("hex")}`;
const now = Math.floor(Date.now() / 1000);

// Generate refresh token
const refreshToken = signToken({
  typ: "refresh",
  lid: licenseId,
  sub: slug,
  iat: now,
  iss: "agentcenter.cloud",
});

// Store in registry
registry[slug] = {
  id: licenseId,
  slug,
  org,
  plan,
  refreshToken,
  maxAgents: defaults.maxAgents,
  maxProjects: defaults.maxProjects,
  maxSeats: defaults.maxSeats,
  features: defaults.features,
  issuedAt: new Date().toISOString(),
  active: true,
};

writeRegistry(registry);

// Output
console.log(JSON.stringify({
  refreshToken,
  licenseId,
  plan,
}));
