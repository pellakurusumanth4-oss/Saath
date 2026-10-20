// The browser engine's conversation memory, with fetch and the audio stubbed (no browser).
// Run: node --test "web/talk/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';

// Web Audio with a clock the tests move by hand (ctx.currentTime); sounds play into nowhere.
globalThis.AudioContext = class {
  state = 'running'; currentTime = 0; destination = {};
  constructor() { globalThis.__ctx = this; }
  resume() {}
  createBuffer(channels, length, rate) { const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data }; }
  createBufferSource() { return { connect() {}, start() {}, stop() { globalThis.__stopped++; } }; }   // counts sounds cut off
};
const asked = [];
let answer;
globalThis.fetch = async (url, init) => { const body = JSON.parse(init.body); asked.push(body); return answer(body); };
const { createTalk } = await import('./talk.js');

const reply = (text) => new Response([{ type: 'cue', emotion: 'happy', action: 'idle' }, { type: 'done', reply: text }].map((l) => JSON.stringify(l)).join('\n') + '\n');
const settle = () => new Promise((r) => setTimeout(r, 30));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 0.2 s of a loud tone as base64 16-bit PCM, and a reply whose second sentence comes `gap` ms after the first.
const pcm = Buffer.from(Int16Array.from({ length: 4800 }, (_, i) => Math.round(12000 * Math.sin(i / 6))).buffer).toString('base64');
const audio = (s, text) => ({ type: 'audio', s, text, pcm, chars: [...text], starts: [...text].map((_, i) => i * 0.04), ends: [...text].map((_, i) => i * 0.04 + 0.04) });
const late = (gap) => new Response(new ReadableStream({ async start(c) {
  const line = (o) => c.enqueue(new TextEncoder().encode(JSON.stringify(o) + '\n'));
  line({ type: 'cue', emotion: 'happy', action: 'idle' }); line(audio(0, 'Hi!'));
  await sleep(gap);
  line(audio(1, 'Bye!')); line({ type: 'done', reply: '[happy|idle] Hi! Bye!' }); c.close();
} }));

test('history keeps 1200 characters of each reply, as the server allows (a listening turn is about 1000), so a runaway breaks nothing', async () => {
  const talk = createTalk({ friend: 'juno', onEvent: () => {} });
  answer = () => reply('[sleepy|idle|long] ' + 'Ha ha. '.repeat(220));   // 1559 characters
  talk.send('tell me a story'); await settle();
  answer = () => reply('[happy|idle] Okay.');
  talk.send('and then?'); await settle();
  const { history } = asked.at(-1);
  assert.equal(history.length, 2);
  assert.ok(history[1].content.length <= 1200 && history[1].content.length > 400, `${history[1].content.length} characters`);
});

test('a question is kept to 300 characters, as the server allows', async () => {
  const talk = createTalk({ friend: 'juno', onEvent: () => {} });
  answer = () => reply('[happy|idle] Okay!');
  talk.send('so '.repeat(150)); await settle();
  assert.ok(asked.at(-1).text.length <= 300, `${asked.at(-1).text.length} characters`);
});

test('if the server turns the history down (400), it is forgotten, so the next question works', async () => {
  const talk = createTalk({ friend: 'juno', onEvent: () => {} });
  answer = () => reply('[happy|idle] Hi!');
  talk.send('hi'); await settle();
  answer = (body) => (body.history.length ? new Response('{"error":"bad history"}', { status: 400 }) : reply('[happy|idle] Hello again!'));
  talk.send('are you there?'); await settle();
  talk.send('hello?'); await settle();
  assert.deepEqual(asked.at(-1).history, []);
});

test('a sentence whose voice comes late keeps him talking: no idle face or empty cloud in the gap', async () => {
  const talk = createTalk({ friend: 'juno', onEvent: () => {} });
  answer = () => late(400);
  talk.send('hi'); await sleep(100);   // the first sentence is playing (0.05-0.25 s)
  const ctx = globalThis.__ctx;
  ctx.currentTime = 2;                 // its voice ended long ago, and the next one hasn't come
  const gap = { face: talk.face(), cloud: talk.cloud(), state: talk.state };
  await sleep(500);                    // the next sentence comes (it plays from 2.05 s), then done
  ctx.currentTime = 2.15;
  const next = { face: talk.face(), cloud: talk.cloud(), state: talk.state };
  ctx.currentTime = 9;
  const end = { face: talk.face(), state: talk.state };
  assert.ok(gap.face?.mouth === 'closed' && gap.cloud?.text === 'Hi!' && gap.state === 'speaking', JSON.stringify(gap));
  assert.ok(next.face && next.cloud?.text === 'Bye!' && next.state === 'speaking', JSON.stringify(next));
  assert.deepEqual(end, { face: null, state: 'idle' });
});

