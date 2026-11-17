import type { ScoreBadge } from "@verdict/shared";
import { scoreTone } from "@/lib/format";

export function ScoreChips({ t }: { t: ScoreBadge }) {
  const c = scoreTone(t.consensusScore, 100);
  const u = scoreTone(t.userScore, 10);
  return (
    <div className="chips">
      <span className="chip" title={t.consensusLabel ? `Reddit consensus: ${t.consensusLabel}` : "No Reddit consensus yet"}>
        <span className={`dot bg-${c}`} />
        <span className={`tone-${c}`}>{t.consensusScore ?? "–"}</span>
        <span className="muted">Reddit</span>
      </span>
      <span className="chip" title={`${t.userRatingCount} user ratings`}>
        <span className={`dot bg-${u}`} />
        <span className={`tone-${u}`}>{t.userScore?.toFixed(1) ?? "–"}</span>
        <span className="muted">Users</span>
      </span>
    </div>
  );
}
