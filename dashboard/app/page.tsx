"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_TYPE, ClientType, planBadgeClass } from "@/lib/constants";

interface Client {
  slug: string;
  name: string;
  type: ClientType;
  status: "running" | "stopped" | "not found" | null;
  url: string;
  createdAt: string;
  license: {
    plan: string;
    active: boolean;
    issuedAt: string;
    revokedReason?: string;
  } | null;
  lastActiveAt: string | null;
}

interface ClientStats {
  total: number;
  hosted: number;
  selfHosted: number;
  licensed: number;
  activeLicenses: number;
  revokedLicenses: number;
  byPlan: Record<string, number>;
}

interface DeletedClient {
  slug: string;
  name: string;
  type: ClientType;
  createdAt: string;
  deletedAt: string;
}

interface Container {
  name: string;
  status: string;
  image: string;
}

interface SystemStats {
  memoryUsed: string;
  memoryTotal: string;
  diskUsed: string;
  diskTotal: string;
  containerCount: number;
  containers: Container[];
}

export default function HomePage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientStats, setClientStats] = useState<ClientStats | null>(null);
  const [deletedClients, setDeletedClients] = useState<DeletedClient[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [maintenanceOutput, setMaintenanceOutput] = useState<string | null>(null);
  const [maintenanceRunning, setMaintenanceRunning] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.clients)) {
          setClients(data.clients);
          setClientStats(data.stats ?? null);
          setDeletedClients(Array.isArray(data.deletedClients) ? data.deletedClients : []);
        }
      })
      .finally(() => setLoading(false));

    fetch("/api/status")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data && !data.error) setStats(data);
      })
      .finally(() => setStatsLoading(false));
  }, []);

  async function handleDelete(slug: string) {
    const password = prompt(`Enter admin password to delete "${slug}":`);
    if (!password) return;

    const res = await fetch(`/api/clients/${slug}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const deleted = clients.find((c) => c.slug === slug);
      setClients((prev) => prev.filter((c) => c.slug !== slug));
      if (deleted) {
        setDeletedClients((prev) => [
          { slug: deleted.slug, name: deleted.name, type: deleted.type, createdAt: deleted.createdAt, deletedAt: new Date().toISOString() },
          ...prev,
        ]);
      }
    } else {
      const data = await res.json();
      alert(data.error || "Failed to delete");
    }
  }

  async function handleRestart(slug: string) {
    const res = await fetch(`/api/clients/${slug}/restart`, { method: "POST" });
    if (res.ok) {
      setClients((prev) =>
        prev.map((c) => (c.slug === slug ? { ...c, status: "running" } : c))
      );
    } else {
      const data = await res.json();
      alert(data.error || "Failed to restart");
    }
  }

  async function runMaintenance(action: string, label: string, requiresPassword = false) {
    let password: string | null = null;
    if (requiresPassword) {
      password = prompt(`Enter admin password to run "${label}":`);
      if (!password) return;
    }
    setMaintenanceRunning(action);
    setMaintenanceOutput(null);
    try {
      const res = await fetch("/api/system/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, password }),
      });
      const data = await res.json();
      if (res.ok) {
        const out = typeof data.output === "string"
          ? data.output
          : JSON.stringify(data.output, null, 2);
        setMaintenanceOutput(`✓ ${label}\n\n${out || "(no output)"}`);
      } else {
        setMaintenanceOutput(`✗ ${label}\n\n${data.error || "Failed"}`);
      }
    } catch {
      setMaintenanceOutput(`✗ ${label}\n\nNetwork error`);
    } finally {
      setMaintenanceRunning(null);
    }
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div>
      {/* System Info */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">System</h2>

        {statsLoading ? (
          <p className="text-zinc-500">Loading...</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Memory</p>
                <p className="text-xl font-semibold">
                  {stats ? `${stats.memoryUsed} / ${stats.memoryTotal}` : "N/A"}
                </p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Disk</p>
                <p className="text-xl font-semibold">
                  {stats ? `${stats.diskUsed} / ${stats.diskTotal}` : "N/A"}
                </p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Containers</p>
                <p className="text-xl font-semibold">
                  {stats ? stats.containerCount : "N/A"}
                </p>
              </div>
            </div>

            {/* Containers table */}
            {stats && stats.containers.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-zinc-800 mb-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400 text-left">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Image</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.containers.map((c) => (
                      <tr
                        key={c.name}
                        className="border-b border-zinc-800/50 hover:bg-zinc-900/30"
                      >
                        <td className="px-4 py-3 font-mono">{c.name}</td>
                        <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{c.image}</td>
                        <td className="px-4 py-3 text-zinc-300">{c.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          {/* Maintenance actions */}
          <div className="mt-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Maintenance</p>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={!!maintenanceRunning}
                onClick={() => runMaintenance("connection-stats", "Connection stats")}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded transition-colors cursor-pointer"
              >
                {maintenanceRunning === "connection-stats" ? "Running..." : "Connection stats"}
              </button>
              <button
                disabled={!!maintenanceRunning}
                onClick={() => runMaintenance("terminate-idle", "Terminate idle connections")}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded transition-colors cursor-pointer"
              >
                {maintenanceRunning === "terminate-idle" ? "Running..." : "Terminate idle connections"}
              </button>
              <button
                disabled={!!maintenanceRunning}
                onClick={() => runMaintenance("refresh-env-all", "Refresh all env files")}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded transition-colors cursor-pointer"
              >
                {maintenanceRunning === "refresh-env-all" ? "Running..." : "Refresh all env files"}
              </button>
              <button
                disabled={!!maintenanceRunning}
                onClick={() => runMaintenance("refresh-and-restart", "Refresh env + restart all clients", true)}
                className="px-3 py-1.5 text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-40 rounded transition-colors cursor-pointer"
              >
                {maintenanceRunning === "refresh-and-restart" ? "Running..." : "Refresh env + restart all clients"}
              </button>
              <button
                disabled={!!maintenanceRunning}
                onClick={() => runMaintenance("restart-postgres", "Restart postgres", true)}
                className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 rounded transition-colors cursor-pointer"
              >
                {maintenanceRunning === "restart-postgres" ? "Restarting..." : "Restart postgres"}
              </button>
            </div>

            {maintenanceOutput && (
              <pre className="mt-3 p-3 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 whitespace-pre-wrap overflow-x-auto max-h-64">
                {maintenanceOutput}
              </pre>
            )}
          </div>
        </>
        )}
      </div>

      {/* Client Stats */}
      {clientStats && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">License &amp; Client Stats</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Total Clients</p>
              <p className="text-xl font-semibold">{clientStats.total}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Hosted / Self-Hosted</p>
              <p className="text-xl font-semibold">
                {clientStats.hosted} / {clientStats.selfHosted}
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Active / Revoked</p>
              <p className="text-xl font-semibold">
                <span className="text-emerald-400">{clientStats.activeLicenses}</span>
                {" / "}
                <span className="text-red-400">{clientStats.revokedLicenses}</span>
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">By Plan</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(clientStats.byPlan).length > 0 ? (
                  Object.entries(clientStats.byPlan).map(([plan, count]) => (
                    <span
                      key={plan}
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${planBadgeClass(plan)}`}
                    >
                      {plan}: {count}
                    </span>
                  ))
                ) : (
                  <span className="text-zinc-500 text-sm">None</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clients */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <a
          href="/create"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
        >
          Create Client
        </a>
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading...</p>
      ) : clients.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg">No clients yet</p>
          <p className="text-sm mt-1">Create your first client to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400 text-left">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Last Active</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr
                  key={c.slug}
                  className="border-b border-zinc-800/50 hover:bg-zinc-900/30"
                >
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium text-zinc-200">{c.name}</span>
                      <span className="text-zinc-500 font-mono text-xs ml-2">{c.slug}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        c.type === CLIENT_TYPE.SELF_HOSTED
                          ? "bg-purple-500/10 text-purple-400"
                          : "bg-blue-500/10 text-blue-400"
                      }`}
                    >
                      {c.type === CLIENT_TYPE.SELF_HOSTED ? "Self-Hosted" : "Hosted"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.type === CLIENT_TYPE.SELF_HOSTED ? (
                      c.license ? (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            c.license.active
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              c.license.active ? "bg-emerald-400" : "bg-red-400"
                            }`}
                          />
                          {c.license.active ? "licensed" : "revoked"}
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-xs">no license</span>
                      )
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.status === "running"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            c.status === "running" ? "bg-emerald-400" : "bg-red-400"
                          }`}
                        />
                        {c.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.license ? (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${planBadgeClass(c.license.plan)}`}
                      >
                        {c.license.plan}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {c.lastActiveAt ? timeAgo(c.lastActiveAt) : "-"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => router.push(`/${c.slug}`)}
                      className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors cursor-pointer"
                    >
                      View
                    </button>
                    {c.type === CLIENT_TYPE.HOSTED && (
                      <button
                        onClick={() => handleRestart(c.slug)}
                        className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors cursor-pointer"
                      >
                        Restart
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(c.slug)}
                      className="px-2 py-1 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Deleted Clients */}
      {deletedClients.length > 0 && (
        <div className="mt-10">
          <button
            onClick={() => setShowDeleted((v) => !v)}
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
          >
            <span
              className={`transition-transform ${showDeleted ? "rotate-90" : ""}`}
            >
              ▶
            </span>
            Deleted clients ({deletedClients.length})
          </button>

          {showDeleted && (
            <div className="overflow-x-auto rounded-lg border border-zinc-800/50 opacity-60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/30 text-zinc-500 text-left">
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Deleted</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedClients.map((c) => (
                    <tr
                      key={`${c.slug}-${c.deletedAt}`}
                      className="border-b border-zinc-800/30"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-zinc-500 line-through">{c.name}</span>
                          <span className="text-zinc-600 font-mono text-xs ml-2">{c.slug}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-500">
                          {c.type === CLIENT_TYPE.SELF_HOSTED ? "Self-Hosted" : "Hosted"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-zinc-500">
                        {new Date(c.deletedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
