import crypto from "crypto";
import fs from "fs";
import path from "path";

const REGISTRY_PATH = process.env.NODE_ENV === "production"
  ? path.join(process.cwd(), "clients/registry.json")
  : path.resolve(process.cwd(), "../clients/registry.json");

export interface ClientEntry {
  name: string;
  type: "hosted" | "self-hosted";
  authSecret: string;
  cronSecret: string;
  createdAt: string;
  domains?: string[];
  version?: string;
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

export function getClient(slug: string): ClientEntry | null {
  const reg = readRegistry();
  return reg[slug] ?? null;
}

export function registerClient(slug: string, name: string, type: "hosted" | "self-hosted"): ClientEntry {
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
  };

  registry[slug] = entry;
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  return entry;
}
