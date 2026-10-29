// Phase 1 — /login: university email entry. Passwordless only:
// no password field, no social login. Client checks are a hint;
// the server route and the auth hook enforce the domain rules.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        configured?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not request a code.");
        return;
      }
      if (data.configured === false) {
        setInfo(data.message ?? "Supabase is not configured yet.");
        return;
      }
      router.push(`/login/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page auth-page">
      <section className="card auth-card">
        <p className="eyebrow">AICT &middot; Sign-in</p>
        <h1>Sign in</h1>
        <p className="lede">
          Enter your university email. We will send a 6-digit code to
          your inbox — no password needed.
        </p>
        <p>
          Teachers and students: any address ending in{" "}
          <code>.duet.edu.pk</code> (for example{" "}
          <code>name@students.duet.edu.pk</code>) — no +tag aliases.
        </p>
        <form className="form" onSubmit={onSubmit}>
          <label htmlFor="email">University email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            placeholder="name@students.duet.edu.pk"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
        {error && <p className="notice error">{error}</p>}
        {info && <p className="notice">{info}</p>}
        <p className="link-row">
          <Link href="/">Home</Link>
        </p>
      </section>
    </main>
  );
}
