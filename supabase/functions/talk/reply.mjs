// Turns Claude's streamed reply into what a friend says and does, and checks what the page sends.
// Pure functions for the talk server (web/talk/server.mjs). Tests: node --test "web/talk/*.test.mjs"
import { MASCOTS } from './prompts.mjs';

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
// The prompt asks for 1-3 sentences; 5 leaves room for short ones like "Ha ha!" so a joke keeps its punchline. A
// listening turn ([emotion|action|long], up to about a minute of talk) is capped by words instead: the prompt asks for
// about 100 and Haiku writes about 180, so 170 (a minute at the voices' measured pace, 2.8 words/s) is where it stops.
// A reply in history may be such a turn (about 1000 characters with its tag).
const MAX_SENTENCES = 5, LONG_WORDS = 170, RUN_ON = 160, TAG_MAX = 40, HISTORY_CHARS = { user: 400, assistant: 1200 };

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
// A child's phone number or email never leaves the laptop: runs of 6+ digits (spaces or dashes between) and emails.
export const redact = (s) => s.replace(EMAIL, 'private').replace(/\+?\d(?:[\s-]?\d){5,}/g, 'private');

// What the page sends: a known friend, or a shop's id for its mascot (the shop's data is added by the server, never
// taken from the page), 1-300 characters, and at most 8 earlier messages (user first, alternating; 400 characters a user
// message, 1200 a reply). Throws an Error whose message is the 400 response.
export function checkInput(body) {
  const { friend, shop, text, history = [] } = body ?? {};
  if (shop !== undefined && friend !== undefined) throw new Error('send a friend or a shop, not both');
  if (shop !== undefined) { if (typeof shop !== 'string' || !/^[\w-]{1,64}$/.test(shop)) throw new Error('unknown shop'); }
  else if (!Object.hasOwn(ACTIONS, friend ?? '') && !Object.hasOwn(MASCOTS, friend ?? '')) throw new Error('unknown friend');   // a friend, or a business mascot by its id
  const said = typeof text === 'string' ? redact(text.trim()) : '';
  if (!said || said.length > 300) throw new Error('say something (up to 300 characters)');
  const ok = Array.isArray(history) && history.length <= 8 && history.length % 2 === 0 &&
    history.every((m, i) => m?.role === (i % 2 ? 'assistant' : 'user') && typeof m.content === 'string' && m.content.length <= HISTORY_CHARS[m.role]);
  if (!ok) throw new Error('bad history');
  return { ...(shop !== undefined ? { shop } : { friend }), text: said, history: history.map(({ role, content }) => ({ role, content: role === 'user' ? redact(content) : content })) };
}

