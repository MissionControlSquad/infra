"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";

interface ClientDetail {
  slug: string;
  name: string;
  status: "running" | "stopped" | "not found";
  stats: { memory: string } | null;
  url: string;
  database: string;
  createdAt: string;
  domains: string[];
  version: string;
  tables: { table: string; count: number }[];
}

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [versionDetails, setVersionDetails] = useState<Record<string, { createdAt: string; message?: string }>>({});
  const [selectedVersion, setSelectedVersion] = useState("");
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [adminUsers, setAdminUsers] = useState<{ id: string; username: string }[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState("");
  const [generatingReset, setGeneratingReset] = useState(false);
  const [resetResult, setResetResult] = useState<{ resetUrl: string; expiresAt: string; username: string } | null>(null);
  const [resetError, setResetError] = useState("");
  const [copied, setCopied] = useState(false);
  const [refreshingEnv, setRefreshingEnv] = useState(false);
  const [flags, setFlags] = useState<{ key: string; enabled: boolean; managedBy: string; description: string }[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [togglingFlag, setTogglingFlag] = useState<string | null>(null);
  const [settingPlan, setSettingPlan] = useState(false);
  const logsRef = useRef<HTMLPreElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/clients/${slug}`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => { if (data) setClient(data); })
      .finally(() => setLoading(false));

    fetch(`/api/clients/${slug}/logs`)
      .then((r) => {
        if (!r.ok) return { logs: "" };
        return r.json();
      })
      .then((d) => setLogs(d.logs || ""));

    fetch(`/api/clients/${slug}/features`)
      .then((r) => r.ok ? r.json() : { flags: [] })
      .then((d) => setFlags(d.flags || []))
      .finally(() => setFlagsLoading(false));
  }, [slug]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  async function handleRefreshEnv() {
    setRefreshingEnv(true);
    try {
      await fetch(`/api/clients/${slug}/refresh-env`, { method: "POST" });
      setTimeout(async () => {
        const r = await fetch(`/api/clients/${slug}/logs`);
        const d = await r.json();
        setLogs(d.logs || "");
      }, 2000);
    } finally {
      setRefreshingEnv(false);
    }
  }

  async function handleRestart() {
    const res = await fetch(`/api/clients/${slug}/restart`, { method: "POST" });
    if (res.ok && client) {
      setClient({ ...client, status: "running" });
      // Refresh logs after short delay
      setTimeout(async () => {
        const r = await fetch(`/api/clients/${slug}/logs`);
        const d = await r.json();
        setLogs(d.logs || "");
      }, 2000);
    }
  }

  async function handleDelete() {
    setDeleteError("");
    setDeleting(true);
    const res = await fetch(`/api/clients/${slug}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: deletePassword }),
    });
    if (res.ok) {
      router.push("/");
    } else {
      const data = await res.json();
      setDeleteError(data.error || "Failed to delete");
      setDeleting(false);
    }
  }

  async function openUpgradeModal() {
    setShowUpgradeModal(true);
    setUpgradeError("");
    setSelectedVersion("");
    try {
      const r = await fetch("/api/versions");
      const d = await r.json();
      setAvailableVersions(d.versions || []);
      setVersionDetails(d.versionDetails || {});
    } catch {
      setAvailableVersions([]);
    }
  }

  async function handleUpgrade() {
    if (!selectedVersion) return;
    setUpgradeError("");
    setUpgrading(true);
    try {
      const res = await fetch(`/api/clients/${slug}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: selectedVersion }),
      });
      if (res.ok) {
        setShowUpgradeModal(false);
        if (client) setClient({ ...client, version: selectedVersion, status: "running" });
        setTimeout(async () => {
          const r = await fetch(`/api/clients/${slug}/logs`);
          const d = await r.json();
          setLogs(d.logs || "");
        }, 2000);
      } else {
        const data = await res.json();
        setUpgradeError(data.error || "Upgrade failed");
      }
    } catch {
      setUpgradeError("Upgrade failed");
    } finally {
      setUpgrading(false);
    }
  }

  async function openResetModal() {
    setShowResetModal(true);
    setResetError("");
    setResetResult(null);
    setSelectedAdminId("");
    setCopied(false);
    try {
      const r = await fetch(`/api/clients/${slug}/reset-password`);
      const d = await r.json();
      setAdminUsers(d.adminUsers || []);
    } catch {
      setAdminUsers([]);
    }
  }

  async function handleGenerateReset() {
    if (!selectedAdminId) return;
    setGeneratingReset(true);
    setResetError("");
    setResetResult(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/clients/${slug}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminUserId: selectedAdminId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.error || "Failed to generate reset link");
      } else {
        setResetResult(data);
      }
    } catch {
      setResetError("Failed to generate reset link");
    } finally {
      setGeneratingReset(false);
    }
  }

  async function handleToggleFlag(key: string, enabled: boolean) {
    setTogglingFlag(key);
    try {
      const res = await fetch(`/api/clients/${slug}/features`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled }),
      });
      if (res.ok) {
        setFlags(prev => prev.map(f => f.key === key ? { ...f, enabled } : f));
      }
    } finally {
      setTogglingFlag(null);
    }
  }

  async function handleSetPlan(plan: string) {
    setSettingPlan(true);
    try {
      await fetch(`/api/clients/${slug}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      // Refresh flags
      const r = await fetch(`/api/clients/${slug}/features`);
      const d = await r.json();
      setFlags(d.flags || []);
    } finally {
      setSettingPlan(false);
    }
  }

  if (loading) return <p className="text-zinc-500">Loading...</p>;
  if (!client) return <p className="text-red-400">Client not found</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{client.name}</h1>
          <p className="text-zinc-500 font-mono text-sm">{client.slug}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openResetModal}
            className="px-4 py-2 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Reset Password
          </button>
          <button
            onClick={openUpgradeModal}
            className="px-4 py-2 bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Upgrade
          </button>
          <button
            onClick={handleRefreshEnv}
            disabled={refreshingEnv}
            className="px-4 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            {refreshingEnv ? "Refreshing..." : "Refresh Env"}
          </button>
          <button
            onClick={handleRestart}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Restart
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <InfoCard label="Status">
          <span
            className={`inline-flex items-center gap-1.5 ${
              client.status === "running" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                client.status === "running" ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            {client.status}
          </span>
        </InfoCard>
        <InfoCard label="Version">
          <span className="font-mono text-xs">{client.version}</span>
        </InfoCard>
        <InfoCard label="Memory">
          {client.stats?.memory || "N/A"}
        </InfoCard>
        <InfoCard label="Database">
          <span className="font-mono text-xs">{client.database}</span>
        </InfoCard>
        <InfoCard label="Created">
          {new Date(client.createdAt).toLocaleDateString()}
        </InfoCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard label="URL">
          <a
            href={client.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline text-sm break-all"
          >
            {client.url}
          </a>
        </InfoCard>
        <InfoCard label="Custom Domains">
          {client.domains.length > 0
            ? client.domains.join(", ")
            : "None"}
        </InfoCard>
      </div>

      {/* Database Tables */}
      <div>
        <h2 className="text-lg font-medium mb-2">Database Tables</h2>
        {client.tables && client.tables.length > 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Table Name</th>
                  <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Row Count</th>
                </tr>
              </thead>
              <tbody>
                {client.tables.map((t) => (
                  <tr key={t.table} className="border-b border-zinc-800 last:border-0">
                    <td className="px-4 py-2 font-mono text-xs text-zinc-300">{t.table}</td>
                    <td className="px-4 py-2 text-right text-xs text-zinc-400">{t.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-500">
            No tables
          </div>
        )}
      </div>

      {/* Feature Flags */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-medium">Feature Flags</h2>
          <div className="flex gap-2">
            {["free", "pro", "enterprise"].map((plan) => (
              <button
                key={plan}
                onClick={() => handleSetPlan(plan)}
                disabled={settingPlan}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded text-xs font-medium capitalize transition-colors cursor-pointer"
              >
                {plan}
              </button>
            ))}
          </div>
        </div>
        {flagsLoading ? (
          <p className="text-zinc-500 text-sm">Loading flags...</p>
        ) : flags.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-500">
            No feature flags configured
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
            {flags.map((flag) => (
              <div key={flag.key} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">{flag.key}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      flag.managedBy === "system"
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-emerald-500/10 text-emerald-400"
                    }`}>
                      {flag.managedBy}
                    </span>
                  </div>
                  {flag.description && (
                    <p className="text-xs text-zinc-500 mt-0.5">{flag.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleToggleFlag(flag.key, !flag.enabled)}
                  disabled={togglingFlag === flag.key}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                    flag.enabled ? "bg-emerald-600" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      flag.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-medium">Logs</h2>
          <button
            onClick={async () => {
              const r = await fetch(`/api/clients/${slug}/logs`);
              const d = await r.json();
              setLogs(d.logs || "");
            }}
            className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
          >
            Refresh
          </button>
        </div>
        <pre
          ref={logsRef}
          className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xs font-mono text-zinc-300 overflow-auto max-h-96 whitespace-pre-wrap"
        >
          {logs || "No logs available"}
        </pre>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Upgrade Client</h3>
            <p className="text-zinc-400 text-sm">
              Current version: <span className="font-mono">{client.version}</span>
            </p>
            {availableVersions.length > 0 ? (
              <div className="max-h-48 overflow-y-auto border border-zinc-700 rounded-lg divide-y divide-zinc-800">
                {availableVersions.map((v) => {
                  const detail = versionDetails[v];
                  const isCurrent = v === client.version;
                  const isSelected = v === selectedVersion;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSelectedVersion(v)}
                      className={`w-full text-left px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-blue-600/20 border-l-2 border-l-blue-500"
                          : "bg-zinc-800/50 hover:bg-zinc-800 border-l-2 border-l-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{v}</span>
                        {isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded">current</span>
                        )}
                      </div>
                      {detail?.message && (
                        <p className="text-xs text-zinc-400 mt-0.5 truncate">{detail.message}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">No versions available from registry.</p>
            )}
            {upgradeError && <p className="text-red-400 text-sm">{upgradeError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowUpgradeModal(false); setUpgradeError(""); }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleUpgrade}
                disabled={!selectedVersion || upgrading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                {upgrading ? "Upgrading..." : "Upgrade"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Reset Password</h3>
            <p className="text-zinc-400 text-sm">
              Generate a one-time reset link for a client admin. The link expires in 30 minutes.
            </p>

            {adminUsers.length > 0 ? (
              <div className="space-y-3">
                <select
                  value={selectedAdminId}
                  onChange={(e) => { setSelectedAdminId(e.target.value); setResetResult(null); setCopied(false); }}
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                >
                  <option value="">Select admin user...</option>
                  {adminUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>

                {!resetResult && (
                  <button
                    onClick={handleGenerateReset}
                    disabled={!selectedAdminId || generatingReset}
                    className="w-full px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    {generatingReset ? "Generating..." : "Generate Reset Link"}
                  </button>
                )}

                {resetResult && (
                  <div className="space-y-2 p-3 bg-zinc-800 border border-zinc-700 rounded-lg">
                    <p className="text-xs text-zinc-400">
                      Reset link for <span className="text-zinc-200 font-medium">{resetResult.username}</span> — expires {new Date(resetResult.expiresAt).toLocaleTimeString()}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={resetResult.resetUrl}
                        className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-300 select-all"
                      />
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(resetResult.resetUrl);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="flex-shrink-0 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">No admin users found for this client.</p>
            )}

            {resetError && <p className="text-red-400 text-sm">{resetError}</p>}

            <div className="flex justify-end">
              <button
                onClick={() => { setShowResetModal(false); setResetResult(null); setResetError(""); }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Delete Client</h3>
            <p className="text-zinc-400 text-sm">
              Are you sure you want to delete <strong>{client.slug}</strong>?
              This will stop and remove the container. The database will be preserved.
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Enter admin password to confirm"
              autoFocus
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
            />
            {deleteError && <p className="text-red-400 text-sm">{deleteError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowDeleteModal(false); setDeletePassword(""); setDeleteError(""); }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!deletePassword || deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
