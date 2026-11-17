import Link from "next/link";
import type { Paginated, ReviewView, TitleSummary } from "@verdict/shared";
import { api, getViewer } from "@/lib/api";
import { TitleGrid } from "@/components/TitleCard";
import { ReviewItem } from "@/components/ReviewItem";

export default async function Home() {
  const list = (q: string) => api<Paginated<TitleSummary>>(`/titles?${q}`).then((r) => r?.items ?? []);
  const [movies, tv, games, loved, recent, viewer] = await Promise.all([
    list("kind=movie&sort=trending&pageSize=6"),
    list("kind=tv&sort=trending&pageSize=6"),
    list("kind=game&sort=trending&pageSize=6"),
    list("sort=consensus&pageSize=6"),
    api<ReviewView[]>("/reviews/recent?limit=5").then((r) => r ?? []),
    getViewer(),
  ]);

  return (
    <>
      <section className="hero">
        <h1>What people actually think about movies, shows and games.</h1>
        <p>Every title gets two scores: an AI read of Reddit discussion, and ratings from reviewers here. When they disagree, that tells you something too.</p>
        <form action="/search">
          <input name="q" placeholder="Search for a movie, show or game" aria-label="Search" />
          <button className="btn btn-primary">Search</button>
        </form>
      </section>

      <Row title="Reddit's favorites right now" href="/browse/movie?sort=consensus" items={loved} />
      <Row title="Trending movies" href="/browse/movie" items={movies} />
      <Row title="Trending TV" href="/browse/tv" items={tv} />
      <Row title="Trending games" href="/browse/game" items={games} />

      <section className="section">
        <div className="section-head"><h2>Latest reviews</h2></div>
        <div className="card card-pad">
          {recent.length ? recent.map((r) => <ReviewItem key={r.id} r={r} canVote={!!viewer && viewer.id !== r.author.id} showTitle />) : <p className="muted">No reviews yet.</p>}
        </div>
      </section>
    </>
  );
}

function Row({ title, href, items }: { title: string; href: string; items: TitleSummary[] }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        <Link href={href}>See all →</Link>
      </div>
      <TitleGrid items={items} />
    </section>
  );
}
