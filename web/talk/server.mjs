// The talk server: a business mascot's reply from Claude, streamed, then spoken by ElevenLabs one sentence at a time with the time of each character, sent on as one JSON object per line (notes/talking-design.md, "The protocol"):
//   {type:'cue', emotion, action, long?, menu?} · {type:'audio', s, text, pcm, chars, starts, ends}… · {type:'done', reply} | {type:'error', message}
// (menu: the reply names items or prices from the shop's list, so a page can show it)
// (long: a listening turn, [emotion|action|long] in the reply, up to about a minute of talk on its own; a listening
// question such as "tell me a story" gets the same room even when the reply forgot the tag)
// (text: the sentence as written, for the cloud over his head; chars: as spoken, so "129.3" may be spelled out)
// hear() writes down a recording, for browsers that can't turn speech into words themselves (Brave, Firefox).
// talk() and hear() use only fetch, the Anthropic SDK and imports, so a Bolt server function can wrap them the way
// web/serve.mjs does. Keys come from the environment and are never logged; nor is anything anyone says.
import Anthropic from '@anthropic-ai/sdk';
import { MASCOT_RULES, mascotAlone, mascotOf, mascotPrompt, shopData } from './prompts.mjs';
import { replyParser, wantsToListen } from './reply.mjs';

const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: false, speed: 1 };
const OOPS = 'Oops, I can’t talk right now. Try again?', NOTHING = 'Hmm… ask me something else!';
// A listening turn runs to about 170 words, so Claude may write 400 tokens (a short reply uses about 60), and once the
// cue says long the deadline is four times as long (80 s); the voice is still made one sentence at a time.
const MAX_TOKENS = 400, LONG_DEADLINES = 4;
const voiceBase = () => process.env.ELEVEN_LABS_URL || 'https://api.elevenlabs.io';
// Everything in Claude's request before the messages: identical for warm() and talk(), or the cache misses. A mascot
// gets the mascot rules and its cached block, then its shop's live SHOP DATA uncached (a new status or price never
// misses the cache). A mascot asked by its own id (friend) has no shop; any other id, or bad shop data, throws.
const CACHE = { type: 'ephemeral', ttl: '1h' };
const prompt = ({ friend, shop = mascotAlone(friend) }) => {
  if (!shop) throw new Error(`unknown friend: ${friend}`);
  return {
    model: 'claude-haiku-5-5', thinking: { type: 'disabled' }, output_config: { effort: 'low' },
    system: [{ type: 'text', text: MASCOT_RULES }, { type: 'text', text: mascotPrompt(shop), cache_control: CACHE }, { type: 'text', text: shopData(shop) }],
  };
};

// Warming up while they are still talking (on a mic press): opens both connections and refreshes the cached prompt,
// so the reply that follows starts sooner. who: a mascot's id, or a shop's data (a shop's id alone has nothing to warm).
// Never throws.
export async function warm(who) {
  const claude = process.env.CLAUDE_API_KEY, voice = process.env.ELEVEN_LABS_API_KEY;
  let request;
  try { request = prompt(typeof who === 'string' ? { friend: who } : { shop: who }); } catch { return; }
  if (!claude || !voice) return;
  await Promise.allSettled([
    new Anthropic({ apiKey: claude, maxRetries: 0, timeout: 10_000 }).messages.create({ ...request, max_tokens: 0, messages: [{ role: 'user', content: 'hi' }] }),
    fetch(`${voiceBase()}/v1/models`, { headers: { 'xi-api-key': voice } }).then((r) => r.arrayBuffer()),
  ]);
}

// One line of the response body at a time (ElevenLabs streams one JSON object per line).
async function* lines(body) {
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true });
    for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) if (buf.slice(0, i).trim()) yield buf.slice(0, i);
  }
  if (buf.trim()) yield buf;
}

