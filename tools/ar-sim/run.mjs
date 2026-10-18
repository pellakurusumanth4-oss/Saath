// Saath AR simulator: plays a scenario (scenarios.mjs) on web/ar/ in headless Chrome as the Galaxy S24 would (384 x 832,
// touch, a 4x slower CPU), with sim-xr.js as ARCore and fake-talk.js as the voice (no paid calls), then checks and
// records it. Needs `node web/serve.mjs` (port 8099); starts its own headless Chrome on CDP port 9420 if none is there.
// ORIGIN=http://127.0.0.1:<port> and CDP_PORT=<port> point it at another copy of web/ and another Chrome.
//   node tools/ar-sim/run.mjs <scenario | all | all-friends> [--throttle 4] [--friend nobita]
// Writes tools/ar-sim/out/<scenario>/{video.mp4, sheet.png, report.json}; all-friends: out/all-friends/<friend>/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { FRIENDS, ROOMS, SCENARIOS } from './scenarios.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname), ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8099', PORT = Number(process.env.CDP_PORT) || 9420;
const argv = process.argv.slice(2), flag = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const WHICH = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')) ?? 'good-room';
const THROTTLE = Number(flag('throttle', 4)), FRIEND = flag('friend', 'nobita');
const INJECT = ['sim-xr.js', 'fake-talk.js'].map((f) => fs.readFileSync(path.join(HERE, f), 'utf8')).join('\n');
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const FEET_TIP = 'Point your phone at the floor by your feet';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chrome() {
  const up = () => fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.ok, () => false);
  if (await up()) return;
  // The laptop's GPU through ANGLE, as a phone has one (SwiftShader would make every frame look slow). Left running.
  spawn('google-chrome', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(os.tmpdir(), 'saath-ar-sim-chrome')}`, '--no-first-run',
    '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl-egl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 50; i++) { await sleep(200); if (await up()) return; }
  throw new Error(`no Chrome on CDP port ${PORT}`);
}

// A tab and a minimal CDP client for it.
async function openTab() {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let n = 0;
  const wait = new Map(), on = {}, errors = [];
  ws.addEventListener('message', (e) => {
    const d = JSON.parse(e.data);
    if (d.id) { wait.get(d.id)?.(d); wait.delete(d.id); return; }
    on[d.method]?.(d.params);
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((r) => { const id = ++n; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); })
    .then((d) => { if (d.error) throw new Error(`${method}: ${d.error.message}`); return d.result; });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  return { send, ev, on, errors, close: async () => { ws.close(); await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {}); } };
}
const centre = (tab, sel) => tab.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
const touch = (tab, type, xy) => tab.send('Input.dispatchTouchEvent', { type, touchPoints: xy ? [{ x: xy[0], y: xy[1] }] : [] });

// A recorded reply from ~/.cache/saath-recovery/talk (the friend's own, else Nobita's), streamed as the server would.
function talkPlan(friend) {
  const file = [friend, 'nobita'].map((f) => path.join(os.homedir(), `.cache/saath-recovery/talk/${f}.ndjson`)).find((f) => fs.existsSync(f));
  if (!file) return null;
  const texts = {}, lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { headMs: 400, lines: lines.map((l) => (l.type === 'audio' ? [30, { ...l, text: (texts[l.s] ??= (l.chars ?? []).join('')) }] : [0, l])) };
}

async function run(name, friend, out) {
  const sc = SCENARIOS[name], room = ROOMS[sc.room], [label, tall] = FRIENDS[friend];
  const tab = await openTab();
  try {
    await tab.send('Emulation.setDeviceMetricsOverride', { width: 384, height: 832, deviceScaleFactor: 1, mobile: true });
    await tab.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await tab.send('Emulation.setUserAgentOverride', { userAgent: UA, platform: 'Android' });
    await tab.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await tab.send('Browser.grantPermissions', { permissions: ['audioCapture'], origin: ORIGIN }).catch(() => {});
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__SIM = ${JSON.stringify({ room, script: sc.script, opts: sc.opts })};\n${INJECT}` });
    // Safety net: nothing under /api/ may reach the real server (paid APIs); fake-talk.js answers them in the page.
    let leaked = 0;
    tab.on['Fetch.requestPaused'] = ({ requestId }) => { leaked++; tab.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); };
    await tab.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
    await tab.send('Page.navigate', { url: `${ORIGIN}/ar/?friend=${friend}&name=${encodeURIComponent(label)}&tall=${tall}` });
    for (let i = 0; !(await tab.ev(`document.getElementById('start')?.textContent === 'Start AR'`).catch(() => false)); i++) {
      if (i > 300) throw new Error('the page never offered Start AR');
      await sleep(200);
    }
    const gl = await tab.ev(`(() => { const g = document.createElement('canvas').getContext('webgl2'), e = g?.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`);
    const reply = talkPlan(friend);
    if (reply) await tab.ev(`__api.plan = ${JSON.stringify(reply)}, true`);
    const frames = [];
    tab.on['Page.screencastFrame'] = ({ data, metadata, sessionId }) => { frames.push({ ts: metadata.timestamp, data }); tab.send('Page.screencastFrameAck', { sessionId }).catch(() => {}); };
    await tab.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
    await touch(tab, 'touchStart', await centre(tab, '#start')); await touch(tab, 'touchEnd');
    // The scenario plays itself in the page; this only holds the mic when the script asks.
    const started = Date.now();
    for (;; await sleep(100)) {
      const s = await tab.ev('window.__sim && { done: __sim.done, want: __sim.want, on: !!__sim.wall0 }');
      if (!s?.on && Date.now() - started > 10_000) throw new Error('tapping Start began no AR session');
      if (s?.want) {
        await tab.ev(`window.__say = ${JSON.stringify(s.want.say)}; __sim.want = null`);
        await touch(tab, 'touchStart', await centre(tab, '#mic')); await sleep(s.want.press * 1000); await touch(tab, 'touchEnd');
      }
      if (s?.done || Date.now() - started > 300_000) break;
    }
    await tab.send('Page.stopScreencast');
    const sim = await tab.ev(`({ log: __sim.log, events: __sim.events, wall0: __sim.wall0, errors: __sim.errors,
      planes: __sim.faces.filter((f) => f.plane).map((f) => ({ on: f.name ?? 'room', c: f.c, normal: f.N, outline: f.poly.map((p) => p.map((v) => +v.toFixed(2))) })) })`);
    const report = judge({ name, friend, sc, room, sim, errors: tab.errors, leaked, gl });
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
    await video(frames, sim.wall0, path.join(out, 'video.mp4'));
    await sheet(frames, sim, report, path.join(out, 'sheet.png'));
    return report;
  } finally { await tab.close(); }
}

