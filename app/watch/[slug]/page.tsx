// Phase 3 — /watch/[slug]: published-video detail + playback.
//
// Server component: access is decided HERE, before any URL is
// minted. Rules: the project must be published and its video
// ready; the visitor must be signed in OR public browsing must
// be on (otherwise redirect to /login, per spec §5.4 — shared
// links open sign-in first when public browsing is off). The
// signed URL is minted server-side with the service-role client
// and only the URL reaches the browser — never the service key,
// never the raw video_path. RLS (can_view_project) remains the
// real gate for signed-in reads; anonymous public reads go via
// the service-role client with an explicit published filter.
//
// Deliberately NOT here (later phases): voting (Phase 4 —
// vote_count is shown read-only only) and comments (Phase 6).
// Story text is rendered as escaped plain text, not markdown
// HTML: there is no HTML sanitizer dependency in this app, and
// rendering stored markdown as HTML without one would be an
// injection hole. Markdown rendering waits on a sanitizer.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderSupabaseEnv } from "@/lib/email";
import { readPublicBrowsing } from "@/lib/settings";
import { PROJECT_SELECT, type ProjectRow } from "@/lib/projects-server";
import { PLAYBACK_URL_TTL_SECONDS } from "@/lib/playback";
import { VIDEO_BUCKET } from "@/lib/video";
import { formatDuration } from "@/lib/gallery";
import { WatchPlayer, ShareButton } from "./watch-client";

export const dynamic = "force-dynamic";

type RelatedRow = {
  id: string;
  slug: string;
  title: string;
  genre: string | null;
  vote_count: number;
  created_at: string;
};

