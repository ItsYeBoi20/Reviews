import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section">
      <h1>Not found</h1>
      <p className="muted">We couldn't find that page. <Link href="/">Back to the homepage</Link>.</p>
    </section>
  );
}
