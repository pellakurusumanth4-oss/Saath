// Run: node --test "web/talk/*.test.mjs". Fake Claude and ElevenLabs servers stand in for the real ones: no keys or
// credits are used, and nothing leaves the laptop.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hear, talk, warm } from './server.mjs';
import { RULES, PERSONAS } from './prompts.mjs';

const listen = (handler) => new Promise((r) => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => r(s)); });
const base = (s) => `http://127.0.0.1:${s.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readBody = async (req) => { let b = ''; for await (const c of req) b += c; return JSON.parse(b); };

// Claude: an SSE reply made of `pieces`, with `pause` ms after the first two; or an error status.
function fakeClaude({ pieces = [], status = 200, pause = 0 } = {}) {
  const seen = [];
  return listen(async (req, res) => {
    const call = { body: await readBody(req), key: req.headers['x-api-key'], closedEarly: false };
    seen.push(call);
    if (status !== 200) return res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }));
    if (!call.body.stream) return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'msg_0', type: 'message', role: 'assistant',
      model: 'claude-haiku-5-5', content: [], stop_reason: 'max_tokens', stop_sequence: null, usage: { input_tokens: 9, output_tokens: 0, cache_read_input_tokens: 2000 } }));
    res.on('close', () => { if (!res.writableFinished) call.closedEarly = true; });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 9, output_tokens: 1 } } });
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    for (const [i, text] of pieces.entries()) { if (i === 2 && pause) await sleep(pause); if (res.destroyed) return; ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text } }); }
    ev('content_block_stop', { index: 0 });
    ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } });
    ev('message_stop', {});
    res.end();
  }).then((server) => Object.assign(server, { seen }));
}

// ElevenLabs: each sentence comes back as two NDJSON chunks of silence, with timings for half the characters each.
function fakeVoice({ status = 200 } = {}) {
  const seen = [];
  return listen(async (req, res) => {
    const call = { method: req.method, path: req.url, body: req.method === 'GET' ? null : await readBody(req), key: req.headers['xi-api-key'] };
    seen.push(call);
    if (status !== 200) return res.writeHead(status).end('{"detail":"nope"}');
    if (req.method === 'GET') return res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
    res.writeHead(200, { 'content-type': 'application/json' });
    const chars = [...call.body.text], half = Math.ceil(chars.length / 2);
    for (const part of [chars.slice(0, half), chars.slice(half)]) {
      const times = part.map((_, i) => +(i * 0.05).toFixed(2));
      res.write(JSON.stringify({ audio_base64: Buffer.alloc(480).toString('base64'), alignment: null,
        normalized_alignment: { characters: part, character_start_times_seconds: times, character_end_times_seconds: times.map((t) => +(t + 0.05).toFixed(2)) } }) + '\n');
    }
    res.end();
  }).then((server) => Object.assign(server, { seen }));
}

// Runs talk() against the fakes and returns the lines it sent.
async function run({ claude, voice, input = { friend: 'nobita', text: 'what are you doing', history: [] }, signal, env = {} }) {
  Object.assign(process.env, { CLAUDE_API_KEY: 'test-claude', ELEVEN_LABS_API_KEY: 'test-voice', ANTHROPIC_BASE_URL: base(claude), ELEVEN_LABS_URL: base(voice) }, env);
  const lines = [];
  await talk(input, (o) => lines.push(o), signal);
  return lines;
}
const REPLY = ['[happy|wa', 've] Oh! You woke me ', 'up. Want to nap too?'];

test('a reply arrives as cue, then each sentence\'s audio in order, then done', async () => {
  const claude = await fakeClaude({ pieces: REPLY }), voice = await fakeVoice();
  const lines = await run({ claude, voice });
  assert.deepEqual(lines[0], { type: 'cue', emotion: 'happy', action: 'wave' });
  const audio = lines.filter((l) => l.type === 'audio');
  assert.deepEqual(audio.map((l) => l.s), [0, 0, 1, 1, 2, 2]);
  assert.deepEqual(lines.at(-1), { type: 'done', reply: '[happy|wave] Oh! You woke me up. Want to nap too?' });
  assert.equal(lines.length, 1 + 6 + 1);
  claude.close(); voice.close();
});

test('each audio line carries the PCM, the spoken characters\' times and its sentence as written (for the cloud)', async () => {
  const claude = await fakeClaude({ pieces: REPLY }), voice = await fakeVoice();
  const audio = (await run({ claude, voice })).filter((l) => l.type === 'audio'), first = audio[0];
  assert.deepEqual(audio.map((l) => l.text), ['Oh!', 'Oh!', 'You woke me up.', 'You woke me up.', 'Want to nap too?', 'Want to nap too?']);
  assert.equal(first.pcm, Buffer.alloc(480).toString('base64'));
  assert.deepEqual(first.chars, ['O', 'h']);
  assert.deepEqual([first.starts, first.ends], [[0, 0.05], [0.05, 0.1]]);
  claude.close(); voice.close();
});

test('Claude is asked with Haiku 5.5, thinking off, low effort, the cached persona, and the key from CLAUDE_API_KEY', async () => {
  const claude = await fakeClaude({ pieces: REPLY }), voice = await fakeVoice();
  const history = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '[happy|wave] Hi!' }];
  await run({ claude, voice, input: { friend: 'nobita', text: 'what are you doing', history } });
  const { body, key } = claude.seen[0];
  assert.equal(key, 'test-claude');
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.equal(body.max_tokens, 400);
  assert.equal(body.stream, true);
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.deepEqual(body.output_config, { effort: 'low' });
  assert.equal('temperature' in body, false);
  assert.deepEqual(body.system, [{ type: 'text', text: RULES }, { type: 'text', text: PERSONAS.nobita, cache_control: { type: 'ephemeral', ttl: '1h' } }]);
  assert.deepEqual(body.messages, [...history, { role: 'user', content: 'what are you doing' }]);
  claude.close(); voice.close();
});

test('ElevenLabs is asked for Flash v2.5 PCM with timings, one sentence at a time, with the sentences before it', async () => {
  const claude = await fakeClaude({ pieces: REPLY }), voice = await fakeVoice();
  await run({ claude, voice });
  assert.deepEqual(voice.seen.map((c) => c.body.text), ['Oh!', 'You woke me up.', 'Want to nap too?']);
  const [a, b] = voice.seen;
  assert.match(a.path, /^\/v1\/text-to-speech\/[\w-]+\/stream\/with-timestamps\?output_format=pcm_24000$/);
  assert.equal(a.key, 'test-voice');
  assert.equal(a.body.model_id, 'eleven_flash_v2_5');
  assert.deepEqual(a.body.voice_settings, { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: false, speed: 1 });
  assert.equal(a.body.previous_text, undefined);
  assert.equal(b.body.previous_text, 'Oh!');
  claude.close(); voice.close();
});

test('Claude failing gives one error line and nothing else', async () => {
  const claude = await fakeClaude({ status: 500 }), voice = await fakeVoice();
  const lines = await run({ claude, voice });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].type, 'error');
  assert.equal(voice.seen.length, 0);
  claude.close(); voice.close();
});

test('the voice failing gives an error line after the cue, and no done', async () => {
  const claude = await fakeClaude({ pieces: REPLY }), voice = await fakeVoice({ status: 401 });
  const lines = await run({ claude, voice });
  assert.deepEqual(lines.map((l) => l.type), ['cue', 'error']);
  claude.close(); voice.close();
});

test('without keys it says talking isn\'t set up, and calls nothing', async () => {
  const claude = await fakeClaude({ pieces: REPLY }), voice = await fakeVoice();
  const lines = await run({ claude, voice, env: { CLAUDE_API_KEY: '' } });
  assert.equal(lines.length, 1);
  assert.match(lines[0].message, /set up/);
  assert.equal(claude.seen.length + voice.seen.length, 0);
  claude.close(); voice.close();
});

test('a reply with no words to say (only a tag) gives an error line', async () => {
  const claude = await fakeClaude({ pieces: ['[sad|idle]'] }), voice = await fakeVoice();
  const lines = await run({ claude, voice });
  assert.deepEqual(lines.map((l) => l.type), ['cue', 'error']);
  claude.close(); voice.close();
});

test('when the page goes away mid-reply, Claude is cut off and nothing more is sent', async () => {
  const claude = await fakeClaude({ pieces: REPLY, pause: 1500 }), voice = await fakeVoice();
  const ac = new AbortController(), lines = [];
  Object.assign(process.env, { CLAUDE_API_KEY: 'test-claude', ELEVEN_LABS_API_KEY: 'test-voice', ANTHROPIC_BASE_URL: base(claude), ELEVEN_LABS_URL: base(voice) });
  const done = talk({ friend: 'nobita', text: 'hi', history: [] }, (o) => { lines.push(o); if (o.type === 'audio') ac.abort(); }, ac.signal);
  await done;
  await sleep(100);
  assert.equal(claude.seen[0].closedEarly, true);
  assert.ok(!lines.some((l) => l.type === 'done' || l.type === 'error'), JSON.stringify(lines.map((l) => l.type)));
  claude.close(); voice.close();
});

test('warming up (on a mic press): Claude gets the same prompt with max_tokens 0 and no stream, ElevenLabs a free GET', async () => {
  const claude = await fakeClaude({ pieces: REPLY }), voice = await fakeVoice();
  Object.assign(process.env, { CLAUDE_API_KEY: 'test-claude', ELEVEN_LABS_API_KEY: 'test-voice', ANTHROPIC_BASE_URL: base(claude), ELEVEN_LABS_URL: base(voice) });
  await warm('nobita');
  const { body, key } = claude.seen[0];
  assert.equal(key, 'test-claude');
  assert.equal(body.max_tokens, 0);
  assert.equal(body.stream, undefined);
  assert.deepEqual([body.model, body.thinking, body.output_config], ['claude-haiku-5-5', { type: 'disabled' }, { effort: 'low' }]);
  assert.deepEqual(body.system, [{ type: 'text', text: RULES }, { type: 'text', text: PERSONAS.nobita, cache_control: { type: 'ephemeral', ttl: '1h' } }]);
  assert.deepEqual(voice.seen.map((c) => [c.method, c.path, c.key]), [['GET', '/v1/models', 'test-voice']]);
  claude.close(); voice.close();
});

test('warming up never throws, even with the services down', async () => {
  const claude = await fakeClaude({ status: 500 }), voice = await fakeVoice({ status: 500 });
  Object.assign(process.env, { CLAUDE_API_KEY: 'test-claude', ELEVEN_LABS_API_KEY: 'test-voice', ANTHROPIC_BASE_URL: base(claude), ELEVEN_LABS_URL: base(voice) });
  await warm('nobita');
  claude.close(); voice.close();
});

test('serve.mjs: /api/talk streams NDJSON, rejects bad input, and never serves the key file', async () => {
  const claude = await fakeClaude({ pieces: REPLY }), voice = await fakeVoice();
  const port = 8197, root = fileURLToPath(new URL('..', import.meta.url));
  const child = spawn(process.execPath, ['serve.mjs'], { cwd: root, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), CLAUDE_API_KEY: 'test-claude', ELEVEN_LABS_API_KEY: 'test-voice', ANTHROPIC_BASE_URL: base(claude), ELEVEN_LABS_URL: base(voice) } });
  try {
    const at = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) { try { await fetch(at + '/'); break; } catch { await sleep(100); } }
    const post = (body) => fetch(at + '/api/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal((await post('{nope')).status, 400);
    const unknown = await post(JSON.stringify({ friend: 'tom', text: 'hi' }));
    assert.equal(unknown.status, 400);
    assert.match((await unknown.json()).error, /friend/);
    assert.equal((await post('x'.repeat(30000))).status, 413);
    assert.equal((await post(JSON.stringify({ friend: 'nobita', warm: true }))).status, 204);
    assert.equal((await post(JSON.stringify({ friend: 'tom', warm: true }))).status, 400);
    const ok = await post(JSON.stringify({ friend: 'nobita', text: 'what are you doing' }));
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /application\/x-ndjson/);
    const types = (await ok.text()).trim().split('\n').map((l) => JSON.parse(l).type);
    assert.deepEqual([types[0], types.at(-1)], ['cue', 'done']);
    for (const p of ['/.env.local', '/../.env.local', '/%2e%2e/.env.local']) assert.equal((await fetch(at + p)).status, 404, p);
  } finally { child.kill(); claude.close(); voice.close(); }
});

// ElevenLabs Scribe: answers with `text` (padded, as it comes), or an error status; keeps each request's form fields.
function fakeScribe({ text = 'what are you doing', status = 200 } = {}) {
  const seen = [];
  return listen(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers['content-type'] } }).formData(), file = form.get('file');
    seen.push({ path: req.url, key: req.headers['xi-api-key'], fields: Object.fromEntries([...form].filter(([k]) => k !== 'file')), file: file && { type: file.type, size: file.size } });
    if (status !== 200) return res.writeHead(status).end('{"detail":"nope"}');
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ language_code: 'eng', language_probability: 1, text: ` ${text} `, words: [] }));
  }).then((server) => Object.assign(server, { seen }));
}

test('hear(): a recording goes to Scribe v2 in English, without sound tags, with the key from ELEVEN_LABS_API_KEY; the words come back', async () => {
  const scribe = await fakeScribe();
  Object.assign(process.env, { ELEVEN_LABS_API_KEY: 'test-voice', ELEVEN_LABS_URL: base(scribe) });
  assert.deepEqual(await hear(Buffer.from('fake opus'), 'audio/webm'), { text: 'what are you doing' });
  const [call] = scribe.seen;
  assert.deepEqual([call.path, call.key], ['/v1/speech-to-text', 'test-voice']);
  assert.deepEqual(call.fields, { model_id: 'scribe_v2', language_code: 'en', tag_audio_events: 'false' });
  assert.deepEqual(call.file, { type: 'audio/webm', size: 9 });
  scribe.close();
});

test('hear(): a failed call or a missing key gives a message to show', async () => {
  const scribe = await fakeScribe({ status: 401 });
  Object.assign(process.env, { ELEVEN_LABS_API_KEY: 'test-voice', ELEVEN_LABS_URL: base(scribe) });
  assert.deepEqual(await hear(Buffer.from('x'), 'audio/webm'), { error: 'Oops, I can’t talk right now. Try again?' });
  delete process.env.ELEVEN_LABS_API_KEY;
  assert.deepEqual(await hear(Buffer.from('x'), 'audio/webm'), { error: 'Talking isn’t set up on the laptop yet.' });
  scribe.close();
});

test('serve.mjs: /api/hear takes audio only, up to 2 MB, and answers with the words', async () => {
  const scribe = await fakeScribe();
  const port = 8198, root = fileURLToPath(new URL('..', import.meta.url));
  const child = spawn(process.execPath, ['serve.mjs'], { cwd: root, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), ELEVEN_LABS_API_KEY: 'test-voice', ELEVEN_LABS_URL: base(scribe) } });
  try {
    const at = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) { try { await fetch(at + '/'); break; } catch { await sleep(100); } }
    const post = (type, body) => fetch(at + '/api/hear', { method: 'POST', headers: { 'content-type': type }, body });
    const ok = await post('audio/webm;codecs=opus', Buffer.from('fake opus'));
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { text: 'what are you doing' });
    assert.deepEqual(scribe.seen[0].file, { type: 'audio/webm', size: 9 });
    assert.equal((await post('text/plain', 'hi')).status, 400);
    assert.equal((await post('audio/webm', Buffer.alloc(2_100_000))).status, 413);
    assert.equal(scribe.seen.length, 1);
  } finally { child.kill(); scribe.close(); }
});

test('serve.mjs: a bad URL or a client that leaves mid-upload never stops the server', async () => {
  const port = 8199, root = fileURLToPath(new URL('..', import.meta.url));
  const child = spawn(process.execPath, ['serve.mjs'], { cwd: root, stdio: 'ignore', env: { ...process.env, PORT: String(port) } });
  try {
    const at = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) { try { await fetch(at + '/'); break; } catch { await sleep(100); } }
    const raw = (path) => new Promise((r) => http.get({ host: '127.0.0.1', port, path }, (res) => { res.resume(); r(res.statusCode); }).on('error', () => r('error')));
    assert.equal(await raw('/%'), 400);
    assert.equal(await raw('http://[/'), 400);
    for (const [url, type] of [['/api/talk', 'application/json'], ['/api/hear', 'audio/webm']]) await new Promise((r) => {   // part of a body, then gone
      const s = net.connect(port, '127.0.0.1', () => {
        s.write(`POST ${url} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: ${type}\r\nContent-Length: 1000\r\n\r\n{"fri`);
        setTimeout(() => { s.destroy(); r(); }, 100);
      });
    });
    await sleep(300);
    assert.equal(child.exitCode, null, 'the server is still running');
    assert.equal((await fetch(at + '/talk/')).status, 200);
  } finally { child.kill(); }
});