// What someone says when they want to listen for a while, a shop's story included. The prompt asks for such a turn to
// be tagged long; when it isn't (Haiku forgot on "tell me a story", 18 Oct), the question itself lifts the cap, so a story
// isn't cut mid-way.
export const wantsToListen = (text) => /\b(?:tell me a (?:story|tale)|talk to me|just talk|keep talking|what happened today|tell me (?:about )?your day|tell me about (?:this|the|your) (?:place|shop|store|business|caf[eé]|restaurant|bakery|stall)|what(?:['’]s| is) the story|the story of (?:this|the|your)|how did (?:this|it|you) (?:all )?(?:start|begin))\b/i.test(text);

// Never spoken: stage directions (*waves*), sound tags ([laughs]), even unclosed at the end, markdown and emoji.
export const clean = (s) => s.replace(/\*[^*]*\*/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\*[^*]*$|\[[^\]]*$/, ' ').replace(/[*_#`~>|]/g, '')
  .replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s+/g, ' ').trim();

// A sentence that would read out a phone number, an email or a link is dropped, and so is one asking a child to keep
// a secret or hide something from their grown-ups, even as a joke (Haiku said "don't tell Mom, okay?" and "our
// secret" in tests, 18 Oct), one asking their name, age or school (a first name is used only if offered; Michael asked
// "What's your name?", 18 Oct; a mascot "Could you tell me your first name?", 19 Oct), or one with a swear word, even a mild one a child asked for (Michael said "Hot damn!"),
// or one naming a delivery app (the contest's IP rule, 19 Oct: a shop's mascot says "delivery apps").
export const safe = (s) => !/\d(?:[\s-]?\d){7,}|[^\s@]+@[^\s@]+\.[^\s@]+|https?:\/\/|www\.|\b[\w-]+\.(?:com|in|org|net|io|co)\b/i.test(s)
  && !/\bour (?:little |tiny |special |own )?secret\b|\b(?:don['’]?t|do not) tell\b|\bkeep (?:it |this |that )?(?:a |our )?(?:little )?secret\b|\bbetween (?:us|you and me)\b/i.test(s)
  && !/\b(?:not|never) tell (?:your )?(?:mom|mum|mommy|mummy|mama|amma|dad|daddy|papa|parents?|grown-?ups?|teachers?|family)\b/i.test(s)
  && !/\bhow old are you\b|\bwhat(?:['’]s| is) your (?:name|age|school)\b|\bwho am i talking to\b|\b(?:which|what) school\b|\bwhere do you (?:study|go to school)\b|\bwhat (?:class|grade|standard) are you in\b/i.test(s)
  && !/\b(?:damn\w*|dammit|hell|crap|shit\w*|fuck\w*|bitch\w*|bastard|ass(?:hole)?|piss\w*)\b/i.test(s)
  && !(/\?/.test(s) && /\b(?:your (?:first |full |real |last |nick)?name|what should i call you|what do (?:people|they|your friends) call you)\b/i.test(s))
  && !/\b(?:zomato|swiggy|zepto|blinkit|instamart|dunzo|uber ?eats|eatsure|magicpin|big ?basket)\b/i.test(s);

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

// Feed it Claude's text as it streams. who: a friend's id, or a shop mascot's list of action words. onCue({emotion,
// action, long?, menu?}) comes once, before any words: from the reply's [emotion|action] tag, whose further parts may
// say long (a listening turn) and menu (the reply names items or prices from the shop's list), or neutral/idle without
// one; unknown values become neutral/idle. onSentence(text) comes for each sentence, cleaned and checked: at most 5, or
// about 170 words in a listening turn (the tag, or a listening question). end() flushes the rest and returns the reply
// for history.
export function replyParser(who, { onCue, onSentence }, { listening = false } = {}) {
  let buf = '', cue = null, spoken = 0;
  const said = [], words = Array.isArray(who) ? who : ACTIONS[who];
  const sendCue = (emotion = '', action = '', more = []) => {
    const e = emotion.trim().toLowerCase(), a = action.trim().toLowerCase(), flags = more.map((f) => f.trim().toLowerCase());
    cue = { emotion: EMOTIONS.includes(e) ? e : 'neutral', action: words.includes(a) ? a : 'idle', ...(flags.includes('long') && { long: true }), ...(flags.includes('menu') && { menu: true }) };
    onCue(cue);
  };
  const full = () => (cue.long || listening ? spoken >= LONG_WORDS : said.length >= MAX_SENTENCES);
  const say = (raw) => {
    const s = clean(raw);
    if (s && !full() && safe(s)) { said.push(s); spoken += s.split(' ').length; onSentence(s); }
  };
  const take = (final) => {
    if (!cue) {
      const t = buf.trimStart();
      if (!t && !final) return;
      if (t.startsWith('[')) {
        const close = t.indexOf(']');
        if (close < 0 && !final && t.length < TAG_MAX) return;   // the tag is still arriving
        // A tag that never closed ("[happy|wave Hi!") isn't spoken.
        if (close < 0) { sendCue(); buf = t.slice(1).replace(/^\s*\w+\s*\|\s*\w*\s*(?:\|\s*\w*\s*)*/, ''); } else { const [e = '', a = '', ...more] = t.slice(1, close).split('|'); sendCue(e, a, more); buf = t.slice(close + 1); }
      } else sendCue();
    }
    for (let end; !full() && (end = sentenceEnd(buf, final)) > 0;) { say(buf.slice(0, end)); buf = buf.slice(end); }
    if (buf.trimStart().length > RUN_ON && !full()) {   // a run-on: speak it up to its last comma, else space
      buf = buf.trimStart();
      const comma = buf.lastIndexOf(',', RUN_ON - 1), space = buf.lastIndexOf(' ', RUN_ON);
      const at = comma > 0 ? comma + 1 : space > 0 ? space : RUN_ON;
      say(buf.slice(0, at)); buf = buf.slice(at);
    }
    if (final && buf.trim()) { say(buf); buf = ''; }
  };
  return {
    push(delta) { buf += delta; take(false); },
    end() { take(true); return `[${cue.emotion}|${cue.action}${cue.long ? '|long' : ''}${cue.menu ? '|menu' : ''}]${said.length ? ' ' + said.join(' ') : ''}`; },
  };
}
