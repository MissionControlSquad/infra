import fs from "fs";
import path from "path";

// ── Types ───────────────────────────────────────────────────────

export interface AuditEntry {
  timestamp: string;
  action: string;
  slug: string;
  details: Record<string, unknown>;
}

// ── File Path ───────────────────────────────────────────────────

const AUDIT_LOG_PATH = process.env.NODE_ENV === "production"
  ? path.join(process.cwd(), "data/audit-log.json")
  : path.resolve(process.cwd(), "../data/audit-log.json");

function ensureDataDir() {
  const dir = path.dirname(AUDIT_LOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ── Read / Write Helpers ────────────────────────────────────────

const MAX_ENTRIES = 1000;
const TRIM_TO = 500;

function readAuditLog(): AuditEntry[] {
  try {
    const data = fs.readFileSync(AUDIT_LOG_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeAuditLog(entries: AuditEntry[]) {
  ensureDataDir();
  fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(entries, null, 2));
}

// ── Public API ──────────────────────────────────────────────────

/** Append an audit entry. Trims to most recent 500 if log exceeds 1000 entries. */
export function logAudit(
  action: string,
  slug: string,
  details: Record<string, unknown>,
) {
  const entries = readAuditLog();

  entries.push({
    timestamp: new Date().toISOString(),
    action,
    slug,
    details,
  });

  // Keep the file manageable
  const trimmed = entries.length > MAX_ENTRIES
    ? entries.slice(-TRIM_TO)
    : entries;

  writeAuditLog(trimmed);
}

/** Read audit entries, optionally filtered by slug. Returns most recent first. */
export function getAuditLog(slug?: string, limit?: number): AuditEntry[] {
  let entries = readAuditLog();

  if (slug) {
    entries = entries.filter((e) => e.slug === slug);
  }

  // Most recent first
  entries.reverse();

  if (limit && limit > 0) {
    entries = entries.slice(0, limit);
  }

  return entries;
}