test('a reply that stalls mid-stream is cut off at the deadline: an error line, and Claude is let go', async () => {
  const claude = await fakeClaude({ pieces: REPLY, pause: 3000 }), voice = await fakeVoice();
  const t0 = performance.now();
  const lines = await run({ claude, voice, env: { TALK_DEADLINE_MS: '400' } });
  delete process.env.TALK_DEADLINE_MS;
  assert.ok(performance.now() - t0 < 1500, `took ${Math.round(performance.now() - t0)} ms`);
  assert.deepEqual(lines.at(-1), { type: 'error', message: 'Oops, I can’t talk right now. Try again?' });
  await sleep(50);
  assert.equal(claude.seen[0].closedEarly, true);
  claude.close(); voice.close();
});

test('serve.mjs: only this laptop\'s own pages may spend credits: JSON only, a local Host, 60 API calls a minute', async () => {
  const port = 8200, root = fileURLToPath(new URL('..', import.meta.url));
  const child = spawn(process.execPath, ['serve.mjs'], { cwd: root, stdio: 'ignore', env: { ...process.env, PORT: String(port) } });
  try {
    const at = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) { try { await fetch(at + '/'); break; } catch { await sleep(100); } }
    const post = (type, body = '{}') => fetch(at + '/api/talk', { method: 'POST', headers: { 'content-type': type }, body }).then((r) => r.status);
    assert.equal(await post('text/plain'), 415, 'a cross-site form can send text/plain without asking first');
    const fromHost = (host) => new Promise((r) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/api/talk', method: 'POST', headers: { host, 'content-type': 'application/json' } }, (res) => { res.resume(); r(res.statusCode); });
      req.on('error', () => r('error')); req.end('{nope');
    });
    assert.equal(await fromHost('evil.example'), 403, 'a rebound DNS name is turned away');
    assert.equal(await fromHost(`localhost:${port}`), 400);
    const codes = [];
    for (let i = 0; i < 62; i++) codes.push(await post('application/json', '{nope'));
    assert.equal(codes[0], 400);
    assert.equal(codes.at(-1), 429);
  } finally { child.kill(); }
});


