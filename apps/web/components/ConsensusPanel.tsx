import type { ConsensusView } from "@verdict/shared";
import { formatDate, pct } from "@/lib/format";
import { Sparkline } from "./Sparkline";

const CONFIDENCE_NOTE = {
  low: "Low confidence: few comments, treat as an early read.",
  medium: "Medium confidence.",
  high: "High confidence.",
};

export function ConsensusPanel({ c }: { c: ConsensusView | null }) {
  if (!c) {
    return (
      <section className="card card-pad">
        <div className="consensus-head"><h2>Reddit consensus</h2></div>
        <p className="muted">Not enough Reddit discussion has been analyzed for this title yet. It is checked automatically on a schedule.</p>
      </section>
    );
  }
  const b = c.breakdown;
  return (
    <section className="card card-pad" aria-labelledby="consensus-h">
      <div className="consensus-head">
        <h2 id="consensus-h">Reddit consensus</h2>
        <span className="badge">{c.label}</span>
        {c.isSampleData && <span className="badge badge-warn">Sample data</span>}
        <span className="spacer" />
        {c.history.length > 1 && <Sparkline points={c.history.map((h) => h.score)} />}
      </div>

      <p className="summary">{c.summary}</p>

      <div className="sentiment-bar" role="img" aria-label={`${pct(b.positive)} positive, ${pct(b.mixed)} mixed, ${pct(b.negative)} negative`}>
        <span style={{ width: pct(b.positive), background: "var(--pos)" }} />
        <span style={{ width: pct(b.mixed), background: "var(--mixed)" }} />
        <span style={{ width: pct(b.negative), background: "var(--neg)" }} />
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--pos)" }} />{pct(b.positive)} positive</span>
        <span><i style={{ background: "var(--mixed)" }} />{pct(b.mixed)} mixed</span>
        <span><i style={{ background: "var(--neg)" }} />{pct(b.negative)} negative</span>
        <span>· {c.sampleSize} comments from {c.threadCount} threads · {CONFIDENCE_NOTE[c.confidence]}</span>
      </div>

      {(c.pros.length > 0 || c.cons.length > 0) && (
        <div className="points">
          <div>
            <h3 className="tone-good">What people liked</h3>
            <ul>{c.pros.map((p) => <Point key={p.point} text={p.point} share={p.share} color="var(--pos)" />)}</ul>
          </div>
          <div>
            <h3 className="tone-bad">Common complaints</h3>
            <ul>{c.cons.length ? c.cons.map((p) => <Point key={p.point} text={p.point} share={p.share} color="var(--neg)" />) : <li className="muted">No recurring complaints.</li>}</ul>
          </div>
        </div>
      )}

      {c.quotes.length > 0 && (
        <div className="quotes">
          {c.quotes.map((q) => (
            <blockquote key={q.permalink} className={`quote quote-${q.sentiment}`} style={{ margin: 0 }}>
              <p>“{q.text}”</p>
              <span className="small muted">
                {c.isSampleData ? `r/${q.subreddit}` : <a href={q.permalink} target="_blank" rel="noopener noreferrer nofollow">r/{q.subreddit}</a>} · {q.upvotes.toLocaleString()} upvotes
              </span>
            </blockquote>
          ))}
        </div>
      )}

      <div className="sources">
        <strong>Sources</strong>
        <ul>
          {c.sources.map((s) => (
            <li key={s.id}>
              {c.isSampleData ? s.title : <a href={s.permalink} target="_blank" rel="noopener noreferrer nofollow">{s.title}</a>}{" "}
              <span>(r/{s.subreddit}, {s.commentCount} comments used)</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="provenance">
        Analyzed {formatDate(c.analyzedAt)} · {c.provider}/{c.model} · prompt {c.promptVersion}. Score is the upvote-weighted share of
        positive opinions (mixed counts half), computed in code from per-comment labels.
        {c.isSampleData && " Built from synthetic fixture threads for local development, not real Reddit posts."}
      </div>
    </section>
  );
}

function Point({ text, share, color }: { text: string; share: number; color: string }) {
  return (
    <li>
      {text}
      <div className="share">
        <div className="share-track"><span style={{ width: pct(Math.min(1, share)), background: color }} /></div>
        {pct(share)} of comments
      </div>
    </li>
  );
}
