"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReviewView } from "@verdict/shared";
import { send } from "@/lib/client";
import { formatDate, scoreTone } from "@/lib/format";

export function ReviewItem({ r, canVote, showTitle = false }: { r: ReviewView; canVote: boolean; showTitle?: boolean }) {
  const [helpful, setHelpful] = useState(r.viewerFoundHelpful);
  const [count, setCount] = useState(r.helpfulCount);
  const [revealed, setRevealed] = useState(!r.containsSpoilers);
  const [reported, setReported] = useState(false);

  async function toggleHelpful() {
    const res = await send<{ helpful: boolean; helpfulCount: number }>("POST", `/reviews/${r.id}/helpful`);
    setHelpful(res.helpful);
    setCount(res.helpfulCount);
  }

  return (
    <article className="review">
      <div className="review-head">
        <span className={`rating-pill bg-${scoreTone(r.rating, 10)}`}>{r.rating}/10</span>
        {showTitle && r.titleSlug && <Link href={`/title/${r.titleSlug}`}><strong>{r.titleName}</strong></Link>}
        <span className="small muted">
          by <Link href={`/u/${r.author.username}`}>{r.author.displayName}</Link> · {formatDate(r.createdAt)}
        </span>
        {r.containsSpoilers && <span className="badge badge-warn">Spoilers</span>}
      </div>
      <h3>{r.headline}</h3>
      <p className={revealed ? "" : "spoiler"} onClick={() => setRevealed(true)} title={revealed ? undefined : "Click to reveal spoilers"}>
        {r.body}
      </p>
      <div className="row small muted" style={{ marginTop: 8 }}>
        <span>{count} found this helpful</span>
        {canVote && (
          <>
            <button className="btn btn-ghost small" onClick={toggleHelpful} aria-pressed={helpful}>
              {helpful ? "✓ Helpful" : "Helpful"}
            </button>
            <button
              className="btn btn-ghost small"
              disabled={reported}
              onClick={async () => {
                await send("POST", `/reviews/${r.id}/report`, { reason: "abuse" });
                setReported(true);
              }}
            >
              {reported ? "Reported" : "Report"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
