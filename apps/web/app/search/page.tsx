import type { TitleSummary } from "@verdict/shared";
import { api } from "@/lib/api";
import { TitleGrid } from "@/components/TitleCard";

export const metadata = { title: "Search" };

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const results = q ? (await api<TitleSummary[]>(`/search?q=${encodeURIComponent(q)}`)) ?? [] : [];
  return (
    <section className="section">
      <h1>{q ? <>Results for “{q}”</> : "Search"}</h1>
      <form action="/search" className="row" style={{ margin: "16px 0 24px" }}>
        <input name="q" defaultValue={q} className="card" style={{ padding: "10px 14px", flex: 1, maxWidth: 480 }} aria-label="Search" />
        <button className="btn btn-primary">Search</button>
      </form>
      {q && <TitleGrid items={results} />}
    </section>
  );
}
