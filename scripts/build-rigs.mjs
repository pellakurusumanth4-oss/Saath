// Builds the friends' 2D anime rigs into the app.
//   node scripts/build-rigs.mjs               -> src/rigs.ts (each approved rig page, plus a camera mode),
//                                                 and the same pages in web/ar/rigs/ for the AR camera page
//   node scripts/build-rigs.mjs --faces 9351  -> also src/faces.ts (round portraits for the map),
//                                                 rendered in a headless Chrome on that CDP port
// The rigs are the design files approved by the user (~/.cache/saath-recovery/design/characters/anime);
// this never edits them, it injects a camera mode into a copy. Re-run it after a rig changes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ANIME = path.join(os.homedir(), '.cache/saath-recovery/design/characters/anime');
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

// ground: the point between his feet in drawing units; tall: his height in units (head top to ground).
// Roles are clip names from the rig's CLIPS: arrive plays when you find him, then hi, then idle with
// an extra now and then.
// face: the round portrait's size and centre, relative to his head's box.
// talk: what saath.face and saath.act use while he talks (web/talk). mouths and moods map the shared names
// to this rig's own existing parts (no new drawings; a mood's `closed` replaces his usual closed mouth, so he
// doesn't smile while sad); actions map the gesture words in Claude's replies
// (web/talk/reply.mjs lists the same words) to his clips; later = gestures that hide or shut his face, so
// they wait until he stops talking.
// roles.extras play by themselves while a friend stands idle, so they keep only clips where his feet stay within about 15 cm of
// his spot and he never vanishes (funny/footcheck.mjs, 18 Oct). Clips that leave the spot (laps, dives, lying down, the Anywhere
// Door) are talk actions only: they play when he says he's doing them.
const RIGS = {
  doraemon: { file: 'doraemon.html', ground: [200, 512], tall: 484,
    roles: { idle: 'Idle', hi: 'Hi!', arrive: 'Yay!', extras: ['Gadget!', 'Yay!', 'Ufufu', 'Janken'] }, face: { zoom: 1.1, dy: 0 },
    talk: { mouths: { closed: 'smile', half: 'a', open: 'open' },
      moods: { neutral: {}, happy: { eyes: 'happy' }, excited: { eyes: 'happy' }, surprised: { look: [0, -7] }, curious: { look: [6, 0] },
        sad: { eyes: 'half', look: [0, 9], closed: 'o' }, worried: { eyes: 'half', look: [-6, 0], closed: 'o' }, sleepy: { eyes: 'half' }, thinking: { look: [6, -7] } },
      actions: { wave: 'Hi!', gadget: 'Gadget!', fly: 'Take-copter', cheer: 'Yay!', mouse: 'Nezumi!', door: 'Anywhere Door', ufufu: 'Ufufu', janken: 'Janken' },
      later: ['fly', 'mouse', 'door'] } },
  nobita: { file: 'nobita/nobita.html', ground: [200, 512], tall: 483,
    roles: { idle: 'Idle', hi: 'Hi!', arrive: 'Nap', extras: ['Bang!', 'Yatta!', 'Doraemon~!'] }, face: { zoom: 1.1, dy: 0 },
    talk: { mouths: { closed: 'smile', half: 'talk', open: 'open' },
      moods: { neutral: {}, happy: { eyes: 'happy' }, excited: { eyes: 'happy' }, surprised: { eyes: 'small' }, curious: { look: [5, 0] },
        sad: { eyes: 'cry', brows: 'worried', closed: 'wavy' }, worried: { brows: 'worried', sweat: 1, closed: 'wavy' }, sleepy: { eyes: 'half' }, thinking: { look: [5, -3] } },
      actions: { wave: 'Hi!', late: 'Late!', call: 'Doraemon~!', nap: 'Nap', aim: 'Bang!', cheer: 'Yatta!', pray: 'Bappa, please!', splat: 'Splat!', lazy: 'Lazy lawn', dog: 'Dog!' },
      later: ['nap', 'late', 'pray', 'splat', 'lazy', 'dog'] } },
  shinchan: { file: 'shinchan/shinchan.html', ground: [200, 512], tall: 484,
    roles: { idle: 'Idle', hi: 'Hi!', arrive: 'Buri-buri', extras: ['Action Kamen', 'Yay!', 'Buri-buri', 'Chocobi', 'Toss & catch', 'Which cake?'] }, face: { zoom: 1.32, dy: -0.02 },
    talk: { mouths: { closed: 'closed', half: 'a', open: 'laugh' },
      moods: { neutral: {}, happy: { eyes: 'happy', blush: 0.8 }, excited: { eyes: 'happy', blush: 0.8 }, surprised: { brows: [-10, -3, -10, 3] },
        curious: { look: [6, 0] }, sad: { brows: [-4, -14, -4, 14], closed: 'wavy' }, worried: { brows: [-4, -14, -4, 14], closed: 'wavy' }, sleepy: { eyes: 'half' },
        thinking: { look: [5, -2] } },
      actions: { wave: 'Hi!', dance: 'Buri-buri', pose: 'Action Kamen', cheer: 'Yay!', chocobi: 'Chocobi', toss: 'Toss & catch', hmm: 'Which cake?' },
      later: ['dance'] } },
  goku: { file: 'goku/goku.html', ground: [0, 0], tall: 1750,
    roles: { idle: 'Idle', hi: 'Hi!', arrive: 'Instant Transmission', extras: ['Kamehameha!', 'Yosha!', 'Starving!', 'Huh?', 'Whaaaa?!'] }, face: { zoom: 0.72, dy: 0.2 },
    talk: { mouths: { closed: 'closed', half: 'o', open: 'a' },
      moods: { neutral: {}, happy: { eyes: 'happy' }, excited: { eyes: 'happy' }, surprised: { brows: 'up' }, curious: { look: [8, 1] },
        sad: { eyes: 'half', brows: 'up' }, worried: { brows: 'up' }, sleepy: { eyes: 'half' }, thinking: { look: [0, -6] } },
      actions: { wave: 'Hi!', blast: 'Kamehameha!', teleport: 'Instant Transmission', cheer: 'Yosha!', eat: 'Starving!', huh: 'Huh?', shock: 'Whaaaa?!' },
      later: ['teleport', 'eat'] } },
  // The live-action friends draw their faces from measured landmarks: moods are pose fields (expr = a measured
  // expression, ew = its weight); talking adds the jaw on top, so no mood needs its own closed mouth.
  michael: { file: 'michael/michael.html', ground: [0, 0], tall: 1750,
    roles: { idle: 'Idle', hi: 'Hi!', arrive: 'Welcome!', extras: ['Look to camera', 'Finger guns', 'No, God, no!', 'I declare bankruptcy!', 'Pout', "World's Best Boss"] },
    face: { zoom: 1.09, dy: -0.07 },
    talk: { mouths: { closed: 'closed', half: 'half', open: 'open', round: 'round' },
      moods: { neutral: {}, happy: { expr: 'grin', ew: 0.7 }, excited: { expr: 'shout', ew: 0.5 }, surprised: { expr: 'wide', ew: 0.9 }, curious: { look: [5, 0] },
        sad: { expr: 'pout', ew: 0.8 }, worried: { expr: 'scream', ew: 0.35 }, sleepy: { blink: 0.55 }, thinking: { look: [5, -3] } },
      actions: { wave: 'Hi!', cheer: 'Welcome!', stare: 'Look to camera', panic: 'No, God, no!', shout: 'I declare bankruptcy!', pout: 'Pout', mug: "World's Best Boss", guns: 'Finger guns' },
      later: [] } },
  dwight: { file: 'dwight/dwight.html', ground: [0, 0], tall: 1870,
    roles: { idle: 'Idle', hi: 'Hi!', arrive: 'Karate!', extras: ['Question.', 'False.', 'Evil grin', 'Glasses', 'Panic!'] },
    face: { zoom: 1.09, dy: -0.07 },
    talk: { mouths: { closed: 'closed', half: 'half', open: 'open', round: 'round' },
      moods: { neutral: {}, happy: { expr: 'grin', ew: 0.6 }, excited: { expr: 'bark', ew: 0.5 }, surprised: { expr: 'panic', ew: 0.8 }, curious: { look: [5, 0] },
        sad: { expr: 'stern', ew: 0.7 }, worried: { expr: 'panic', ew: 0.4 }, sleepy: { blink: 0.55 }, thinking: { look: [5, -3] } },
      actions: { wave: 'Hi!', karate: 'Karate!', question: 'Question.', false: 'False.', grin: 'Evil grin', glasses: 'Glasses', panic: 'Panic!' },
      later: [] } },
  // Holt's deadpan is the joke: happy is only a softer look, never a grin.
  holt: { file: 'holt/holt.html', ground: [0, 0], tall: 1830,
    roles: { idle: 'Idle', hi: 'Hi!', arrive: 'Salute', extras: ['BONE?!', 'Side-eye', 'Hot damn!', 'Dance', 'Vindication!'] },
    face: { zoom: 1.09, dy: -0.07 },
    talk: { mouths: { closed: 'closed', half: 'half', open: 'open', round: 'round' },
      moods: { neutral: {}, happy: { blink: 0.25 }, excited: { expr: 'bone2', ew: 0.4 }, surprised: { expr: 'bone', ew: 0.7 }, curious: { expr: 'side', ew: 0.6 },
        sad: { expr: 'concerned', ew: 0.8 }, worried: { expr: 'concerned', ew: 0.6 }, sleepy: { blink: 0.55 }, thinking: { look: [5, -3] } },
      // Talk words that never prime him to say the clip's name: Claude would say "Hot damn!" (a swear the filter drops)
      // or a baffling "BONE?!" for words named after them.
      actions: { wave: 'Hi!', salute: 'Salute', outburst: 'BONE?!', sideeye: 'Side-eye', celebrate: 'Hot damn!', dance: 'Dance', vindication: 'Vindication!' },
      later: [] } },
};
// The camera mode (scripts/rig-ar.js), pasted in front of the rig's own modes.
const AR = "if (mode === 'ar') {\n" + fs.readFileSync(path.join(ROOT, 'scripts/rig-ar.js'), 'utf8') + "\n} else ";

