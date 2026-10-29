// Phase 2 — /upload: multi-step project wizard (authenticated
// only). Steps: Details → Video → Characters → Review.
// Session handling reuses Phase 1: a 401 from /api/profile sends
// the visitor to /login. Under placeholder env /api/profile
// returns 503 configured:false, which is NOT a signed-out user,
// so the wizard stays usable as a step preview and says plainly
// that creating a project will fail until Supabase is live — it
// never pretends a save succeeded.
// Video: NO playback here (playback is Phase 3). Duration is
// read from the file's metadata via an off-screen element only
// to enforce the ≤ 2 minute cap, and the file itself is never
// played in the wizard. The real upload runs only after the
// draft exists: POST /api/projects → POST upload-url → PUT the
// file to the signed URL → POST complete-upload.
// Edit mode: /upload?id=<project id> prefills from
// GET /api/projects/[id] and saves via PATCH.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  validatePickedVideo,
  validateVideoMagicBytes,
  validateVideoDuration,
  isWithinRecommendedSize,
  formatBytes,
  MAX_VIDEO_BYTES,
} from "@/lib/video";

const STEPS = ["Details", "Video", "Characters", "Review"] as const;

type CharacterDraft = {
  name: string;
  role: string;
  description: string;
  image_path: string;
};

type Group = { id: string; name: string };

function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.onloadedmetadata = () =>
      done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}

async function readHeader(file: File): Promise<Uint8Array> {
  const slice = file.slice(0, 24);
  return new Uint8Array(await slice.arrayBuffer());
}

