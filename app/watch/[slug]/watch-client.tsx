// Phase 3 — watch-page client pieces ONLY.
//
// WatchPlayer wraps the native <video> element (progressive
// MP4 from a server-issued signed URL): native controls already
// give play/pause, scrub, volume, speed, fullscreen and PiP.
// This component adds keyboard shortcuts and position memory
// (localStorage, per slug). It never sees the raw Storage path
// or any key — only the signed URL the server page passes in.
// ShareButton copies the page link; on browsers with a share
// sheet it uses navigator.share, otherwise the clipboard.
"use client";

import { useEffect, useRef, useState } from "react";

export function WatchPlayer({
  signedUrl,
  slug,
  title,
}: {
  signedUrl: string;
  slug: string;
  title: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedRef = useRef(0);
  const [playbackError, setPlaybackError] = useState(false);

  const storageKey = `aict-watch-pos:${slug}`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => {
      try {
        const saved = Number(window.localStorage.getItem(storageKey));
        if (Number.isFinite(saved) && saved > 0 && saved < video.duration - 5) {
          video.currentTime = saved;
        }
      } catch {
        // Private mode / blocked storage: position memory is
        // a nicety, never a failure.
      }
    };
    video.addEventListener("loadedmetadata", onLoaded);
    return () => video.removeEventListener("loadedmetadata", onLoaded);
  }, [storageKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const video = videoRef.current;
      if (!video) return;
      if (e.key === " " || e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (video.paused) void video.play();
        else video.pause();
      } else if (e.key === "ArrowRight") {
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
      } else if (e.key === "ArrowLeft") {
        video.currentTime = Math.max(0, video.currentTime - 10);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        video.volume = Math.min(1, video.volume + 0.1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        video.volume = Math.max(0, video.volume - 0.1);
      } else if (e.key.toLowerCase() === "m") {
        video.muted = !video.muted;
      } else if (e.key.toLowerCase() === "f") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void video.requestFullscreen().catch(() => undefined);
      } else if (e.key.toLowerCase() === "p") {
        if (document.pictureInPictureElement) {
          void document.exitPictureInPicture().catch(() => undefined);
        } else {
          void video.requestPictureInPicture().catch(() => undefined);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function savePosition() {
    const video = videoRef.current;
    if (!video) return;
    const now = video.currentTime;
    if (Math.abs(now - lastSavedRef.current) < 5) return;
    lastSavedRef.current = now;
    try {
      window.localStorage.setItem(storageKey, String(Math.floor(now)));
    } catch {
      // Position memory is optional; ignore storage failures.
    }
  }

  return (
    <div className="watch-player">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={signedUrl}
        controls
        playsInline
        preload="metadata"
        aria-label={`Video: ${title}`}
        onTimeUpdate={savePosition}
        onPause={savePosition}
        onError={() => setPlaybackError(true)}
      />
      {playbackError && (
        <p className="notice error">
          This video could not be played. The signed link may have
          expired (it lasts 1 hour) — refresh the page to get a new
          one.
        </p>
      )}
      <p className="hero-note">
        Keyboard: Space / K play-pause · ← / → seek 10s · ↑ / ↓ volume
        · M mute · F fullscreen · P picture-in-picture.
      </p>
    </div>
  );
}

export function ShareButton() {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      throw new Error("no share sheet");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } catch {
        window.prompt("Copy this link:", url);
      }
    }
  }
  return (
    <button className="btn-secondary" type="button" onClick={() => void share()}>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
