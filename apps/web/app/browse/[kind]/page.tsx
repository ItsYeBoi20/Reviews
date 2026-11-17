import Link from "next/link";
import { notFound } from "next/navigation";
import { MEDIA_KINDS, TITLE_SORTS, type MediaKind, type Paginated, type TitleSort, type TitleSummary } from "@verdict/shared";
import { api } from "@/lib/api";
import { KIND_PLURAL } from "@/lib/format";
import { TitleGrid } from "@/components/TitleCard";

const SORT_LABEL: Record<TitleSort, string> = { trending: "Trending", consensus: "Reddit favorites", top: "Top rated by users", new: "New releases" };
const PAGE_SIZE = 24;

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return { title: KIND_PLURAL[kind as MediaKind] ?? "Browse" };
}

export default async function Browse({ params, searchParams }: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  const { kind } = await params;
  const sp = await searchParams;
  if (!MEDIA_KINDS.includes(kind as MediaKind)) notFound();
  const sort = (TITLE_SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as TitleSort) : "trending";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await api<Paginated<TitleSummary>>(`/titles?kind=${kind}&sort=${sort}&page=${page}&pageSize=${PAGE_SIZE}`);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <section className="section">
      <h1>{KIND_PLURAL[kind as MediaKind]}</h1>
      <nav className="tabs" aria-label="Sort">
        {TITLE_SORTS.map((s) => (
          <Link key={s} href={`/browse/${kind}?sort=${s}`} aria-current={s === sort ? "page" : undefined}>{SORT_LABEL[s]}</Link>
        ))}
      </nav>
      <TitleGrid items={data?.items ?? []} />
      {pages > 1 && (
        <div className="pager">
          {page > 1 && <Link className="btn" href={`/browse/${kind}?sort=${sort}&page=${page - 1}`}>← Previous</Link>}
          <span className="muted small" style={{ alignSelf: "center" }}>Page {page} of {pages}</span>
          {page < pages && <Link className="btn" href={`/browse/${kind}?sort=${sort}&page=${page + 1}`}>Next →</Link>}
        </div>
      )}
    </section>
  );
}
