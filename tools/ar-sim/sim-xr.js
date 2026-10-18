// Saath AR simulator: a physical fake of ARCore behind Chrome's WebXR, injected into web/ar/ before it loads
// (run.mjs sets window.__SIM = { room, script, opts } first). Nothing is scripted as results: hit tests, planes, anchors
// and light all come from a room model and a phone-pose script, played in real time at 30 fps as on the S24.
// World ("true"): metres, y up, the room's floor at y = 0. The page sees ARCore's frame instead, true + off: local-floor
// puts y = 0 1.2 m below where the phone started (Chrome's floor guess on ARCore), and a scripted map re-fix shifts it.
// shortcut: off is a translation only (no yaw drift), so scripts start facing -z; add a rotation if drift ever matters.
(() => {
  if (window.top !== window || !window.__SIM) return;   // not in the rig's frame
  const { room, script, opts = {} } = window.__SIM;
  const FPS = 30, VFOV = 72.7, W = 384, H = 832, D2R = Math.PI / 180, TY = Math.tan((VFOV / 2) * D2R), TX = TY * (W / H);
  // ARCore-ish mapping: a 10 cm patch counts once it has had CELL_S of clear view; a plane appears with MIN_CELLS patches,
  // its outline the convex hull of them (ARCore's outlines are convex), and nothing is found before INIT_S.
  const CELL = 0.1, CELL_S = 0.3, MIN_CELLS = 12, INIT_S = 1, RANGE = 4.5, NOISE = opts.anchorNoise ?? 0.002;
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';   // the page's own copy

  let seed = opts.seed ?? 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]), mul = (a, k) => a.map((v) => v * k);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], unit = (a) => mul(a, 1 / Math.hypot(...a));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), r3 = (a) => a.map((v) => +v.toFixed(3));
  const mat = (X, Y, Z, p) => new Float32Array([...X, 0, ...Y, 0, ...Z, 0, ...p, 1]);   // column-major, as WebXR
  const pose = (m) => ({ emulatedPosition: false, transform: { matrix: m, position: { x: m[12], y: m[13], z: m[14], w: 1 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } });

  // ---- The room as rectangles: centre c, normal N (out of the surface), in-plane axes X and Z = X x N, half sizes ----
  const faces = [];
  const face = (c, N, X, hx, hz, look) => faces.push({ c, N, X, Z: cross(X, N), hx, hz, texture: 0.6, ...look, i: faces.length, cells: new Map(), mapped: [], plane: null });
  const [x0, x1] = room.x, [z0, z1] = room.z, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2, RH = room.h;
  face([mx, 0, mz], [0, 1, 0], [1, 0, 0], hx, hz, room.floor);
  face([mx, RH, mz], [0, -1, 0], [1, 0, 0], hx, hz, room.wall);
  face([mx, RH / 2, z0], [0, 0, 1], [1, 0, 0], hx, RH / 2, room.wall);
  face([mx, RH / 2, z1], [0, 0, -1], [1, 0, 0], hx, RH / 2, room.wall);
  face([x0, RH / 2, mz], [1, 0, 0], [0, 0, 1], hz, RH / 2, room.wall);
  face([x1, RH / 2, mz], [-1, 0, 0], [0, 0, 1], hz, RH / 2, room.wall);
  for (const b of room.boxes) {
    const [a, c] = b.x, [d, e] = b.z, bx = (a + c) / 2, bz = (d + e) / 2, h = b.h / 2;
    face([bx, b.h, bz], [0, 1, 0], [1, 0, 0], (c - a) / 2, (e - d) / 2, b);
    face([bx, h, e], [0, 0, 1], [1, 0, 0], (c - a) / 2, h, b);
    face([bx, h, d], [0, 0, -1], [1, 0, 0], (c - a) / 2, h, b);
    face([c, h, bz], [1, 0, 0], [0, 0, 1], (e - d) / 2, h, b);
    face([a, h, bz], [-1, 0, 0], [0, 0, 1], (e - d) / 2, h, b);
  }
  // The nearest face a ray meets from its front (the surface the camera actually sees there).
  const cast = (o, d) => {
    let best = null;
    for (const f of faces) {
      const den = dot(d, f.N); if (den > -1e-6) continue;
      const t = dot(sub(f.c, o), f.N) / den; if (t <= 0 || (best && t >= best.t)) continue;
      const r = sub(add(o, mul(d, t)), f.c), lx = dot(r, f.X), lz = dot(r, f.Z);
      if (Math.abs(lx) <= f.hx && Math.abs(lz) <= f.hz) best = { f, t, lx, lz };
    }
    return best;
  };
  const inPoly = (poly, x, z) => {
    let k = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, az] = poly[i], [bx, bz] = poly[j]; if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) k = !k; }
    return k;
  };
  const hull = (p) => {
    p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (pts) => pts.reduce((h, q) => { while (h.length > 1 && cr(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); return h; }, []);
    return [...half(p).slice(0, -1), ...half(p.slice().reverse()).slice(0, -1)];
  };
  // A plane's outline: the hull of its mapped patches' corners, kept on the surface.
  const outline = (f, now) => {
    const pts = [];
    for (const c of f.mapped) { const i = Math.floor(c / 1000), j = c % 1000; for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) pts.push([clamp((i + a) * CELL - f.hx, -f.hx, f.hx), clamp((j + b) * CELL - f.hz, -f.hz, f.hz)]); }
    f.poly = hull(pts);
    f.plane ??= { planeSpace: { face: f }, orientation: Math.abs(f.N[1]) > 0.9 ? 'horizontal' : 'vertical' };
    f.plane.polygon = f.poly.map(([x, z]) => new DOMPointReadOnly(x, 0, z)); f.plane.lastChangedTime = now;
  };
  // Each frame ARCore looks for detail across the picture: rays through a jittered 8 x 16 grid. q0 is the light and
  // motion; a patch also needs detail on the surface, a view not too glancing, and to be within about 4 m.
  const observe = (o, [X, Y, Z], dt, q0, now) => {
    const gain = new Map();
    for (let i = 0; i < 8; i++) for (let j = 0; j < 16; j++) {
      const d = unit(add(add(mul(X, (((i + rnd()) / 8) * 2 - 1) * TX), mul(Y, (((j + rnd()) / 16) * 2 - 1) * TY)), mul(Z, -1)));
      const h = cast(o, d); if (!h || h.t < 0.25 || h.t > RANGE) continue;
      const q = q0 * h.f.texture * Math.min(1, -dot(d, h.f.N) / 0.3) * Math.min(1, (RANGE - h.t) / 1.5);
      const key = h.f.i * 1e6 + Math.floor((h.lx + h.f.hx) / CELL) * 1000 + Math.floor((h.lz + h.f.hz) / CELL);
      gain.set(key, Math.max(gain.get(key) ?? 0, q));
    }
    for (const [key, q] of gain) {
      const f = faces[Math.floor(key / 1e6)], c = key % 1e6, was = f.cells.get(c) ?? 0;
      f.cells.set(c, was + q * dt);
      if (was < CELL_S && was + q * dt >= CELL_S) { f.mapped.push(c); f.dirty = true; }
    }
    for (const f of faces) if (f.dirty && f.mapped.length >= MIN_CELLS) { f.dirty = false; outline(f, now); }
  };
  // WebXR hit test as ARCore does it: the ray against every detected plane, inside its outline, nearest first. Like
  // ARCore it knows nothing of surfaces it hasn't mapped, so it can return the floor behind an unmapped bed.
  const hitsAlong = (o, d) => faces.filter((f) => f.plane).map((f) => {
    const den = dot(d, f.N); if (den > -1e-6) return null;
    const t = dot(sub(f.c, o), f.N) / den; if (t <= 0) return null;
    const p = add(o, mul(d, t)), r = sub(p, f.c);
    return inPoly(f.poly, dot(r, f.X), dot(r, f.Z)) ? { t, p, f, m: mat(f.X, f.N, f.Z, add(p, off)) } : null;
  }).filter(Boolean).sort((a, b) => a.t - b.t);

  // ---- ARCore's frame, anchors, light ----
  const eye0 = room.eye, start = [room.start[0], eye0, room.start[1]];
  let off = [-start[0], -(eye0 - 1.2), -start[2]];
  const anchors = [];
  const sh = new Float32Array(27); for (let c = 0; c < 3; c++) sh[c] = room.light.ambient / 0.282095;
  const ld = unit(room.light.lamp.dir), li = room.light.lamp.intensity;
  const light = { sphericalHarmonicsCoefficients: sh, primaryLightDirection: { x: ld[0], y: ld[1], z: ld[2], w: 0 }, primaryLightIntensity: { x: li, y: li, z: li, w: 1 } };
  const f = 1 / TY, PROJ = new Float32Array([f / (W / H), 0, 0, 0, 0, f, 0, 0, 0, 0, -60.02 / 59.98, -1, 0, 0, -2.4 / 59.98, 0]);

  // ---- The phone: a script of steps (scenarios.mjs), each easing from where the last one left the phone ----
  const S = window.__sim = { faces, log: [], events: [], want: null, tap: false, done: false, placed: false, friend: null, ringAt: null, errors: 0 };
  const ph = { o: start.slice(), yaw: 0, pitch: -20 };
  const target = (n) => { if (Array.isArray(n)) return n; const b = room.boxes.find((x) => x.name === n); return [(b.x[0] + b.x[1]) / 2, b.h, (b.z[0] + b.z[1]) / 2]; };
  const aim = (from, at) => { const v = sub(at, from); return { yaw: Math.atan2(-v[0], -v[2]) / D2R, pitch: Math.atan2(v[1], Math.hypot(v[0], v[2])) / D2R }; };
  let si = -1, seg = null, clipQueue = null;
  const rigWin = () => document.getElementById('rig')?.contentWindow;
  const next = (t) => {
    const s = script[++si];
    if (!s) { S.done = true; seg = { s: {}, t0: t, dur: 1e9, from: { ...ph }, to: { ...ph } }; return; }
    const from = { o: ph.o.slice(), yaw: ph.yaw, pitch: ph.pitch }, to = { ...from, o: from.o.slice() };
    let ease = s.s ?? 0.8, dur = s.s ?? s.hold ?? 0, wob = null, until = null;   // ease: how long the move takes
    if (s.look) { Object.assign(to, s.look); dur = ease; }
    if (s.lookAt) { Object.assign(to, aim(from.o, target(s.lookAt))); ease = dur = s.s ?? 1; }
    if (s.sweep) { to.pitch = s.pitch ?? from.pitch; wob = (e) => s.sweep * Math.sin((2 * Math.PI * e) / s.s); }   // one look left and right every s
    if (s.walkTo && S.friend) {   // to dist from him, looking at his middle, at a slow 0.6 m/s
      const fr = S.friend, d = sub(from.o, fr); d[1] = 0;
      to.o = add([fr[0], from.o[1], fr[2]], mul(unit(d), s.dist));
      Object.assign(to, aim(to.o, [fr[0], 0.6, fr[2]]));
      ease = dur = s.s ?? Math.max(1, Math.hypot(...sub(to.o, from.o)) / 0.6);
    }
    if (s.eye) { to.o[1] = s.eye; ease = dur = s.s ?? 1.2; }
    if (s.follow) { dur = s.follow; until = () => S.placed; }
    if (s.clips) {   // every gesture of his, one after another, each when the last has finished
      const A = rigWin()?.SAATH_AR; clipQueue = A ? Object.entries(A.actions) : [];
      let playing = null; dur = 600;
      until = () => {
        const sa = rigWin()?.saath; if (!sa) return true;
        if (playing && sa.now().clip === playing) return false;
        if (!clipQueue.length) return true;
        const [word, clip] = clipQueue.shift(); playing = clip; sa.act(word); S.events.push({ t: (performance.now() - T0) / 1000, clip, word });
        return false;
      };
    }
    if (s.jump) { if (s.jump.camera) off = add(off, s.jump.camera); if (s.jump.anchor) for (const a of anchors) a.err = add(a.err, s.jump.anchor); }
    if (s.talk) S.want = { say: s.talk, press: s.press ?? 1.5 };
    to.yaw = from.yaw + ((((to.yaw - from.yaw) % 360) + 540) % 360) - 180;   // the short way round
    seg = { s, t0: t, ease, dur, from, to, wob, until, amp: 0, phase: 0 };
    S.events.push({ t: +t.toFixed(3), step: si, ...s });   // rounded as the log is, so the frame of a jump is on its side of it
  };
  // A user who does what the tip says and wants him on the floor: aims at the floor a few steps ahead of where the phone
  // faced at Start (follow.yaw, default 0: open floor in both rooms), looking slowly left and right, nearer or further when
  // told; when the ring is on the floor (not a bed or desk top) holds still and taps TAP_S later. Eased in over about 0.5 s.
  const TAP_S = 0.4;
  const stepPose = (t, dt) => {
    while (!seg || (!S.done && (t - seg.t0 >= seg.dur || seg.until?.(t)))) next(t);
    if (seg.s.follow) {
      const tip = S.tip ?? '', k = 1 - Math.exp(-dt / 0.5), onFloor = S.ring && Math.abs(S.ring[1]) < 0.05;
      if (tip.startsWith('Tap') && onFloor) { seg.tapAt ??= t; if (t - seg.tapAt >= TAP_S) { S.tap = true; seg.tapAt = Infinity; } return; }   // hold still, tap once
      seg.tapAt = null;
      const pitch = tip.startsWith('Too close') ? -20 : tip.startsWith('Too far') ? -45 : -30;
      seg.mid = (seg.mid ?? seg.from.yaw) + ((seg.s.yaw ?? 0) - (seg.mid ?? seg.from.yaw)) * k;
      ph.pitch += (pitch - ph.pitch) * k; seg.amp += (12 - seg.amp) * k; seg.phase += (2 * Math.PI * dt) / 6;
      ph.yaw = seg.mid + seg.amp * Math.sin(seg.phase);
      return;
    }
    const k = Math.min(1, (t - seg.t0) / (seg.ease || 1)), e = k * k * (3 - 2 * k);
    ph.o = seg.from.o.map((v, i) => v + (seg.to.o[i] - v) * e);
    ph.yaw = seg.from.yaw + (seg.to.yaw - seg.from.yaw) * e + (seg.wob ? seg.wob(t - seg.t0) : 0);
    ph.pitch = seg.from.pitch + (seg.to.pitch - seg.from.pitch) * e;
  };
  // A hand holding a phone: a slow sway and a little shake, plus a step bob while walking.
  const held = (t, speed) => ({
    o: add(ph.o, [0.002 * Math.sin(t * 2.1), 0.002 * Math.sin(t * 1.7) + (speed > 0.2 ? 0.012 * Math.sin(t * 2 * Math.PI * 1.8) : 0), 0.002 * Math.sin(t * 1.3)]),
    yaw: ph.yaw + 0.3 * Math.sin(t * 2 * Math.PI * 0.4) + 0.08 * Math.sin(t * 2 * Math.PI * 3.1),
    pitch: ph.pitch + 0.25 * Math.sin(t * 2 * Math.PI * 0.33) + 0.08 * Math.sin(t * 2 * Math.PI * 2.7),
  });
  const axes = (yaw, pitch) => {
    const cy = Math.cos(yaw * D2R), sy = Math.sin(yaw * D2R), cp = Math.cos(pitch * D2R), sp = Math.sin(pitch * D2R);
    return [[cy, 0, -sy], [sy * sp, cp, cy * sp], [sy * cp, -sp, cy * cp]];   // the camera's X, Y and Z (it looks along -Z)
  };

  // ---- His drawing's feet: the lowest 6 cm of the drawn art, against the rig's ground point, in real centimetres ----
  const drawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) {
    if (this.canvas.height === 1024 && img instanceof HTMLImageElement) S.art = img;   // his new drawing, as the page's art canvas (PX_H) gets it
    return drawImage.call(this, img, ...a);
  };
  const small = document.createElement('canvas'), sg = small.getContext('2d', { willReadFrequently: true });
  let meta = null;
  const feet = () => {
    if (!meta) {
      const w = rigWin(), svg = w && [...w.document.body.children].find((e) => e.tagName === 'svg' && e.querySelector('.head'));
      if (!svg) return null;
      const vb = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number), tall = Number(new URLSearchParams(location.search).get('tall')) || 1.4;
      meta = { A: w.SAATH_AR, vb, cardH: (vb[3] * tall) / w.SAATH_AR.tall };
    }
    // Drawn small from the decoded picture on a CPU canvas: reading back the page's GPU canvas stalled its frames.
    const a = S.art, { A, vb, cardH } = meta, h = 128, w = Math.round((a.naturalWidth / a.naturalHeight) * h), mpp = cardH / h;
    small.width = w; small.height = h; drawImage.call(sg, a, 0, 0, w, h);
    const px = sg.getImageData(0, 0, w, h).data, rows = Array.from({ length: h }, () => []);
    let n = 0, edge = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 40) { n++; rows[y].push(x); if (!x || !y || x === w - 1 || y === h - 1) edge = true; }
    const bottom = rows.findLastIndex((r) => r.length >= 2);
    if (bottom < 0) return { n: 0 };
    const xs = rows.slice(Math.max(0, bottom - Math.round(0.06 / mpp)), bottom + 1).flat(), xc = xs.reduce((s, x) => s + x + 0.5, 0) / xs.length;
    const gx = ((A.ground[0] - vb[0]) / vb[2]) * w, gy = ((A.ground[1] - vb[1]) / vb[3]) * h;
    return { dx: +((xc - gx) * mpp * 100).toFixed(1), lift: +((gy - bottom - 1) * mpp * 100).toFixed(1), wide: +((Math.max(...xs) - Math.min(...xs) + 1) * mpp * 100).toFixed(0), n, edge };
  };

  // ---- The camera feed: a worker draws the room from the phone's true pose, behind the page (off its main thread,
  // as the phone's compositor does) ----
  const FEED = `import * as THREE from '${THREE_URL}';
let r, cam, scene;
const tiles = (color, size, w, h) => {
  const c = new OffscreenCanvas(256, 256), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) { g.fillStyle = 'rgba(40,30,20,' + Math.random() * 0.12 + ')'; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 1 + Math.random() * 3); }
  g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 4; g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / size, h / size); t.colorSpace = THREE.SRGBColorSpace; return t;
};
onmessage = ({ data: d }) => {
  if (d.canvas) {
    r = new THREE.WebGLRenderer({ canvas: d.canvas, antialias: true }); r.setSize(d.w, d.h, false);
    cam = new THREE.PerspectiveCamera(d.vfov, d.w / d.h, 0.02, 60); cam.matrixAutoUpdate = false;
    scene = new THREE.Scene(); scene.background = new THREE.Color('#000');
    const k = 0.4 + 0.6 * d.light.level;   // a phone camera brightens a dim room, but not all the way
    const sun = new THREE.DirectionalLight('#ffe8c8', 1.4 * k); sun.position.set(...d.light.lamp.dir);
    scene.add(new THREE.HemisphereLight('#ffffff', '#806a55', 2.4 * k), sun);
    for (const f of d.faces) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * f.hx, 2 * f.hz), new THREE.MeshLambertMaterial(f.tiles ? { map: tiles(f.color, f.tiles, 2 * f.hx, 2 * f.hz) } : { color: f.color }));
      const X = new THREE.Vector3(...f.X), N = new THREE.Vector3(...f.N);
      m.matrixAutoUpdate = false; m.matrix.makeBasis(X, new THREE.Vector3().crossVectors(N, X), N).setPosition(...f.c); scene.add(m);
    }
    return;
  }
  cam.matrix.fromArray(d.m); cam.matrixWorld.copy(cam.matrix); cam.matrixWorldInverse.copy(cam.matrix).invert(); r.render(scene, cam);
};`;
  let feed = null;
  const startFeed = () => {
    document.documentElement.style.background = document.body.style.background = 'transparent';   // as :xr-overlay does on the phone
    const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-2';
    document.body.prepend(cv);
    const oc = cv.transferControlToOffscreen();
    feed = new Worker(URL.createObjectURL(new Blob([FEED], { type: 'text/javascript' })), { type: 'module' });
    feed.onerror = (e) => S.events.push({ feedError: e.message || 'worker failed' });
    feed.postMessage({ canvas: oc, w: W, h: H, vfov: VFOV, light: room.light, faces: faces.map(({ c, N, X, hx, hz, color, tiles }) => ({ c, N, X, hx, hz, color, tiles })) }, [oc]);
  };

  // ---- WebXR ----
  const FEATURES = ['viewer', 'local', 'local-floor', 'hit-test', 'plane-detection', 'anchors', 'dom-overlay', 'light-estimation'];
  class Session extends EventTarget {
    constructor() { super(); Object.assign(this, { enabledFeatures: FEATURES, renderState: {}, inputSources: [], visibilityState: 'visible', cbs: [], ended: false }); }
    updateRenderState(s) { Object.assign(this.renderState, s); }
    async requestReferenceSpace(type) { return { type }; }
    async requestHitTestSource(o) { return { o }; }
    async requestLightProbe() { return { probeSpace: {} }; }
    requestAnimationFrame(cb) { this.cbs.push(cb); return this.cbs.length; }
    cancelAnimationFrame() {}
    async end() { if (!this.ended) { this.ended = true; this.dispatchEvent(new Event('end')); } }
  }
  window.XRWebGLLayer = class { constructor() { this.framebuffer = null; this.framebufferWidth = W; this.framebufferHeight = H; } getViewport() { return { x: 0, y: 0, width: W, height: H }; } };
  window.XRRigidTransform ??= class { constructor(p = {}) { this.position = { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0, w: 1 }; } };
  WebGL2RenderingContext.prototype.makeXRCompatible = WebGLRenderingContext.prototype.makeXRCompatible = async function () {};
  let session = null, T0 = 0, lastT = 0, lastFwd = null, lastO = null, n = 0;
  Object.defineProperty(navigator, 'xr', { configurable: true, value: {
    isSessionSupported: async (mode) => mode === 'immersive-ar',
    requestSession: async () => { session = new Session(); T0 = performance.now(); S.wall0 = Date.now(); startFeed(); setTimeout(loop, 0); return session; },
    addEventListener() {},
  } });

  const tick = () => {
    const now = performance.now(), t = (now - T0) / 1000, dt = Math.min(0.2, t - lastT || 1 / FPS);
    lastT = t;
    stepPose(t, dt);
    const lost = !!seg.s.lose;
    const speed = lastO ? Math.hypot(...sub(ph.o, lastO)) / dt : 0; lastO = ph.o.slice();
    const p = held(t, speed), [X, Y, Z] = axes(p.yaw, p.pitch), fwd = mul(Z, -1);
    const turn = lastFwd ? Math.acos(clamp(dot(fwd, lastFwd), -1, 1)) / dt : 0; lastFwd = fwd;
    // Light and motion: in a dim room the camera exposes longer, so a slower turn already blurs the detail away.
    const L = clamp(room.light.level, 0.15, 1), w0 = 0.4 + 0.4 * L, qm = clamp(1 - (turn - w0) / (0.3 + 1.2 * L), 0, 1) * clamp(2 - speed, 0, 1);
    if (!lost && t > INIT_S) observe(p.o, [X, Y, Z], dt, L * qm, now);
    const cm = mat(X, Y, Z, add(p.o, off));
    feed?.postMessage({ m: mat(X, Y, Z, p.o) });
    const hits = lost ? [] : hitsAlong(p.o, fwd), noise = () => [gauss(), gauss(), gauss()].map((v) => v * NOISE);
    const frame = {
      session,
      getViewerPose: () => (lost ? null : { ...pose(cm), views: [{ eye: 'none', projectionMatrix: PROJ, transform: pose(cm).transform }] }),
      getHitTestResults: () => hits.map((h) => ({ getPose: () => pose(h.m) })),
      detectedPlanes: new Set(faces.filter((x) => x.plane).map((x) => x.plane)),
      getPose: (sp) => (sp.face ? pose(mat(sp.face.X, sp.face.N, sp.face.Z, add(sp.face.c, off)))
        : sp.anchor ? pose(mat([1, 0, 0], [0, 1, 0], [0, 0, 1], add(add(sp.anchor.at, off), add(sp.anchor.err, noise())))) : null),
      createAnchor: (rt) => {
        const a = { at: sub([rt.position.x, rt.position.y, rt.position.z], off), err: [0, 0, 0], anchorSpace: {}, delete() {} };
        a.anchorSpace.anchor = a; anchors.push(a); S.events.push({ t, anchor: r3(a.at) });
        return Promise.resolve(a);
      },
      trackedAnchors: new Set(lost ? [] : anchors),
      getLightEstimate: () => (t < 0.5 ? null : light),   // ARCore has none for the first frames
    };
    const cbs = session.cbs.splice(0), a = performance.now();
    for (const cb of cbs) try { cb(now, frame); } catch (e) { S.errors++; setTimeout(() => { throw e; }); }   // a page error, reported as one
    const ms = performance.now() - a;
    // The scripted user's tap: a WebXR select, with this frame, as Chrome sends one for a tap on the screen.
    if (S.tap) { S.tap = false; session.dispatchEvent(Object.assign(new Event('select'), { frame, inputSource: {} })); S.events.push({ t: +t.toFixed(3), tap: true }); }
    // What the page did with it, for run.mjs's checks.
    const st = window.state?.(), sa = rigWin()?.saath?.now?.();
    S.placed = !!st?.placed; S.tip = st?.tip; if (S.placed) S.friend = sub(st.at, off);
    S.ring = st?.ringAt ? sub(st.ringAt, off) : null;   // where the ring is in the room, or null
    if (S.ringAt == null && S.ring) S.ringAt = t;
    const row = { t: +t.toFixed(3), ms: +ms.toFixed(1), step: si, lost, cam: [...r3(p.o), +p.yaw.toFixed(1), +p.pitch.toFixed(1)], turn: +turn.toFixed(2),
      planes: faces.filter((x) => x.plane && x.N[1] > 0.9).map((x) => x.name ?? 'floor'), hit: hits[0] ? [...r3(hits[0].p), hits[0].f.name ?? (hits[0].f.N[1] > 0.9 ? 'floor' : 'wall')] : null,
      tip: st?.tip, ring: !!st?.ring, ringAt: S.ring && r3(S.ring), placed: S.placed, at: st?.at,
      friend: S.friend && r3(S.friend), close: st?.close, talk: st?.talk, hint: st?.hint, clip: sa?.clip, mouth: sa?.face?.mouth ?? null };
    if (S.art) { row.feet = feet(); S.art = null; }
    row.simMs = +(performance.now() - now - ms).toFixed(1);   // this simulator's own cost on the page's thread, not the page's
    S.log.push(row);
  };
  const loop = () => {
    if (session.ended) return;
    try { tick(); } catch (e) { S.events.push({ simError: String(e.stack || e) }); }
    n = Math.max(n + 1, Math.ceil((performance.now() - T0) / (1000 / FPS)));   // late: drop the frames it missed, as the phone does
    setTimeout(loop, Math.max(0, T0 + (n * 1000) / FPS - performance.now()));
  };
})();
