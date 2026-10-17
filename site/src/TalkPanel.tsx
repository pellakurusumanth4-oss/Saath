import { useEffect, useRef, useState } from 'react';
import type { Friend } from '../../src/friends';
import { askFriend, type ChatMessage } from './talk';

type Chip = { label: string; send: string };

const STARTERS: Record<string, Chip[]> = {
  doraemon: [
    { label: 'Show me a gadget!', send: 'Show me a gadget from your pocket!' },
    { label: 'Want a dorayaki?', send: 'Want a dorayaki?' },
    { label: "What's in Pune?", send: "What do you like about Pune?" },
  ],
  nobita: [
    { label: 'How was the test?', send: 'How did your test go?' },
    { label: 'Good nap?', send: 'Did you have a good nap?' },
    { label: 'Temple stories?', send: 'What do you like about Sarasbaug temple?' },
  ],
  shinchan: [
    { label: 'Action Kamen!', send: 'Do you like Action Kamen?' },
    { label: 'Chocobi time?', send: 'Want to share some Chocobi?' },
    { label: 'Do the dance!', send: 'Do your cheeky dance for me!' },
  ],
  goku: [
    { label: 'Train with me!', send: 'Can we train together?' },
    { label: 'Hungry?', send: 'Are you hungry? Want some food?' },
    { label: 'Strong opponent?', send: 'Who is the strongest opponent you want to fight?' },
  ],
};

export default function TalkPanel({ friend, onClose }: { friend: Friend; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, waiting]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || waiting) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setDraft('');
    setWaiting(true);
    setError(null);
    try {
      const reply = await askFriend(friend.id, next.slice(-12));
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch {
      setError(`${friend.name.split(' ')[0]} didn’t hear you — try again in a moment.`);
    } finally {
      setWaiting(false);
    }
  };

  const starters = STARTERS[friend.character] ?? [];

  return (
    <div className="watch talk" role="dialog" aria-label={`Talking with ${friend.name}`}>
      <button className="watch-close" onClick={onClose} aria-label={`Stop talking with ${friend.name}`}>
        ✕
      </button>
      <h3 className="talk-title">Talk to {friend.name}</h3>
      <div className="talk-scroll" ref={scroller}>
        {messages.length === 0 && !waiting && (
          <p className="talk-empty">Say hello to {friend.name.split(' ')[0]}!</p>
        )}
        {messages.map((message, index) => (
          <p key={index} className={`talk-bubble ${message.role === 'user' ? 'is-user' : 'is-friend'}`}>
            {message.content}
          </p>
        ))}
        {waiting && <p className="talk-bubble is-friend talk-waiting">…</p>}
        {error && <p className="talk-error" role="alert">{error}</p>}
      </div>
      <div className="talk-chips">
        {starters.map((chip) => (
          <button key={chip.label} className="talk-chip" disabled={waiting} onClick={() => send(chip.send)}>
            {chip.label}
          </button>
        ))}
      </div>
      <form
        className="talk-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <input
          className="talk-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Say something to ${friend.name.split(' ')[0]}…`}
          maxLength={500}
          aria-label={`Message for ${friend.name}`}
        />
        <button className="btn btn-yellow talk-send" type="submit" disabled={waiting || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
