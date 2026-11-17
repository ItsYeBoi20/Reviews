import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/api";
import { LogoutButton } from "@/components/LogoutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Verdict: what people actually think", template: "%s · Verdict" },
  description: "Movie, TV and game reviews with an AI-read consensus of Reddit discussion alongside ratings from our own community.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer().catch(() => null);
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="logo"><span className="logo-mark">V</span>Verdict</Link>
            <nav className="nav">
              <Link href="/browse/movie">Movies</Link>
              <Link href="/browse/tv">TV</Link>
              <Link href="/browse/game">Games</Link>
            </nav>
            <form action="/search" className="search-form" role="search">
              <input name="q" placeholder="Search titles…" aria-label="Search titles" />
            </form>
            <span className="spacer" />
            <div className="user-menu">
              {viewer ? (
                <>
                  <Link href={`/u/${viewer.username}`} className="small">@{viewer.username}</Link>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <Link href="/login" className="btn btn-ghost">Sign in</Link>
                  <Link href="/register" className="btn btn-primary">Join</Link>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          <div className="container">
            Reddit consensus scores are AI-assisted summaries of public discussion and can be wrong. User scores come from Verdict members.
          </div>
        </footer>
      </body>
    </html>
  );
}
