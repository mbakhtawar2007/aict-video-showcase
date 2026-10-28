import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AICT AI Video Showcase",
  description:
    "Phase 0 scaffold for the AICT AI Video Showcase & Voting Website. No sign-in, upload, voting, or live database yet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