// One sentence in the friend's voice: audio chunks with the timings of what is actually spoken, each with the sentence.
async function speak({ key, voice, text, previous, s, send, signal }) {
  const res = await fetch(`${voiceBase()}/v1/text-to-speech/${voice}/stream/with-timestamps?output_format=pcm_24000`, {
    method: 'POST', signal, headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', ...(previous && { previous_text: previous }), voice_settings: VOICE_SETTINGS }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
  for await (const line of lines(res.body)) {
    const c = JSON.parse(line), a = c.normalized_alignment ?? c.alignment;
    if (c.audio_base64) send({ type: 'audio', s, text, pcm: c.audio_base64, chars: a?.characters ?? [], starts: a?.character_start_times_seconds ?? [], ends: a?.character_end_times_seconds ?? [] });
  }
}

// What a child said, from a recording: ElevenLabs Scribe writes it down in English, without "(laughter)" tags.
// audio: the recording's bytes; type: its media type (audio/webm …). -> { text } or { error } to show.
export async function hear(audio, type, signal) {
  const key = process.env.ELEVEN_LABS_API_KEY;
  if (!key) return { error: 'Talking isn’t set up on the laptop yet.' };
  const form = new FormData(), t0 = performance.now();
  for (const [k, v] of Object.entries({ model_id: 'scribe_v2', language_code: 'en', tag_audio_events: 'false' })) form.append(k, v);
  form.append('file', new Blob([audio], { type }), `speech.${type.split('/')[1]}`);
  try {
    const res = await fetch(`${voiceBase()}/v1/speech-to-text`, { method: 'POST', signal, headers: { 'xi-api-key': key }, body: form });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
    const text = ((await res.json()).text ?? '').trim();
    console.log(`hear: ${Math.round(performance.now() - t0)} ms, ${Math.round(audio.length / 1000)} kB`);
    return { text };
  } catch (e) {
    if (!signal?.aborted) console.log(`hear failed: ${e.message}`);
    return { error: OOPS };
  }
}

// input: already checked by checkInput (web/talk/reply.mjs), with a shop's data in place of its id for a mascot.
// send(obj) writes one line; signal ends it all early. Bad shop data gives one error line and calls nothing. A shop's
// mascot is its own agent: its prompt, its stock voice and its gestures come from mascotOf (web/talk/prompts.mjs).
// friend: a mascot's id, for a page without a shop.
export async function talk({ friend, shop = mascotAlone(friend), text, history }, send, signal) {
  let request, mascot;
  try { request = prompt({ friend, shop }); mascot = shop && mascotOf(shop); } catch (e) { console.log(`talk: ${e.message}`); return send({ type: 'error', message: OOPS }); }
  const key = { claude: process.env.CLAUDE_API_KEY, voice: process.env.ELEVEN_LABS_API_KEY }, voice = mascot.voice;
  if (!key.claude || !key.voice || !voice) return send({ type: 'error', message: 'Talking isn’t set up on the laptop yet.' });
  const t0 = performance.now(), ms = () => Math.round(performance.now() - t0), times = {};
  const ac = new AbortController(), stop = () => ac.abort();
  signal?.addEventListener('abort', stop, { once: true });
  // Nothing may hang: the SDK's timeout stops once its headers arrive, and the voice's fetches have none.
  const deadlineMs = Number(process.env.TALK_DEADLINE_MS) || 20_000, listening = wantsToListen(text);
  let deadline = setTimeout(stop, deadlineMs * (listening ? LONG_DEADLINES : 1));

  // Each sentence is spoken as soon as it is complete, in order, while Claude is still writing the next.
  const said = [];
  let wake = () => {}, ended = false, failed = null, long = false;
  const parser = replyParser(mascot.actions, {
    onCue: (cue) => {
      times.cue = ms();
      if (cue.long) { long = true; clearTimeout(deadline); deadline = setTimeout(stop, deadlineMs * LONG_DEADLINES); }
      send({ type: 'cue', ...cue });
    },
    onSentence: (sentence) => { said.push(sentence); wake(); },
  }, { listening });
  const speaking = (async () => {
    for (let i = 0; ; i++) {
      while (i >= said.length && !ended) await new Promise((r) => (wake = r));
      if (i >= said.length) return;
      await speak({ key: key.voice, voice, text: said[i], previous: said.slice(0, i).join(' '), s: i, signal: ac.signal,
        send: (o) => { times.audio ??= ms(); send(o); } });
    }
  })().catch((e) => { failed ??= e; stop(); });

  let reply = null;
  try {
    const stream = new Anthropic({ apiKey: key.claude, maxRetries: 1, timeout: 15_000 }).messages.stream({
      ...request, max_tokens: MAX_TOKENS, messages: [...history, { role: 'user', content: text }],
    }, { signal: ac.signal });
    for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') parser.push(ev.delta.text);
    times.cached = (await stream.finalMessage()).usage?.cache_read_input_tokens ?? 0;
    reply = parser.end();
  } catch (e) { failed ??= e; stop(); }   // the error line replaces whatever was left to say
  ended = true; wake();
  await speaking;
  clearTimeout(deadline);
  signal?.removeEventListener('abort', stop);
  if (signal?.aborted) return;   // the page went away: nobody to tell
  console.log(`talk ${shop.id ?? friend ?? '-'}${long || listening ? ' (long)' : ''}: cue ${times.cue ?? '-'} ms, first audio ${times.audio ?? '-'} ms, all ${ms()} ms, cached ${times.cached ?? '-'} tokens${failed ? `, failed: ${failed.message}` : ''}`);
  if (failed) return send({ type: 'error', message: OOPS });
  if (!said.length) return send({ type: 'error', message: NOTHING });
  send({ type: 'done', reply });
}
