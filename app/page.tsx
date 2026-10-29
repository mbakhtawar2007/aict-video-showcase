export default function HomePage() {
  return (
    <main className="page home-page">
      <section className="hero-new fade-up">
        <p className="hero-badge">AICT &middot; Phase 2</p>
        <h1 className="hero-title">
          Student videos,
          <br />
          <span className="gradient-text">voted by the class.</span>
        </h1>
        <p className="hero-lede">
          A class-only showcase for AI-made videos from Dawood
          University of Engineering &amp; Technology. No passwords, no
          public feed — just sign in with your university email.
        </p>
        <p className="hero-note">
          Sign-in, onboarding, profile, upload and dashboard are built
          (Phases 1–2). Gallery and voting arrive in later phases.
        </p>
        <div className="hero-actions">
          <a className="btn-primary" href="/login">
            Sign in
          </a>
          <a className="btn-secondary" href="#gallery">
            View gallery
          </a>
        </div>
      </section>

      <section className="how-it-works fade-up anim-delay-1" aria-label="How it works">
        <h2>How it works</h2>
        <ol className="steps">
          <li className="step-card">
            <span className="step-number" aria-hidden="true">
              1
            </span>
            <h3>Sign in</h3>
            <p>
              Enter your university email ending in{" "}
              <code>.duet.edu.pk</code> and confirm the 6-digit code.
              No password needed.
            </p>
            <span className="pill pill-live">Phase 1</span>
          </li>
          <li className="step-card">
            <span className="step-number" aria-hidden="true">
              2
            </span>
            <h3>Upload</h3>
            <p>
              Share your AI video as an MP4, with its story, tools and
              team. The wizard and dashboard are built in Phase 2;
              live use waits on the Vercel server (see below).
            </p>
            <span className="pill pill-live">Phase 2</span>
          </li>
          <li className="step-card">
            <span className="step-number" aria-hidden="true">
              3
            </span>
            <h3>Vote</h3>
            <p>
              Give your 3 votes to other students&apos; videos — never
              your own or your group&apos;s.
            </p>
            <span className="pill">Coming in Phase 4</span>
          </li>
        </ol>
      </section>

      <section
        id="gallery"
        className="gallery-section fade-up anim-delay-2"
        aria-label="Gallery"
      >
        <h2>Gallery</h2>
        <p className="section-lede">
          The gallery arrives in Phase 3. Nothing here is a real video
          yet — these slots are placeholders only.
        </p>
        <div className="gallery-grid">
          <article className="gallery-card">
            <div className="gallery-thumb" aria-hidden="true">
              <span>Coming soon</span>
            </div>
            <h3>Gallery slot</h3>
            <p>Student videos will appear here in Phase 3.</p>
          </article>
          <article className="gallery-card">
            <div className="gallery-thumb" aria-hidden="true">
              <span>Coming soon</span>
            </div>
            <h3>Gallery slot</h3>
            <p>Student videos will appear here in Phase 3.</p>
          </article>
          <article className="gallery-card">
            <div className="gallery-thumb" aria-hidden="true">
              <span>Coming soon</span>
            </div>
            <h3>Gallery slot</h3>
            <p>Student videos will appear here in Phase 3.</p>
          </article>
        </div>
      </section>

      <section className="fade-up anim-delay-2" aria-label="Locked decisions">
        <h2>Locked decisions</h2>
        <p className="section-lede">
          These were settled before Phase 1 and are not re-decided
          here.
        </p>
        <div className="decision-grid">
          <article className="decision-card">
            <h3>Domain</h3>
            <p>
              Teachers and students: any address ending in{" "}
              <code>.duet.edu.pk</code> (for example{" "}
              <code>@students.duet.edu.pk</code>); no <code>+tag</code>{" "}
              aliases. Role comes from the allowlist, not the domain.
            </p>
          </article>
          <article className="decision-card">
            <h3>Teachers</h3>
            <p>
              Skipped for now. No teacher rows are seeded in Phase 1;
              teacher/admin accounts are added later when real emails
              arrive. Roster mode OFF.
            </p>
          </article>
          <article className="decision-card">
            <h3>Video</h3>
            <p>
              Supabase Storage free tier, MP4 (H.264) only, &le; 50 MB
              per file, 1 GB total, signed URLs, no transcoding, no
              Cloudflare Stream.
            </p>
          </article>
          <article className="decision-card">
            <h3>Voting</h3>
            <p>
              Later phases: 3 votes per student, no voting for your own
              or your group&apos;s video.
            </p>
          </article>
          <article className="decision-card">
            <h3>Sign-in</h3>
            <p>
              No passwords. No social login. Passwordless OTP is
              Phase 1.
            </p>
          </article>
          <article className="decision-card">
            <h3>Stack</h3>
            <p>
              Next.js App Router + TypeScript, Tailwind, Supabase
              Postgres / Auth.
            </p>
          </article>
        </div>
      </section>

      <section className="card notice-card">
        <h2>What is not live yet</h2>
        <ul>
          <li>
            The Supabase project exists and migrations 0001–0003 are
            live, with a private <code>videos</code> bucket — but the
            Vercel server is not deployed with its environment yet,
            so sign-in and upload cannot run on the live site. Until
            then the app reports Supabase as not configured instead
            of pretending a sign-in or upload worked.
          </li>
          <li>No real secrets, keys, or teacher emails in this repo.</li>
          <li>
            No SMTP delivery test yet — that needs a real university
            inbox and a human-owned sending domain.
          </li>
          <li>
            No gallery, playback, or voting yet — those are Phases 3
            and 4, and nothing on this page is a real video.
          </li>
        </ul>
        <p>
          See <code>README.md</code> and <code>PHASE2-REPORT.md</code>{" "}
          for the full scope and the human checklist.
        </p>
      </section>
    </main>
  );
}
