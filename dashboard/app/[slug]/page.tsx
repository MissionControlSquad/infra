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
  const logsRef = useRef<HTMLPreElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/clients/${slug}`)
      .then((r) => r.json())
      .then(setClient)
      .finally(() => setLoading(false));

    fetch(`/api/clients/${slug}/logs`)
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || ""));
  }, [slug]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

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
    const res = await fetch(`/api/clients/${slug}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
    } else {
      const data = await res.json();
      alert(data.error || "Failed to delete");
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Delete Client</h3>
            <p className="text-zinc-400 text-sm">
              Are you sure you want to delete <strong>{client.slug}</strong>?
              This will remove the container and database permanently.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Delete
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
