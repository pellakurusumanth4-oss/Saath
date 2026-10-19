// The camera mode that scripts/build-rigs.mjs pastes into each approved rig page, in front of the
// rig's own modes (it runs inside `if (mode === 'ar') { ... }`, with the rig's CLIPS, make(), apply()
// and step() in scope). One friend on a transparent page over the app's camera view.
//
// Two ways to say where he stands:
// - saath.place(x, y, h, rot): the app projects him (far away, at his GPS spot) and passes his feet
//   (x, y) in its pixels, his height h in pixels and his turn rot in degrees.
// - Floor mode (saath.floor*): the page tracks the phone itself and pins him to a spot on the floor.
//   deviceorientation in Chrome on Android is the gyroscope plus gravity, no compass, at 60 Hz, so
//   he doesn't slide with the camera. Flow: scan the floor (radar), lock a spot (the ring stays
//   put), call him: he appears on the ring, does his arrival, says hi, and stays right there.
//   Why he can still slide a little: notes/ar-stability.md.
// Drawings still change on 2s.
const A = window.SAATH_AR;
for (const id of ['title', 'sheet', 'street']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent';
const NS = 'http://www.w3.org/2000/svg';
// The floor marks (radar and ring) go under him.
const marks = document.createElementNS(NS, 'svg');
Object.assign(marks.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' });
document.body.appendChild(marks);
const svg = make(document.createElementNS(NS, 'svg'));
const vb = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
svg.setAttribute('width', vb[2]); svg.setAttribute('height', vb[3]);
Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', overflow: 'visible', transformOrigin: '0 0', visibility: 'hidden' });
document.body.appendChild(svg);
// Rigs that draw their lines with CSS (classes in this page's <style>, widths in --lw from ink()) keep both
// inside the <svg> too, so a copy of the <svg> alone, like the AR page's picture of him, still has its lines: the
// page's styles, and line widths for him at 400 px tall (layout() sets them for his size on screen, and those win).
if (typeof ink === 'function') {
  const probe = document.createElementNS(NS, 'svg'), own = document.createElementNS(NS, 'style');
  ink(probe, 400 / A.tall);
  svg.setAttribute('data-ink', '');
  own.textContent = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n') + '\nsvg[data-ink]{' + probe.style.cssText + '}';
  svg.prepend(own);
}
const q = document.createElement('div'); q.textContent = '?';
Object.assign(q.style, { position: 'absolute', display: 'none', transform: 'translate(-50%, -50%)', color: '#F9BC4D',
  fontFamily: 'system-ui, Roboto, sans-serif', fontWeight: '900', textShadow: '0 0 0.12em rgba(249,188,77,.95), 0 0 0.3em rgba(249,188,77,.6)' });
document.body.appendChild(q);
const bubble = document.createElement('div');
Object.assign(bubble.style, { position: 'absolute', display: 'none', transform: 'translate(-50%, -100%)', maxWidth: '230px', padding: '10px 14px',
  background: '#fff', border: '2.5px solid #111318', borderRadius: '18px', boxShadow: '3px 3px 0 #111318',
  font: '800 16px system-ui, Roboto, sans-serif', color: '#111318', textAlign: 'center', whiteSpace: 'nowrap' });
document.body.appendChild(bubble);
const post = (m) => { try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} };
const idx = (name) => { const i = CLIPS.findIndex((c) => c[0] === name); if (i < 0) throw new Error('rig has no clip ' + name); return i; };
const R = { idle: idx(A.roles.idle), hi: idx(A.roles.hi), arrive: idx(A.roles.arrive), extras: A.roles.extras.map(idx) };
const roleOf = (i) => (i === R.arrive ? 'arrive' : i === R.hi ? 'hi' : i === R.idle ? 'idle' : 'extra');
let mystery = false, quiet = false, held = false, queue = [], cur = R.idle, since = 0, rest = 8, clock = 0, shown = '', at = null, flip = 1;
// Talking (saath.face, saath.act): the face laid over every drawing, and a clip waiting until he stops talking.
let faceOn = {}, afterTalk = null;

// The page's visible size in CSS pixels. Android's WebView may zoom the page a little (1.037 on the
// S24), and reports innerWidth/innerHeight in device pixels (2.6x too big), so use the visual viewport.
const zoom = () => (window.visualViewport && visualViewport.scale > 0 ? visualViewport.scale : 1);
const view = () => (window.visualViewport ? [visualViewport.width, visualViewport.height] : [document.documentElement.clientWidth, document.documentElement.clientHeight]);

// at = [x, y, h, rot] in visible CSS pixels: feet, height, turn.
const layout = () => {
  q.style.display = mystery && !quiet && at ? 'block' : 'none';
  if (!at) { svg.style.visibility = 'hidden'; bubble.style.display = 'none'; return; }
  const s = at[2] / A.tall;
  svg.style.visibility = '';
  svg.style.transform = 'translate(' + at[0] + 'px,' + at[1] + 'px) rotate(' + at[3] + 'deg) scale(' + s * flip + ',' + s + ') translate(' + (vb[0] - A.ground[0]) + 'px,' + (vb[1] - A.ground[1]) + 'px)';
  if (typeof ink === 'function') ink(svg, s);
  q.style.fontSize = Math.round(at[2] * 0.22) + 'px';
  if (mystery && !quiet) mark();
};
const begin = (i, t) => {
  cur = i; since = t;
  if (i === R.idle) rest = 7 + Math.random() * 7;
  // On the floor his hello is a speech bubble over his head while he waves.
  const talk = fl.on && i === R.hi && !!fl.hello;
  if (talk) bubble.textContent = fl.hello;
  bubble.style.display = talk ? 'block' : 'none';
  post({ type: 'clip', role: roleOf(i), name: CLIPS[i][0] });
};
const mark = () => { const r = svg.querySelector('.head').getBoundingClientRect(); q.style.left = r.left + r.width / 2 + 'px'; q.style.top = r.top + r.height * 0.55 + 'px'; };

// ---- Floor mode -------------------------------------------------------------------------------
// ARM: the phone is held this far in front of where you turn (your body), so turning swings it
// round, as a VR headset models the neck. Ignoring that made him slide as you turned.
// LEAD_S: on the S24 the camera picture reaches the screen sooner than this WebView does (measured
// from a screen recording, 17 Oct), so he is drawn where the phone will be that long from now, or
// he trails behind the floor. Negative would draw him that long in the past instead.
const D2R = Math.PI / 180, SCAN_S = 1.6, RING_M = 0.42, ARM_M = 0.3, LEAD_S = 0.015;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const fl = { on: false, state: 'off', eye: 1.4, tallM: 1.3, vfov: 72.7, cam: null, src: '', hit: null, d: null,
  anchor: null, pos: null, scan: 0, lastF: null, lastT: 0, sent: '', hello: '' };
// Recent orientations, oldest first: [time in s, camera frame]. Not smoothed: the gyroscope is
// already smooth, and smoothing only made him lag behind the floor.
const hist = [];
// a and b blended (k 0-1), or carried on past b (k > 1), as a square frame.
const blend = (a, b, k) => {
  const mix = (u, v) => [0, 1, 2].map((i) => u[i] + (v[i] - u[i]) * k);
  const f = unit(mix(a.fwd, b.fwd)), u0 = mix(a.up, b.up), d = dot(u0, f);
  const up = unit([u0[0] - d * f[0], u0[1] - d * f[1], u0[2] - d * f[2]]);
  return { fwd: f, up, right: cross(f, up) };
};
// The orientation at time t (s), blended between the readings either side of it (they come at
// 60 Hz). Past the newest one it carries on at the latest turning speed, by at most 50 ms, and only
// while readings keep coming: Chrome sends none once the phone stops turning. The speed is taken
// over at least 10 ms, as two readings close together would blow up their difference.
const camAt = (t, now) => {
  let j = 0;
  while (j < hist.length && hist[j][0] < t) j++;
  if (j === 0) return hist[0][1];
  if (j < hist.length) return blend(hist[j - 1][1], hist[j][1], (t - hist[j - 1][0]) / (hist[j][0] - hist[j - 1][0]));
  const [t1, b] = hist[j - 1];
  let i = j - 2;
  while (i >= 0 && t1 - hist[i][0] < 0.01) i--;
  const a = hist[i];
  if (!a || now - t1 > 0.03 || t1 - a[0] > 0.05) return b;
  return blend(a[1], b, 1 + Math.min(t - t1, 0.05) / (t1 - a[0]));
};
// The camera's right, up and forward in a world with z up (W3C deviceorientation, Z-X'-Y'' angles).
const fromAngles = (a, b, g) => {
  a *= D2R; b *= D2R; g *= D2R;
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  return { right: [cA * cG - sA * sB * sG, cG * sA + cA * sB * sG, -cB * sG], up: [-cB * sA, cA * cB, sB], fwd: [-(cG * sA * sB + cA * sG), -(sA * sG - cA * cG * sB), -cB * cG] };
};
// The same from the app's heading, elevation and clockwise roll (degrees), used if no events come.
const fromApp = (h, e, r) => {
  h *= D2R; e *= D2R; r *= D2R;
  const f = [Math.sin(h) * Math.cos(e), Math.cos(h) * Math.cos(e), Math.sin(e)], r0 = [Math.cos(h), -Math.sin(h), 0];
  const u0 = [r0[1] * f[2] - r0[2] * f[1], r0[2] * f[0] - r0[0] * f[2], r0[0] * f[1] - r0[1] * f[0]], c = Math.cos(r), s = Math.sin(r);
  return { fwd: f, up: [u0[0] * c + r0[0] * s, u0[1] * c + r0[1] * s, u0[2] * c + r0[2] * s], right: [r0[0] * c - u0[0] * s, r0[1] * c - u0[1] * s, r0[2] * c - u0[2] * s] };
};
addEventListener('deviceorientation', (e) => {
  if (e.alpha === null || e.beta === null) return;
  hist.push([performance.now() / 1000, fromAngles(e.alpha, e.beta, e.gamma || 0)]);
  if (hist.length > 40) hist.shift();
  fl.src = 'device';
});
// Where the camera is: ARM_M in front of you (you stand at 0, 0), at eye height (the floor is z = -eye).
const lens = () => { const f = flat(fl.cam.fwd); return [ARM_M * f[0], ARM_M * f[1], 0]; };
// A world point on screen, in visible CSS pixels, or null behind the camera.
const project = (P) => {
  const c = fl.cam, o = lens(), v = [P[0] - o[0], P[1] - o[1], P[2] - o[2]], z = dot(v, c.fwd);
  if (z < 0.05) return null;
  const [W, H] = view(), f = H / 2 / Math.tan((fl.vfov * D2R) / 2);
  return [W / 2 + (f * dot(v, c.right)) / z, H / 2 - (f * dot(v, c.up)) / z];
};
const flat = (v) => { const n = Math.hypot(v[0], v[1]) || 1; return [v[0] / n, v[1] / n, 0]; };
// A circle of radius r on the floor around P, as an SVG path.
const circle = (P, r, n) => {
  let d = '';
  for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI, p = project([P[0] + r * Math.cos(a), P[1] + r * Math.sin(a), P[2]]); if (!p) return ''; d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }
  return d + 'Z';
};
// A flat circle of radius r round floor point P, drawn as an ellipse centred on P's own projection.
// (A circle's projected middle drifts towards you, which would leave his feet off-centre.)
const disc = (P, r, attrs) => {
  const c = project(P), R = flat(fl.cam.right), F = flat(fl.cam.fwd);
  const a = project([P[0] + r * R[0], P[1] + r * R[1], P[2]]), b = project([P[0] - r * R[0], P[1] - r * R[1], P[2]]);
  const n = project([P[0] - r * F[0], P[1] - r * F[1], P[2]]), f = project([P[0] + r * F[0], P[1] + r * F[1], P[2]]);
  if (!c || !a || !b || !n || !f) return '';
  const lx = a[0] - b[0], ly = a[1] - b[1], rx = Math.hypot(lx, ly) / 2;
  const ry = Math.abs(((n[0] - f[0]) / 2) * (ly / (2 * rx)) - ((n[1] - f[1]) / 2) * (lx / (2 * rx)));
  const at2 = c[0].toFixed(1) + ' ' + c[1].toFixed(1);
  return '<ellipse cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" rx="' + rx.toFixed(1) + '" ry="' + Math.max(1, ry).toFixed(1) +
    '" transform="rotate(' + (Math.atan2(ly, lx) / D2R).toFixed(1) + ' ' + at2 + ')" ' + attrs + '/>';
};
const say = (state) => {
  const m = { type: 'floor', state, scan: Math.round(Math.min(1, fl.scan / SCAN_S) * 20) / 20, d: fl.d === null ? null : Math.round(fl.d * 10) / 10, src: fl.src };
  const key = JSON.stringify(m);
  if (key !== fl.sent) { fl.sent = key; post(m); }
};
// Radar while scanning, the ring once the floor is found (pinned once locked).
const drawMarks = (t) => {
  let html = '';
  if (fl.state === 'scan' && fl.hit) {
    const sweep = (t * 200) % 360;
    [0.3, 0.6, 0.9].forEach((r) => { const d = circle(fl.hit, r, 36); if (d) html += '<path d="' + d + '" fill="none" stroke="rgba(120,230,255,.75)" stroke-width="2"/>'; });
    let wedge = '';
    const c = project(fl.hit);
    for (let i = 0; i <= 10; i++) { const a = (sweep - i * 4) * D2R, p = project([fl.hit[0] + 0.9 * Math.cos(a), fl.hit[1] + 0.9 * Math.sin(a), fl.hit[2]]); if (p) wedge += 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }
    if (c && wedge) html += '<path d="M' + c[0].toFixed(1) + ' ' + c[1].toFixed(1) + wedge + 'Z" fill="rgba(120,230,255,.35)"/>';
  } else if ((fl.state === 'found' && fl.hit) || fl.state === 'locked') {
    const P = fl.state === 'found' ? fl.hit : fl.anchor, ok = fl.state !== 'found' || (fl.d >= 0.8 && fl.d <= 4);
    const pulse = 1 + 0.05 * Math.sin(t * 5);
    html += disc(P, RING_M * pulse, 'fill="' + (ok ? 'rgba(255,196,87,.28)' : 'rgba(255,255,255,.14)') + '" stroke="' + (ok ? '#FFB43C' : '#fff') + '" stroke-width="4"' + (ok ? '' : ' stroke-dasharray="10 8"'));
    if (ok) {
      // Two footprints, and on a locked spot a faint second ring.
      const side = flat([fl.cam.right[0], fl.cam.right[1], 0]);
      [-1, 1].forEach((k) => { const d = circle([P[0] + side[0] * 0.1 * k, P[1] + side[1] * 0.1 * k, P[2]], 0.055, 12); if (d) html += '<path d="' + d + '" fill="#FFC457"/>'; });
      if (fl.state !== 'found') html += disc(P, RING_M * (1.25 + 0.15 * ((t * 0.8) % 1)), 'fill="none" stroke="rgba(255,226,166,' + (0.8 - 0.8 * ((t * 0.8) % 1)).toFixed(2) + ')" stroke-width="2"');
    }
  } else if (fl.pos) {
    // His shadow on the floor, in perspective, so he stands on it rather than over it.
    const d = disc(fl.pos, 0.17, 'fill="rgba(25,18,12,.5)" filter="url(#sh)"');
    if (d) html += '<defs><filter id="sh" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs>' + d;
  }
  marks.innerHTML = html;
};
// Each frame in floor mode: track the floor, move him along his path, put him on screen.
const floorFrame = (t) => {
  if (fl.src === 'device') { const now = performance.now() / 1000; fl.cam = camAt(now + LEAD_S, now); }
  if (!fl.cam) { marks.innerHTML = ''; return; }
  const F = fl.cam.fwd, o = lens();
  if (F[2] < -0.08) { const k = fl.eye / -F[2]; fl.hit = [o[0] + k * F[0], o[1] + k * F[1], -fl.eye]; fl.d = k * Math.hypot(F[0], F[1]); }
  else { fl.hit = null; fl.d = null; }
  const dt = Math.min(0.1, t - fl.lastT);
  if (fl.state === 'scan') {
    // Scanning counts while you point at floor 0.8-4 m ahead and move slowly, like a radar sweep.
    const turn = fl.lastF ? Math.acos(Math.min(1, dot(F, fl.lastF))) / Math.max(dt, 1e-3) : 0;
    if (fl.d !== null && fl.d >= 0.8 && fl.d <= 4 && turn < 1.2) fl.scan += dt; else fl.scan = Math.max(0, fl.scan - dt * 0.5);
    if (fl.scan >= SCAN_S) fl.state = 'found';
  }
  fl.lastF = F; fl.lastT = t;
  if (fl.pos && fl.state !== 'scan' && fl.state !== 'found' && fl.state !== 'locked') {
    const feet = project(fl.pos), head = project([fl.pos[0], fl.pos[1], fl.pos[2] + fl.tallM]);
    if (feet && head) {
      const h = Math.hypot(head[0] - feet[0], head[1] - feet[1]), rot = Math.atan2(head[0] - feet[0], feet[1] - head[1]) / D2R;
      at = [feet[0], feet[1], h, rot];
    } else at = null;
    layout();
    if (bubble.style.display === 'block' && at) { const top = head ? Math.max(70, head[1] - 12) : 70; bubble.style.left = Math.max(125, Math.min(view()[0] - 125, (head || feet)[0])) + 'px'; bubble.style.top = top + 'px'; }
  } else { at = null; layout(); }
  drawMarks(t);
  say(fl.state);
};