// The automatic checks, from the per-frame log. "True" positions are in the room, as the camera feed shows them.
function judge({ name, friend, sc, room, sim, errors, leaked, gl }) {
  const L = sim.log, E = sim.events, checks = [];
  const check = (what, pass, got) => checks.push({ what, pass: !!pass, got });
  const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]), d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const dedupe = (xs) => xs.filter((x, i) => x !== xs[i - 1]), cm = (m) => +(m * 100).toFixed(1);

  const floorAt = L.find((r) => r.tip && r.tip !== FEET_TIP)?.t ?? null;
  check(`floor set within ${sc.floorWithin} s`, floorAt !== null && floorAt <= sc.floorWithin, { floorAt });
  const out = L.find((r) => r.placed), clips = {};
  if (!out) check('he comes out', false, { lastTip: L.at(-1)?.tip, planes: L.at(-1)?.planes });
  else {
    const P = L.filter((r) => r.placed), p = out.friend;
    check('he comes out on the floor (feet within 2 cm of it)', Math.abs(p[1]) <= 0.02, { at: p, t: out.t, yCm: cm(p[1]) });
    check('1.2-5 m away', flat(p, out.cam) >= 1.2 && flat(p, out.cam) <= 5, { dist: +flat(p, out.cam).toFixed(2) });
    const onIt = (q) => room.boxes.find((b) => q[0] > b.x[0] && q[0] < b.x[1] && q[2] > b.z[0] && q[2] < b.z[1]);
    const outside = (q) => !(q[0] > room.x[0] && q[0] < room.x[1] && q[2] > room.z[0] && q[2] < room.z[1]);
    const bad = P.find((r) => onIt(r.friend) || outside(r.friend));
    check('never on furniture (or through a wall)', !bad, bad ? { t: bad.t, at: bad.friend, on: onIt(bad.friend)?.name ?? 'outside the room' } : 'clear');
    // Between scripted jumps (each given 1.5 s to settle) he moves at most 2 cm in the room.
    const jumps = E.filter((e) => e.jump).map((e) => e.t), from = [out.t + 0.6, ...jumps.map((j) => j + 1.5)], to = [...jumps, Infinity];
    let worst = 0;
    from.forEach((a, i) => { const rs = P.filter((r) => r.t >= a && r.t < to[i]); for (const r of rs) worst = Math.max(worst, d3(r.friend, rs[0].friend)); });
    check('after placement he stays put (≤ 2 cm)', worst <= 0.02, { worstCm: cm(worst) });
    // ARCore moving his anchor: he glides to it (1 m/s, plus 2 cm for its noise). ARCore re-fixing its map (the camera and
    // every anchor together): he must stay on his real spot, as the room in the camera feed does.
    const win = (j) => P.filter((r) => r.t >= j && r.t < j + 1.5), before = (j) => P.findLast((r) => r.t < j)?.friend;
    const moves = E.filter((e) => e.jump?.anchor && before(e.t)), refixes = E.filter((e) => e.jump?.camera && before(e.t));
    if (moves.length) {
      let extra = 0;
      for (const e of moves) win(e.t).forEach((r, i, w) => { const q = i ? w[i - 1] : P.findLast((x) => x.t < e.t); extra = Math.max(extra, d3(r.friend, q.friend) - (r.t - q.t)); });
      check('when ARCore moves his anchor he glides there (≤ 1 m/s)', extra <= 0.02, { worstExtraCm: cm(extra), movedCm: moves.map((e) => cm(d3(before(e.t), win(e.t).at(-1).friend))) });
    }
    if (refixes.length) {
      const off = refixes.map((e) => {
        const w = win(e.t), b = before(e.t), far = w.filter((r) => d3(r.friend, b) > 0.02);
        return { camera: e.jump.camera, maxOffCm: cm(Math.max(0, ...w.map((r) => d3(r.friend, b)))), offForS: +(far.length ? far.at(-1).t - far[0].t + 0.033 : 0).toFixed(2) };
      });
      check('through a map re-fix he stays on his real spot (≤ 2 cm)', off.every((o) => o.maxOffCm <= 2), off);
    }
    // Too close: under 1 m the view greys; it clears past 1.2 m (one frame late is fine).
    const near = P.filter((r) => r.t > out.t + 0.6), wrong = near.filter((r, i) => i && (flat(r.friend, r.cam) < 0.95 ? !r.close : flat(r.friend, r.cam) > 1.25 && r.close)
      && (flat(near[i - 1].friend, near[i - 1].cam) < 0.95 ? !near[i - 1].close : flat(near[i - 1].friend, near[i - 1].cam) > 1.25 && near[i - 1].close));
    if (near.some((r) => flat(r.friend, r.cam) < 0.95)) {
      check('within 1 m the view greys, and clears past 1.2 m', !wrong.length, { closest: +Math.min(...near.map((r) => flat(r.friend, r.cam))).toFixed(2), wrongFrames: wrong.length, first: wrong[0] && { t: wrong[0].t, close: wrong[0].close } });
    }
    // His drawing's feet, per clip: the lowest 6 cm of the art against his spot, in real size.
    for (const r of P) if (r.feet && r.t > out.t + 0.5) {
      const c = (clips[r.clip] ??= { drawings: 0, maxOffCm: 0, liftCm: [Infinity, -Infinity], minPx: Infinity, clipped: false });
      c.drawings++; c.minPx = Math.min(c.minPx, r.feet.n);
      if (r.feet.n) { c.maxOffCm = Math.max(c.maxOffCm, Math.abs(r.feet.dx)); c.liftCm = [Math.min(c.liftCm[0], r.feet.lift), Math.max(c.liftCm[1], r.feet.lift)]; c.clipped ||= r.feet.edge; }
    }
    const idle = pct(P.filter((r) => r.feet?.n && r.clip === 'Idle').map((r) => r.feet.n), 0.5) ?? Infinity, problems = {};
    for (const [k, c] of Object.entries(clips)) {
      const why = [c.maxOffCm > 15 && `feet ${c.maxOffCm} cm off his spot`, c.minPx < 0.2 * idle && 'vanishes', c.clipped && 'cut off at the card edge', c.liftCm[0] < -5 && `feet ${-c.liftCm[0]} cm under the floor`].filter(Boolean);
      if (why.length) problems[k] = why.join(', ');
    }
    check('his feet stay on his spot in every clip (≤ 15 cm), and he never vanishes', !Object.keys(problems).length, Object.keys(problems).length ? problems : `${Object.keys(clips).length} clips seen`);
  }
  const lostRing = L.filter((r) => r.lost && !r.placed && r.ring);
  if (L.some((r) => r.lost)) check('no ring while tracking is lost', !lostRing.length, { frames: lostRing.length });
  const asked = E.find((e) => e.talk);
  if (asked) {
    const R = L.filter((r) => r.t >= asked.t), sp = R.filter((r) => r.talk === 'speaking'), words = sp.find((r) => r.cloud && r.cloud !== '…')?.cloud;
    check('holding the mic gives a reply (he speaks, his words in the cloud)', sp.length && words, { states: dedupe(R.map((r) => r.talk)), words });
    const mouths = [...new Set(sp.map((r) => r.mouth).filter(Boolean))], redraws = sp.filter((r) => r.feet).length;
    check('his mouth moves while he talks', mouths.length >= 2 && redraws >= 5, { mouths, redrawsWhileSpeaking: redraws });
  }
  const ms = L.map((r) => r.ms), gaps = L.slice(1).map((r, i) => r.t - L[i].t);
  check('frame time p95 < 50 ms', pct(ms, 0.95) < 50, { p50: pct(ms, 0.5), p95: pct(ms, 0.95), max: Math.max(...ms), fps: +(L.length / (L.at(-1).t - L[0].t)).toFixed(1), framesOver50msApart: gaps.filter((g) => g > 0.05).length, simulatorP95: pct(L.map((r) => r.simMs ?? 0), 0.95) });
  const simBugs = E.filter((e) => e.simError || e.feedError);
  check('no page errors', !errors.length && !leaked && !sim.errors, { errors: [...new Set(errors)].slice(0, 5), leakedApiCalls: leaked, simBugs: simBugs.slice(0, 3) });
  return { scenario: name, friend, throttle: THROTTLE, gl, pass: checks.every((c) => c.pass), checks, clips, events: E, planesAtEnd: sim.planes, frames: L };
}