// A listening turn: 12 sentences; two of them are complete before the fake's pause (after its first two pieces).
const STORY = ['[sleepy|lazy|long] Okay. ', 'This one is true. It', ' happened on a Sunday. ', ...Array.from({ length: 9 }, (_, i) => `Then came part ${i + 1}. `)];
const STORY_SENTENCES = ['Okay.', 'This one is true.', 'It happened on a Sunday.', ...Array.from({ length: 9 }, (_, i) => `Then came part ${i + 1}.`)];

test('a listening turn: the cue says long, all 12 sentences are spoken in order, the first before Claude has finished, and Claude may write 400 tokens', async () => {
  const claude = await fakeClaude({ pieces: STORY, pause: 600 }), voice = await fakeVoice();
  Object.assign(process.env, { CLAUDE_API_KEY: 'test-claude', ELEVEN_LABS_API_KEY: 'test-voice', ANTHROPIC_BASE_URL: base(claude), ELEVEN_LABS_URL: base(voice) });
  const t0 = performance.now(), at = [], lines = [];
  await talk({ friend: 'nobita', text: 'tell me a story', history: [] }, (o) => { at.push(Math.round(performance.now() - t0)); lines.push(o); });
  assert.deepEqual(lines[0], { type: 'cue', emotion: 'sleepy', action: 'lazy', long: true });
  assert.deepEqual(voice.seen.map((c) => c.body.text), STORY_SENTENCES);
  const first = lines.findIndex((l) => l.type === 'audio');
  assert.ok(at[first] < 500, `first audio at ${at[first]} ms: it should go before the 600 ms pause in Claude's reply ends`);
  assert.ok(at.at(-1) >= 600, `done at ${at.at(-1)} ms`);
  assert.deepEqual(lines.at(-1), { type: 'done', reply: '[sleepy|lazy|long] ' + STORY_SENTENCES.join(' ') });
  assert.equal(claude.seen[0].body.max_tokens, 400);
  claude.close(); voice.close();
});

