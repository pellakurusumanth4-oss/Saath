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
// face: the round portrait's size and centre (dx, dy), relative to his head's box.
// talk: what saath.face and saath.act use while he talks (web/talk). mouths and moods map the shared names
// to this rig's own parts (its existing drawings, and the wide mouth for ee that rig-ar.js adds; a mood's `closed`
// replaces his usual closed mouth, so he doesn't smile while sad); actions map the gesture words in Claude's replies
// (web/talk/reply.mjs lists the same words) to his clips; later = gestures that hide or shut his face, so
// they wait until he stops talking.
// roles.extras play by themselves while a friend stands idle, so they keep only clips where his feet stay within about 15 cm of
// his spot and he never vanishes (funny/footcheck.mjs, 18 Oct). Clips that leave the spot (laps, dives, lying down, the Anywhere
// Door) are talk actions only: they play when he says he's doing them.
// The business mascots (19 Oct) all run one engine (anime/mascot/build/mascot-rig.js) with the same seven clips, so they
// share roles and talk table; tall is the design's height in cm (adult 172, young 140). A mood's `closed` swaps the design's
// own closed grin or smile for a flat mouth or an o. Each face is set so the features fill every portrait alike (the crop is
// 1.75 face widths), whatever the hat, bun or ponytail does to the head's box.
const MASCOT = {
  roles: { idle: 'Idle', hi: 'Hi!', arrive: 'Welcome!', extras: ['Show', 'Think', 'Laugh'] },
  talk: { mouths: { closed: 'closed', half: 'half', open: 'open', round: 'round', wide: 'wide' },
    moods: { neutral: {}, happy: { eyes: 'happy' }, excited: { eyes: 'happy', brows: 'up', closed: 'grin' }, surprised: { brows: 'up', closed: 'round' },
      curious: { look: [1, 0], brows: 'tilt' }, sad: { brows: 'sad', closed: 'flat' }, worried: { brows: 'sad', look: [0, 0.6], closed: 'flat' },
      sleepy: { blink: 0.55 }, thinking: { look: [1, -1], brows: 'tilt' } },
    actions: { wave: 'Hi!', welcome: 'Welcome!', show: 'Show', yes: 'Yes!', think: 'Think', laugh: 'Laugh' }, later: [] } };
const RIGS = {
  rosa: { file: 'mascot/rosa/rosa.html', ground: [0, 0], tall: 172, face: { zoom: 0.85, dy: 0.07 }, ...MASCOT },
  kiran: { file: 'mascot/kiran/kiran.html', ground: [0, 0], tall: 172, face: { zoom: 1.03, dy: -0.02, dx: -0.03 }, ...MASCOT },
  juno: { file: 'mascot/juno/juno.html', ground: [0, 0], tall: 140, face: { zoom: 0.94, dy: -0.17, dx: -0.12 }, ...MASCOT },
  otto: { file: 'mascot/otto/otto.html', ground: [0, 0], tall: 172, face: { zoom: 1.07, dy: -0.03 }, ...MASCOT },
  sunny: { file: 'mascot/sunny/sunny.html', ground: [0, 0], tall: 172, face: { zoom: 1, dy: 0, dx: -0.08 }, ...MASCOT },
  nia: { file: 'mascot/nia/nia.html', ground: [0, 0], tall: 172, face: { zoom: 0.9, dy: 0.05 }, ...MASCOT },
  mika: { file: 'mascot/mika/mika.html', ground: [0, 0], tall: 172, face: { zoom: 1.2, dy: -0.12 }, ...MASCOT },
  max: { file: 'mascot/max/max.html', ground: [0, 0], tall: 140, face: { zoom: 1, dy: 0 }, ...MASCOT },
  omar: { file: 'mascot/omar/omar.html', ground: [0, 0], tall: 172, face: { zoom: 1.07, dy: -0.03 }, ...MASCOT },
  lina: { file: 'mascot/lina/lina.html', ground: [0, 0], tall: 172, face: { zoom: 0.86, dy: 0.02 }, ...MASCOT },
  sana: { file: 'mascot/sana/sana.html', ground: [0, 0], tall: 172, face: { zoom: 0.9, dy: -0.17 }, ...MASCOT },
  kai: { file: 'mascot/kai/kai.html', ground: [0, 0], tall: 140, face: { zoom: 1.04, dy: -0.02 }, ...MASCOT },
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
  // The borrowed characters are gone (contest rules, 19 Oct): not even a comment naming one ships in a page.
  const old = html.match(/doraemon|nobita|shin-?chan|goku|michael|dwight|holt/i);
  if (old) throw new Error(`${id}: the page still names ${old[0]}`);
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
    const { zoom, dy, dx = 0 } = RIGS[id].face, side = Math.max(w, h) * zoom, cy = y + h * (0.5 + dy);
    const clip = { x: x + w * (0.5 + dx) - side / 2, y: cy - side / 2, width: side, height: side, scale: SIDE / side };
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
