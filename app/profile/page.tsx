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
      <main className="page">
        <section className="card">
          <p>Loading your profile…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">AICT &middot; Phase 1</p>
        <h1>{profile.full_name ?? profile.username ?? "Your profile"}</h1>
        <ul>
          <li>
            Username: <code>{profile.username ?? "—"}</code>
          </li>
          <li>Class section: {profile.class_section ?? "—"}</li>
          <li>Role: {profile.role}</li>
          <li>Status: {profile.status}</li>
          <li>
            Onboarded: {profile.onboarded_at ? "Yes" : "Not yet — "}
            {!profile.onboarded_at && <Link href="/welcome">finish onboarding</Link>}
          </li>
          <li>
            Reduced effects: {profile.reduce_effects ? "On" : "Off"}
          </li>
        </ul>
        {error && <p className="notice error">{error}</p>}
        <p className="link-row">
          <Link href="/welcome">Edit profile</Link>
          <Link href="/">Home</Link>
          <button className="button" type="button" onClick={signOut}>
            Sign out
          </button>
        </p>
      </section>
    </main>
  );
}
