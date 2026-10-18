import { useCallback, useEffect, useRef, useState } from 'react';
import { FRIENDS, type Friend, type Character } from '../../src/friends';
import { askGroup, RateLimitError, type GroupMessage, type GroupSpeaker } from './talk';
import { listenOnce, speechSupported, type RecognitionHandle } from './speech';
import { loadSoundPref, saveSoundPref } from './voices';
import { kokoroUnavailable, loadKokoro, speakReply, stopAllSpeaking, type SpeakHandle } from './kokoro';
import { useSaathRig } from './useSaathRig';

type HangoutMessage = GroupMessage & { id: number };

const BANTER_DELAY_MS = 12_000;
const MAX_BANTER_IN_A_ROW = 6;

/** Name patterns → friend id, for detecting who the user is addressing. */
const NAME_PATTERNS: Array<{ id: Exclude<GroupSpeaker, 'user'>; re: RegExp }> = [
  { id: 'doraemon', re: /\bdoraemon\b/i },
  { id: 'nobita', re: /\bnobita\b/i },
  { id: 'shinchan', re: /\bshin[\s-]?chan\b/i },
  { id: 'goku', re: /\bgoku\b/i },
];

function detectAddressee(text: string): Exclude<GroupSpeaker, 'user'> | null {
  for (const { id, re } of NAME_PATTERNS) {
    if (re.test(text)) return id;
  }
  return null;
}

function friendById(id: string): Friend | undefined {
  return FRIENDS.find((f) => f.id === id);
}

function friendName(id: string): string {
  return friendById(id)?.name.split(' ')[0] ?? id;
}

