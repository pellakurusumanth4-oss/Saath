// Serves web/ on http://127.0.0.1:8099 for the AR camera page (web/ar/), plus POST /api/talk and /api/hear
// (web/talk/server.mjs).
// On the phone, after `adb reverse tcp:8099 tcp:8099`, Chrome opens http://localhost:8099/ar/, which counts as a
// secure page, so WebXR is allowed. shortcut: needs the laptop plugged in; host web/ on HTTPS to go without it.
// The API keys come from ../.env.local (git-ignored, and outside web/, so never served); PORT picks another port.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ACTIONS, checkInput } from './talk/reply.mjs';
import { hear, talk, warm } from './talk/server.mjs';

const root = path.dirname(new URL(import.meta.url).pathname);
try { process.loadEnvFile(path.join(root, '..', '.env.local')); } catch {}   // without it, /api/talk says it isn't set up
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };

// A friend's reply as NDJSON lines; leaving the page (or interrupting) cuts it off upstream too.
// {friend, warm: true} (sent on a mic press) only warms the connections up, in the background.
async function api(req, res) {
  if ((req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') return res.writeHead(415, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'send JSON' }));
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 20_000) return res.writeHead(413).end(); }
  let input;
  try {
    const data = JSON.parse(body);
    if (data?.warm === true) {
      if (!Object.hasOwn(ACTIONS, data.friend ?? '')) throw new Error('unknown friend');
      warm(data.friend);
      return res.writeHead(204).end();
    }
    input = checkInput(data);
  } catch (e) { return res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e.message })); }
  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' });
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  await talk(input, (o) => { if (!res.destroyed) res.write(JSON.stringify(o) + '\n'); }, ac.signal);
  res.end();
}

// A recording to write down, from browsers that can't hear (web/talk/talk.js): audio only, up to 2 MB, as JSON
// { text } or { error }.
async function hearApi(req, res) {
  const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (!/^audio\/(webm|ogg|mp4|mpeg|wav)$/.test(type)) return res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'send audio' }));
  const parts = [];
  let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 2_000_000) return res.writeHead(413).end(); parts.push(chunk); }
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  const out = await hear(Buffer.concat(parts), type, ac.signal);
  if (!res.destroyed) res.writeHead(out.error ? 502 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(out));
}

// Only this laptop's own pages may spend credits. The Host must be local: a page elsewhere that rebinds its name to
// 127.0.0.1 is turned away. /api/talk takes JSON only: a cross-site form can't send that without asking first, and
// nothing here answers. Each address gets 60 API calls a minute; a question is up to three (warm, hear, talk).
// shortcut: a fixed window per address, which is one bucket while the server only listens on 127.0.0.1.
const LOCAL = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i, calls = new Map();
const tooMany = (ip) => {
  const now = Date.now(), c = calls.get(ip);
  if (!c || now - c.at > 60_000) { calls.set(ip, { at: now, n: 1 }); return false; }
  return ++c.n > 60;
};

// One bad request never stops the server: a URL that doesn't parse gets 400, and a client that leaves mid-upload
// (for await on its body throws) only loses its own connection.
http
  .createServer((req, res) => {
    if (req.method === 'POST' && (req.url === '/api/talk' || req.url === '/api/hear')) {
      if (!LOCAL.test(req.headers.host ?? '')) return res.writeHead(403).end();
      if (tooMany(req.socket.remoteAddress)) return res.writeHead(429).end();
      return (req.url === '/api/talk' ? api : hearApi)(req, res).catch(() => res.destroy());
    }
    let name;
    try { name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'); } catch { return res.writeHead(400).end('bad request'); }
    const file = path.join(root, path.normalize(name));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404, { 'cache-control': 'no-store' }).end('not found');
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  })
  .listen(Number(process.env.PORT) || 8099, '127.0.0.1', () => console.log('serving', root, 'on http://127.0.0.1:' + (Number(process.env.PORT) || 8099)));
