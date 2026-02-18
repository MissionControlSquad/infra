"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Client {
  slug: string;
  name: string;
  status: "running" | "stopped" | "not found";
  url: string;
  createdAt: string;
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
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => {
        if (!r.ok) return [];
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setClients(data);
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
      setClients((prev) => prev.filter((c) => c.slug !== slug));
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
          </>
        )}
      </div>

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
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">URL</th>
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
                  <td className="px-4 py-3 font-mono">{c.slug}</td>
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {c.slug}.app...
                    </a>
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
                    <button
                      onClick={() => handleRestart(c.slug)}
                      className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors cursor-pointer"
                    >
                      Restart
                    </button>
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
    </div>
  );
}
