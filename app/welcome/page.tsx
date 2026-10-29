// Phase 1 — /welcome: first-sign-in onboarding (spec §5.1 step 5).
// Collects username (unique), full name and class section, then
// sets onboarded_at via PATCH /api/profile. Already-onboarded
// users are sent to /profile.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function WelcomePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [classSection, setClassSection] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/profile");
      const data = (await res.json()) as {
        ok?: boolean;
        profile?: { onboarded_at?: string | null };
      };
      if (!res.ok) {
        router.push("/login");
        return;
      }
      if (data.profile?.onboarded_at) {
        router.push("/profile");
        return;
      }
      setChecking(false);
    })();
  }, [router]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          full_name: fullName,
          class_section: classSection,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not save your profile.");
        return;
      }
      router.push("/profile");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="page auth-page">
        <section className="card auth-card">
          <p className="skeleton">Checking your profile…</p>
          <p className="skeleton skeleton-line" aria-hidden="true" />
          <p className="skeleton skeleton-line" aria-hidden="true" />
        </section>
      </main>
    );
  }

  return (
    <main className="page auth-page">
      <section className="card auth-card">
        <p className="eyebrow">AICT &middot; Onboarding</p>
        <h1>Welcome — finish your profile</h1>
        <p className="lede">
          Pick a username, add your full name and class section. You
          can change these later on your profile page.
        </p>
        <form className="form" onSubmit={onSubmit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            className="input"
            type="text"
            placeholder="e.g. ahmed_2024"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <label htmlFor="full_name">Full name</label>
          <input
            id="full_name"
            className="input"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
          <label htmlFor="class_section">Class section (optional)</label>
          <input
            id="class_section"
            className="input"
            type="text"
            placeholder="e.g. BS-CS 3A"
            value={classSection}
            onChange={(event) => setClassSection(event.target.value)}
          />
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save and continue"}
          </button>
        </form>
        {error && <p className="notice error">{error}</p>}
        <p className="link-row">
          <Link href="/">Home</Link>
        </p>
      </section>
    </main>
  );
}