// The screencast as a 30 fps mp4 (each frame held until the next), stamped with the time since Start.
async function video(frames, wall0, file) {
  if (frames.length < 2) return;
  const t0 = frames[0].ts, from = (t0 - wall0 / 1000).toFixed(3);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', '-',
    '-vf', `drawtext=font=Sans:text='%{pts\\:hms\\:${from}}':x=8:y=h-22:fontsize=13:fontcolor=white:box=1:boxcolor=black@0.45`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let k = 0, i = 0; t0 + k / 30 <= frames.at(-1).ts; k++) {
    while (i + 1 < frames.length && frames[i + 1].ts <= t0 + k / 30) i++;
    if (!ff.stdin.write((frames[i].buf ??= Buffer.from(frames[i].data, 'base64')))) await once(ff.stdin, 'drain');
  }
  ff.stdin.end();
  await once(ff, 'close');
}

// 12 time-stamped frames: the moments that matter (floor set, out, too close, speaking, jumps), the rest evenly spread.
async function sheet(frames, sim, report, file) {
  if (!frames.length) return;
  const L = sim.log, w0 = sim.wall0 / 1000, end = L.at(-1).t, esc = (s) => String(s ?? '').replace(/[&<]/g, (c) => (c === '&' ? '&amp;' : '&lt;'));
  const near = (xs, t, f) => xs.reduce((b, x) => (Math.abs(f(x) - t) < Math.abs(f(b) - t) ? x : b));
  const key = [['floor set', L.find((r) => r.tip && r.tip !== FEET_TIP)?.t], ['he is out', L.find((r) => r.placed)?.t], ['too close', L.find((r) => r.close)?.t],
    ['speaking', L.find((r) => r.talk === 'speaking')?.t], ...sim.events.filter((e) => e.jump || e.lose).map((e) => [e.jump ? 'jump' : 'tracking lost', e.t + 0.4])]
    .filter(([, t]) => t != null).slice(0, 7);
  const picks = [...key, ...Array.from({ length: 12 - key.length }, (_, i) => ['', (end * (i + 0.5)) / (12 - key.length)])].sort((a, b) => a[1] - b[1]);
  const cells = picks.map(([what, t]) => {
    const r = near(L, t, (x) => x.t), state = r.close ? 'grey: too close' : r.tip || [r.talk !== 'idle' && r.talk, r.cloud && `“${r.cloud}”`, r.clip].filter(Boolean).join(' · ');
    return `<figure><img src="data:image/jpeg;base64,${near(frames, t, (f) => f.ts - w0).data}"><figcaption><b>${t.toFixed(1)} s</b> ${esc(what)}<br>${esc(state)}</figcaption></figure>`;
  }).join('');
  const fails = report.checks.filter((c) => !c.pass).map((c) => c.what);
  const html = `<style>body{margin:0;background:#15171c;color:#eee;font:12px system-ui,sans-serif}h1{font-size:14px;margin:8px}main{display:grid;grid-template-columns:repeat(6,192px);gap:6px;padding:0 6px 6px}
img{width:192px;height:416px;display:block}figure{margin:0}figcaption{height:44px;overflow:hidden;padding:3px 2px;line-height:1.35}</style>
<h1>${esc(report.scenario)} · ${esc(report.friend)} · ${report.throttle}x CPU · ${fails.length ? 'FAIL: ' + esc(fails.join('; ')) : 'all checks pass'}</h1><main>${cells}</main>`;
  const tab = await openTab();
  try {
    await tab.send('Emulation.setDeviceMetricsOverride', { width: 6 * 198 + 6, height: 980, deviceScaleFactor: 1, mobile: false });
    await tab.ev(`document.open(); document.write(${JSON.stringify(html)}); document.close(); Promise.all([...document.images].map((i) => i.decode())).then(() => document.body.scrollHeight)`);
    const { data } = await tab.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  } finally { await tab.close(); }
}

