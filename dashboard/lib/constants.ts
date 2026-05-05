/** Plan name string used by the website's BuildBase subscription for self-hosting. */
export const SELF_HOST_PLAN_NAME = "Self-Hosting";

/** License plan tier assigned to all self-hosted customers (unlimited limits). */
export const SELF_HOST_LICENSE_PLAN = "scale" as const;

/** Subdomain base for hosted tenant workspaces. */
export const HOSTED_APP_DOMAIN = "app.agentcenter.cloud";

/** Maximum provisioning retry attempts before requiring admin intervention. */
export const TENANT_MAX_RETRY_ATTEMPTS = 3;

/** Individual plan name constants. */
export const PLAN_STARTER   = "starter" as const;
export const PLAN_PRO       = "pro"     as const;
export const PLAN_SCALE     = "scale"   as const;

export type LicensePlan = typeof PLAN_STARTER | typeof PLAN_PRO | typeof PLAN_SCALE;

/** All valid license plan tiers — use individual constants (PLAN_STARTER etc.) when referencing a specific plan. */
export const LICENSE_PLANS = [PLAN_STARTER, PLAN_PRO, PLAN_SCALE] as const satisfies LicensePlan[];

/** Display label for each plan. */
export const PLAN_LABELS: Record<LicensePlan, string> = {
  starter: "Starter",
  pro: "Pro",
  scale: "Scale",
};

/** Tailwind color token for each plan (used for badges and highlights). */
export const PLAN_COLORS: Record<LicensePlan, "zinc" | "blue" | "amber"> = {
  starter: "zinc",
  pro: "blue",
  scale: "amber",
};

/** Returns Tailwind badge class string for a plan name. */
export function planBadgeClass(plan: string): string {
  if (plan === "scale") return "bg-amber-500/10 text-amber-400";
  if (plan === "pro")   return "bg-blue-500/10 text-blue-400";
  return "bg-zinc-700/50 text-zinc-400";
}

/** Plan limits and features shown in the issue-license modal. Keep in sync with plan-config.json. */
export const PLAN_META: Record<LicensePlan, {
  agents: number; projects: number; seats: number; features: string[];
}> = {
  starter: { agents: 5,  projects: 3,  seats: 3,  features: ["channels", "documents", "agent_queue"] },
  pro:     { agents: 15, projects: 15, seats: 10, features: ["channels", "documents", "agent_queue", "reviews", "recurring_tasks", "notifications", "live_gateway"] },
  scale:   { agents: 50, projects: 50, seats: -1, features: ["channels", "analytics", "recurring_tasks", "cloud_vms", "reviews", "documents", "agent_queue", "notifications", "live_gateway"] },
};

/** Client deployment type discriminator values. */
export const CLIENT_TYPE = {
  HOSTED: "hosted",
  SELF_HOSTED: "self-hosted",
} as const;
export type ClientType = (typeof CLIENT_TYPE)[keyof typeof CLIENT_TYPE];

/** Provisioning lifecycle state values. */
export const PROVISIONING_STATUS = {
  PROVISIONING: "provisioning",
  ACTIVE: "active",
  FAILED: "failed",
} as const;
export type ProvisioningStatus = (typeof PROVISIONING_STATUS)[keyof typeof PROVISIONING_STATUS];