test('after he is cut off, face() is false (drop a held-back gesture); after he finishes, null (play it)', async () => {
  const talk = createTalk({ friend: 'juno', onEvent: () => {} });
  answer = () => late(300);
  talk.send('hi'); await sleep(100);
  globalThis.__ctx.currentTime = 0.1;
  assert.ok(talk.face(), 'talking');
  talk.stop();
  assert.equal(talk.face(), false);
  answer = () => late(0);
  talk.send('again'); await sleep(100);
  globalThis.__ctx.currentTime = 30;
  assert.equal(talk.face(), null);
});

test('an error after he has started talking lets him finish his sentence, then shows it', async () => {
  const errors = [];
  const talk = createTalk({ friend: 'juno', onEvent: (type, data) => type === 'error' && errors.push(data) });
  const OOPS = 'Oops, I can’t talk right now. Try again?';
  answer = () => new Response([{ type: 'cue', emotion: 'happy', action: 'idle' }, audio(0, 'Hi!'), { type: 'error', message: OOPS }].map((l) => JSON.stringify(l)).join('\n') + '\n');
  talk.send('hi'); globalThis.__stopped = 0;   // only what is cut off from here on counts
  await sleep(100);
  globalThis.__ctx.currentTime = 0.1;          // mid-sentence: the error has come, his voice hasn't ended
  const mid = { face: !!talk.face(), state: talk.state, stopped: globalThis.__stopped, errors: errors.length };
  globalThis.__ctx.currentTime = 9;            // his sentence and the pause after it are over
  const end = { face: talk.face(), state: talk.state, errors };
  assert.deepEqual(mid, { face: true, state: 'speaking', stopped: 0, errors: 0 });
  assert.deepEqual(end, { face: false, state: 'idle', errors: [OOPS] });
});


test('a shop\'s mascot: the page sends the shop\'s id instead of a friend, and the cue passes menu and long on', async () => {
  const events = [];
  const talk = createTalk({ shop: 'kettle-and-kulhad', onEvent: (type, data) => type === 'cue' && events.push(data) });
  answer = () => new Response([{ type: 'cue', emotion: 'happy', action: 'wave', menu: true }, { type: 'done', reply: '[happy|wave|menu] Try the chai.' }].map((l) => JSON.stringify(l)).join('\n') + '\n');
  talk.send("what's good here?"); await settle();
  const body = asked.at(-1);
  assert.equal(body.shop, 'kettle-and-kulhad');
  assert.equal('friend' in body, false);
  assert.deepEqual(events, [{ emotion: 'happy', action: 'wave', menu: true }]);
  talk.warm(); await settle();
  assert.deepEqual(asked.at(-1), { shop: 'kettle-and-kulhad', warm: true });
});

test('a long sentence\'s timings come in several chunks: the first part keeps its m, b and p', async () => {
  const talk = createTalk({ friend: 'juno', onEvent: () => {} });
  // one sentence in two 0.2 s chunks: "am" in the first (the m at 0.1-0.2 s), "aa" in the second
  const part = (chars, from) => ({ type: 'audio', s: 0, text: 'am aa', pcm, chars, starts: chars.map((_, i) => from + i * 0.1), ends: chars.map((_, i) => from + i * 0.1 + 0.1) });
  answer = () => new Response([{ type: 'cue', emotion: 'happy', action: 'idle' }, part(['a', 'm'], 0), part(['a', 'a'], 0.2), { type: 'done', reply: '[happy|idle] am aa' }]
    .map((l) => JSON.stringify(l)).join('\n') + '\n');
  globalThis.__ctx && (globalThis.__ctx.currentTime = 0);
  talk.send('hi'); await settle();
  __ctx.currentTime = 0.05 + 0.05;   // the voice started at 0.05: this drawing shows its 0.1-0.18 s, the m
  assert.equal(talk.face().mouth, 'closed');
  __ctx.currentTime = 0.05 + 0.3;
  assert.notEqual(talk.face().mouth, 'closed');
  talk.stop();
});
