// The friends on the map: round profile locators with each friend's face from their approved rig
// (src/faces.ts), on a pointer whose tip is the friend's spot. Pasted into mapHtml.ts.
import { FACES } from './faces';

// Each friend is a marker whose root box is 56×70 px (the touch target). MapLibre's bottom anchor
// puts the root's bottom centre, the pointer's tip, on the friend's spot. Everything else hangs off
// that point and never changes the root's size. Animations only move inner parts, with CSS keyframes
// on transform and opacity.
export const FIGURES_CSS = `
.fg{width:56px;height:70px;cursor:pointer;-webkit-tap-highlight-color:transparent;
  --fg-t:1;--fg-k:calc(var(--fg-s,1)*var(--fg-t));--fg-c:#2F8DF6}
.fg.fg-target{--fg-t:1.18}
.fg-pin{position:absolute;left:0;bottom:0;width:56px;height:70px;transform-origin:50% 100%;
  transform:scale(var(--fg-k));transition:transform .25s ease-out}
.fg-pop,.fg-bob{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:50% 100%}
.fg-bob{animation:fg-bob 3.4s ease-in-out infinite var(--d,0s)}
/* A soft shadow on the ground at the tip (the sun is behind your left shoulder). */
.fg-shadow{position:absolute;left:17px;bottom:-5px;width:24px;height:9px;border-radius:50%;
  background:radial-gradient(closest-side,rgba(42,34,56,.45),rgba(42,34,56,0));animation:fg-shade 3.4s ease-in-out infinite var(--d,0s)}
.fg-tip{position:absolute;left:19px;bottom:1px;width:18px;height:17px;overflow:visible}
.fg-disc{position:absolute;left:4px;top:4px;width:48px;height:48px;border-radius:50%;overflow:hidden;background:#fff;
  box-shadow:0 0 0 3px var(--fg-c),0 7px 14px rgba(42,34,56,.34)}
.fg-disc img{position:absolute;left:2px;top:2px;width:44px;height:44px;border-radius:50%;display:none}
.fg-met .fg-face,.fg:not(.fg-met) .fg-sil{display:block}
.fg:not(.fg-met) .fg-disc{background:#433D5E;box-shadow:0 0 0 3px #F9BC4D,0 7px 14px rgba(42,34,56,.34)}
.fg:not(.fg-met) .fg-sil{opacity:.55}
.fg-q{position:absolute;left:0;top:11px;width:100%;text-align:center;color:#F9BC4D;display:none;
  font:900 24px/1 system-ui,Roboto,"Segoe UI",sans-serif;text-shadow:0 0 5px rgba(249,188,77,.95),0 0 12px rgba(249,188,77,.6);
  animation:fg-glow 2.4s ease-in-out infinite var(--d,0s)}
.fg:not(.fg-met) .fg-q{display:block}
/* The friend you're tracking: a ring pulsing out, a bouncing pointer and their name. */
.fg-pulse{position:absolute;left:4px;top:4px;width:48px;height:48px;border-radius:50%;display:none;
  box-shadow:0 0 0 3px #F9BC4D;animation:fg-pulse 1.8s ease-out infinite}
.fg-target .fg-pulse{display:block}
@keyframes fg-bob{0%,100%{transform:none}50%{transform:translateY(-3px)}}
@keyframes fg-shade{0%,100%{transform:none}50%{transform:scale(.82);opacity:.7}}
@keyframes fg-glow{0%,100%{opacity:.75}50%{opacity:1}}
@keyframes fg-pulse{0%{transform:scale(1);opacity:.9}100%{transform:scale(1.55);opacity:0}}

.fg-above{position:absolute;left:50%;bottom:0;width:0;height:0;display:none;
  transform:translateY(calc(var(--fg-k)*-64px));transition:transform .25s ease-out}
.fg-target .fg-above{display:block}
.fg-pill{position:absolute;left:0;bottom:5px;transform:translateX(-50%);white-space:nowrap;
  padding:4px 10px 4px 20px;border-radius:999px;background:rgba(255,255,255,.8);color:#1D2B3C;
  -webkit-backdrop-filter:blur(8px) saturate(1.3);backdrop-filter:blur(8px) saturate(1.3);
  box-shadow:0 4px 12px rgba(42,34,56,.22);font:700 12px/1.1 system-ui,Roboto,"Segoe UI",sans-serif;letter-spacing:.1px}
.fg-pill::before{content:'';position:absolute;left:9px;top:50%;width:6px;height:6px;margin-top:-3px;border-radius:50%;background:var(--fg-c)}
.fg-ptr{position:absolute;left:-8px;bottom:31px;width:18px;height:16px;animation:fg-bounce .9s ease-in-out infinite}
.fg-ptr svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 2px 2px rgba(42,34,56,.35))}
@keyframes fg-bounce{0%,100%{transform:none}50%{transform:translateY(-5px)}}

/* Meeting someone and tapping them. */
.fg-burst{position:absolute;left:50%;top:40%;width:0;height:0;display:none}
.fg-reveal .fg-burst{display:block}
.fg-burst i{position:absolute;left:-3.5px;top:-3.5px;width:7px;height:7px;border-radius:50%;
  opacity:0;animation:fg-burst .75s ease-out}
.fg-reveal .fg-pop{animation:fg-reveal .7s cubic-bezier(.2,1.6,.4,1)}
.fg-tap .fg-pop{animation:fg-squash .4s ease-out}
@keyframes fg-burst{0%{opacity:1;transform:rotate(var(--a)) translateY(-8px) scale(.6)}100%{opacity:0;transform:rotate(var(--a)) translateY(-44px)}}
@keyframes fg-reveal{0%{transform:scale(.2);opacity:.3}100%{transform:none;opacity:1}}
@keyframes fg-squash{0%,100%{transform:none}30%{transform:scale(1.12,.86)}62%{transform:scale(.95,1.07)}}

@media (prefers-reduced-motion:reduce){.fg *{animation:none!important;transition:none!important}}
`;