test('a listening turn gets four times the deadline: a stall of twice the short deadline still finishes, one past the long deadline is cut', async () => {
  const voice = await fakeVoice(), slow = await fakeClaude({ pieces: STORY, pause: 700 }), stuck = await fakeClaude({ pieces: STORY, pause: 2500 });
  let lines = await run({ claude: slow, voice, input: { friend: 'nobita', text: 'tell me a story', history: [] }, env: { TALK_DEADLINE_MS: '300' } });   // long: 1200 ms
  assert.equal(lines.at(-1).type, 'done', JSON.stringify(lines.at(-1)));
  lines = await run({ claude: stuck, voice, input: { friend: 'nobita', text: 'tell me a story', history: [] }, env: { TALK_DEADLINE_MS: '300' } });
  delete process.env.TALK_DEADLINE_MS;
  assert.equal(lines.at(-1).type, 'error', JSON.stringify(lines.at(-1)));
  slow.close(); stuck.close(); voice.close();
});

test('cut off mid-story (the mic is held again): no later sentence is spoken, and nothing more is sent', async () => {
  const claude = await fakeClaude({ pieces: STORY, pause: 400 }), voice = await fakeVoice();
  Object.assign(process.env, { CLAUDE_API_KEY: 'test-claude', ELEVEN_LABS_API_KEY: 'test-voice', ANTHROPIC_BASE_URL: base(claude), ELEVEN_LABS_URL: base(voice) });
  const ac = new AbortController(), lines = [];
  await talk({ friend: 'nobita', text: 'tell me a story', history: [] }, (o) => { lines.push(o); if (o.type === 'audio' && o.s === 1) ac.abort(); }, ac.signal);
  await sleep(100);
  assert.deepEqual(voice.seen.map((c) => c.body.text), STORY_SENTENCES.slice(0, 2));
  assert.ok(!lines.some((l) => l.type === 'done' || l.type === 'error'), JSON.stringify(lines.map((l) => l.type)));
  assert.equal(claude.seen[0].closedEarly, true);
  claude.close(); voice.close();
});

