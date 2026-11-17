import { notFound } from "next/navigation";
import type { ReviewView, UserPublic } from "@verdict/shared";
import { api, getViewer } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ReviewItem } from "@/components/ReviewItem";

type Profile = { user: UserPublic; reviews: ReviewView[]; stats: { reviewCount: number; averageRating: number | null } };

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  return { title: `@${(await params).username}` };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [data, viewer] = await Promise.all([api<Profile>(`/users/${encodeURIComponent(username)}`), getViewer()]);
  if (!data) notFound();
  const { user, reviews, stats } = data;
  return (
    <section className="section">
      <h1>{user.displayName}</h1>
      <p className="muted">@{user.username} · joined {formatDate(user.createdAt)} · {stats.reviewCount} reviews{stats.averageRating !== null && ` · average rating ${stats.averageRating}/10`}</p>
      <div className="card card-pad" style={{ marginTop: 20 }}>
        {reviews.length ? reviews.map((r) => <ReviewItem key={r.id} r={r} canVote={!!viewer && viewer.id !== user.id} showTitle />) : <p className="muted">No reviews yet.</p>}
      </div>
    </section>
  );
}
