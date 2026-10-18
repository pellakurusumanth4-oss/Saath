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

/** Ask the friend's edge function for a reply (as the host at a shop, given its slug). Throws with a friendly message on failure. */
export async function askFriend(friendId: string, messages: ChatMessage[], shop?: string): Promise<string> {
  const response = await fetch(TALK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ friendId, messages, shop }),
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

export type GroupSpeaker = 'user' | 'doraemon' | 'nobita' | 'shinchan' | 'goku';

export type GroupMessage = {
  speaker: GroupSpeaker;
  text: string;
};

export type GroupReply = {
  speaker: Exclude<GroupSpeaker, 'user'>;
  reply: string;
};

/** Ask the edge function for the next group line. Throws RateLimitError on 429. */
export async function askGroup(
  messages: GroupMessage[],
  addressee: Exclude<GroupSpeaker, 'user'> | null,
): Promise<GroupReply> {
  const response = await fetch(TALK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ mode: 'group', messages, addressee }),
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
  if (
    typeof data === 'object' &&
    data !== null &&
    'speaker' in data &&
    'reply' in data
  ) {
    const { speaker, reply } = data as { speaker: unknown; reply: unknown };
    if (
      typeof speaker === 'string' &&
      speaker !== 'user' &&
      typeof reply === 'string' &&
      reply.length > 0
    ) {
      return { speaker: speaker as Exclude<GroupSpeaker, 'user'>, reply };
    }
  }
  throw new Error('talk returned no group reply');
}
