import type { Shop } from './shops';

/** Connection details for the Supabase project that hosts the talk function. */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const TALK_URL = `${SUPABASE_URL}/functions/v1/talk`;

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/** Thrown when the edge function rate-limits the visitor (HTTP 429). The message is meant to be shown. */
export class RateLimitError extends Error {}

/** Ask the talk function for the mascot's reply about its shop (by slug). Throws with a friendly message on failure.
 * A demo shop's copy placed near the visitor (relocate.ts) says so, with its street there: the mascot says that street,
 * never the shop's own area. */
export async function askFriend(friendId: string, messages: ChatMessage[], shop: Pick<Shop, 'slug' | 'placed' | 'street'>): Promise<string> {
  const response = await fetch(TALK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ friendId, messages, shop: shop.slug, ...(shop.placed && { placed: true, street: shop.street ?? '' }) }),
    signal: AbortSignal.timeout?.(20000), // a reply that never comes would leave the mascot thinking forever
  });
  if (!response.ok) {
    if (response.status === 429) {
      const body: unknown = await response.json().catch(() => null);
      const message =
        typeof body === 'object' && body !== null && 'error' in body
          ? (body as { error: unknown }).error
          : null;
      throw new RateLimitError(
        typeof message === 'string' && message.length > 0
          ? message
          : 'Too many messages, try again in a minute',
      );
    }
    throw new Error(`talk failed: ${response.status}`);
  }
  const data: unknown = await response.json();
  const reply =
    typeof data === 'object' && data !== null && 'reply' in data
      ? (data as { reply: unknown }).reply
      : null;
  if (typeof reply !== 'string' || reply.length === 0) {
    throw new Error('talk returned no reply');
  }
  return reply;
}