test('a listening question whose reply forgot the long tag: the long deadline applies from the start and every sentence is spoken', async () => {
  const story = ['[sleepy|lazy] Okay. ', ...STORY.slice(1)];
  const claude = await fakeClaude({ pieces: story, pause: 700 }), voice = await fakeVoice();
  const lines = await run({ claude, voice, input: { friend: 'nobita', text: 'tell me a story', history: [] }, env: { TALK_DEADLINE_MS: '300' } });
  delete process.env.TALK_DEADLINE_MS;
  assert.deepEqual(lines[0], { type: 'cue', emotion: 'sleepy', action: 'lazy' });
  assert.deepEqual(voice.seen.map((c) => c.body.text), STORY_SENTENCES);
  assert.equal(lines.at(-1).type, 'done', JSON.stringify(lines.at(-1)));
  claude.close(); voice.close();
});

// A shop's mascot (web/talk/sample-shops.json: made-up shops).
import { MASCOTS, MASCOT_RULES, mascotPrompt, shopData } from './prompts.mjs';
import SHOPS from './sample-shops.json' with { type: 'json' };
import VOICES from './voices.json' with { type: 'json' };

test('a shop\'s mascot: Claude gets the mascot rules, the shop\'s cached block and its live SHOP DATA (not cached); the voice is the mascot\'s, the cue its own words and menu', async () => {
  const claude = await fakeClaude({ pieces: ['[happy|show|me', 'nu] Try the kulhad chai. ', 'It is thirty-five rupees.'] }), voice = await fakeVoice();
  const lines = await run({ claude, voice, input: { shop: SHOPS.cafe, text: "what's good here?", history: [] } });
  assert.deepEqual(lines[0], { type: 'cue', emotion: 'happy', action: 'show', menu: true });
  assert.deepEqual(claude.seen[0].body.system, [{ type: 'text', text: MASCOT_RULES }, { type: 'text', text: mascotPrompt(SHOPS.cafe), cache_control: { type: 'ephemeral', ttl: '1h' } }, { type: 'text', text: shopData(SHOPS.cafe) }]);
  assert.ok(voice.seen[0].path.includes(`/${MASCOTS.kiran.voice}/`), voice.seen[0].path);
  assert.deepEqual(lines.at(-1), { type: 'done', reply: '[happy|show|menu] Try the kulhad chai. It is thirty-five rupees.' });
  claude.close(); voice.close();
});