function once(text, find, replace, what) {
  const n = text.split(find).length - 1;
  if (n !== 1) throw new Error(`${what}: expected one "${find.slice(0, 40)}", found ${n}`);
  return text.replace(find, replace);
}

function arPage(id) {
  const r = RIGS[id];
  let html = fs.readFileSync(path.join(ANIME, r.file), 'utf8');
  html = once(html, 'const P = new URLSearchParams(location.hash.slice(1));', "const P = new URLSearchParams('mode=ar&capture=1');", id);
  html = once(html, 'let render, loopLen = 1e9;\n', 'let render, loopLen = 1e9;\n' + AR, id);
  const config = { ground: r.ground, tall: r.tall, roles: r.roles, ...r.talk };
  html = html.replace('<script>', `<script>window.SAATH_AR = ${JSON.stringify(config)};</script>\n<script>`);
  return html;
}

const pages = Object.fromEntries(Object.keys(RIGS).map((id) => [id, arPage(id)]));
const header = '// Generated by scripts/build-rigs.mjs from the approved rigs. Do not edit; re-run the script.\n';
fs.writeFileSync(path.join(ROOT, 'src/rigs.ts'),
  header + "import type { Character } from './friends';\n\n" +
  'export const RIG_HTML: Record<Character, string> = {\n' +
  Object.entries(pages).map(([id, html]) => `  ${id}: ${JSON.stringify(html)},\n`).join('') + '};\n');
