// The guide from you to the friend you're tracking. Pasted into mapHtml.ts.
//
// A glowing azure path along real walking streets (gold for the last stretch), with pulses of
// light flowing towards the friend, soft gold ripples on the ground where they stand, a shower of
// gold stars when you arrive and a glass arrow at the screen edge while they're off-screen.
// Buildings hide the path; a fainter second pass shows it through them. The path and the ripples
// are small WebGL layers: animating them only changes a few numbers per frame, never map data or styles.

export const NAV_CSS = `
.nav-edge{position:absolute;left:0;top:0;z-index:3;width:0;height:0;pointer-events:none;opacity:0;transition:opacity .2s}
.nav-edge.on{opacity:1}
.nav-edge-btn{position:absolute;left:-23px;top:-23px;width:46px;height:46px;box-sizing:border-box;margin:0;padding:0;border-radius:50%;background:rgba(255,255,255,.72);-webkit-backdrop-filter:blur(10px) saturate(1.4);backdrop-filter:blur(10px) saturate(1.4);border:1px solid rgba(255,255,255,.85);box-shadow:0 6px 16px rgba(42,34,56,.28);display:flex;align-items:center;justify-content:center;pointer-events:none;-webkit-tap-highlight-color:transparent}
.nav-edge.on .nav-edge-btn{pointer-events:auto}
.nav-edge-dir{display:block;width:26px;height:26px}
.nav-edge-dir svg{display:block;animation:nav-nudge 1.1s ease-in-out infinite}
.nav-edge-dist{position:absolute;left:0;top:26px;transform:translateX(-50%);background:#2F8DF6;border-radius:999px;padding:0 8px;font:800 12px/19px system-ui,Roboto,sans-serif;color:#fff;white-space:nowrap;box-shadow:0 3px 10px rgba(47,141,246,.45)}
.nav-edge-dist:empty{display:none}
@keyframes nav-nudge{0%,100%{transform:translateY(1px)}50%{transform:translateY(-3px)}}
.nav-party{width:0;height:0;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(42,34,56,.35))}
.nav-party i{position:absolute;left:-7px;top:-7px;width:14px;height:14px;opacity:0;animation:nav-pop 1.3s cubic-bezier(.15,.8,.3,1) forwards;
  clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.nav-party i:nth-child(3n){left:-5px;top:-5px;width:10px;height:10px}
@keyframes nav-pop{0%{opacity:1;transform:rotate(var(--a)) translateY(-6px) scale(.4)}65%{opacity:1}100%{opacity:0;transform:rotate(var(--a)) translateY(var(--d)) rotate(220deg) scale(1)}}
`;

/**
 * Runs inside the map page. createNav(map, post, hooks) returns what the page calls:
 * - addLayers(): on every style load, after the style's own layers and the accuracy circle.
 * - setMe(me, accuracy) and setTarget(target): positions as [lng, lat], or null.
 * - setInsets(top, bottom): pixels hidden under the app's card (top) and buttons (bottom).
 * - frame(now): on every animation frame.
 * hooks.focus(lng, lat) moves the map to a spot (and stops it following you). Only tapping the
 * edge arrow calls it; the guide never moves the camera by itself.
 * window.__navDebug() returns the guide's state and timings, for tests.
 */