test('a mascot speaks in its own stock voice; a friend\'s voice or any other id is never used for it', async () => {
  const claude = await fakeClaude({ pieces: ['[happy|wave] Hello.'] }), voice = await fakeVoice();
  for (const v of ['Xb7hH8MSUJpSbSDYk0k2', 'LFWwdLzOs2fj7AQXGqNp', 'doraemon', null]) await run({ claude, voice, input: { shop: { ...SHOPS.cafe, mascot: { id: 'kiran', voice: v } }, text: 'hi', history: [] } });
  assert.deepEqual(voice.seen.map((c) => c.path.split('/')[3]), ['Xb7hH8MSUJpSbSDYk0k2', MASCOTS.kiran.voice, MASCOTS.kiran.voice, MASCOTS.kiran.voice]);
  assert.ok(!Object.values(VOICES).includes(MASCOTS.kiran.voice));
  claude.close(); voice.close();
});

test('a shop request with only its id, or with bad data, gives one error line and calls nothing', async () => {
  const claude = await fakeClaude({ pieces: REPLY }), voice = await fakeVoice();
  for (const shop of ['kettle-and-kulhad', { ...SHOPS.cafe, section: 'casino' }]) {
    const lines = await run({ claude, voice, input: { shop, text: 'hi', history: [] } });
    assert.deepEqual(lines, [{ type: 'error', message: 'Oops, I can’t talk right now. Try again?' }], JSON.stringify(shop).slice(0, 40));
  }
  assert.equal(claude.seen.length + voice.seen.length, 0);
  claude.close(); voice.close();
});

