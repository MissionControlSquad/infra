/** Plan name string used by the website's BuildBase subscription for self-hosting. */
export const SELF_HOST_PLAN_NAME = "Self-Hosting";

/** License plan tier assigned to all self-hosted customers (unlimited limits). */
export const SELF_HOST_LICENSE_PLAN = "enterprise" as const;

/** Subdomain base for hosted tenant workspaces. */
export const HOSTED_APP_DOMAIN = "app.agentcenter.cloud";

/** Maximum provisioning retry attempts before requiring admin intervention. */
export const TENANT_MAX_RETRY_ATTEMPTS = 3;

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
