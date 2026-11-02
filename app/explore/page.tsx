// Phase 3 — /explore: the published-video gallery.
//
// Client component: it fetches GET /api/projects?gallery=true
// (published rows only, server-enforced) and renders search,
// genre/tool/group filters, sort, and cursor "Load more"
// pagination. No video, title, count, or project is ever
// invented here: with no published rows the page says plainly
// that nothing is published yet. Vote counts are read-only
// (voting is Phase 4); there is no vote button and no comments
// section anywhere on this page.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDuration } from "@/lib/gallery";

type GalleryProject = {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  genre: string | null;
  tools_used: string[];
  duration_seconds: number | null;
  vote_count: number;
  view_count: number;
  created_at: string;
  group_id: string | null;
  group_name: string | null;
  creator_name: string | null;
  thumbnail_url: string | null;
};

type Facets = {
  genres: string[];
  tools: string[];
  groups: { id: string; name: string }[];
};

type SortKey = "newest" | "most_voted" | "trending" | "most_viewed";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "most_voted", label: "Most voted" },
  { value: "trending", label: "Trending" },
  { value: "most_viewed", label: "Most viewed" },
];

function SkeletonGrid() {
  return (
    <div className="gallery-grid" aria-label="Loading gallery">
      {Array.from({ length: 6 }).map((_, i) => (
        <article key={i} className="gallery-card skeleton" aria-hidden="true">
          <div className="gallery-thumb">
            <span>Loading…</span>
          </div>
          <p className="skeleton-line" />
          <p className="skeleton-line" />
        </article>
      ))}
    </div>
  );
}