/**
 * Runs inside the map page. createFigures(map, post) returns setFriends(list), called with every
 * friend as { id, lat, lng, name, character, color, met, target }. Tapping one posts { type: 'friend', id }.
 */
export const FIGURES_JS = `
  function createFigures(map, post) {
    var FACES = ${JSON.stringify(FACES)};
    var GOLD = '#F9BC4D', AZURE = '#2F8DF6';
    var box = map.getContainer(), markers = {};

    var POINTER = '<svg viewBox="0 0 18 16"><path d="M1.5 1.5 H16.5 L9 13.5 Z" fill="' + GOLD + '" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    // The pointer under the disc, in the friend's colour (unmet: gold), its tip on the spot.
    var TIP = '<svg class="fg-tip" viewBox="0 0 18 17"><path d="M2 0 H16 L10.2 15.6 Q9 17.4 7.8 15.6 Z" style="fill:var(--fg-tc)"/></svg>';
    var BURST = '<div class="fg-burst">' + [0, 45, 90, 135, 180, 225, 270, 315].map(function (a, i) {
      return '<i style="--a:' + a + 'deg;background:' + (i % 2 ? AZURE : GOLD) + '"></i>';
    }).join('') + '</div>';

    // So friends side by side don't all bob in step.
    function phase(id) {
      var h = 0;
      for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
      return (-h / 97).toFixed(2) + 's';
    }
    function replay(m, cls, ms) {
      var el = m.el;
      clearTimeout(m[cls]);
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
      m[cls] = setTimeout(function () { el.classList.remove(cls); }, ms);
    }

    function create(f) {
      var el = document.createElement('div');
      el.classList.add('fg');
      el.style.setProperty('--d', phase(String(f.id)));
      el.innerHTML = '<div class="fg-pin"><div class="fg-shadow"></div><div class="fg-pop"><div class="fg-bob">' + TIP +
        '<div class="fg-pulse"></div><div class="fg-disc"><img class="fg-face" alt=""><img class="fg-sil" alt=""><div class="fg-q">?</div></div>' +
        '</div>' + BURST + '</div></div>' +
        '<div class="fg-above"><div class="fg-ptr">' + POINTER + '</div><div class="fg-pill"></div></div>';
      var m = {
        el: el, face: el.querySelector('.fg-face'), sil: el.querySelector('.fg-sil'), pill: el.querySelector('.fg-pill'),
        marker: new maplibregl.Marker({ element: el, anchor: 'bottom', pitchAlignment: 'viewport', rotationAlignment: 'viewport' })
      };
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        post({ type: 'friend', id: f.id });
        replay(m, 'fg-tap', 400);
      });
      m.marker.setLngLat([f.lng, f.lat]).addTo(map);
      return m;
    }

    // Changes only what changed, so running animations carry on.
    function update(m, f) {
      var el = m.el, who = FACES.hasOwnProperty(f.character) ? f.character : 'doraemon';
      var color = /^#[0-9a-f]{3,8}$/i.test(f.color || '') ? f.color : AZURE;
      var met = !!f.met, name = met ? String(f.name || '') : '???';
      var ll = m.marker.getLngLat();
      if (ll.lng !== f.lng || ll.lat !== f.lat) m.marker.setLngLat([f.lng, f.lat]);
      if (who !== m.who) {
        m.who = who;
        m.face.src = FACES[who].met;
        m.sil.src = FACES[who].unmet;
      }
      if (color !== m.color) { m.color = color; el.style.setProperty('--fg-c', color); }
      el.style.setProperty('--fg-tc', met ? color : GOLD);
      if (met && m.met === false) replay(m, 'fg-reveal', 800);
      m.met = met;
      el.classList.toggle('fg-met', met);
      el.classList.toggle('fg-target', !!f.target);
      if (m.pill.textContent !== name) m.pill.textContent = name;
      m.target = !!f.target;
    }

    // Nearer friends (lower on screen) in front of farther ones, and the one you track on top.
    function restack() {
      var list = Object.keys(markers).map(function (id) {
        var m = markers[id];
        return { m: m, y: map.project(m.marker.getLngLat()).y };
      });
      list.sort(function (a, b) { return a.y - b.y; });
      list.forEach(function (it, i) {
        var z = String(i + 1 + (it.m.target ? 500 : 0));
        if (it.m.el.style.zIndex !== z) it.m.el.style.zIndex = z;
      });
    }
    map.on('moveend', restack);

    // Smaller when zoomed out. Set on the map's box, a few times a second at most, as a CSS
    // variable the markers scale by.
    var shownScale = null, zoomTimer = null, zoomAt = 0;
    function zoomStyle() {
      clearTimeout(zoomTimer);
      zoomTimer = null;
      zoomAt = Date.now();
      var s = Math.round(Math.max(0.6, Math.min(1, 0.6 + (map.getZoom() - 12.5) * 0.16)) * 20) / 20;
      if (s !== shownScale) { shownScale = s; box.style.setProperty('--fg-s', String(s)); }
    }
    map.on('zoom', function () {
      if (!zoomTimer) zoomTimer = setTimeout(zoomStyle, Math.max(0, 150 - (Date.now() - zoomAt)));
    });
    map.on('zoomend', zoomStyle);
    zoomStyle();

    return {
      setFriends: function (list) {
        var seen = {};
        list.forEach(function (f) {
          seen[f.id] = true;
          var m = markers[f.id] || (markers[f.id] = create(f));
          update(m, f);
        });
        Object.keys(markers).forEach(function (id) {
          if (!seen[id]) { markers[id].marker.remove(); delete markers[id]; }
        });
        restack();
      }
    };
  }
`;