console.log('src/rigs.ts', Object.entries(pages).map(([id, h]) => `${id} ${Math.round(h.length / 1024)} KB`).join(', '));
// The same pages for the AR camera page that Chrome opens (web/ar/index.html loads rigs/<id>.html).
fs.mkdirSync(path.join(ROOT, 'web/ar/rigs'), { recursive: true });
for (const [id, html] of Object.entries(pages)) fs.writeFileSync(path.join(ROOT, 'web/ar/rigs', id + '.html'), html);
console.log('web/ar/rigs', Object.keys(pages).join(', '));

// Portraits: each rig at rest, face on, cropped round his head; plus the same head as a silhouette.
const fi = process.argv.indexOf('--faces');
if (fi > 0) {
  const port = process.argv[fi + 1];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'saath-faces-'));
  // A tab of its own in that Chrome, closed at the end: other sessions' tests use the same browser.
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let n = 0;
  const waiting = new Map(), problems = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') problems.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++n; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  const SIDE = 192, faces = {};
  for (const id of Object.keys(RIGS)) {
    const file = path.join(tmp, id + '.html');
    fs.writeFileSync(file, pages[id]);
    await send('Page.navigate', { url: 'file://' + file });
    for (let i = 0; i < 60 && !(await evaluate('!!window.saath && !!window.__ready')); i++) await sleep(100);
    if (!(await evaluate('!!window.saath'))) throw new Error(id + ': camera mode did not start ' + problems.join(' | '));
    await evaluate('saath.place(300, 860, 570, 0); saath.quiet(true); saath.still(0); true');
    await sleep(150);
    const [x, y, w, h] = await evaluate('saath.head()');
    const { zoom, dy } = RIGS[id].face, side = Math.max(w, h) * zoom, cy = y + h * (0.5 + dy);
    const clip = { x: x + w / 2 - side / 2, y: cy - side / 2, width: side, height: side, scale: SIDE / side };
    const shot = async () => 'data:image/png;base64,' + (await send('Page.captureScreenshot', { format: 'png', clip })).result.data;
    const met = await shot();
    await evaluate('saath.mystery(true); saath.still(0); true');
    await sleep(150);
    faces[id] = { met, unmet: await shot() };
    fs.writeFileSync(path.join(tmp, id + '.png'), Buffer.from(met.split(',')[1], 'base64'));
  }
  ws.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
  if (problems.length) throw new Error('page errors: ' + problems.join(' | '));
  fs.writeFileSync(path.join(ROOT, 'src/faces.ts'),
    header + "import type { Character } from './friends';\n\n" +
    '/** Each friend\'s head, face on, as a square PNG for round markers; unmet is the same head as a silhouette. */\n' +
    'export const FACES: Record<Character, { met: string; unmet: string }> = ' + JSON.stringify(faces, null, 1) + ';\n');
  console.log('src/faces.ts', Object.keys(faces).join(', '), '· previews in', tmp);
}
process.exit(0);
