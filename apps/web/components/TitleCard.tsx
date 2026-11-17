import Link from "next/link";
import type { TitleSummary } from "@verdict/shared";
import { KIND_LABEL } from "@/lib/format";
import { Poster } from "./Poster";
import { ScoreChips } from "./ScoreChips";

export function TitleCard({ t }: { t: TitleSummary }) {
  return (
    <Link href={`/title/${t.slug}`} className="title-card">
      <Poster slug={t.slug} name={t.name} kind={t.kind} url={t.posterUrl} />
      <div>
        <div className="name">{t.name}</div>
        <div className="meta">{[KIND_LABEL[t.kind], t.year].filter(Boolean).join(" · ")}</div>
      </div>
      <ScoreChips t={t} />
    </Link>
  );
}

export function TitleGrid({ items }: { items: TitleSummary[] }) {
  if (!items.length) return <p className="muted">Nothing here yet.</p>;
  return <div className="grid">{items.map((t) => <TitleCard key={t.id} t={t} />)}</div>;
}
