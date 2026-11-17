import Link from "next/link";
import { notFound } from "next/navigation";
import type { ConsensusView, Paginated, ReviewView, TitleDetail } from "@verdict/shared";
import { api, getViewer } from "@/lib/api";
import { KIND_LABEL, formatDate, scoreTone } from "@/lib/format";
import { Poster } from "@/components/Poster";
import { ConsensusPanel } from "@/components/ConsensusPanel";
import { ReviewForm } from "@/components/ReviewForm";
import { ReviewItem } from "@/components/ReviewItem";

const REVIEW_SORTS = { helpful: "Most helpful", recent: "Newest", rating_high: "Highest rated", rating_low: "Lowest rated" } as const;
type ReviewSort = keyof typeof REVIEW_SORTS;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const t = await api<TitleDetail>(`/titles/${(await params).slug}`);
  if (!t) return { title: "Not found" };
  return { title: `${t.name}${t.year ? ` (${t.year})` : ""}`, description: t.synopsis ?? undefined };
}

export default async function TitlePage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const sort: ReviewSort = sp.sort && sp.sort in REVIEW_SORTS ? (sp.sort as ReviewSort) : "helpful";
  const page = Math.max(1, Number(sp.page) || 1);

  const [t, consensus, reviews, viewer] = await Promise.all([
    api<TitleDetail>(`/titles/${slug}`),
    api<ConsensusView>(`/titles/${slug}/consensus`),
    api<Paginated<ReviewView> & { mine: ReviewView | null }>(`/titles/${slug}/reviews?sort=${sort}&page=${page}`),
    getViewer(),
  ]);
  if (!t) notFound();

  const facts = [
    KIND_LABEL[t.kind],
    t.releaseDate && formatDate(t.releaseDate),
    t.runtimeMinutes && `${Math.floor(t.runtimeMinutes / 60)}h ${t.runtimeMinutes % 60}m`,
    t.platforms.length > 0 && t.platforms.join(", "),
    t.genres.join(", "),
  ].filter(Boolean);
  const cTone = scoreTone(t.consensusScore, 100);
  const uTone = scoreTone(t.userScore, 10);
  const maxBar = Math.max(1, ...t.ratingHistogram);
  const pages = Math.max(1, Math.ceil((reviews?.total ?? 0) / (reviews?.pageSize ?? 10)));

  return (
    <>
      <section className="title-hero">
        <Poster slug={t.slug} name={t.name} kind={t.kind} url={t.posterUrl} />
        <div>
          <h1>{t.name} {t.year && <span className="muted" style={{ fontWeight: 400 }}>({t.year})</span>}</h1>
          <div className="title-facts">{facts.map((f, i) => <span key={i}>{f}</span>)}</div>
          {t.creators.length > 0 && <p className="small muted">{t.kind === "game" ? "Developer" : "By"} {t.creators.join(", ")}</p>}
          {t.synopsis && <p style={{ maxWidth: 680 }}>{t.synopsis}</p>}
          <div className="score-tiles">
            <div className="score-tile">
              <div className="label">Reddit consensus</div>
              <div className={`value tone-${cTone}`}>{t.consensusScore ?? "–"}<small>/100</small></div>
              <div className="sub">{consensus ? `${consensus.label} · ${consensus.sampleSize} comments` : "Not analyzed yet"}</div>
            </div>
            <div className="score-tile">
              <div className="label">User score</div>
              <div className={`value tone-${uTone}`}>{t.userScore?.toFixed(1) ?? "–"}<small>/10</small></div>
              <div className="sub">{t.userRatingCount} {t.userRatingCount === 1 ? "rating" : "ratings"}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="two-col section">
        <div className="stack">
          <ConsensusPanel c={consensus} />

          <section className="card card-pad" id="reviews">
            <div className="section-head" style={{ marginBottom: 4 }}><h2>User reviews</h2><span className="muted small">{reviews?.total ?? 0} total</span></div>
            <nav className="tabs" aria-label="Sort reviews">
              {Object.entries(REVIEW_SORTS).map(([k, label]) => (
                <Link key={k} href={`/title/${slug}?sort=${k}#reviews`} aria-current={k === sort ? "page" : undefined} scroll={false}>{label}</Link>
              ))}
            </nav>
            {reviews?.items.length ? (
              reviews.items.map((r) => <ReviewItem key={r.id} r={r} canVote={!!viewer && viewer.id !== r.author.id} />)
            ) : (
              <p className="muted">No reviews yet. Be the first.</p>
            )}
            {pages > 1 && (
              <div className="pager">
                {page > 1 && <Link className="btn" href={`/title/${slug}?sort=${sort}&page=${page - 1}#reviews`}>← Previous</Link>}
                {page < pages && <Link className="btn" href={`/title/${slug}?sort=${sort}&page=${page + 1}#reviews`}>Next →</Link>}
              </div>
            )}
          </section>
        </div>

        <aside className="stack">
          <section className="card card-pad">
            <h2 style={{ fontSize: "1.05rem", marginBottom: 12 }}>{reviews?.mine ? "Your review" : "Rate this " + KIND_LABEL[t.kind].toLowerCase()}</h2>
            {viewer ? (
              <ReviewForm slug={slug} mine={reviews?.mine ?? null} />
            ) : (
              <p className="muted"><Link href={`/login?next=/title/${slug}`}>Sign in</Link> to rate and review.</p>
            )}
          </section>
          <section className="card card-pad">
            <h2 style={{ fontSize: "1.05rem", marginBottom: 12 }}>Rating distribution</h2>
            <div className="histogram">
              {[...t.ratingHistogram].map((n, i) => ({ n, rating: i + 1 })).reverse().map(({ n, rating }) => (
                <div className="bar-row" key={rating}>
                  <span>{rating}</span>
                  <div className="bar"><span style={{ width: `${(n / maxBar) * 100}%` }} /></div>
                  <span>{n}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