export const NAV_JS = `
  function createNav(map, post, hooks) {
    // Walking routes come from the FOSSGIS OSRM foot router (OpenStreetMap data, free, no key).
    var ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/';
    // Within FINAL_M of the friend the path is a straight line (GPS is about 5 m and they're right
    // there); it goes back to the route past FINAL_EXIT_M. Further than DRIFT_M off the route = lost.
    var FINAL_M = 60, FINAL_EXIT_M = 80, DRIFT_M = 25;
    var REROUTE_MS = 10000, TIMEOUT_MS = 4000, HOLD_MS = 700, BURST_MS = 1300, FADE_MS = 250;
    var RAD = Math.PI / 180;
    var AZURE = [0.184, 0.553, 0.965], WHITE = [1, 1, 1], GOLD = [0.976, 0.737, 0.302], AMBER = [0.957, 0.62, 0.227];
    // The look at each closeness level (the app's levels: here <= 20 m, hot <= 60, warm <= 200,
    // cold <= 600): path colour, pulse colour, ripple colour, pulse pace in px/s and ripple period
    // in s. It turns gold for the last 60 m and quickens as you close in.
    var LOOKS = {
      far: { core: AZURE, mark: WHITE, ring: GOLD, pace: 40, period: 2.2 },
      cold: { core: AZURE, mark: WHITE, ring: GOLD, pace: 48, period: 1.9 },
      warm: { core: AZURE, mark: GOLD, ring: GOLD, pace: 62, period: 1.4 },
      hot: { core: GOLD, mark: WHITE, ring: GOLD, pace: 85, period: 0.95 },
      here: { core: AMBER, mark: WHITE, ring: GOLD, pace: 85, period: 0.75 }
    };

    var me = null, accuracy = 0, target = null, key = '';
    var insetTop = 0, insetBottom = 0, W = 0, H = 0;
    var level = 'far', final = false, partyKey = '';
    // none: nothing to draw. hold: briefly waiting for a route. route / straight: what's drawn.
    var mode = 'none', holdUntil = 0;
    var route = null, asking = null, lastAsk = -1e9, calmUntil = 0, fails = 0, skipUntil = {};
    var lastCheck = 0, lastPaint = 0, layerOn = false, fallbackOn = false;
    var dbg = { asks: 0, last: '', frames: 0, frameMs: 0, frameMax: 0, renders: 0, renderMs: 0, renderMax: 0 };

    function metres(a, b) {
      var dLat = (b[1] - a[1]) * RAD, dLng = (b[0] - a[0]) * RAD;
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    function lineLength(pts) {
      for (var i = 1, m = 0; i < pts.length; i++) m += metres(pts[i - 1], pts[i]);
      return m;
    }
    // The point on a line nearest to p, which segment it's on and how far off p is (m).
    function nearestOnLine(pts, p) {
      var kx = 111320 * Math.cos(p[1] * RAD), ky = 110574, best = { i: 0, t: 0, d2: Infinity };
      for (var i = 0; i < pts.length - 1; i++) {
        var ax = (pts[i][0] - p[0]) * kx, ay = (pts[i][1] - p[1]) * ky;
        var vx = (pts[i + 1][0] - p[0]) * kx - ax, vy = (pts[i + 1][1] - p[1]) * ky - ay;
        var l2 = vx * vx + vy * vy, t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / l2)) : 0;
        var x = ax + vx * t, y = ay + vy * t;
        if (x * x + y * y < best.d2) best = { i: i, t: t, d2: x * x + y * y };
      }
      var a = pts[best.i], b = pts[best.i + 1];
      return { i: best.i, p: [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t], off: Math.sqrt(best.d2) };
    }
    function levelFor(d, prev) {
      if (d <= 20 || (prev === 'here' && d <= 35)) return 'here';
      return d <= 60 ? 'hot' : d <= 200 ? 'warm' : d <= 600 ? 'cold' : 'far';
    }
    function keyOf(p) { return p ? p[0].toFixed(6) + ',' + p[1].toFixed(6) : ''; }
    function mercY(lat) { return (180 - Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2)) / RAD) / 360; }

    // ---- Routing ----------------------------------------------------------------------------
    // One request at a time, a new target at most every 1.5 s, a re-route at most every 10 s, and
    // backing off after failures: it's a shared free service.
    function wantRoute(now) {
      if (!me || !target || asking || final || metres(me, target) <= FINAL_M) return;
      var r = route && route.key === key ? route : null;
      if (r && !r.drift) return;
      if (now < calmUntil || now < (skipUntil[key] || 0) || navigator.onLine === false) return;
      if (now - lastAsk < (r ? REROUTE_MS : 1500)) return;
      ask(now);
    }
    function ask(now) {
      var job = { key: key, from: me.slice(), to: target.slice(), done: false, ctrl: null };
      var url = ROUTER + job.from[0].toFixed(6) + ',' + job.from[1].toFixed(6) + ';' +
        job.to[0].toFixed(6) + ',' + job.to[1].toFixed(6) + '?overview=full&geometries=geojson';
      try { job.ctrl = new AbortController(); } catch (e) {}
      asking = job;
      lastAsk = now;
      dbg.asks++;
      job.timer = setTimeout(function () { settle(job, null, 'slow'); }, TIMEOUT_MS);
      fetch(url, job.ctrl ? { signal: job.ctrl.signal } : {}).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (json) { settle(job, json, ''); }, function () { settle(job, null, 'offline'); });
    }
    function cancelAsk() {
      if (!asking) return;
      asking.cancelled = true;
      if (asking.ctrl) try { asking.ctrl.abort(); } catch (e) {}
      asking = null;
    }
    function settle(job, json, why) {
      if (job.done) return;
      job.done = true;
      clearTimeout(job.timer);
      if (!json && job.ctrl) try { job.ctrl.abort(); } catch (e) {}
      if (asking === job) asking = null;
      if (job.cancelled) return;
      var now = performance.now(), pts = json ? checkRoute(json, job.from, job.to) : null;
      if (!pts) {
        why = why || 'odd';
        // A silly route stays silly for a while; a network problem backs off 10 s, 20 s, 40 s, 60 s.
        if (why === 'odd') skipUntil[job.key] = now + 60000;
        else { fails++; calmUntil = now + Math.min(60000, 5000 * Math.pow(2, fails)); }
        dbg.last = 'no route (' + why + ')';
        post({ type: 'log', msg: 'Guide: no walking route (' + why + '), drawing a straight line' });
        if (job.key === key) { holdUntil = 0; update('show'); }
        return;
      }
      fails = 0;
      route = { key: job.key, pts: pts, drift: false };
      dbg.last = 'route ' + Math.round(lineLength(pts)) + ' m, ' + pts.length + ' points';
      post({ type: 'log', msg: 'Guide: walking ' + dbg.last });
      if (job.key === key) update('route');
    }
    // A usable route reaches the friend and isn't a huge detour. It always ends exactly on them.
    function checkRoute(json, from, to) {
      var r = json && json.code === 'Ok' && json.routes && json.routes[0];
      var c = r && r.geometry && r.geometry.coordinates, pts = [];
      if (!c || c.length < 2) return null;
      for (var i = 0; i < c.length; i++) {
        var p = [+c[i][0], +c[i][1]];
        if (!isFinite(p[0]) || !isFinite(p[1])) return null;
        pts.push(p);
      }
      var first = pts[0], last = pts[pts.length - 1];
      var walk = lineLength(pts) + metres(from, first) + metres(last, to);
      if (metres(last, to) > 40 || metres(from, first) > 150 || walk > 2.5 * metres(from, to) + 100) return null;
      if (metres(last, to) < 0.5) pts.pop();
      pts.push(to.slice());
      return pts;
    }
    window.addEventListener('online', function () { calmUntil = 0; fails = 0; });

    // What to draw: always from you to the friend's exact spot. On a route, only the part ahead of
    // you, joined to you by a short straight piece.
    function update(why) {
      var now = performance.now(), pts = null, next = 'none';
      if (!target && fade.from) return;
      if (me && target) {
        var d = metres(me, target);
        level = levelFor(d, level);
        if (level === 'here' && partyKey !== key) { partyKey = key; arrive(now); }
        if (d > FINAL_M && partyKey === key) partyKey = '';
        final = d <= (final ? FINAL_EXIT_M : FINAL_M);
        var r = route && route.key === key ? route : null;
        if (!final && r) {
          var hit = nearestOnLine(r.pts, me);
          r.drift = hit.off > Math.max(DRIFT_M, accuracy);
          pts = [me];
          if (hit.off > 0.3) pts.push(hit.p);
          for (var i = hit.i + 1; i < r.pts.length; i++) pts.push(r.pts[i]);
          next = 'route';
        } else if (final || now >= holdUntil) {
          pts = [me, target];
          next = 'straight';
        } else next = 'hold';
      }
      var was = mode, drawIn = 0;
      mode = next;
      if (next === 'route' || next === 'straight') {
        // A new target or a first route draws itself in; a re-route or switching to the final
        // straight line redraws quickly; walking along just trims it.
        if (why === 'new' || was === 'none' || was === 'hold' || (why === 'route' && was !== 'route')) drawIn = 2;
        else if (why === 'route' || was !== next) drawIn = 1;
      }
      setPath(pts, drawIn);
      wantRoute(now);
    }

    // ---- Geometry ---------------------------------------------------------------------------
    // The path is a triangle strip in Mercator units around its first point (so it stays precise
    // at street zoom). Per vertex: position, extrusion (unit normal, mitred at corners), and
    // [distance left to the friend, side -1/1, cap -1 at your end / 1 at theirs]. Measuring from
    // the friend keeps the pulses flowing smoothly while the walked part is trimmed off.
    var path = { n: 0, verts: null, ox: 0, oy: 0, total: 0, box: null, dirty: false };
    var reveal = { from: 0, dur: 0 }, fade = { from: 0 }, burst = { from: -1e9 };
    var beacon = { on: false, x: 0, y: 0, at: null };
    function setPath(pts, drawIn) {
      var clean = [];
      if (pts) for (var i = 0; i < pts.length; i++) {
        if (!clean.length || metres(clean[clean.length - 1], pts[i]) > 0.05) clean.push(pts[i]);
      }
      if (clean.length < 2) { path.n = 0; path.verts = null; lineSource(); return; }
      var n = clean.length, X = [], Y = [], dx = [], dy = [], cum = [0], total = 0, out = [];
      var w = 180, s = 90, e = -180, no = -90;
      for (i = 0; i < n; i++) {
        X.push((clean[i][0] + 180) / 360);
        Y.push(mercY(clean[i][1]));
        w = Math.min(w, clean[i][0]); e = Math.max(e, clean[i][0]);
        s = Math.min(s, clean[i][1]); no = Math.max(no, clean[i][1]);
      }
      for (i = 0; i < n - 1; i++) {
        var ux = X[i + 1] - X[i], uy = Y[i + 1] - Y[i], l = Math.sqrt(ux * ux + uy * uy);
        dx.push(ux / l); dy.push(uy / l); total += l; cum.push(total);
      }
      function put(k, ex, ey, side, cap) { out.push(X[k] - X[0], Y[k] - Y[0], ex, ey, total - cum[k], side, cap); }
      var nx = -dy[0], ny = dx[0];
      put(0, nx - dx[0], ny - dy[0], 1, -1); put(0, -nx - dx[0], -ny - dy[0], -1, -1);
      put(0, nx, ny, 1, 0); put(0, -nx, -ny, -1, 0);
      for (i = 1; i < n - 1; i++) {
        var ax = -dy[i - 1], ay = dx[i - 1], bx = -dy[i], by = dx[i], mx = ax + bx, my = ay + by, m2 = mx * mx + my * my;
        if (m2 > 0.45) {
          // Mitre, at most 3x as wide as the path (|a + b|^2 = 4 cos^2 of half the turn).
          put(i, mx * 2 / m2, my * 2 / m2, 1, 0); put(i, -mx * 2 / m2, -my * 2 / m2, -1, 0);
        } else {
          // A hairpin: bevel it.
          put(i, ax, ay, 1, 0); put(i, -ax, -ay, -1, 0); put(i, bx, by, 1, 0); put(i, -bx, -by, -1, 0);
        }
      }
      var j = n - 2;
      nx = -dy[j]; ny = dx[j];
      put(n - 1, nx, ny, 1, 0); put(n - 1, -nx, -ny, -1, 0);
      put(n - 1, nx + dx[j], ny + dy[j], 1, 1); put(n - 1, -nx + dx[j], -ny + dy[j], -1, 1);
      path.verts = new Float32Array(out);
      path.n = out.length / 7;
      path.ox = X[0]; path.oy = Y[0]; path.total = total;
      path.box = [w, s, e, no];
      path.pts = clean;
      path.dirty = true;
      if (drawIn) { reveal.from = performance.now(); reveal.dur = drawIn === 2 ? 0 : 380; reveal.full = drawIn === 2; }
      lineSource();
    }
    function revealed(now, totalPx) {
      if (reveal.dur === 0 && reveal.full) reveal.dur = Math.max(450, Math.min(1500, totalPx / 1.4));
      if (!reveal.dur) return 1;
      var f = (now - reveal.from) / reveal.dur;
      if (f >= 1) { reveal.dur = 0; reveal.full = false; return 1; }
      return 1 - (1 - f) * (1 - f);
    }

    // ---- WebGL layer ------------------------------------------------------------------------
    var PATH_VS = [
      'precision highp float;',
      'uniform mat4 u_m; uniform float u_hw; uniform float u_g; uniform float u_world; uniform vec2 u_vp; uniform vec2 u_shift;',
      'attribute vec2 a_pos; attribute vec2 a_ext; attribute vec3 a_meta;',
      'varying vec3 v_line;',
      'void main() {',
      '  vec4 c0 = u_m * vec4(a_pos, 0.0, 1.0);',
      '  vec4 c1 = u_m * vec4(a_pos + a_ext * u_hw, 0.0, 1.0);',
      '  vec2 s = (c1.xy / c1.w - c0.xy / c0.w) * u_vp;',
      // x: px left to the friend, y: px across the path, z: screen px per ground px (for smoothing).
      '  v_line = vec3(a_meta.x * u_world - a_meta.z * u_g, a_meta.y * u_g, clamp(length(s) / (length(a_ext) * u_g), 0.05, 4.0));',
      '  gl_Position = c1 + vec4(u_shift * c1.w, 0.0, 0.0);',
      '}'
    ].join('\\n');
    var PATH_FS = [
      'precision highp float;',
      'uniform float u_edge; uniform float u_core; uniform float u_aa;',
      'uniform float u_total; uniform float u_shown; uniform float u_space; uniform float u_phase;',
      'uniform float u_s; uniform float u_alpha; uniform float u_shadow; uniform vec3 u_cCore; uniform vec3 u_cMark;',
      'varying vec3 v_line;',
      'const vec3 SHADE = vec3(0.204, 0.251, 0.416);',  // the map's shadow colour
      'const vec3 LINE = vec3(0.914, 0.965, 1.0);',
      'void main() {',
      '  float rem = v_line.x, across = v_line.y, aa = u_aa / v_line.z;',
      // Round ends at you, at the friend and at the tip while it draws itself in.
      '  float tip = u_total - u_shown, r = abs(across);',
      '  if (rem > u_total) r = length(vec2(rem - u_total, across));',
      '  else if (rem < tip) r = length(vec2(tip - rem, across));',
      '  if (r > u_edge) discard;',
      // A soft shadow on the ground, a little below the path.
      '  if (u_shadow > 0.5) {',
      '    float k = (1.0 - smoothstep(0.3 * u_core, u_core + 3.0 * u_s, r)) * 0.28 * u_alpha;',
      '    gl_FragColor = vec4(SHADE * k, k);',
      '    return;',
      '  }',
      // Light spilling round a tube, brightest along its top, with a thin bright line down the middle.
      '  float glow = 0.25 * (1.0 - smoothstep(1.5 * u_core, 2.1 * u_core, r)) + 0.16 * (1.0 - smoothstep(0.78 * u_edge, u_edge, r));',
      '  float body = 1.0 - smoothstep(u_core - aa, u_core + aa, r);',
      '  vec3 col = u_cCore * (0.86 + 0.22 * (1.0 - smoothstep(0.0, u_core, r)));',
      '  col = mix(col, LINE, (1.0 - smoothstep(1.4 * u_s - aa, 1.4 * u_s + aa, r)) * 0.85);',
      // Capsules of light flowing to the friend, fading in after you and out before them.
      '  float q = rem + u_phase, c = (floor(q / u_space) + 0.5) * u_space - u_phase;',
      '  float d = length(vec2(max(abs(rem - c) - 3.5 * u_s, 0.0), across)) - 2.0 * u_s;',
      '  float show = smoothstep(10.0, 22.0, c) * (1.0 - smoothstep(u_total - 28.0, u_total - 16.0, c)) * smoothstep(tip + 4.0, tip + 14.0, c);',
      '  col = mix(col, u_cMark, (1.0 - smoothstep(-aa, aa, d)) * show);',
      '  gl_FragColor = (vec4(col, 1.0) * body + vec4(mix(u_cCore, vec3(1.0), 0.3), 1.0) * glow * (1.0 - body)) * u_alpha;',
      '}'
    ].join('\\n');
    var BEACON_VS = [
      'precision highp float;',
      'uniform mat4 u_m; uniform float u_r; uniform float u_rpx; uniform vec2 u_vp;',
      'attribute vec2 a_corner;',
      'varying vec2 v_uv; varying float v_ratio;',
      'void main() {',
      '  vec4 c0 = u_m * vec4(0.0, 0.0, 0.0, 1.0);',
      '  vec4 c1 = u_m * vec4(a_corner * u_r, 0.0, 1.0);',
      '  vec2 s = (c1.xy / c1.w - c0.xy / c0.w) * u_vp;',
      '  v_uv = a_corner * u_rpx;',
      '  v_ratio = clamp(length(s) / (length(a_corner) * u_rpx), 0.05, 4.0);',
      '  gl_Position = c1;',
      '}'
    ].join('\\n');
    var BEACON_FS = [
      'precision highp float;',
      'uniform float u_cyc; uniform float u_here; uniform float u_burst;',
      'uniform float u_s; uniform float u_aa; uniform float u_alpha; uniform vec3 u_cRing;',
      'varying vec2 v_uv; varying float v_ratio;',
      'vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }',
      // A soft ring: a thin bright band with light either side.
      'vec4 ring(float r, float R, float w, vec3 col, float aa) {',
      '  float d = abs(r - R);',
      '  return vec4(col, 1.0) * max(1.0 - smoothstep(w - aa, w + aa, d), exp(-d * d / (8.0 * w * w)) * 0.5);',
      '}',
      'void main() {',
      '  float r = length(v_uv) / u_s, aa = u_aa / (v_ratio * u_s);',
      // A warm pool of light where the friend stands, brighter once you're here.
      '  vec4 c = vec4(u_cRing, 1.0) * exp(-r * r / 180.0) * (0.35 + 0.3 * u_here);',
      // Two ripples spreading out over the ground from the friend's spot.
      '  for (int i = 0; i < 2; i++) {',
      '    float f = fract(u_cyc + float(i) * 0.5);',
      '    c = over(ring(r, mix(12.0, 56.0, f), 1.4, u_cRing, aa) * pow(1.0 - f, 1.1) * smoothstep(0.0, 0.08, f), c);',
      '  }',
      // The arrival shockwave.
      '  if (u_burst >= 0.0) {',
      '    float e = 1.0 - pow(1.0 - u_burst, 3.0);',
      '    c = over(ring(r, mix(10.0, 120.0, e), 1.0 + 2.5 * (1.0 - u_burst), u_cRing, aa) * (1.0 - u_burst * u_burst), c);',
      '  }',
      '  gl_FragColor = c * u_alpha;',
      '}'
    ].join('\\n');

    var gl = null, progs = null, pathBuf = null, quadBuf = null, glBroken = false;
    var M = new Float32Array(16), AA = 0.75 / (window.devicePixelRatio || 1);
    var look = { core: AZURE.slice(), mark: WHITE.slice(), ring: GOLD.slice(), pace: 40, period: 2.2, here: 0 };
    var anim = { at: 0, phase: 0, cyc: 0, easing: false };

    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    }
    function program(vs, fs, attrs) {
      var p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      for (var i = 0; i < attrs.length; i++) gl.bindAttribLocation(p, i, attrs[i]);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var u = {}, count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (i = 0; i < count; i++) { var info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
      return { p: p, u: u };
    }
    function setup(g) {
      gl = g;
      progs = { path: program(PATH_VS, PATH_FS, ['a_pos', 'a_ext', 'a_meta']), beacon: program(BEACON_VS, BEACON_FS, ['a_corner']) };
      pathBuf = gl.createBuffer();
      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      path.dirty = true;
    }
    function u1(P, name, v) { if (P.u[name]) gl.uniform1f(P.u[name], v); }
    function u2(P, name, a, b) { if (P.u[name]) gl.uniform2f(P.u[name], a, b); }
    function u3(P, name, c) { if (P.u[name]) gl.uniform3f(P.u[name], c[0], c[1], c[2]); }
    // The camera matrix moved to a local origin, worked out in doubles: Mercator floats alone
    // would wobble by metres at street zoom.
    function local(m, ox, oy) {
      for (var i = 0; i < 12; i++) M[i] = m[i];
      for (i = 0; i < 4; i++) M[12 + i] = m[i] * ox + m[4 + i] * oy + m[12 + i];
      return M;
    }
    // Colours and pace glide to the current level's look.
    function ease(dt) {
      var want = LOOKS[level], k = 1 - Math.exp(-dt / 0.2), moving = false;
      ['core', 'mark', 'ring'].forEach(function (name) {
        for (var i = 0; i < 3; i++) {
          var d = want[name][i] - look[name][i];
          if (Math.abs(d) > 0.002) { look[name][i] += d * k; moving = true; } else look[name][i] = want[name][i];
        }
      });
      look.pace += (want.pace - look.pace) * k;
      look.period += (want.period - look.period) * k;
      var here = level === 'here' ? 1 : 0;
      if (Math.abs(here - look.here) > 0.002) { look.here += (here - look.here) * k; moving = true; } else look.here = here;
      anim.easing = moving;
    }
    // k: 1 for the main pass, under the buildings; less for the x-ray pass over them.
    function render(g, matrix, k) {
      var t0 = performance.now();
      if (glBroken) return;
      if (g !== gl || !progs || !g.isProgram(progs.path.p)) {
        try { setup(g); } catch (err) {
          glBroken = true;
          post({ type: 'log', msg: 'Guide: WebGL path failed (' + (err && err.message) + '), using plain lines' });
          return;
        }
      }
      var z = map.getZoom(), world = 512 * Math.pow(2, z), s = Math.max(0.55, Math.min(1, 0.55 + (z - 13) * 0.15));
      var space = 46 * s, wave = space * 4;
      if (k === 1) {
        // The animation moves on once a frame, in the main pass.
        var dt = Math.min(0.1, Math.max(0, (t0 - anim.at) / 1000));
        anim.at = t0;
        ease(dt);
        anim.phase = (anim.phase + dt * look.pace * s) % wave;
        anim.cyc = (anim.cyc + dt / look.period) % 1;
      }
      var alpha = fade.from ? 1 - (t0 - fade.from) / FADE_MS : 1;
      if (alpha <= 0) {
        if (k === 1) { fade.from = 0; path.n = 0; path.verts = null; beacon.on = false; lineSource(); }
        return;
      }
      alpha *= k;
      // Drawn before the buildings, nothing is in the way yet; the x-ray pass draws over them.
      gl.disable(gl.DEPTH_TEST);
      if (path.n) {
        var P = progs.path, edge = 20 * s, G = edge + 2, total = path.total * world;
        gl.useProgram(P.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, pathBuf);
        if (path.dirty) { gl.bufferData(gl.ARRAY_BUFFER, path.verts, gl.DYNAMIC_DRAW); path.dirty = false; }
        gl.uniformMatrix4fv(P.u.u_m, false, local(matrix, path.ox, path.oy));
        u1(P, 'u_hw', G / world); u1(P, 'u_g', G); u1(P, 'u_world', world); u2(P, 'u_vp', W / 2, H / 2);
        u1(P, 'u_edge', edge); u1(P, 'u_core', 6 * s); u1(P, 'u_aa', AA);
        u1(P, 'u_total', total); u1(P, 'u_shown', total * revealed(t0, total));
        u1(P, 'u_space', space); u1(P, 'u_phase', anim.phase); u1(P, 'u_s', s);
        u1(P, 'u_alpha', alpha); u3(P, 'u_cCore', look.core); u3(P, 'u_cMark', look.mark);
        gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 28, 0);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 8);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16);
        // A soft shadow 3 px down (on the ground only, not through walls), then the path itself.
        if (k === 1) {
          u2(P, 'u_shift', 0, -6 / H); u1(P, 'u_shadow', 1);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, path.n);
        }
        u2(P, 'u_shift', 0, 0); u1(P, 'u_shadow', 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, path.n);
        gl.disableVertexAttribArray(0); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
      }
      if (beacon.on) {
        var B = progs.beacon, b = (t0 - burst.from) / BURST_MS, R = (b < 1 ? 128 : 60) * s;
        gl.useProgram(B.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
        gl.uniformMatrix4fv(B.u.u_m, false, local(matrix, beacon.x, beacon.y));
        u1(B, 'u_r', R / world); u1(B, 'u_rpx', R); u2(B, 'u_vp', W / 2, H / 2);
        u1(B, 'u_cyc', anim.cyc); u1(B, 'u_here', look.here);
        u1(B, 'u_burst', b < 1 ? b : -1); u1(B, 'u_s', s); u1(B, 'u_aa', AA); u1(B, 'u_alpha', alpha);
        u3(B, 'u_cRing', look.ring);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(0);
      }
      var spent = performance.now() - t0;
      dbg.renders++; dbg.renderMs += spent; dbg.renderMax = Math.max(dbg.renderMax, spent);
    }
    var layer = {
      id: 'nav-guide', type: 'custom', renderingMode: '2d',
      onAdd: function () { progs = null; },
      render: function (g, matrix) { render(g, matrix, 1); }
    };
    // Where a building hides the path, this shows it faintly through the walls.
    var xray = { id: 'nav-xray', type: 'custom', renderingMode: '2d', render: function (g, matrix) { render(g, matrix, 0.42); } };

    // If WebGL ever fails, a plain glowing line from the same path, without the animation.
    function lineData() {
      return path.n && path.pts ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.pts } }
        : { type: 'FeatureCollection', features: [] };
    }
    function lineSource() { var src = fallbackOn && map.getSource('nav-line'); if (src) src.setData(lineData()); }
    function fallback() {
      fallbackOn = true;
      if (map.getSource('nav-line')) return;
      map.addSource('nav-line', { type: 'geojson', data: lineData() });
      [['nav-line-glow', '#4FB2FF', 24, 0.4, 6], ['nav-line', '#2F8DF6', 11, 1, 0], ['nav-line-centre', '#E9F6FF', 2, 0.9, 0]].forEach(function (l) {
        map.addLayer({ id: l[0], type: 'line', source: 'nav-line', layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': l[1], 'line-width': l[2], 'line-opacity': l[3], 'line-blur': l[4] } });
      });
    }

    // Only ask the map to redraw while some of the guide is on screen.
    function inView() {
      var b = map.getBounds(), c = map.getCenter();
      var pad = 150 * 40075016 * Math.cos(c.lat * RAD) / (512 * Math.pow(2, map.getZoom())) / 111320;
      var w = b.getWest() - pad, e = b.getEast() + pad, s = b.getSouth() - pad, n = b.getNorth() + pad;
      var box = path.n ? path.box : null, at = beacon.on ? beacon.at : null;
      if (box && box[0] < e && box[2] > w && box[1] < n && box[3] > s) return true;
      return !!at && at[0] > w && at[0] < e && at[1] > s && at[1] < n;
    }

    // ---- Arrival ----------------------------------------------------------------------------
    // A shockwave on the ground and a pop of gold stars over the friend, once per approach.
    function arrive(now) {
      burst.from = now;
      var el = document.createElement('div'), colours = ['#F9BC4D', '#F49E3A', '#FFFFFF', '#FFE0AE'];
      el.className = 'nav-party';
      for (var i = 0; i < 14; i++) {
        var bit = document.createElement('i');
        bit.style.setProperty('--a', Math.round(i * 360 / 14 + (i % 2) * 9) + 'deg');
        bit.style.setProperty('--d', -(50 + (i % 3) * 18) + 'px');
        bit.style.background = colours[i % 4];
        bit.style.animationDelay = (i % 3) * 40 + 'ms';
        el.appendChild(bit);
      }
      var party = new maplibregl.Marker({ element: el }).setLngLat(target).addTo(map);
      setTimeout(function () { party.remove(); }, BURST_MS + 400);
    }

    // ---- Edge arrow -------------------------------------------------------------------------
    // While the friend is off-screen (or under the card or buttons), a glass arrow at the edge
    // of the visible map points at them and shows how far they are. Tapping it shows them.
    var edge = document.createElement('div');
    edge.className = 'nav-edge';
    edge.innerHTML = '<button class="nav-edge-btn" aria-label="Show the friend you are tracking"><span class="nav-edge-dir">' +
      '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M12 2.5l7 18-7-4-7 4z" fill="#2F8DF6" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>' +
      '</span></button><div class="nav-edge-dist"></div>';
    map.getContainer().appendChild(edge);
    var edgeBtn = edge.firstChild, edgeDir = edgeBtn.firstChild, edgeDist = edge.lastChild;
    var shown = { on: false, x: -1, y: -1, angle: 999, text: '', cam: '' };
    edgeBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (target) hooks.focus(target[0], target[1]);
    });
    function measure() { var c = map.getContainer(); W = c.clientWidth; H = c.clientHeight; shown.cam = ''; }
    measure();
    map.on('resize', measure);
    function showEdge(on) { if (shown.on !== on) { shown.on = on; edge.classList.toggle('on', on); } }
    function fmt(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km'; }
    function updateEdge() {
      if (!target) { showEdge(false); return; }
      var c = map.getCenter(), z = map.getZoom();
      var cam = c.lng.toFixed(7) + c.lat.toFixed(7) + z.toFixed(3) + map.getBearing().toFixed(1) + map.getPitch().toFixed(1) + key + insetTop + insetBottom;
      var text = me ? fmt(metres(me, target)) : '';
      if (text !== shown.text) { shown.text = text; edgeDist.textContent = text; }
      if (cam === shown.cam) return;
      shown.cam = cam;
      var top = insetTop, bottom = H - insetBottom, centre = [c.lng, c.lat];
      var tp = map.project(target);
      if (tp.x >= 10 && tp.x <= W - 10 && tp.y >= top + 10 && tp.y <= bottom - 10) {
        // Points behind the camera project back onto the screen; check it really is that spot.
        var back = map.unproject(tp);
        if (metres([back.lng, back.lat], target) < Math.max(10, 0.05 * metres(centre, target))) { showEdge(false); return; }
      }
      // Which way the friend is on screen: from the centre, take a short step towards them.
      var mpp = 40075016 * Math.cos(c.lat * RAD) / (512 * Math.pow(2, z)), step = 60 * mpp;
      var dLng = target[0] - c.lng, dLat = target[1] - c.lat, kx = Math.cos(c.lat * RAD);
      var len = Math.sqrt(dLng * dLng * kx * kx + dLat * dLat) * 111320;
      if (!(len > 0)) { showEdge(false); return; }
      var o = map.project(c), q = map.project([c.lng + dLng * step / len, c.lat + dLat * step / len]);
      var vx = q.x - o.x, vy = q.y - o.y, vl = Math.sqrt(vx * vx + vy * vy);
      if (!(vl > 1e-6)) { showEdge(false); return; }
      vx /= vl; vy /= vl;
      var L = 34, R = W - 34, T = top + 34, Bm = bottom - 50;
      if (T > Bm) T = Bm = (top + bottom) / 2;
      var ox = Math.max(L, Math.min(R, o.x)), oy = Math.max(T, Math.min(Bm, o.y)), t = 1e9;
      if (vx > 1e-9) t = Math.min(t, (R - ox) / vx); else if (vx < -1e-9) t = Math.min(t, (L - ox) / vx);
      if (vy > 1e-9) t = Math.min(t, (Bm - oy) / vy); else if (vy < -1e-9) t = Math.min(t, (T - oy) / vy);
      var x = ox + vx * t, y = oy + vy * t, angle = Math.atan2(vx, -vy) / RAD;
      if (Math.abs(x - shown.x) > 0.3 || Math.abs(y - shown.y) > 0.3) {
        shown.x = x; shown.y = y;
        edge.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      }
      if (Math.abs(angle - shown.angle) > 0.5) { shown.angle = angle; edgeDir.style.transform = 'rotate(' + angle.toFixed(1) + 'deg)'; }
      showEdge(true);
    }

    window.__navDebug = function (full) {
      return {
        mode: mode, level: level, final: final, target: target, me: me, path: path.n ? path.pts.length : 0,
        ends: path.n ? [path.pts[0], path.pts[path.pts.length - 1]] : null,
        routePts: full && route ? route.pts : undefined,
        route: route && { key: route.key, points: route.pts.length, drift: route.drift, forTarget: route.key === key },
        asking: !!asking, asks: dbg.asks, last: dbg.last, edge: shown.on, edgeAt: [Math.round(shown.x), Math.round(shown.y)],
        glBroken: glBroken, fallback: fallbackOn,
        frames: dbg.frames, frameAvgMs: dbg.frameMs / Math.max(1, dbg.frames), frameMaxMs: dbg.frameMax,
        renders: dbg.renders, renderAvgMs: dbg.renderMs / Math.max(1, dbg.renders), renderMaxMs: dbg.renderMax
      };
    };

    return {
      addLayers: function () {
        layerOn = true;
        // Under the buildings, so they hide it; the x-ray pass goes over them, under the labels.
        var walls = map.getLayer('building-3d') ? 'building-3d' : undefined;
        if (!map.getLayer(layer.id)) map.addLayer(layer, walls);
        if (walls && !map.getLayer(xray.id)) map.addLayer(xray, map.getLayer('road-name-small') ? 'road-name-small' : undefined);
        if (fallbackOn && !map.getSource('nav-line')) { fallbackOn = false; fallback(); }
        path.dirty = true;
        map.triggerRepaint();
      },
      setMe: function (lngLat, acc) {
        me = lngLat ? [lngLat[0], lngLat[1]] : null;
        accuracy = acc || 0;
        update();
      },
      setTarget: function (lngLat) {
        var next = keyOf(lngLat);
        if (next === key) return;
        key = next;
        cancelAsk();
        level = 'far';
        final = false;
        if (!lngLat) {
          target = null;
          fade.from = performance.now();
          mode = 'none';
          return;
        }
        target = [lngLat[0], lngLat[1]];
        fade.from = 0;
        beacon.on = true;
        beacon.at = target;
        beacon.x = (target[0] + 180) / 360;
        beacon.y = mercY(target[1]);
        var now = performance.now(), have = route && route.key === key;
        // Wait a moment for the walking route so it draws in once, instead of a line that jumps.
        holdUntil = !have && me && metres(me, target) > FINAL_M && navigator.onLine !== false &&
          now >= calmUntil && now >= (skipUntil[key] || 0) ? now + HOLD_MS : 0;
        mode = 'none';
        update('new');
      },
      setInsets: function (top, bottom) { insetTop = top || 0; insetBottom = bottom || 0; shown.cam = ''; },
      frame: function (now) {
        var t0 = performance.now();
        if (mode === 'hold' && now >= holdUntil) update('show');
        if (now - lastCheck > 1000) { lastCheck = now; wantRoute(now); }
        if (glBroken && !fallbackOn && layerOn) fallback();
        if (layerOn && !glBroken && !document.hidden && (path.n || beacon.on)) {
          // Pulses and ripples at about 30 fps; drawing in, fading, bursting and colour changes every frame.
          var busy = reveal.dur || reveal.full || fade.from || anim.easing || now - burst.from < BURST_MS;
          if ((busy || now - lastPaint >= 30) && inView()) { lastPaint = now; map.triggerRepaint(); }
        }
        updateEdge();
        var spent = performance.now() - t0;
        dbg.frames++; dbg.frameMs += spent; dbg.frameMax = Math.max(dbg.frameMax, spent);
      }
    };
  }
`;