/** One rig tile in the hangout grid. */
function RigTile({ friend, speaking, clip }: {
  friend: Friend;
  speaking: boolean;
  clip: string;
}) {
  const { frame, ready, timedOut, wave } = useSaathRig(friend.character, 'arrive');

  useEffect(() => {
    if (ready && clip === 'hi') wave(clip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, ready]);

  return (
    <div className={`hangout-rig ${speaking ? 'is-speaking' : ''}`} style={{ ['--friend-color' as string]: friend.color }}>
      <iframe
        ref={frame}
        className="hangout-frame"
        src={`/rigs/${friend.character}.html`}
        title={`${friend.name} in the hangout`}
      />
      {!ready && !timedOut && <div className="hangout-rig-loading">{friend.name.split(' ')[0]}…</div>}
      {timedOut && <div className="hangout-rig-loading">Couldn’t load {friend.name.split(' ')[0]}.</div>}
      <span className="hangout-rig-name">{friend.name.split(' ')[0]}</span>
    </div>
  );
}

export default function HangoutPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<HangoutMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [listening, setListening] = useState(false);
  const [soundOn, setSoundOn] = useState(() => loadSoundPref());
  const [error, setError] = useState<string | null>(null);
  const [micHint, setMicHint] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [waitingPrompt, setWaitingPrompt] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  // Source of truth for async callbacks; appendMessage keeps it in step with state.
  const messagesRef = useRef<HangoutMessage[]>([]);
  const recognition = useRef<RecognitionHandle | null>(null);
  const currentSpeak = useRef<SpeakHandle | null>(null);
  const msgId = useRef(0);
  const banterCount = useRef(0);
  const banterTimer = useRef<number | undefined>(undefined);
  const panelOpen = useRef(true);

  // The clip to trigger on each rig — 'hi' when speaking, 'arrive' otherwise.
  const clipFor = useCallback((character: Character, isSpeaking: boolean) => {
    return isSpeaking ? 'hi' : 'arrive';
  }, []);

  const nextId = () => ++msgId.current;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, waiting]);

  // Preload Kokoro when the hangout opens.
  useEffect(() => {
    if (kokoroUnavailable()) return;
    loadKokoro().catch(() => {});
  }, []);

  // Cleanup on close.
  useEffect(() => {
    panelOpen.current = true;
    return () => {
      panelOpen.current = false;
      currentSpeak.current?.cancel();
      currentSpeak.current = null;
      stopAllSpeaking();
      window.clearTimeout(banterTimer.current);
    };
  }, []);

  // Start the friends chatting once the user has been quiet for a while.
  useEffect(() => {
    scheduleBanter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause banter while the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(banterTimer.current);
      } else if (panelOpen.current && !waiting && !listening) {
        scheduleBanter();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, listening]);

  const cancelBanter = () => {
    window.clearTimeout(banterTimer.current);
    banterCount.current = 0;
    setWaitingPrompt(false);
  };

  const scheduleBanter = useCallback(() => {
    window.clearTimeout(banterTimer.current);
    if (!panelOpen.current || document.hidden) return;
    banterTimer.current = window.setTimeout(() => {
      void runBanter();
    }, BANTER_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Speak a line with the friend's voice, trigger their rig, and wait for playback to finish. */
  const speakLine = useCallback(async (speakerId: string, text: string): Promise<void> => {
    setSpeakingId(speakerId);
    // Trigger the rig wave.
    const friend = friendById(speakerId);
    if (friend) {
      // Rig wave is handled via the clip prop change in RigTile.
    }
    if (soundOn) {
      currentSpeak.current?.cancel();
      const handle = await speakReply(speakerId, text);
      currentSpeak.current = handle;
      await handle.done;
    } else {
      // No voice — just pause briefly so the bubble is readable.
      await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    }
    setSpeakingId(null);
  }, [soundOn]);

  /** Append a message and return the updated list. */
  const appendMessage = useCallback((speaker: GroupSpeaker, text: string): HangoutMessage[] => {
    const updated = [...messagesRef.current, { id: nextId(), speaker, text }];
    messagesRef.current = updated;
    setMessages(updated);
    return updated;
  }, []);

  /** Request the next group line from the edge function and speak it. */
  const requestAndSpeak = useCallback(async (
    history: GroupMessage[],
    addressee: Exclude<GroupSpeaker, 'user'> | null,
  ): Promise<boolean> => {
    setWaiting(true);
    setError(null);
    try {
      const result = await askGroup(history.slice(-16), addressee);
      const updated = appendMessage(result.speaker, result.reply);
      await speakLine(result.speaker, result.reply);
      return true;
    } catch (err) {
      if (err instanceof RateLimitError) {
        appendMessage('doraemon', err.message);
      } else {
        setError('They didn’t catch that — try again in a moment.');
      }
      return false;
    } finally {
      setWaiting(false);
    }
  }, [appendMessage, speakLine]);

  /** NPC banter: request a line with no addressee. */
  const runBanter = useCallback(async () => {
    if (!panelOpen.current || document.hidden || waiting) return;
    if (banterCount.current >= MAX_BANTER_IN_A_ROW) {
      setWaitingPrompt(true);
      return;
    }
    banterCount.current += 1;
    // Build history from current messages.
    const history: GroupMessage[] = messagesRef.current.map((m) => ({ speaker: m.speaker, text: m.text }));
    // The function needs at least one line; open an empty hangout with a scene cue (not shown in the log).
    if (history.length === 0) history.push({ speaker: 'user', text: '(You four are hanging out together in Pune. Someone starts chatting.)' });
    await requestAndSpeak(history, null);
    if (banterCount.current < MAX_BANTER_IN_A_ROW) {
      scheduleBanter();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestAndSpeak, scheduleBanter]);

  /** User sends a message (typed or mic). */
  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || waiting) return;

    // User speaking cancels queued banter.
    cancelBanter();
    setWaitingPrompt(false);

    const addressee = detectAddressee(content);
    const updated = appendMessage('user', content);
    const history: GroupMessage[] = updated.map((m) => ({ speaker: m.speaker, text: m.text }));
    await requestAndSpeak(history, addressee);
    // After the user speaks, reset banter and schedule the next one.
    banterCount.current = 0;
    scheduleBanter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appendMessage, requestAndSpeak, scheduleBanter, waiting]);

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
        if (code === 'not-allowed') setMicHint('Mic blocked — allow it in the browser');
        else if (code === 'network') setMicHint('Mic needs Chrome with Google speech');
        else setMicHint(null);
      },
    });
    if (handle) {
      recognition.current = handle;
      setListening(true);
      setError(null);
    }
  };

  const close = () => {
    currentSpeak.current?.cancel();
    currentSpeak.current = null;
    stopAllSpeaking();
    cancelBanter();
    onClose();
  };

  return (
    <div className="hangout" role="dialog" aria-label="Hangout with all four friends">
      <div className="hangout-head">
        <h3 className="hangout-title">Hangout</h3>
        <button
          className="talk-sound"
          onClick={toggleSound}
          aria-label={soundOn ? 'Turn voice off' : 'Turn voice on'}
          title={soundOn ? 'Voice on' : 'Voice off'}
        >
          {soundOn ? '🔊' : '🔇'}
        </button>
        <button className="watch-close talk-close" onClick={close} aria-label="Leave the hangout">
          ✕
        </button>
      </div>

      <div className="hangout-rigs">
        {FRIENDS.map((friend) => (
          <RigTile
            key={friend.id}
            friend={friend}
            speaking={speakingId === friend.id}
            clip={clipFor(friend.character, speakingId === friend.id)}
          />
        ))}
      </div>

      <div className="hangout-scroll" ref={scroller}>
        {messages.length === 0 && !waiting && (
          <p className="talk-empty">Say hello to everyone!</p>
        )}
        {messages.map((message) => (
          message.speaker === 'user' ? (
            <p key={message.id} className="talk-bubble is-user">{message.text}</p>
          ) : (
            <span
              key={message.id}
              className="talk-bubble is-friend"
              style={{ ['--friend-color' as string]: friendById(message.speaker)?.color ?? 'var(--ink)' }}
            >
              <strong className="hangout-speaker">{friendName(message.speaker)}:</strong> {message.text}
            </span>
          )
        ))}
        {waiting && <p className="talk-bubble is-friend talk-waiting">…</p>}
        {listening && <p className="talk-listening">Listening…</p>}
        {waitingPrompt && <p className="talk-note" role="status">They’re waiting for you…</p>}
        {error && <p className="talk-error" role="alert">{error}</p>}
      </div>

      <form
        className="talk-form hangout-form"
        onSubmit={(event) => {
          event.preventDefault();
          recognition.current?.stop();
          setMicHint(null);
          const text = draft;
          setDraft('');
          void send(text);
        }}
      >
        <input
          className="talk-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={micHint ?? 'Say something to everyone…'}
          maxLength={300}
          aria-label="Message for the hangout"
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