export default async function WatchPage({ params }: { params: { slug: string } }) {
  if (isPlaceholderSupabaseEnv()) {
    return (
      <main className="page">
        <p className="notice">
          Supabase is not configured yet, so this video cannot be
          played. Sign-in and playback need the live project.
        </p>
        <p className="link-row">
          <Link href="/explore">Back to gallery</Link>
        </p>
      </main>
    );
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const publicBrowsing = await readPublicBrowsing(admin);
  if (!user && !publicBrowsing) {
    redirect("/login");
  }
  // Project load: signed-in via the user client (RLS gate);
  // anonymous public via the service-role client, published only.
  let project: ProjectRow | null = null;
  if (user) {
    const { data } = await supabase
      .from("projects")
      .select(PROJECT_SELECT)
      .eq("slug", params.slug)
      .single();
    project = data as ProjectRow | null;
  } else if (admin) {
    const { data } = await admin
      .from("projects")
      .select(PROJECT_SELECT)
      .eq("slug", params.slug)
      .eq("status", "published")
      .single();
    project = data as ProjectRow | null;
  }
  if (!project || project.status !== "published") {
    notFound();
  }
  const reader = user ? supabase : admin;
  const { data: characters } = reader
    ? await reader
        .from("characters")
        .select("id, name, role, description, sort_order")
        .eq("project_id", project.id)
        .order("sort_order", { ascending: true })
    : { data: null };
  const { data: captions } = reader
    ? await reader
        .from("captions")
        .select("id, language, label")
        .eq("project_id", project.id)
        .order("language", { ascending: true })
    : { data: null };
  let groupName: string | null = null;
  if (reader && project.group_id) {
    const { data: g } = await reader
      .from("groups")
      .select("name")
      .eq("id", project.group_id)
      .single();
    groupName = (g as { name?: string } | null)?.name ?? null;
  }
  let creatorName: string | null = null;
  if (reader) {
    const { data: owner } = await reader
      .from("profiles")
      .select("username, full_name")
      .eq("id", project.owner_id)
      .single();
    const o = owner as { username?: string | null; full_name?: string | null } | null;
    creatorName = (o?.full_name ?? "").trim() || o?.username || null;
  }
  let related: RelatedRow[] = [];
  if (reader) {
    let relQuery = reader
      .from("projects")
      .select("id, slug, title, genre, vote_count, created_at")
      .eq("status", "published")
      .neq("id", project.id)
      .order("created_at", { ascending: false })
      .limit(6);
    if (project.genre) relQuery = relQuery.eq("genre", project.genre);
    const { data: rel } = await relQuery;
    related = (rel ?? []) as RelatedRow[];
  }

  const videoReady = project.video_status === "ready" && !!project.video_path;
  let signedUrl: string | null = null;
  if (videoReady && admin && project.video_path) {
    const { data } = await admin.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(project.video_path, PLAYBACK_URL_TTL_SECONDS);
    signedUrl = data?.signedUrl ?? null;
  }
  const duration = formatDuration(project.duration_seconds);

  return (
    <main className="page">
      <p className="link-row">
        <Link href="/explore">← Back to gallery</Link>
      </p>
      <section className="fade-up">
        <p className="eyebrow">
          AICT &middot; Phase 3{project.genre ? ` · ${project.genre}` : ""}
        </p>
        <h1>{project.title}</h1>
        {project.tagline && <p className="lede">{project.tagline}</p>}
        <p className="hero-note">
          {creatorName ?? "A student creator"}
          {groupName ? ` · ${groupName}` : ""}
          {duration ? ` · ${duration}` : ""} · {project.vote_count} votes
          (read-only until Phase 4) · {project.view_count} views
        </p>
        <p className="link-row">
          <ShareButton />
        </p>
      </section>

      <section aria-label="Video player">
        {signedUrl ? (
          <WatchPlayer signedUrl={signedUrl} slug={project.slug} title={project.title} />
        ) : (
          <div className="empty-state">
            <h3>Video unavailable right now</h3>
            <p>
              {videoReady
                ? "Playback could not be set up on the server. Try refreshing the page."
                : "This video is not ready to play yet."}
            </p>
          </div>
        )}
      </section>

      <nav className="watch-sections" aria-label="Video sections">
        <a href="#overview">Overview</a>
        <a href="#story">Story</a>
        <a href="#characters">Characters</a>
        <a href="#behind-the-scenes">Behind the scenes</a>
        <a href="#credits">Credits</a>
      </nav>

      <section id="overview" className="card">
        <h2>Overview</h2>
        {project.description ? (
          <p style={{ whiteSpace: "pre-wrap" }}>{project.description}</p>
        ) : (
          <p className="hero-note">No overview was written for this video.</p>
        )}
        <p>
          {(project.tools_used ?? []).map((t) => (
            <span key={t} className="pill">
              {t}
            </span>
          ))}{" "}
        </p>
      </section>

      <section id="story" className="card">
        <h2>Story</h2>
        {project.story ? (
          <p style={{ whiteSpace: "pre-wrap" }}>{project.story}</p>
        ) : (
          <p className="hero-note">No story was written for this video.</p>
        )}
      </section>

      <section id="characters" className="card">
        <h2>Characters</h2>
        {(characters ?? []).length === 0 ? (
          <p className="hero-note">No characters were listed for this video.</p>
        ) : (
          <ul>
            {(characters ?? []).map(
              (c: { id: string; name: string; role: string | null; description: string | null }) => (
                <li key={c.id}>
                  <strong>{c.name}</strong>
                  {c.role ? ` — ${c.role}` : ""}
                  {c.description ? <p>{c.description}</p> : null}
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section id="behind-the-scenes" className="card">
        <h2>Behind the scenes</h2>
        {project.concept ? (
          <p style={{ whiteSpace: "pre-wrap" }}>{project.concept}</p>
        ) : (
          <p className="hero-note">No concept notes were shared.</p>
        )}
        {project.prompts_notes && (
          <p style={{ whiteSpace: "pre-wrap" }}>{project.prompts_notes}</p>
        )}
        {(captions ?? []).length > 0 && (
          <div>
            <h3>Captions available</h3>
            <ul>
              {(captions ?? []).map((c: { id: string; language: string; label: string }) => (
                <li key={c.id}>
                  {c.label} ({c.language})
                </li>
              ))}
            </ul>
            <p className="hero-note">
              Caption playback is not wired in Phase 3; languages are
              listed here only.
            </p>
          </div>
        )}
      </section>

      <section id="credits" className="card">
        <h2>Credits</h2>
        <dl className="profile-rows">
          <div className="profile-row">
            <dt>Creator</dt>
            <dd>{creatorName ?? "A student creator"}</dd>
          </div>
          {groupName && (
            <div className="profile-row">
              <dt>Group</dt>
              <dd>{groupName}</dd>
            </div>
          )}
          {project.genre && (
            <div className="profile-row">
              <dt>Genre</dt>
              <dd>{project.genre}</dd>
            </div>
          )}
          <div className="profile-row">
            <dt>Tools</dt>
            <dd>{(project.tools_used ?? []).join(", ") || "—"}</dd>
          </div>
          <div className="profile-row">
            <dt>Published</dt>
            <dd>{new Date(project.created_at).toLocaleDateString()}</dd>
          </div>
          <div className="profile-row">
            <dt>Votes</dt>
            <dd>{project.vote_count} (read-only; voting arrives in Phase 4)</dd>
          </div>
        </dl>
      </section>

      {related.length > 0 && (
        <section aria-label="Related videos">
          <h2>Related videos</h2>
          <div className="gallery-grid">
            {related.map((r) => (
              <article key={r.id} className="gallery-card">
                <Link href={`/watch/${r.slug}`} className="gallery-card-link">
                  <div className="gallery-thumb" aria-hidden="true">
                    <span>{r.title.slice(0, 1).toUpperCase()}</span>
                  </div>
                  <h3>{r.title}</h3>
                </Link>
                <p className="hero-note">
                  {r.genre ?? ""} {r.genre ? "· " : ""}
                  {r.vote_count} votes
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
