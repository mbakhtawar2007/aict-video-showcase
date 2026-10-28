// Phase 1 — /login/verify: 6-digit code entry (spec §5.1 step 3).
// After success, onboarding-pending users go to /welcome, everyone
// else to /profile.
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        onboarded?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Code verification failed.");
        return;
      }
      router.push(data.onboarded ? "/profile" : "/welcome");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <p className="eyebrow">AICT &middot; Phase 1</p>
      <h1>Enter your code</h1>
      <p className="lede">
        We sent a 6-digit code to <code>{email || "your inbox"}</code>.
        Codes expire in 10 minutes and work once.
      </p>
      <form className="form" onSubmit={onSubmit}>
        <label htmlFor="code">6-digit code</label>
        <input
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Verifying…" : "Verify and sign in"}
        </button>
      </form>
      {error && <p className="notice error">{error}</p>}
      <p className="link-row">
        <Link href="/login">Back to sign-in</Link>
        <Link href="/">Home</Link>
      </p>
    </section>
  );
}

export default function VerifyPage() {
  return (
    <main className="page">
      <Suspense>
        <VerifyForm />
      </Suspense>
    </main>
  );
}
