"use client";

import { useEffect, useState } from "react";

interface VersionDetail {
  createdAt: string;
  message?: string;
}

interface VersionData {
  versions: string[];
  versionDetails: Record<string, VersionDetail>;
  clientsByVersion: Record<string, string[]>;
}

export default function VersionsPage() {
  const [data, setData] = useState<VersionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/versions")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-zinc-500">Loading...</p>;
  if (!data) return <p className="text-red-400">Failed to load versions</p>;

  const allVersions = new Set([
    ...data.versions,
    ...Object.keys(data.clientsByVersion),
  ]);
  const sorted = Array.from(allVersions).sort((a, b) => {
    if (a === "latest") return -1;
    if (b === "latest") return 1;
    return b.localeCompare(a, undefined, { numeric: true });
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Versions</h1>

      {sorted.length === 0 ? (
        <p className="text-zinc-500">
          No versions found. Create a GitHub Release to publish your first
          version.
        </p>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">
                  Version
                </th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">
                  Message
                </th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">
                  Source
                </th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">
                  Clients
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((version) => {
                const clients = data.clientsByVersion[version] || [];
                const isFromRegistry = data.versions.includes(version);
                const detail = data.versionDetails?.[version];
                return (
                  <tr
                    key={version}
                    className="border-b border-zinc-800/50 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono">{version}</div>
                      {detail?.createdAt && (
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {new Date(detail.createdAt).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {detail?.message ? (
                        <span className="text-xs text-zinc-300 line-clamp-2">
                          {detail.message}
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isFromRegistry ? (
                        <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded">
                          ghcr.io
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-zinc-700/50 text-zinc-400 rounded">
                          local
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {clients.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {clients.map((slug) => (
                            <a
                              key={slug}
                              href={`/${slug}`}
                              className="text-xs px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                            >
                              {slug}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-zinc-600">No clients</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
