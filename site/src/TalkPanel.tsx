import { useEffect, useRef, useState } from 'react';
import { askFriend, RateLimitError, type ChatMessage } from './talk';
import { listenOnce, speechSupported, type RecognitionHandle } from './speech';
import { loadSoundPref, saveSoundPref, speechVoicesReady, VOICES } from './voices';
import { elevenAvailable, kokoroUnavailable, loadKokoro, speakReply, stopAllSpeaking, subscribeKokoroState, type KokoroStatus, type SpeakHandle } from './kokoro';

type PanelMessage = ChatMessage & { replayable?: boolean };

type Chip = { label: string; send: string };

// The mascot answers about its shop: the menu, prices, today's special and how busy it is.
const SHOP_STARTERS: Chip[] = [
  { label: 'What’s good today?', send: 'What’s good here today?' },
  { label: 'Is it busy?', send: 'Is it busy right now?' },
  { label: 'How much do I save?', send: 'How much do I save if I walk over instead of ordering on a delivery app?' },
];

export default function TalkPanel({ friend, shop, onClose, onReplySpoken }: {
  /** The shop's mascot; its id picks its voice. */
  friend: { id: string; name: string };
  shop: { slug: string; name: string };
  onClose: () => void;
  onReplySpoken?: () => void;
}) {
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [listening, setListening] = useState(false);
  const [soundOn, setSoundOn] = useState(() => loadSoundPref());
  const [error, setError] = useState<string | null>(null);
  const [noVoices, setNoVoices] = useState(false);
  const [micHint, setMicHint] = useState<string | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [kokoroState, setKokoroState] = useState<KokoroStatus>('idle');
  const scroller = useRef<HTMLDivElement | null>(null);
  const recognition = useRef<RecognitionHandle | null>(null);
  const currentSpeak = useRef<SpeakHandle | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, waiting]);

  // Kick off Kokoro load as soon as a chat opens, so the first reply can use it.
  // With ElevenLabs set up, skip the 90 MB Kokoro download entirely.
  useEffect(() => {
    if (kokoroUnavailable()) return;
    let active = true;
    void elevenAvailable().then((eleven) => {
      if (eleven || !active) return;
      setVoiceLoading(true);
      loadKokoro()
        .catch(() => { /* state subscription marks it unavailable */ })
        .finally(() => { if (active) setVoiceLoading(false); });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => subscribeKokoroState(setKokoroState), []);

  // Cancel any playback when the chat closes.
  useEffect(() => () => {
    currentSpeak.current?.cancel();
    currentSpeak.current = null;
    stopAllSpeaking();
  }, []);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) {
      setNoVoices(true);
      return;
    }
    if (speechVoicesReady()) return;
    const check = setTimeout(() => setNoVoices(!speechVoicesReady()), 2000);
    const onVoicesChanged = () => {
      if (speechVoicesReady()) {
        setNoVoices(false);
        clearTimeout(check);
      }
    };
    synth.addEventListener('voiceschanged', onVoicesChanged);
    return () => {
      clearTimeout(check);
      synth.removeEventListener('voiceschanged', onVoicesChanged);
    };
  }, []);

  const toggleSound = () => {
    setSoundOn((prev) => {
      const next = !prev;
      saveSoundPref(next);
      if (!next) {
        currentSpeak.current?.cancel();
        currentSpeak.current = null;
        stopAllSpeaking();
      }
      return next;
    });
  };

  const speak = async (text: string) => {
    currentSpeak.current?.cancel();
    currentSpeak.current = null;
    const handle = await speakReply(friend.id, text);
    currentSpeak.current = handle;
  };

  const reply = (text: string) => {
    setMessages((prev) => [...prev, { role: 'assistant', content: text, replayable: true }]);
    if (soundOn) void speak(text);
    onReplySpoken?.();
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || waiting) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setDraft('');
    setWaiting(true);
    setError(null);
    // Cancel any previous playback when a new reply starts.
    currentSpeak.current?.cancel();
    currentSpeak.current = null;
    try {
      const answer = await askFriend(friend.id, next.slice(-12), shop.slug);
      reply(answer);
    } catch (err) {
      if (err instanceof RateLimitError) {
        setMessages((prev) => [...prev, { role: 'assistant', content: err.message }]);
      } else {
        setError(`${friend.name.split(' ')[0]} didn’t hear you — try again in a moment.`);
      }
    } finally {
      setWaiting(false);
    }
  };

  const toggleMic = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const handle = listenOnce({
      onPartial: (text) => setDraft(text),
      onFinal: (text) => {
        setListening(false);
        recognition.current = null;
        setDraft('');
        void send(text);
      },
      onError: (code) => {
        setListening(false);
        recognition.current = null;
        setError('Couldn’t hear that — try saying it again.');
        if (code === 'not-allowed') {
          setMicHint('Mic blocked — allow it in the browser');
        } else if (code === 'network') {
          setMicHint('Mic needs Chrome with Google speech');
        } else {
          setMicHint(null);
        }
      },
    });
    if (handle) {
      recognition.current = handle;
      setListening(true);
      setError(null);
    }
  };

  const starters = SHOP_STARTERS;
  const firstName = friend.name.split(' ')[0];
  const loadingVoice = voiceLoading && kokoroState === 'loading';

  return (
    <div className="watch talk" role="dialog" aria-label={`Talking with ${friend.name}`}>
      <div className="talk-head">
        <h3 className="talk-title">
          Talk to {friend.name} at {shop.name}
          {loadingVoice && <span className="talk-voice-loading"> Loading voice…</span>}
        </h3>
        <button
          className="talk-sound"
          onClick={toggleSound}
          aria-label={soundOn ? 'Turn voice off' : 'Turn voice on'}
          title={soundOn ? 'Voice on' : 'Voice off'}
        >
          {soundOn ? '🔊' : '🔇'}
        </button>
        <button
          className="watch-close talk-close"
          onClick={() => { currentSpeak.current?.cancel(); currentSpeak.current = null; stopAllSpeaking(); onClose(); }}
          aria-label={`Stop talking with ${friend.name}`}
        >
          ✕
        </button>
      </div>
      <div className="talk-scroll" ref={scroller}>
        {messages.length === 0 && !waiting && (
          <p className="talk-empty">Ask {firstName} about {shop.name}!</p>
        )}
        {messages.map((message, index) => (
          message.role === 'user' ? (
            <p key={index} className="talk-bubble is-user">{message.content}</p>
          ) : (
            <span key={index} className="talk-bubble is-friend">
              {message.content}
              {message.replayable && soundOn && (
                <button
                  className="talk-replay"
                  onClick={() => void speak(message.content)}
                  aria-label={`Play ${firstName}'s reply again`}
                  title="▶ play"
                >
                  ▶ play
                </button>
              )}
            </span>
          )
        ))}
        {waiting && <p className="talk-bubble is-friend talk-waiting">…</p>}
        {listening && <p className="talk-listening">Listening…</p>}
        {noVoices && kokoroState === 'unavailable' && (
          <p className="talk-note" role="status">This browser has no voices — try Chrome on your phone.</p>
        )}
        {error && <p className="talk-error" role="alert">{error}</p>}
      </div>
      <div className="talk-chips">
        {starters.map((chip) => (
          <button key={chip.label} className="talk-chip" disabled={waiting || listening} onClick={() => void send(chip.send)}>
            {chip.label}
          </button>
        ))}
      </div>
      <form
        className="talk-form"
        onSubmit={(event) => {
          event.preventDefault();
          recognition.current?.stop();
          setMicHint(null);
          void send(draft);
        }}
      >
        <input
          className="talk-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={micHint ?? `Say something to ${firstName}…`}
          maxLength={500}
          aria-label={`Message for ${friend.name}`}
        />
        {speechSupported() && (
          <button
            type="button"
            className={listening ? 'talk-mic is-active' : 'talk-mic'}
            onClick={toggleMic}
            aria-label={listening ? 'Stop listening' : 'Speak your message'}
            title={listening ? 'Stop listening' : '🎤 Speak'}
          >
            🎤
          </button>
        )}
        <button className="btn btn-yellow talk-send" type="submit" disabled={waiting || listening || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
