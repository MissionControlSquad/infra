"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CreatePage() {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/versions")
      .then((r) => r.json())
      .then((d) => {
        const v = d.versions || [];
        setVersions(v);
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
      body: JSON.stringify({ slug: cleanSlug, name: name || cleanSlug, version: version || undefined }),
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
            Used for subdomain: {slug || "slug"}.app.agentcenter.cloud
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

        {versions.length > 0 && (
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Version</label>
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            >
              {versions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
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
