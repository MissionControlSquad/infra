import fs from "fs";
import path from "path";

const REGISTRY_PATH = path.resolve(process.cwd(), "../clients/registry.json");

export interface ClientEntry {
  name: string;
  authSecret: string;
  cronSecret: string;
  createdAt: string;
  domains?: string[];
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