function Wizard() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<string>("none");

  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [concept, setConcept] = useState("");
  const [story, setStory] = useState("");
  const [genre, setGenre] = useState("");
  const [tools, setTools] = useState("");
  const [groupChoice, setGroupChoice] = useState<"none" | "existing" | "new">("none");
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [characters, setCharacters] = useState<CharacterDraft[]>([]);
  const [rulesAccepted, setRulesAccepted] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [fileWarning, setFileWarning] = useState("");
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/profile");
      const data = (await res.json()) as { configured?: boolean; profile?: unknown };
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (data.configured === false) setNotConfigured(true);
      if (res.ok || data.configured === false) {
        const g = await fetch("/api/groups");
        const gData = (await g.json()) as { groups?: Group[] };
        if (g.ok && gData.groups) setGroups(gData.groups);
        if (editId) {
          const p = await fetch(`/api/projects/${editId}`);
          const pData = (await p.json()) as {
            project?: {
              title: string; tagline: string | null; description: string | null;
              concept: string | null; story: string | null; genre: string | null;
              tools_used: string[]; group_id: string | null; video_status: string;
            };
            characters?: CharacterDraft[];
          };
          if (p.ok && pData.project) {
            const pr = pData.project;
            setTitle(pr.title);
            setTagline(pr.tagline ?? "");
            setDescription(pr.description ?? "");
            setConcept(pr.concept ?? "");
            setStory(pr.story ?? "");
            setGenre(pr.genre ?? "");
            setTools((pr.tools_used ?? []).join(", "));
            if (pr.group_id) {
              setGroupChoice("existing");
              setGroupId(pr.group_id);
            }
            setVideoStatus(pr.video_status);
            setCharacters(
              (pData.characters ?? []).map((c) => ({
                name: c.name,
                role: c.role ?? "",
                description: c.description ?? "",
                image_path: c.image_path ?? "",
              })),
            );
          }
        }
      } else {
        router.push("/login");
        return;
      }
      setChecking(false);
    })();
  }, [router, editId]);

  const checkFile = useCallback(async (picked: File) => {
    setFile(null);
    setFileError("");
    setFileWarning("");
    setFileDuration(null);
    const basic = validatePickedVideo({
      mime: picked.type,
      fileName: picked.name,
      sizeBytes: picked.size,
    });
    if (!basic.ok) {
      setFileError(basic.error);
      return;
    }
    const header = await readHeader(picked);
    const magic = validateVideoMagicBytes(header);
    if (!magic.ok) {
      setFileError(magic.error);
      return;
    }
    const duration = await readDuration(picked);
    const durationCheck = validateVideoDuration(duration);
    if (!durationCheck.ok) {
      setFileError(durationCheck.error);
      return;
    }
    setFileDuration(duration);
    setFile(picked);
    const warnings: string[] = [];
    if (!isWithinRecommendedSize(picked.size)) {
      warnings.push(
        `This file is ${formatBytes(picked.size)} — aim for ≤ 20 MB so the 1 GB catalog lasts longer.`,
      );
    }
    if (warnings.length > 0) setFileWarning(warnings.join(" "));
  }, []);

  async function uploadVideo(projectId: string, picked: File): Promise<string> {
    const urlRes = await fetch(`/api/projects/${projectId}/upload-url`, {
      method: "POST",
    });
    const urlData = (await urlRes.json()) as {
      signedUrl?: string;
      error?: string;
      configured?: boolean;
    };
    if (!urlRes.ok || !urlData.signedUrl) {
      throw new Error(urlData.error ?? "Could not start the video upload.");
    }
    const putRes = await fetch(urlData.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
      body: picked,
    });
    if (!putRes.ok) {
      throw new Error("The video upload itself failed. Try again.");
    }
    const header = await readHeader(picked);
    let headerBase64 = "";
    // btoa over a 24-byte header is safe (no large-string limits).
    header.forEach((b) => {
      headerBase64 += String.fromCharCode(b);
    });
    const completeRes = await fetch(`/api/projects/${projectId}/complete-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        size_bytes: picked.size,
        mime: picked.type,
        header_base64: btoa(headerBase64),
        duration_seconds: fileDuration,
      }),
    });
    const completeData = (await completeRes.json()) as {
      ok?: boolean;
      error?: string;
      video_status?: string;
    };
    if (!completeRes.ok || !completeData.ok) {
      throw new Error(completeData.error ?? "Video validation failed.");
    }
    return completeData.video_status ?? "ready";
  }

  async function saveDraft() {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        tagline,
        description,
        concept,
        story,
        genre,
        tools_used: tools.split(",").map((t) => t.trim()).filter(Boolean),
        group_id: groupChoice === "existing" ? groupId || null : null,
        group_name: groupChoice === "new" ? groupName.trim() : "",
        characters: characters.filter((c) => c.name.trim() !== ""),
      };
      const res = await fetch(
        editId ? `/api/projects/${editId}` : "/api/projects",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as {
        project?: { id: string; video_status?: string };
        error?: string;
      };
      if (!res.ok || !data.project) {
        throw new Error(data.error ?? "Could not save the project.");
      }
      const projectId = data.project.id;
      setSavedId(projectId);
      let status = data.project.video_status ?? videoStatus;
      if (file) {
        setNotice("Draft saved. Uploading and validating your video…");
        status = await uploadVideo(projectId, file);
        setVideoStatus(status);
      }
      setNotice(
        status === "ready"
          ? "Saved — video is ready, so this project can now be published."
          : "Draft saved. Add a video (MP4, H.264, ≤ 50 MB) before publishing.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the project.");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!savedId && !editId) {
      setError("Save as draft first, then publish.");
      return;
    }
    const projectId = savedId ?? editId;
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "published",
          rules_accepted_at: new Date().toISOString(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not publish.");
      setNotice("Published. It will appear in the gallery once Phase 3 ships.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <main className="page">
        <section className="card">
          <p className="skeleton">Loading the upload wizard…</p>
          <p className="skeleton skeleton-line" aria-hidden="true" />
          <p className="skeleton skeleton-line" aria-hidden="true" />
        </section>
      </main>
    );
  }

  const canPublish =
    rulesAccepted && (videoStatus === "ready" || !!file);

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">AICT &middot; Phase 2</p>
        <h1>{editId ? "Edit project" : "Upload a video"}</h1>
        <p className="lede">
          Four steps: details, video, characters, review. Your video
          must already be an H.264 MP4, ≤ 50 MB, ≤ 2 minutes — there
          is no transcoding on the free plan, so MOV, HEVC and WebM
          files are rejected with “Export as H.264 MP4 and try again.”
        </p>
        {notConfigured && (
          <p className="notice">
            Supabase is not configured yet, so saving will fail with
            “not configured” until the live project exists. You can
            still walk through the steps below to preview the wizard.
          </p>
        )}
        <ol className="stepper" aria-label="Upload steps">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={
                "stepper-step" +
                (i === step ? " stepper-current" : "") +
                (i < step ? " stepper-done" : "")
              }
            >
              <button type="button" onClick={() => setStep(i)}>
                {i + 1}. {label}
              </button>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="form">
            <label>
              Title *
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label>
              Tagline (one-line hook)
              <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} />
            </label>
            <label>
              Description
              <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label>
              Concept
              <textarea className="input" rows={3} value={concept} onChange={(e) => setConcept(e.target.value)} />
            </label>
            <label>
              Story (markdown)
              <textarea className="input" rows={5} value={story} onChange={(e) => setStory(e.target.value)} />
            </label>
            <label>
              Genre
              <input className="input" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="e.g. Sci-fi, Comedy" />
            </label>
            <label>
              Tools used (comma-separated)
              <input className="input" value={tools} onChange={(e) => setTools(e.target.value)} placeholder="e.g. Sora, Runway, ElevenLabs" />
            </label>
            <fieldset>
              <legend>Group</legend>
              <label>
                <input type="radio" checked={groupChoice === "none"} onChange={() => setGroupChoice("none")} /> Solo project
              </label>{" "}
              <label>
                <input type="radio" checked={groupChoice === "existing"} onChange={() => setGroupChoice("existing")} /> Existing group
              </label>{" "}
              <label>
                <input type="radio" checked={groupChoice === "new"} onChange={() => setGroupChoice("new")} /> Create a new group
              </label>
              {groupChoice === "existing" && (
                <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">Choose a group…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
              {groupChoice === "new" && (
                <input className="input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="New group name" />
              )}
            </fieldset>
          </div>
        )}

        {step === 1 && (
          <div className="form">
            <p>
              Pick an MP4 file (H.264, ≤ 50 MB, ≤ 2 minutes, aim ≤ 20 MB
              and 720p). The file is checked in your browser first —
              type, size, MP4 header and duration — and checked again
              on the server after upload.
            </p>
            {videoStatus !== "none" && (
              <p className="notice">
                Current video status: <strong>{videoStatus}</strong>.
                Picking a new file replaces it once the new upload validates.
              </p>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="video/mp4,.mp4"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void checkFile(picked);
              }}
            />
            {file && (
              <p className="notice success">
                {file.name} — {formatBytes(file.size)}
                {fileDuration !== null && ` — ${Math.round(fileDuration)} seconds`}
              </p>
            )}
            {fileWarning && <p className="notice">{fileWarning}</p>}
            {fileError && <p className="notice error">{fileError}</p>}
            <p className="hero-note">
              Max file size is {formatBytes(MAX_VIDEO_BYTES)}. No video
              playback happens in this wizard; playback arrives in Phase 3.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="form">
            <p>
              Character cards (optional). Images are a path field only
              in Phase 2 — character image upload is not built yet.
            </p>
            {characters.map((c, i) => (
              <div key={i} className="card">
                <label>
                  Name *
                  <input
                    className="input"
                    value={c.name}
                    onChange={(e) => {
                      const next = [...characters];
                      next[i] = { ...next[i], name: e.target.value };
                      setCharacters(next);
                    }}
                  />
                </label>
                <label>
                  Role
                  <input
                    className="input"
                    value={c.role}
                    onChange={(e) => {
                      const next = [...characters];
                      next[i] = { ...next[i], role: e.target.value };
                      setCharacters(next);
                    }}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    className="input"
                    rows={2}
                    value={c.description}
                    onChange={(e) => {
                      const next = [...characters];
                      next[i] = { ...next[i], description: e.target.value };
                      setCharacters(next);
                    }}
                  />
                </label>
                <label>
                  Image path (optional, no upload in Phase 2)
                  <input
                    className="input"
                    value={c.image_path}
                    onChange={(e) => {
                      const next = [...characters];
                      next[i] = { ...next[i], image_path: e.target.value };
                      setCharacters(next);
                    }}
                  />
                </label>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setCharacters(characters.filter((_, j) => j !== i))}
                >
                  Remove character
                </button>
              </div>
            ))}
            <button
              className="btn-secondary"
              type="button"
              onClick={() =>
                setCharacters([...characters, { name: "", role: "", description: "", image_path: "" }])
              }
            >
              Add character
            </button>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2>Review</h2>
            <div className="card">
              <h3>{title || "(Untitled project)"}</h3>
              {tagline && <p><em>{tagline}</em></p>}
              {genre && <p><span className="pill">{genre}</span></p>}
              {description && <p>{description}</p>}
              {concept && <p><strong>Concept:</strong> {concept}</p>}
              {story && <p><strong>Story:</strong> {story}</p>}
              {tools && <p><strong>Tools:</strong> {tools}</p>}
              <p>
                <strong>Group:</strong>{" "}
                {groupChoice === "new" ? `New group: ${groupName || "(unnamed)"}` : groupChoice === "existing" ? groups.find((g) => g.id === groupId)?.name ?? groupId : "Solo"}
              </p>
              <p>
                <strong>Video:</strong>{" "}
                {file ? `${file.name} — ${formatBytes(file.size)}` : `No new file picked (current status: ${videoStatus})`}
              </p>
              {characters.length > 0 && (
                <ul>
                  {characters.filter((c) => c.name.trim()).map((c, i) => (
                    <li key={i}>
                      <strong>{c.name}</strong>
                      {c.role ? ` — ${c.role}` : ""}
                      {c.description ? `: ${c.description}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className="checkbox-row">
              <span>
                <input
                  type="checkbox"
                  checked={rulesAccepted}
                  onChange={(e) => setRulesAccepted(e.target.checked)}
                />{" "}
                I confirm this team made or is allowed to use all content,
                the AI tools are disclosed above, and class guidelines were followed.
              </span>
            </label>
            {!canPublish && (
              <p className="notice">
                Publishing needs the rules checkbox plus a ready video.
                {!file && videoStatus !== "ready" && " Upload an MP4 first, or save as draft and add the video later."}
              </p>
            )}
            {notice && <p className="notice success">{notice}</p>}
            {error && <p className="notice error">{error}</p>}
            <p className="link-row">
              <button className="btn-primary" type="button" onClick={() => void saveDraft()} disabled={saving || !title.trim()}>
                {saving ? "Saving…" : "Save as draft"}
              </button>
              <button className="btn-secondary" type="button" onClick={() => void publish()} disabled={saving || !canPublish || (!savedId && !editId)}>
                Publish
              </button>
            </p>
            <p className="hero-note">
              Publish is only enabled after a draft save (so the project
              exists) and a ready video — the server blocks publishing
              without a ready video even if this button is bypassed.
            </p>
          </div>
        )}

        {step < 3 && (
          <p className="link-row">
            {step > 0 && (
              <button className="btn-secondary" type="button" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button
              className="btn-primary"
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={step === 0 && !title.trim()}
            >
              Continue
            </button>
          </p>
        )}
        {step === 3 && (
          <p className="link-row">
            <button className="btn-secondary" type="button" onClick={() => setStep(2)}>
              Back to characters
            </button>
          </p>
        )}
      </section>
    </main>
  );
}

export default function UploadPage() {
  // useSearchParams requires a Suspense boundary in Next.js 14.
  return (
    <Suspense>
      <Wizard />
    </Suspense>
  );
}
