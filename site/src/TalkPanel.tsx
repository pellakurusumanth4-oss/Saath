import { useEffect, useRef, useState } from 'react';
import type { Friend } from '../../src/friends';
import { askFriend, type ChatMessage } from './talk';
import { listenOnce, speechSupported, type RecognitionHandle } from './speech';
import { loadSoundPref, pickEnglishVoice, saveSoundPref, VOICES } from './voices';

type Chip = { label: string; send: string };

const STARTERS: Record<string, Chip[]> = {
  doraemon: [
    { label: 'Show me a gadget!', send: 'Show me a gadget from your pocket!' },
    { label: 'Want a dorayaki?', send: 'Want a dorayaki?' },
    { label: "What's in Pune?", send: 'What do you like about Pune?' },
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

function speak(friendId: string, text: string) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const settings = VOICES[friendId];
  if (settings) {
    utterance.pitch = settings.pitch;
    utterance.rate = settings.rate;
  }
  const voice = pickEnglishVoice(synth.getVoices());
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? 'en-IN';
  synth.speak(utterance);
}

export default function TalkPanel({ friend, onClose, onReplySpoken }: {
  friend: Friend;
  onClose: () => void;
  onReplySpoken?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [listening, setListening] = useState(false);
  const [soundOn, setSoundOn] = useState(() => loadSoundPref());
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const recognition = useRef<RecognitionHandle | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, waiting]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const toggleSound = () => {
    setSoundOn((prev) => {
      const next = !prev;
      saveSoundPref(next);
      if (!next) window.speechSynthesis?.cancel();
      return next;
    });
  };

  const reply = (text: string) => {
    setMessages((prev) => [...prev, { role: 'assistant', content: text }]);
    if (soundOn) speak(friend.character, text);
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
    try {
      const answer = await askFriend(friend.id, next.slice(-12));
      reply(answer);
    } catch {
      setError(`${friend.name.split(' ')[0]} didn’t hear you — try again in a moment.`);
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
      onError: () => {
        setListening(false);
        recognition.current = null;
        setError('Couldn’t hear that — try saying it again.');
      },
    });
    if (handle) {
      recognition.current = handle;
      setListening(true);
      setError(null);
    }
  };

  const starters = STARTERS[friend.character] ?? [];
  const firstName = friend.name.split(' ')[0];

  return (
    <div className="watch talk" role="dialog" aria-label={`Talking with ${friend.name}`}>
      <button className="watch-close" onClick={() => { window.speechSynthesis?.cancel(); onClose(); }} aria-label={`Stop talking with ${friend.name}`}>
        ✕
      </button>
      <div className="talk-head">
        <h3 className="talk-title">Talk to {friend.name}</h3>
        <button
          className="talk-sound"
          onClick={toggleSound}
          aria-label={soundOn ? 'Turn voice off' : 'Turn voice on'}
          title={soundOn ? 'Voice on' : 'Voice off'}
        >
          {soundOn ? '🔊' : '🔇'}
        </button>
      </div>
      <div className="talk-scroll" ref={scroller}>
        {messages.length === 0 && !waiting && (
          <p className="talk-empty">Say hello to {firstName}!</p>
        )}
        {messages.map((message, index) => (
          message.role === 'user' ? (
            <p key={index} className="talk-bubble is-user">{message.content}</p>
          ) : (
            <span key={index} className="talk-bubble is-friend">
              {message.content}
              <button
                className="talk-replay"
                onClick={() => speak(friend.character, message.content)}
                aria-label={`Play ${firstName}'s reply again`}
                title="▶ play"
              >
                ▶ play
              </button>
            </span>
          )
        ))}
        {waiting && <p className="talk-bubble is-friend talk-waiting">…</p>}
        {listening && <p className="talk-listening">Listening…</p>}
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
          void send(draft);
        }}
      >
        <input
          className="talk-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Say something to ${firstName}…`}
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
