// J9/J10: a shop's latest reviews. Each comes from a verified visit (the counter code). Visitors can report one
// (three reports hide it); the owner answers each.
import { useCallback, useEffect, useState } from 'react';
import { ago, db, type Shop } from './shops';
import { Icon } from './ui';

type Review = { id: string; rating: number; body: string; owner_reply: string | null; visit_id: string | null; created_at: string };

export default function Reviews({ shop, owner = false }: { shop: Pick<Shop, 'id' | 'name'>; owner?: boolean }) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [now] = useState(() => Date.now());
  const load = useCallback(async () => {
    const { data } = await db.from('reviews').select('id,rating,body,owner_reply,visit_id,created_at')
      .eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(20);
    if (data) setReviews(data as Review[]); // a failed read hides the section rather than claiming there are none
  }, [shop.id]);
  useEffect(() => { void load(); }, [load]);
  if (!reviews) return null;
  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  return (
    <section className="reviews" aria-label="Reviews">
      <h2 className="block-title">
        Reviews{reviews.length > 0 && <span className="reviews-avg">★ {average.toFixed(1)} · {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</span>}
      </h2>
      {reviews.length === 0 && <p className="note">{owner ? 'No reviews yet. They come from verified visits.' : 'No reviews yet. Walk over, ask for the code, and be the first.'}</p>}
      <ul className="reviews-list">
        {reviews.map((review) => <ReviewItem key={review.id} review={review} shopName={shop.name} now={now} owner={owner} onChange={load} />)}
      </ul>
    </section>
  );
}

function ReviewItem({ review, shopName, now, owner, onChange }: { review: Review; shopName: string; now: number; owner: boolean; onChange: () => void }) {
  const [reported, setReported] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reply, setReply] = useState(review.owner_reply ?? '');
  const [error, setError] = useState<string | null>(null);
  const report = async () => {
    const { error: failed } = await db.rpc('report_content', { p_kind: 'review', p_id: review.id });
    if (failed) setError('Couldn’t report it. Try again.');
    else {
      setError(null);
      setReported(true);
    }
  };
  const save = async () => {
    const { error: failed } = await db.rpc('reply_to_review', { p_review: review.id, p_reply: reply });
    if (failed) setError('Couldn’t save the reply. Try again.');
    else {
      setError(null);
      setEditing(false);
      onChange();
    }
  };
  return (
    <li className="review">
      <div className="review-top">
        <span className="review-stars-s" role="img" aria-label={`${review.rating} of 5 stars`}>{'★'.repeat(review.rating)}<i>{'★'.repeat(5 - review.rating)}</i></span>
        {review.visit_id && <span className="review-verified"><Icon name="check" size={11} stroke={3} />Verified visit</span>}
        <span className="review-when">{ago(review.created_at, now)}</span>
      </div>
      {review.body && <p className="review-body">{review.body}</p>}
      {review.owner_reply && !editing && <div className="review-reply"><b>Reply from {shopName}</b><p>{review.owner_reply}</p></div>}
      {owner && (editing || !review.owner_reply) && (
        <div className="review-reply-form">
          <textarea value={reply} maxLength={500} onChange={(event) => setReply(event.target.value)} placeholder={`Answer as ${shopName}`} aria-label="Your reply" />
          <button type="button" className="btn-dark small" disabled={!reply.trim()} onClick={() => void save()}>Reply</button>
        </div>
      )}
      {owner && review.owner_reply && !editing && <button type="button" className="review-link" onClick={() => setEditing(true)}>Edit reply</button>}
      {!owner && <button type="button" className="review-link" disabled={reported} onClick={() => void report()}>{reported ? 'Reported. Thanks.' : 'Report'}</button>}
      {error && <p className="owner-msg" role="alert">{error}</p>}
    </li>
  );
}
