/**
 * buildbase (SaaSOS) workspace provisioning — dashboard mirror of the
 * `create_buildbase_workspace` function in the root `ac` CLI.
 *
 * !!! VERIFY THESE CALLS AGAINST THE LIVE BUILDBASE API !!!
 * The endpoints/shapes below were reverse-engineered from the compiled SDK
 * (@buildbase/sdk dist/index.cjs + index.d.ts). They are UNVERIFIED against a
 * running server because there is no valid service credential here and the org
 * is in "personal" mode (workspace creation disabled). Confirm the path, auth
 * header, request body and response shape once the org is reconfigured.
 *
 * Reference (SDK WorkspaceApi):
 *   baseUrl = `${serverUrl}/api/${version}/${basePath}`  (version "v1",
 *             WorkspaceApi basePath defaults to "public")
 *   create  = fetchJson("workspaces", {method:"POST", body:{name, image?}})
 *             → POST ${SAAS_SERVER_URL}/api/v1/public/workspaces
 *             → returns IWorkspace { _id, workspaceId, name, ... }
 *   addUser = fetchJson(`workspaces/${id}/users/add`, {method:"POST",
 *                        body:{email, role}})
 *             → POST .../api/v1/public/workspaces/<id>/users/add
 *   auth    = getAuthHeaders() → { "x-session-id": <sessionId> }
 *             (org is derived server-side from the service session; SAAS_ORG_ID
 *              is the SDK's client-side guard.)
 */

const SAAS_SERVER_URL = process.env.SAAS_SERVER_URL || process.env.NEXT_PUBLIC_SAAS_SERVER_URL;
const SERVICE_SESSION_ID = process.env.BUILDBASE_SERVICE_SESSION_ID;
const SAAS_API_VERSION = process.env.SAAS_API_VERSION || "v1";
const SAAS_API_BASEPATH = process.env.SAAS_API_BASEPATH || "public";

interface BuildbaseWorkspace {
  _id?: string;
  workspaceId?: string;
  name?: string;
}

/**
 * Create the tenant's buildbase workspace and add the owner as an owner-member.
 *
 * Mirrors the `ac` CLI: never throws. Returns the workspace id on success, or
 * an empty string when the service credential is missing or the API call fails
 * (in which case the tenant falls back to single-tenant — no cross-tenant gate —
 * until re-bound). Failures are logged, not surfaced to the caller.
 */
export async function createBuildbaseWorkspace(
  name: string,
  email?: string
): Promise<string> {
  if (!SAAS_SERVER_URL || !SERVICE_SESSION_ID) {
    console.warn(
      "[buildbase] SAAS_SERVER_URL / BUILDBASE_SERVICE_SESSION_ID not set — " +
        "skipping workspace creation; tenant will run single-tenant."
    );
    return "";
  }

  const base = `${SAAS_SERVER_URL.replace(/\/+$/, "")}/api/${SAAS_API_VERSION}/${SAAS_API_BASEPATH}`;
  const headers = {
    "Content-Type": "application/json",
    "x-session-id": SERVICE_SESSION_ID,
  };

  // 1. Create the workspace (VERIFY endpoint/shape against live buildbase API).
  let workspaceId = "";
  try {
    const res = await fetch(`${base}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      console.warn(
        `[buildbase] workspace creation failed (${res.status}): ${await safeText(res)}. ` +
          "Likely org in 'personal' mode or invalid service session. Tenant runs single-tenant."
      );
      return "";
    }
    const data = (await res.json()) as BuildbaseWorkspace;
    workspaceId = data.workspaceId || data._id || "";
  } catch (err) {
    console.warn(
      `[buildbase] workspace creation error: ${err instanceof Error ? err.message : String(err)}. ` +
        "Tenant runs single-tenant."
    );
    return "";
  }

  if (!workspaceId) {
    console.warn("[buildbase] workspace created but no id in response. Tenant runs single-tenant.");
    return "";
  }

  // 2. Add the owner as an owner-member (VERIFY; role name assumed "owner").
  //    Non-fatal: the workspace already exists.
  if (email) {
    try {
      const res = await fetch(`${base}/workspaces/${encodeURIComponent(workspaceId)}/users/add`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, role: "owner" }),
      });
      if (!res.ok) {
        console.warn(
          `[buildbase] workspace ${workspaceId} created but adding owner ${email} ` +
            `failed (${res.status}): ${await safeText(res)}. Add manually or re-run bind-workspace.`
        );
      }
    } catch (err) {
      console.warn(
        `[buildbase] adding owner ${email} to ${workspaceId} errored: ` +
          (err instanceof Error ? err.message : String(err))
      );
    }
  }

  return workspaceId;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "<no body>";
  }
}