test('warming a shop\'s mascot sends the same system prompt talk() will', async () => {
  const claude = await fakeClaude({ pieces: REPLY }), voice = await fakeVoice();
  Object.assign(process.env, { CLAUDE_API_KEY: 'test-claude', ELEVEN_LABS_API_KEY: 'test-voice', ANTHROPIC_BASE_URL: base(claude), ELEVEN_LABS_URL: base(voice) });
  await warm(SHOPS.realestate);
  await warm('kettle-and-kulhad');   // only an id: nothing to warm, and it never throws
  assert.equal(claude.seen.length, 1);
  assert.deepEqual(claude.seen[0].body.system, [{ type: 'text', text: MASCOT_RULES }, { type: 'text', text: mascotPrompt(SHOPS.realestate), cache_control: { type: 'ephemeral', ttl: '1h' } }, { type: 'text', text: shopData(SHOPS.realestate) }]);
  claude.close(); voice.close();
});

test('a business mascot asked by its own id talks as itself: the mascot rules, its block with no shop, its stock voice and its gestures', async () => {
  const claude = await fakeClaude({ pieces: ['[happy|show] Hi, I am Juno.'] }), voice = await fakeVoice();
  const lines = await run({ claude, voice, input: { friend: 'juno', text: 'hi', history: [] } });
  const alone = { section: 'juice', mascot: { id: 'juno' } };
  assert.deepEqual(claude.seen[0].body.system, [{ type: 'text', text: MASCOT_RULES }, { type: 'text', text: mascotPrompt(alone), cache_control: { type: 'ephemeral', ttl: '1h' } }, { type: 'text', text: shopData(alone) }]);
  assert.ok(voice.seen[0].path.includes(`/${MASCOTS.juno.voice}/`), voice.seen[0].path);
  assert.deepEqual(lines[0], { type: 'cue', emotion: 'happy', action: 'show' });
  claude.close(); voice.close();
});
