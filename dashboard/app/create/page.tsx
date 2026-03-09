"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CreatePage() {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"hosted" | "self-hosted">("hosted");
  const [version, setVersion] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [versionDetails, setVersionDetails] = useState<Record<string, { createdAt: string; message?: string }>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/versions")
      .then((r) => r.json())
      .then((d) => {
        const v = d.versions || [];
        setVersions(v);
        setVersionDetails(d.versionDetails || {});
        if (v.length > 0) setVersion(v[0]);
      })
      .catch(() => {});
  }, []);

  function slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cleanSlug = slugify(slug);
    if (!cleanSlug || !/^[a-z][a-z0-9-]*$/.test(cleanSlug)) {
      setError("Slug must start with a letter and contain only lowercase letters, numbers, and hyphens.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: cleanSlug,
        name: name || cleanSlug,
        type,
        version: type === "hosted" ? (version || undefined) : undefined,
      }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      const data = await res.json();
      setError(data.error || "Failed to create client");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Create Client</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            placeholder="my-client"
            required
            autoFocus
            className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
          />
          <p className="text-xs text-zinc-500 mt-1">
            {type === "hosted"
              ? `Used for subdomain: ${slug || "slug"}.app.agentcenter.cloud`
              : "Unique identifier for this self-hosted client"}
          </p>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Display Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Client"
            className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">Client Type</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setType("hosted")}
              className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                type === "hosted"
                  ? "bg-blue-600/10 border-blue-500 text-blue-400"
                  : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              <div className="font-medium">Hosted</div>
              <p className="text-xs mt-0.5 opacity-70">We manage the container</p>
            </button>
            <button
              type="button"
              onClick={() => setType("self-hosted")}
              className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                type === "self-hosted"
                  ? "bg-purple-600/10 border-purple-500 text-purple-400"
                  : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              <div className="font-medium">Self-Hosted</div>
              <p className="text-xs mt-0.5 opacity-70">Client runs their own instance</p>
            </button>
          </div>
        </div>

        {type === "hosted" && versions.length > 0 && (
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Version</label>
            <div className="max-h-48 overflow-y-auto border border-zinc-700 rounded-lg divide-y divide-zinc-800">
              {versions.map((v) => {
                const detail = versionDetails[v];
                const isSelected = v === version;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVersion(v)}
                    className={`w-full text-left px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-blue-600/20 border-l-2 border-l-blue-500"
                        : "bg-zinc-900 hover:bg-zinc-800 border-l-2 border-l-transparent"
                    }`}
                  >
                    <span className="font-mono text-xs">{v}</span>
                    {detail?.message && (
                      <p className="text-xs text-zinc-400 mt-0.5 truncate">{detail.message}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg font-medium transition-colors cursor-pointer"
          >
            {loading ? "Creating..." : "Create Client"}
          </button>
          <a
            href="/"
            className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-medium transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