const FRIEND_PASS = Object.keys(FRIENDS).map((f) => ['friend-pass', f, `all-friends/${f}`]);
const jobs = WHICH === 'all' ? [...Object.keys(SCENARIOS).filter((s) => s !== 'friend-pass').map((s) => [s, FRIEND, s]), ...FRIEND_PASS]
  : WHICH === 'all-friends' ? FRIEND_PASS : SCENARIOS[WHICH] ? [[WHICH, FRIEND, FRIEND === 'nobita' ? WHICH : `${WHICH}-${FRIEND}`]] : null;
if (!jobs || !FRIENDS[FRIEND]) { console.error(`usage: run.mjs <${Object.keys(SCENARIOS).join(' | ')} | all | all-friends> [--throttle 4] [--friend ${Object.keys(FRIENDS).join('|')}]`); process.exit(2); }
await chrome();
let failed = 0;
for (const [s, f, dir] of jobs) {
  console.log(`\n== ${dir} (${f}, ${THROTTLE}x CPU)`);
  try {
    const r = await run(s, f, path.join(HERE, 'out', dir));
    for (const c of r.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.what}   ${JSON.stringify(c.got)}`);
    failed += !r.pass;
    console.log(`-> ${path.join(HERE, 'out', dir)}`);
  } catch (e) { failed++; console.log('ERROR', e.message); }
}
process.exit(failed ? 1 : 0);
