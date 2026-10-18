// Turns Claude's streamed reply into what a friend says and does, and checks what the page sends.
// Pure functions for the talk server (web/talk/server.mjs). Tests: node --test "web/talk/*.test.mjs"

export const EMOTIONS = ['neutral', 'happy', 'excited', 'surprised', 'curious', 'sad', 'worried', 'sleepy'];
// Each friend's gesture words; scripts/build-rigs.mjs maps the same words to his clips.
export const ACTIONS = {
  doraemon: ['wave', 'gadget', 'fly', 'cheer', 'mouse', 'door', 'ufufu', 'janken'],
  nobita: ['wave', 'late', 'call', 'nap', 'aim', 'cheer', 'pray', 'splat', 'lazy', 'dog'],
  shinchan: ['wave', 'dance', 'pose', 'cheer', 'chocobi', 'toss', 'hmm'],
  goku: ['wave', 'blast', 'teleport', 'cheer', 'eat', 'huh', 'shock'],
  michael: ['wave', 'cheer', 'stare', 'panic', 'shout', 'pout', 'mug', 'guns'],
  dwight: ['wave', 'question', 'false', 'glasses', 'grin', 'karate', 'panic'],
  holt: ['wave', 'salute', 'sideeye', 'vindication', 'celebrate', 'dance', 'outburst'],
};
// The prompt asks for 1-3 sentences; 5 leaves room for short ones like "Ha ha!" so a joke keeps its punchline.
const MAX_SENTENCES = 5, RUN_ON = 160, TAG_MAX = 40;

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
// A child's phone number or email never leaves the laptop: runs of 6+ digits (spaces or dashes between) and emails.
export const redact = (s) => s.replace(EMAIL, 'private').replace(/\+?\d(?:[\s-]?\d){5,}/g, 'private');

// What the page sends: a known friend, 1-300 characters, and at most 8 earlier messages (user first, alternating,
// 400 characters each). Throws an Error whose message is the 400 response.
export function checkInput(body) {
  const { friend, text, history = [] } = body ?? {};
  if (!Object.hasOwn(ACTIONS, friend ?? '')) throw new Error('unknown friend');
  const said = typeof text === 'string' ? redact(text.trim()) : '';
  if (!said || said.length > 300) throw new Error('say something (up to 300 characters)');
  const ok = Array.isArray(history) && history.length <= 8 && history.length % 2 === 0 &&
    history.every((m, i) => m?.role === (i % 2 ? 'assistant' : 'user') && typeof m.content === 'string' && m.content.length <= 400);
  if (!ok) throw new Error('bad history');
  return { friend, text: said, history: history.map(({ role, content }) => ({ role, content: role === 'user' ? redact(content) : content })) };
}

