import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "AICT AI Video Showcase",
  description:
    "AICT AI Video Showcase & Voting Website. Phase 1: passwordless sign-in, onboarding and profile for @duet.edu.pk.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceGrotesk.variable}`}>
        <header className="nav">
          <div className="nav-inner">
            <Link href="/" className="nav-brand" aria-label="AICT home">
              <span className="nav-mark" aria-hidden="true">
                A
              </span>
              <span className="nav-brand-text">
                <span className="nav-brand-name">AI Video Showcase</span>
                <span className="nav-brand-sub">AICT</span>
              </span>
            </Link>
            <nav className="nav-links" aria-label="Main">
              <Link href="/">Home</Link>
              <Link href="/login">Sign in</Link>
              <Link href="/profile">Profile</Link>
            </nav>
          </div>
        </header>
        <div className="site-main">{children}</div>
        <footer className="footer">
          <div className="footer-inner">
            <p className="footer-title">AICT AI Video Showcase</p>
            <p className="footer-note">
              Phase 1 — sign-in, onboarding and profile only. Upload,
              gallery and voting arrive in later phases.
            </p>
            <p className="footer-links">
              <a href="https://github.com/mbakhtawar2007/aict-video-showcase">
                GitHub repo
              </a>
              <a href="https://aict-video-showcase.netlify.app">
                Netlify site
              </a>
              <a href="/login">Sign in</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
