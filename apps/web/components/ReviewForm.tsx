"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReviewView } from "@verdict/shared";
import { send } from "@/lib/client";

export function ReviewForm({ slug, mine }: { slug: string; mine: ReviewView | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!mine);
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [headline, setHeadline] = useState(mine?.headline ?? "");
  const [body, setBody] = useState(mine?.body ?? "");
  const [spoilers, setSpoilers] = useState(mine?.containsSpoilers ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (mine && !editing) {
    return (
      <div className="row">
        <span>You rated this <strong>{mine.rating}/10</strong>.</span>
        <button className="btn" onClick={() => setEditing(true)}>Edit your review</button>
        <button
          className="btn btn-ghost"
          onClick={async () => {
            if (!confirm("Delete your review?")) return;
            await send("DELETE", `/titles/${slug}/reviews/mine`);
            router.refresh();
          }}
        >
          Delete
        </button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setError("Pick a rating from 1 to 10.");
    setBusy(true);
    setError(null);
    try {
      await send("PUT", `/titles/${slug}/reviews/mine`, { rating, headline, body, containsSpoilers: spoilers });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label id="rating-label">Your rating</label>
        <div className="rating-input" role="group" aria-labelledby="rating-label">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button type="button" key={n} aria-pressed={rating === n} onClick={() => setRating(n)}>{n}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="headline">Headline</label>
        <input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} required minLength={3} />
      </div>
      <div className="field">
        <label htmlFor="body">Review</label>
        <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} minLength={20} maxLength={10000} required />
      </div>
      <label className="row small">
        <input type="checkbox" checked={spoilers} onChange={(e) => setSpoilers(e.target.checked)} /> Contains spoilers
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>{mine ? "Save changes" : "Post review"}</button>
        {mine && <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
      </div>
    </form>
  );
}
