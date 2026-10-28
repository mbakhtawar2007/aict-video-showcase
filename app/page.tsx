export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">AICT &middot; Phase 1</p>
        <h1>AI Video Showcase &amp; Voting</h1>
        <p className="gradient-text">Cinematic. Animated. Class-only.</p>
        <p className="lede">
          Phase 1 adds student sign-in (passwordless email code),
          onboarding and profile pages — locally only for now, until
          the new AICT Supabase project is connected. Upload, gallery
          and voting arrive in later phases.
        </p>
        <p>
          <a href="/login">Sign in with your university email</a>
        </p>
      </section>

      <section className="card">
        <h2>Locked decisions (do not re-decide in Phase 1)</h2>
        <ul>
          <li>
            Stack: Next.js App Router + TypeScript, Tailwind, Supabase
            Postgres / Auth.
          </li>
          <li>
            Teachers and students: <code>@duet.edu.pk</code> only, exact
            match, no subdomains, no <code>+tag</code> aliases. Role
            (admin vs student) comes from the allowlist, not the domain.
          </li>
          <li>
            Teachers / admins: SKIPPED FOR NOW (2026-10-28 decision).
            No teacher rows are seeded in Phase 1; teacher/admin
            accounts are added later when real emails arrive. Roster
            mode OFF.
          </li>
          <li>
            Video: Supabase Storage free tier, MP4 (H.264) only, &le; 50 MB
            per file, 1 GB total, signed URLs, no transcoding, no
            Cloudflare Stream.
          </li>
          <li>
            Voting defaults (for later phases): 3 votes per student, no
            voting for your own or your group&rsquo;s video.
          </li>
          <li>No passwords. No social login. Passwordless OTP is Phase 1.</li>
        </ul>
      </section>

      <section className="card">
        <h2>What Phase 0 does not do</h2>
        <ul>
          <li>No GitHub push, no deploy, no live Supabase project.</li>
          <li>No real secrets, keys, or teacher emails in this repo.</li>
          <li>
            No SMTP delivery test yet — that needs a real university inbox
            and a human-owned sending domain.
          </li>
          <li>
            No Stream test — Stream was removed by the locked free-video
            decision.
          </li>
        </ul>
        <p>
          See <code>README.md</code> and <code>PHASE0-REPORT.md</code> for
          the full scope and the human checklist.
        </p>
      </section>
    </main>
  );
}
