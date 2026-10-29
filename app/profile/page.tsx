// Phase 1 — /profile: own profile page. Shows the signed-in user's
// profile row and offers sign-out. Unauthenticated visitors are
// sent to /login.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Profile = {
  username: string | null;
  full_name: string | null;
  class_section: string | null;
  role: string;
  status: string;
  onboarded_at: string | null;
  reduce_effects: boolean;
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/profile");
      const data = (await res.json()) as {
        ok?: boolean;
        profile?: Profile;
        error?: string;
      };
      if (!res.ok || !data.profile) {
        router.push("/login");
        return;
      }
      setProfile(data.profile);
    })();
  }, [router]);

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/login");
  }

  if (!profile) {
    return (
      <main className="page auth-page">
        <section className="card auth-card">
          <p className="skeleton">Loading your profile…</p>
          <p className="skeleton skeleton-line" aria-hidden="true" />
          <p className="skeleton skeleton-line" aria-hidden="true" />
        </section>
      </main>
    );
  }

  return (
    <main className="page auth-page">
      <section className="card auth-card">
        <p className="eyebrow">AICT &middot; Profile</p>
        <h1>{profile.full_name ?? profile.username ?? "Your profile"}</h1>
        <dl className="profile-rows">
          <div className="profile-row">
            <dt>Username</dt>
            <dd><code>{profile.username ?? "—"}</code></dd>
          </div>
          <div className="profile-row">
            <dt>Class section</dt>
            <dd>{profile.class_section ?? "—"}</dd>
          </div>
          <div className="profile-row">
            <dt>Role</dt>
            <dd>{profile.role}</dd>
          </div>
          <div className="profile-row">
            <dt>Status</dt>
            <dd>{profile.status}</dd>
          </div>
          <div className="profile-row">
            <dt>Onboarded</dt>
            <dd>
              {profile.onboarded_at ? "Yes" : "Not yet — "}
              {!profile.onboarded_at && <Link href="/welcome">finish onboarding</Link>}
            </dd>
          </div>
          <div className="profile-row">
            <dt>Reduced effects</dt>
            <dd>{profile.reduce_effects ? "On" : "Off"}</dd>
          </div>
        </dl>
        {error && <p className="notice error">{error}</p>}
        <p className="link-row">
          <Link href="/welcome">Edit profile</Link>
          <Link href="/">Home</Link>
          <button className="btn-secondary" type="button" onClick={signOut}>
            Sign out
          </button>
        </p>
      </section>
    </main>
  );
}
