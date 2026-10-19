// Talk to a shop's mascot, voice only: no transcript on screen (screen readers still get every reply, and it shows
// when the sound is off). The mascot answers from the shop's live data in its own voice.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Compare from './Compare';
import { askFriend, RateLimitError, type ChatMessage } from './talk';
import { listenOnce, speechSupported, type RecognitionHandle } from './speech';
import { loadSoundPref, saveSoundPref } from './voices';
import { speakReply, stopAllSpeaking, type SpeakHandle } from './kokoro';
import { hostOf, sectionOf, type MenuItem, type ShopWithMenu } from './shops';
import { Icon, MenuRow, Podium } from './ui';

const HINTS = [
  { label: 'How much do I save?', send: 'How much do I save if I walk over instead of ordering on a delivery app?' },
  { label: 'What’s on the board?', send: 'What’s on your billboard today?' },
  { label: 'Is it busy?', send: 'Is it busy right now?' },
  { label: 'What’s good today?', send: 'What’s good here today?' },
];

/** The menu item a reply names (the longest name it contains), to light up its row. */
const namedIn = (reply: string, menu: MenuItem[]) =>
  [...menu].sort((a, b) => b.name.length - a.name.length).find((item) => reply.toLowerCase().includes(item.name.toLowerCase())) ?? null;

type State = 'idle' | 'listening' | 'thinking' | 'talking';