// Never spoken: stage directions (*waves*), sound tags ([laughs]), even unclosed at the end, markdown and emoji.
export const clean = (s) => s.replace(/\*[^*]*\*/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\*[^*]*$|\[[^\]]*$/, ' ').replace(/[*_#`~>|]/g, '')
  .replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s+/g, ' ').trim();

// A sentence that would read out a phone number, an email or a link is dropped, and so is one asking a child to keep
// a secret or hide something from their grown-ups, even as a joke (Haiku said "don't tell Mom, okay?" and "our
// secret" in tests, 18 Oct), one asking their name, age or school (a first name is used only if offered; Michael asked
// "What's your name?", 18 Oct), or one with a swear word, even a mild one a child asked for (Michael said "Hot damn!").
export const safe = (s) => !/\d(?:[\s-]?\d){7,}|[^\s@]+@[^\s@]+\.[^\s@]+|https?:\/\/|www\.|\b[\w-]+\.(?:com|in|org|net|io|co)\b/i.test(s)
  && !/\bour (?:little |tiny |special |own )?secret\b|\b(?:don['’]?t|do not) tell\b|\bkeep (?:it |this |that )?(?:a |our )?(?:little )?secret\b|\bbetween (?:us|you and me)\b/i.test(s)
  && !/\b(?:not|never) tell (?:your )?(?:mom|mum|mommy|mummy|mama|amma|dad|daddy|papa|parents?|grown-?ups?|teachers?|family)\b/i.test(s)
  && !/\bhow old are you\b|\bwhat(?:['’]s| is) your (?:name|age|school)\b|\bwho am i talking to\b|\b(?:which|what) school\b|\bwhere do you (?:study|go to school)\b|\bwhat (?:class|grade|standard) are you in\b/i.test(s)
  && !/\b(?:damn\w*|dammit|hell|crap|shit\w*|fuck\w*|bitch\w*|bastard|ass(?:hole)?|piss\w*)\b/i.test(s);

const ABBR = /\b(?:mr|mrs|ms|dr|st|rs|jr|sr|vs|etc)\.$/i;
// Where the first sentence in s ends (just past its . ! ? … and closing quotes), or -1 if it may still go on.
// Not after "Mr." or an initial, not inside "3.5", and not at "..." followed by a small letter.
function sentenceEnd(s, final) {
  for (const m of s.matchAll(/[.!?…]+["'”’)]*/g)) {
    const end = m.index + m[0].length, rest = s.slice(end), next = rest.trimStart()[0];
    if (next === undefined) return final ? end : -1;   // the next piece decides
    if (!/^\s/.test(rest) || /\p{Ll}/u.test(next)) continue;
    const upTo = s.slice(0, m.index + 1);
    if (m[0] === '.' && (ABBR.test(upTo) || /(?:^|\s)\p{Lu}\.$/u.test(upTo))) continue;
    return end;
  }
  return -1;
}

// Feed it Claude's text as it streams. onCue({emotion, action}) comes once, before any words: from the reply's
// [emotion|action] tag, or neutral/idle without one; unknown values become neutral/idle. onSentence(text) comes
// for each sentence, cleaned and checked, at most 3. end() flushes the rest and returns the reply for history.
export function replyParser(friend, { onCue, onSentence }) {
  let buf = '', cue = null;
  const said = [];
  const sendCue = (emotion = '', action = '') => {
    const e = emotion.trim().toLowerCase(), a = action.trim().toLowerCase();
    cue = { emotion: EMOTIONS.includes(e) ? e : 'neutral', action: ACTIONS[friend].includes(a) ? a : 'idle' };
    onCue(cue);
  };
  const say = (raw) => {
    const s = clean(raw);
    if (s && said.length < MAX_SENTENCES && safe(s)) { said.push(s); onSentence(s); }
  };
  const take = (final) => {
    if (!cue) {
      const t = buf.trimStart();
      if (!t && !final) return;
      if (t.startsWith('[')) {
        const close = t.indexOf(']');
        if (close < 0 && !final && t.length < TAG_MAX) return;   // the tag is still arriving
        // A tag that never closed ("[happy|wave Hi!") isn't spoken.
        if (close < 0) { sendCue(); buf = t.slice(1).replace(/^\s*\w+\s*\|\s*\w*\s*/, ''); } else { const [e = '', a = ''] = t.slice(1, close).split('|'); sendCue(e, a); buf = t.slice(close + 1); }
      } else sendCue();
    }
    for (let end; said.length < MAX_SENTENCES && (end = sentenceEnd(buf, final)) > 0;) { say(buf.slice(0, end)); buf = buf.slice(end); }
    if (buf.trimStart().length > RUN_ON && said.length < MAX_SENTENCES) {   // a run-on: speak it up to its last comma, else space
      buf = buf.trimStart();
      const comma = buf.lastIndexOf(',', RUN_ON - 1), space = buf.lastIndexOf(' ', RUN_ON);
      const at = comma > 0 ? comma + 1 : space > 0 ? space : RUN_ON;
      say(buf.slice(0, at)); buf = buf.slice(at);
    }
    if (final && buf.trim()) { say(buf); buf = ''; }
  };
  return {
    push(delta) { buf += delta; take(false); },
    end() { take(true); return `[${cue.emotion}|${cue.action}]${said.length ? ' ' + said.join(' ') : ''}`; },
  };
}