export default function ExplorePage() {
  const [projects, setProjects] = useState<GalleryProject[]>([]);
  const [featured, setFeatured] = useState<GalleryProject | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [tool, setTool] = useState("");
  const [group, setGroup] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const load = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      const params = new URLSearchParams({
        gallery: "true",
        sort,
        limit: "12",
      });
      if (debouncedQuery) params.set("query", debouncedQuery);
      if (genre) params.set("genre", genre);
      if (tool) params.set("tool", tool);
      if (group) params.set("group", group);
      if (cursor) params.set("cursor", cursor);
      try {
        const res = await fetch(`/api/projects?${params.toString()}`);
        const data = (await res.json()) as {
          configured?: boolean;
          error?: string;
          projects?: GalleryProject[];
          nextCursor?: string | null;
          facets?: Facets | null;
          featured?: GalleryProject | null;
        };
        if (res.status === 401) {
          setNeedsSignIn(true);
          setLoading(false);
          setLoadingMore(false);
          return;
        }
        if (data.configured === false) {
          setNotConfigured(true);
          setLoading(false);
          setLoadingMore(false);
          return;
        }
        if (!res.ok || !data.projects) {
          setError(data.error ?? "Could not load the gallery.");
        } else {
          setProjects((prev) => (append ? [...prev, ...data.projects!] : data.projects!));
          setNextCursor(data.nextCursor ?? null);
          if (!append) {
            if (data.facets) setFacets(data.facets);
            setFeatured(data.featured ?? null);
          }
        }
      } catch {
        setError("Could not load the gallery. Check your connection and try again.");
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [debouncedQuery, genre, tool, group, sort],
  );

  useEffect(() => {
    setProjects([]);
    setNextCursor(null);
    setFeatured(null);
    void load(null, false);
  }, [load]);

  const filtersActive = Boolean(debouncedQuery || genre || tool || group);

  return (
    <main className="page">
      <section className="fade-up">
        <p className="eyebrow">AICT &middot; Phase 3</p>
        <h1>Explore videos</h1>
        <p className="lede">
          Published student videos, voted by the class. Voting itself
          arrives in Phase 4 — counts here are read-only.
        </p>
      </section>

      {needsSignIn && (
        <section className="card">
          <h2>Sign in to browse</h2>
          <p>
            Public browsing is off, so the gallery is for signed-in
            university members only. Sign in with your address ending
            in <code>.duet.edu.pk</code>.
          </p>
          <Link href="/login" className="btn-primary">
            Sign in
          </Link>
        </section>
      )}

      {notConfigured && (
        <p className="notice">
          Supabase is not configured yet, so no live gallery can be
          shown. This page will fill in once the live project is
          connected.
        </p>
      )}

      {!needsSignIn && !notConfigured && (
        <>
          <section className="card" aria-label="Search and filters">
            <form
              className="form"
              onSubmit={(e) => e.preventDefault()}
            >
              <label>
                Search
                <input
                  className="input"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Title, creator, or character name"
                  aria-label="Search by title, creator, or character name"
                />
              </label>
              <div className="filter-row">
                <label>
                  Genre
                  <select
                    className="input"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    aria-label="Filter by genre"
                  >
                    <option value="">All genres</option>
                    {(facets?.genres ?? []).map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tool used
                  <select
                    className="input"
                    value={tool}
                    onChange={(e) => setTool(e.target.value)}
                    aria-label="Filter by tool used"
                  >
                    <option value="">All tools</option>
                    {(facets?.tools ?? []).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Group
                  <select
                    className="input"
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    aria-label="Filter by group"
                  >
                    <option value="">All groups</option>
                    {(facets?.groups ?? []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sort
                  <select
                    className="input"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    aria-label="Sort gallery"
                  >
                    {SORTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {filtersActive && (
                <p className="link-row">
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setGenre("");
                      setTool("");
                      setGroup("");
                    }}
                  >
                    Clear filters
                  </button>
                </p>
              )}
            </form>
          </section>

          {featured && (
            <section className="card" aria-label="Current leader">
              <p className="eyebrow">Current leader</p>
              <h2>
                <Link href={`/watch/${featured.slug}`}>{featured.title}</Link>
              </h2>
              <p>
                {featured.creator_name ?? "A student creator"}
                {featured.group_name ? ` · ${featured.group_name}` : ""} ·{" "}
                {featured.vote_count} votes
              </p>
            </section>
          )}

          {loading && <SkeletonGrid />}
          {error && <p className="notice error">{error}</p>}

          {!loading && !error && projects.length === 0 && (
            <div className="empty-state">
              <h3>
                {filtersActive
                  ? "No published videos match those filters"
                  : "Nothing is published yet"}
              </h3>
              <p>
                {filtersActive
                  ? "Try a different search or clear the filters."
                  : "Published student videos will appear here. Nothing on this page is a placeholder video."}
              </p>
              {filtersActive ? (
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setGenre("");
                    setTool("");
                    setGroup("");
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Link href="/upload" className="btn-primary">
                  Upload a video
                </Link>
              )}
            </div>
          )}

          {projects.length > 0 && (
            <section className="gallery-grid" aria-label="Published videos">
              {projects.map((p) => {
                const duration = formatDuration(p.duration_seconds);
                return (
                  <article key={p.id} className="gallery-card fade-up">
                    <Link
                      href={`/watch/${p.slug}`}
                      className="gallery-card-link"
                      aria-label={`Watch ${p.title}`}
                    >
                      <div className="gallery-thumb">
                        {p.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumbnail_url} alt="" />
                        ) : (
                          <span aria-hidden="true">
                            {p.title.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        {duration && (
                          <span className="duration-badge">{duration}</span>
                        )}
                      </div>
                      <h3>{p.title}</h3>
                    </Link>
                    <p className="hero-note">
                      {p.creator_name ?? "A student creator"}
                      {p.group_name ? ` · ${p.group_name}` : ""}
                    </p>
                    <p>
                      {p.genre && <span className="pill">{p.genre}</span>}{" "}
                      <span className="hero-note">
                        {p.vote_count} votes · {p.view_count} views
                      </span>
                    </p>
                    {p.tagline && <p>{p.tagline}</p>}
                  </article>
                );
              })}
            </section>
          )}

          {nextCursor && (
            <p className="link-row">
              <button
                className="btn-secondary"
                type="button"
                disabled={loadingMore}
                onClick={() => void load(nextCursor, true)}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </p>
          )}
          {loadingMore && <SkeletonGrid />}
        </>
      )}
    </main>
  );
}
