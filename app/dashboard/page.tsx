// Phase 2 — /dashboard: own + group projects, stats, storage
// bar (authenticated only, Phase 1 session pattern: a 401 from
// /api/profile sends the visitor to /login; a 503
// configured:false shows a banner instead of a redirect, since
// it means "no live project yet", not "signed out").
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBytes } from "@/lib/video";

type Project = {
  id: string;
  title: string;
  slug: string;
  status: string;
  video_status: string;
  video_size_bytes: number | null;
  vote_count: number;
  view_count: number;
  updated_at: string;
};

type Usage = {
  usedBytes: number;
  totalBytes: number;
  percent: number;
  warn: boolean;
  block: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageError, setUsageError] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/profile");
      const data = (await res.json()) as { configured?: boolean };
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (data.configured === false) {
        setNotConfigured(true);
        setChecking(false);
        return;
      }
      if (!res.ok) {
        router.push("/login");
        return;
      }
      const p = await fetch("/api/projects");
      const pData = (await p.json()) as { projects?: Project[]; error?: string };
      if (p.ok && pData.projects) setProjects(pData.projects);
      else setError(pData.error ?? "Could not load projects.");
      const u = await fetch("/api/storage-usage");
      const uData = (await u.json()) as Usage & { error?: string };
      if (u.ok) setUsage(uData);
      else setUsageError(uData.error ?? "Storage usage unavailable.");
      setChecking(false);
    })();
  }, [router]);

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      setProjects(projects.filter((p) => p.id !== id));
    } else {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Could not delete the project.");
    }
    setDeleting(null);
  }

  if (checking) {
    return (
      <main className="page">
        <section className="card">
          <p className="skeleton">Loading your dashboard…</p>
          <p className="skeleton skeleton-line" aria-hidden="true" />
          <p className="skeleton skeleton-line" aria-hidden="true" />
        </section>
      </main>
    );
  }

  const drafts = projects.filter((p) => p.status === "draft").length;
  const published = projects.filter((p) => p.status === "published").length;
  const totalSize = projects.reduce((s, p) => s + (p.video_size_bytes ?? 0), 0);

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">AICT &middot; Phase 2</p>
        <h1>Your dashboard</h1>
        {notConfigured && (
          <p className="notice">
            Supabase is not configured yet, so no live projects can be
            shown. This page will fill in once the live project exists
            and you have signed in.
          </p>
        )}
        {error && <p className="notice error">{error}</p>}
        <div className="decision-grid">
          <div className="decision-card">
            <h3>{projects.length}</h3>
            <p>My projects</p>
          </div>
          <div className="decision-card">
            <h3>{drafts}</h3>
            <p>Drafts</p>
          </div>
          <div className="decision-card">
            <h3>{published}</h3>
            <p>Published</p>
          </div>
          <div className="decision-card">
            <h3>{formatBytes(totalSize)}</h3>
            <p>My video size</p>
          </div>
        </div>

        <h2>Storage (catalog total, 1 GB free tier)</h2>
        {usage ? (
          <div>
            <div
              className="storage-bar"
              role="progressbar"
              aria-valuenow={Math.round(usage.percent)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={
                  "storage-bar-fill" +
                  (usage.block ? " storage-bar-full" : usage.warn ? " storage-bar-warn" : "")
                }
                style={{ width: `${Math.min(100, usage.percent)}%` }}
              />
            </div>
            <p>
              {formatBytes(usage.usedBytes)} of {formatBytes(usage.totalBytes)} used
              ({usage.percent}%).
              {usage.block && (
                <strong> Catalog is full — new publishes are blocked until an admin archives or deletes videos.</strong>
              )}
              {!usage.block && usage.warn && (
                <strong> Over 80% full — keep new videos small.</strong>
              )}
            </p>
          </div>
        ) : (
          <p>{usageError || "Storage usage unavailable."}</p>
        )}

        <h2>Projects</h2>
        {projects.length === 0 ? (
          <div className="empty-state">
            <h3>No projects yet</h3>
            <p>
              Your first project starts in the upload wizard — details,
              an H.264 MP4, characters, then review.
            </p>
            <Link href="/upload" className="btn-primary">
              Upload your first video
            </Link>
          </div>
        ) : (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id} className="project-row">
                <div>
                  <strong>{p.title}</strong>{" "}
                  <span className={`badge badge-${p.status}`}>{p.status}</span>{" "}
                  <span className={`badge badge-video-${p.video_status}`}>video: {p.video_status}</span>
                  <p className="hero-note">
                    {p.vote_count} votes · {p.view_count} views
                    {p.video_size_bytes !== null && ` · ${formatBytes(p.video_size_bytes)}`}
                  </p>
                </div>
                <p className="link-row">
                  <Link href={`/upload?id=${p.id}`}>Edit</Link>
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={deleting === p.id}
                    onClick={() => void remove(p.id, p.title)}
                  >
                    {deleting === p.id ? "Deleting…" : "Delete"}
                  </button>
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="link-row">
          <Link href="/upload" className="btn-primary">New project</Link>
          <Link href="/profile">Profile</Link>
        </p>
      </section>
    </main>
  );
}