/** greet: a first question asked as the panel opens (the owner's setup, so the mascot says hello). */
export default function TalkPanel({ shop, onClose, greet }: { shop: ShopWithMenu; onClose: () => void; greet?: string }) {
  const mascot = hostOf(shop);
  const section = sectionOf(shop);
  const name = mascot.name.split(' ').pop()!;
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<State>('idle');
  const [reply, setReply] = useState('');
  const [named, setNamed] = useState<MenuItem | null>(null);
  const [soundOn, setSoundOn] = useState(() => loadSoundPref());
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(() => !speechSupported());
  const [draft, setDraft] = useState('');
  const recognition = useRef<RecognitionHandle | null>(null);
  const speaking = useRef<SpeakHandle | null>(null);
  // Each ask, mic tap or close starts a new turn; an older ask that comes back late drops its reply.
  const turn = useRef(0);
  const opener = useRef(document.activeElement as HTMLElement | null);
  const historyRef = useRef(history);
  historyRef.current = history;

  const hush = () => {
    speaking.current?.cancel();
    speaking.current = null;
    stopAllSpeaking();
  };
  useEffect(() => () => {
    turn.current++;
    recognition.current?.stop();
    hush();
    opener.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ask = async (text: string) => {
    const words = text.trim();
    if (!words || state === 'thinking') return;
    hush();
    const mine = ++turn.current;
    setError(null);
    setState('thinking');
    const next = [...historyRef.current, { role: 'user' as const, content: words }];
    try {
      const answer = await askFriend(mascot.id, next.slice(-12), shop.slug);
      if (mine !== turn.current) return;
      setHistory([...next, { role: 'assistant', content: answer }]);
      setReply(answer);
      setNamed(namedIn(answer, shop.menu));
      if (soundOn) {
        setState('talking');
        const handle = await speakReply(mascot.id, answer);
        if (mine !== turn.current) {
          handle.cancel();
          return;
        }
        speaking.current = handle;
        await handle.done;
      }
      if (mine === turn.current) setState('idle');
    } catch (err) {
      if (mine !== turn.current) return;
      setState('idle');
      setError(err instanceof RateLimitError ? err.message : `${name} didn’t hear you. Try again in a moment.`);
    }
  };

  useEffect(() => {
    if (greet) void ask(greet);
    // Once, as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => {
    if (state === 'listening') {
      recognition.current?.stop();
      return;
    }
    turn.current++;
    hush();
    const handle = listenOnce({
      onPartial: () => {},
      onFinal: (text) => {
        recognition.current = null;
        setState('idle');
        void ask(text);
      },
      onError: (code) => {
        recognition.current = null;
        setState('idle');
        setError(code === 'not-allowed' ? 'The mic is blocked: allow it in the browser, or type instead.' : 'Couldn’t hear that. Try again, or type instead.');
      },
    });
    if (handle) {
      recognition.current = handle;
      setState('listening');
      setError(null);
    } else {
      setTyping(true);
    }
  };

  const toggleSound = () => setSoundOn((on) => {
    saveSoundPref(!on);
    if (on) hush();
    return !on;
  });

  const pill = state === 'listening' ? 'Listening…' : state === 'thinking' ? `${name} is thinking…` : state === 'talking' ? `${name} is talking` : `Ask ${name} about ${shop.name}`;
  const row = named ?? shop.menu.find((item) => item.price !== null) ?? null;

  return (
    <div className={`talk-screen is-${state}`} role="dialog" aria-modal="true" aria-label={`Talk to ${mascot.name}`} style={{ '--c': section.color } as CSSProperties}>
      <div className="talk-top">
        <button type="button" className="icon-btn glass" onClick={onClose} aria-label="Back"><Icon name="back" /></button>
        <div className="talk-who"><b>{mascot.name}</b><span>{shop.name} · {section.label}</span></div>
        <button type="button" className="icon-btn glass" onClick={toggleSound} aria-label={soundOn ? 'Turn the voice off' : 'Turn the voice on'}>
          <Icon name={soundOn ? 'sound' : 'mute'} />
        </button>
      </div>

      <div className="talk-stage">
        <span className="ring r1" /><span className="ring r2" /><span className="ring r3" />
        <Podium mascot={mascot} color={section.color} height={260} grey={shop.status === 'closed'} className="talk-podium" />
      </div>

      <div className="talk-pill" role="status">
        {state === 'talking' && <span className="bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>}
        {pill}
      </div>
      <p className="sr-only" aria-live="polite">{reply ? `${name} said: ${reply}` : ''}</p>
      {!soundOn && reply && <p className="talk-text">{reply}</p>}
      {error && <p className="talk-error" role="alert">{error}</p>}

      <div className="talk-hints">
        {HINTS.map((hint) => (
          <button key={hint.label} type="button" className="glass" aria-disabled={state === 'thinking'} onClick={() => void ask(hint.send)}>{hint.label}</button>
        ))}
      </div>

      <div className="talk-card">
        <Compare shop={shop} menu={shop.menu} mode="compact" />
        {row && (
          <div className="talk-named">
            <MenuRow item={row} color={section.color} highlight={!!named} />
            {named && <span className="talk-named-note">{name} is talking about this</span>}
          </div>
        )}
      </div>

      {typing && (
        <form className="talk-type" onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
          setDraft('');
        }}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} placeholder={`Ask ${name}…`} aria-label={`Message for ${mascot.name}`} />
          <button type="submit" className="btn-go small" disabled={!draft.trim() || state === 'thinking'}>Ask</button>
        </form>
      )}

      <div className="talk-controls">
        <a className="icon-btn glass round" href={`#/shop/${shop.slug}`} onClick={onClose} aria-label="See the menu"><Icon name="list" /></a>
        <button type="button" autoFocus className={`mic${state === 'listening' ? ' is-on' : ''}`} onClick={toggleMic} aria-label={state === 'listening' ? 'Stop listening' : `Talk to ${name}`}>
          <Icon name="mic" size={30} stroke={2.4} />
        </button>
        <button type="button" className="icon-btn glass round" onClick={() => setTyping((t) => !t)} aria-label="Type instead"><Icon name="receipt" /></button>
      </div>
      <p className="talk-tip">{speechSupported() ? 'Tap to talk · tap again to stop' : 'Type your question: this browser can’t listen'}</p>
    </div>
  );
}