window.saath = {
  play: (roles) => { queue = roles.map((r) => R[r]).filter((i) => typeof i === 'number'); begin(queue.length ? queue.shift() : R.idle, clock); shown = ''; },
  // Talking: a face laid over whatever clip plays, from his next drawing. f = {mouth: 'closed'|'half'|'open', mood}
  // in the shared names, which SAATH_AR.mouths and .moods turn into this rig's own parts (a mood's `closed` replaces
  // his usual closed mouth). Unknown names are ignored, as a wrong part name blanks every mouth or eye. null ends it
  // and starts any clip held for later; false (he was cut off, or the reply failed) ends it and drops that clip.
  face: (f) => {
    const { closed, ...mood } = f && Object.hasOwn(A.moods, f.mood) ? A.moods[f.mood] : {};
    const mouth = f && (f.mouth === 'closed' && closed ? closed : Object.hasOwn(A.mouths, f.mouth) ? A.mouths[f.mouth] : null);
    faceOn = f ? { ...mood, ...(mouth ? { mouth } : {}) } : {};
    if (f === false) afterTalk = null;
    else if (!f && afterTalk !== null) { queue = []; begin(afterTalk, clock); afterTalk = null; shown = ''; }
  },
  // A gesture from the reply, by its word (SAATH_AR.actions). One that hides or shuts his face (SAATH_AR.later)
  // waits until he stops talking.
  act: (word) => {
    if (!Object.hasOwn(A.actions, word)) return;
    if (A.later.includes(word) && faceOn.mouth) { afterTalk = idx(A.actions[word]); return; }
    queue = []; begin(idx(A.actions[word]), clock); shown = '';
  },
  now: () => ({ clip: CLIPS[cur][0], face: faceOn }),   // for tests
  // Not met yet: a dark silhouette with a glowing "?", still breathing.
  mystery: (on) => { mystery = !!on; svg.style.filter = on ? 'brightness(0)' : ''; svg.style.opacity = on ? '0.86' : ''; q.style.display = mystery && !quiet && at ? 'block' : 'none'; shown = ''; },
  quiet: (on) => { quiet = !!on; q.style.display = mystery && !quiet && at ? 'block' : 'none'; },
  head: () => { const r = svg.querySelector('.head').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; },
  // Stops the clock on the idle drawing at time t (for portraits).
  still: (t) => { held = true; cur = R.idle; since = 0; shown = ''; draw(t); },
  // The app's pixels are the page's CSS pixels times the WebView's zoom.
  place: (x, y, h, rot) => { if (fl.on) return; const z = zoom(); at = [x / z, y / z, h / z, rot || 0]; flip = 1; layout(); },
  hide: () => { if (fl.on) return; at = null; layout(); },
  // Floor mode. eye: how high the phone is (m); tallM: his height (m).
  floorStart: (o) => {
    Object.assign(fl, o, { on: true, state: 'scan', scan: 0, anchor: null, pos: null, sent: '' });
    at = null; flip = 1; bubble.style.display = 'none';
    // His own flat shadow is drawn for a level view; on the floor he gets one in perspective instead.
    const own = svg.querySelector('.contact'); if (own) own.style.display = 'none';
    layout();
  },
  floorEye: (eye) => { fl.eye = eye; },
  floorLock: () => { if (fl.state !== 'found' || !fl.hit || fl.d < 0.8 || fl.d > 4) return false; fl.anchor = fl.hit.slice(); fl.state = 'locked'; say('locked'); return true; },
  // He appears right on the ring, does his arrival there, says hi, and stays on that spot.
  floorCall: (hello) => {
    if (fl.state !== 'locked' || !fl.cam) return false;
    fl.hello = hello || '';
    fl.pos = fl.anchor.slice();
    fl.state = 'greet'; flip = 1; queue = [R.hi]; begin(R.arrive, clock); shown = '';
    return true;
  },
  floorReset: () => { if (fl.on) Object.assign(fl, { state: 'scan', scan: 0, anchor: null, pos: null }); at = null; bubble.style.display = 'none'; layout(); },
  floorOff: () => { fl.on = false; fl.state = 'off'; marks.innerHTML = ''; at = null; bubble.style.display = 'none'; layout(); },
  // The app's own orientation, used only if the WebView sends no deviceorientation events.
  orient: (h, e, r) => { if (fl.src !== 'device') { fl.cam = fromApp(h, e, r); fl.src = 'app'; } },
};
render = (t) => { if (!held) draw(t); };
const draw = (t) => {
  clock = t;
  if (fl.on) floorFrame(t);
  const len = CLIPS[cur][3];
  if (cur !== R.idle && t - since >= len) {
    if (fl.on && fl.state === 'greet' && cur === R.hi) { fl.state = 'stay'; begin(R.idle, t); }   // said hi: he stays
    else begin(queue.length ? queue.shift() : R.idle, t);
  } else if (cur === R.idle && !mystery && !faceOn.mouth && !queue.length && R.extras.length && t - since >= rest && (!fl.on || fl.state === 'stay')) begin(R.extras[Math.floor(Math.random() * R.extras.length)], t);
  const loop = cur === R.idle;
  const lt = loop ? (t - since) % CLIPS[cur][3] : t - since, s = step(lt), key = cur + ':' + s;
  if (key === shown) return;   // a new drawing only every 1/12 s
  shown = key;
  apply(svg, Object.assign(CLIPS[cur][2](s), faceOn));   // the clip poses him; a talking face wins
  if (mystery && !quiet && at) mark();
};
addEventListener('resize', layout);
if (window.visualViewport) visualViewport.addEventListener('resize', layout);
layout();
const t0 = performance.now();
(function loop() { render((performance.now() - t0) / 1000); requestAnimationFrame(loop); })();
post({ type: 'ready' });
