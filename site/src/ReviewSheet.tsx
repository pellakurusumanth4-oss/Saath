// J5b: the verified visit, then stars and a few words. One review per visit; it can't be changed after posting.
// Photos come later (the photo bucket only takes uploads from the server).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { db, type ShopWithMenu } from './shops';
import { Icon } from './ui';
import { useInert } from './useInert';

export default function ReviewSheet({ shop, visit, onDone }: { shop: ShopWithMenu; visit: string; onDone: (posted: boolean) => void }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const box = useRef<HTMLDivElement>(null);
  useInert(box);
  useEffect(() => box.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onDone(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const post = async () => {
    setPosting(true);
    setError(null);
    const { error: failed } = await db.rpc('post_review', { p_visit: visit, p_rating: rating, p_body: body.trim() });
    setPosting(false);
    // One review per visit, and one visit per person, shop and day: a second review the same day is refused.
    if (failed) setError(failed.message.includes('already-reviewed') ? 'This visit was already reviewed from this network today.' : 'Couldn’t post it. Check the connection and try again.');
    else onDone(true);
  };

  return createPortal(
    <div className="code-wrap">
      <div className="review-screen" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Your review">
        <button type="button" className="icon-btn round review-close" onClick={() => onDone(false)} aria-label="Close"><Icon name="close" size={20} stroke={2.4} /></button>
        <div className="review-head">
          <span className="review-tick"><Icon name="check" size={30} stroke={3} /></span>
          <div><b>Verified visit</b><span>{shop.name} · today {time}</span></div>
        </div>
        <p className="j-kicker">HOW WAS IT?</p>
        <div className="review-stars" role="group" aria-label="Stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)}>
              <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={n <= rating ? '#F59E0B' : '#E3E8EF'} /></svg>
            </button>
          ))}
        </div>
        <textarea className="review-text" value={body} maxLength={500} onChange={(event) => setBody(event.target.value)}
          placeholder="What did you have? How was it?" aria-label="Your review" />
        {body.length >= 450 && <p className="review-count">{body.length} / 500</p>}
        <p className="review-badge"><span><Icon name="check" size={12} stroke={3} />Verified visit</span>shows on your review</p>
        {error && <p className="code-msg" role="alert">{error}</p>}
        <div className="review-actions">
          <button type="button" className="btn-go" disabled={!rating || posting} onClick={() => void post()}>{posting ? 'Posting…' : 'Post review'}</button>
          <button type="button" className="review-skip" onClick={() => onDone(false)}>Skip</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
