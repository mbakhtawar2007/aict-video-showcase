import Link from "next/link";

// Plain 404 — no logic, no data, just a way back. Tier 1 fade only,
// shared card/button styles, same 1120px page shell as every page.
export default function NotFound() {
  return (
    <main className="page auth-page">
      <section className="card auth-card fade-up">
        <p className="eyebrow">AICT &middot; Page not found</p>
        <h1>That page does not exist</h1>
        <p className="lede">
          The link may be mistyped, or the page may have moved. Nothing
          was deleted — your projects, if any, are still on your
          dashboard.
        </p>
        <p className="link-row">
          <Link href="/" className="btn-primary">
            Home
          </Link>
          <Link href="/dashboard" className="btn-secondary">
            Dashboard
          </Link>
        </p>
      </section>
    </main>
  );
}
