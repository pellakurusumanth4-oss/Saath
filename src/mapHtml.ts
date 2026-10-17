import { FIGURES_CSS, FIGURES_JS } from './mapFigures';
import { NAV_CSS, NAV_JS } from './mapNav';
import { MAP_STYLE, STYLE_CSS, STYLE_JS } from './mapStyle';

// The live map runs MapLibre GL JS inside a WebView. Tiles come from OpenFreeMap
// (OpenStreetMap data, no API key), with real 3D buildings once you zoom in.
// If those vector tiles can't load, it falls back to OpenStreetMap raster tiles.
// The map's look, the guide to your friend and the friends themselves each live in their own
// file (mapStyle, mapNav, mapFigures) and are pasted into the page here.
export const MAP_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>
html,body,#map{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#EEF2FB}
.me{width:16px;height:16px;border-radius:50%;background:#2F8DF6;border:3px solid #fff;
  box-shadow:0 2px 6px rgba(42,34,56,.4),0 0 0 6px rgba(47,141,246,.2)}
.cone{display:none;width:150px;height:150px;pointer-events:none;
  background:conic-gradient(from -28deg,rgba(47,141,246,.5) 0deg 56deg,transparent 56deg);
  -webkit-mask-image:radial-gradient(circle closest-side,#000 12%,transparent 100%);
  mask-image:radial-gradient(circle closest-side,#000 12%,transparent 100%)}
.cone.unsure{background:conic-gradient(from -50deg,rgba(91,97,112,.45) 0deg 100deg,transparent 100deg)}
.maplibregl-ctrl-attrib{font-size:10px}
.maplibregl-ctrl-bottom-right,.maplibregl-ctrl-bottom-left{bottom:var(--covered-bottom,0px)}
${STYLE_CSS}
${NAV_CSS}
${FIGURES_CSS}
</style>
</head>
<body>
<div id="map"></div>
<script>
(function () {
  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  if (!window.maplibregl) { post({ type: 'error', msg: 'Map library did not load (no internet?)' }); return; }
${STYLE_JS}
${NAV_JS}
${FIGURES_JS}
  var VECTOR = ${JSON.stringify(MAP_STYLE)};
  // CARTO's keyless tiles now only show "API KEY REQUIRED", so the fallback uses OpenStreetMap's own.
  var RASTER = {
    version: 8,
    sources: { osm: { type: 'raster', tileSize: 256, maxzoom: 19,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      attribution: '© OpenStreetMap contributors' } },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  };

  // How far the map tilts back when it starts, finds you and recentres (0 = straight down).
  var PITCH = 68;
  var map = new maplibregl.Map({
    container: 'map', style: VECTOR, center: [73.8553, 18.5195], zoom: 15.5,
    pitch: PITCH, maxPitch: 76, attributionControl: { compact: true }
  });

  var styleLoaded = false, usingRaster = false;
  function useRaster() {
    if (usingRaster) return;
    usingRaster = true;
    post({ type: 'log', msg: 'Vector map failed, switched to raster tiles' });
    map.setStyle(RASTER);
  }
  map.on('error', function () { if (!styleLoaded) useRaster(); });
  // A few POI icons are missing from the Liberty sprite; give them a blank image instead of warnings.
  map.on('styleimagemissing', function (e) {
    if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
  });
  setTimeout(function () { if (!styleLoaded) useRaster(); }, 9000);

  var me = null, accuracy = 0, meMarker = null, coneMarker = null;
  var centredOnce = false;
  // free: you move the map. follow: it keeps you centred. compass: it also turns so you face up.
  var mode = 'follow';
  var heading = null, shownHeading = null;
  var nav = createNav(map, post, { focus: focus });
  var figures = createFigures(map, post);

  var EMPTY = { type: 'FeatureCollection', features: [] };
  function accuracyData() {
    if (!me || !(accuracy > 0)) return EMPTY;
    var ring = [], dLat = accuracy / 111320, dLng = dLat / Math.cos(me[1] * Math.PI / 180);
    for (var i = 0; i <= 48; i++) {
      var a = (i / 48) * 2 * Math.PI;
      ring.push([me[0] + dLng * Math.sin(a), me[1] + dLat * Math.cos(a)]);
    }
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
  }
  function refresh() {
    var a = map.getSource('accuracy'); if (a) a.setData(accuracyData());
  }

  map.on('style.load', function () {
    styleLoaded = true;
    decorateMap(map, usingRaster);
    if (!map.getSource('accuracy')) {
      // How far off GPS could be: the real you is somewhere in this circle.
      map.addSource('accuracy', { type: 'geojson', data: accuracyData() });
      map.addLayer({ id: 'accuracy', type: 'fill', source: 'accuracy', paint: { 'fill-color': '#2F8DF6', 'fill-opacity': 0.1 } });
      map.addLayer({ id: 'accuracy-edge', type: 'line', source: 'accuracy', paint: { 'line-color': '#2F8DF6', 'line-opacity': 0.45, 'line-width': 1.5 } });
    }
    nav.addLayers();
    post({ type: 'ready', raster: usingRaster });
  });

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    post({ type: 'mode', mode: mode });
  }
  function focus(lng, lat) {
    setMode('free');
    map.easeTo({ center: [lng, lat], zoom: 16.5, duration: 900 });
  }
  // Dragging the map lets you look around; turning it by hand leaves compass mode.
  map.on('dragstart', function (e) { if (e.originalEvent) setMode('free'); });
  map.on('rotatestart', function (e) { if (e.originalEvent && mode === 'compass') setMode('follow'); });

  // Every frame: ease the cone (and in compass mode the map) towards the latest heading, and
  // glide the map after you. Updates arrive a few times a second; this keeps the motion smooth.
  function frame(now) {
    requestAnimationFrame(frame);
    nav.frame(now);
    if (heading !== null && coneMarker) {
      var d = shownHeading === null ? null : ((heading - shownHeading + 540) % 360) - 180;
      if (d === null || Math.abs(d) > 0.05) {
        shownHeading = d === null ? heading : (shownHeading + d * 0.25 + 360) % 360;
        coneMarker.setRotation(shownHeading);
      }
    }
    if (mode === 'free' || !me || map.isMoving()) return;
    var view = null, c = map.getCenter();
    var dx = me[0] - c.lng, dy = me[1] - c.lat;
    if (Math.abs(dx) + Math.abs(dy) > 2e-7) view = { center: [c.lng + dx * 0.15, c.lat + dy * 0.15] };
    if (mode === 'compass' && shownHeading !== null) {
      var b = map.getBearing(), db = ((shownHeading - b + 540) % 360) - 180;
      if (Math.abs(db) > 0.1) { view = view || {}; view.bearing = b + db * 0.3; }
    }
    if (view) map.jumpTo(view);
  }
  requestAnimationFrame(frame);

  window.saath = {
    setMe: function (lat, lng, acc) {
      me = [lng, lat];
      accuracy = acc || 0;
      if (!meMarker) {
        var cone = document.createElement('div');
        cone.className = 'cone';
        coneMarker = new maplibregl.Marker({ element: cone, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(me).addTo(map);
        var dot = document.createElement('div');
        dot.className = 'me';
        meMarker = new maplibregl.Marker({ element: dot }).setLngLat(me).addTo(map);
      } else {
        meMarker.setLngLat(me);
        coneMarker.setLngLat(me);
      }
      refresh();
      nav.setMe(me, accuracy);
      if (!centredOnce) { centredOnce = true; map.jumpTo({ center: me, zoom: 17, pitch: PITCH }); }
    },
    // The direction you face, in degrees. Unsure = the compass is being bent by something nearby.
    setHeading: function (deg, ok) {
      heading = deg;
      if (!coneMarker) return;
      var el = coneMarker.getElement();
      el.style.display = 'block';
      el.classList.toggle('unsure', !ok);
    },
    // Pixels hidden under the app's card (top) and buttons (bottom).
    setInsets: function (top, bottom) {
      map.setPadding({ top: top, bottom: bottom, left: 0, right: 0 });
      document.documentElement.style.setProperty('--covered-bottom', bottom + 'px');
      nav.setInsets(top, bottom);
    },
    // The locate button: centre on me, then turn the map with me, then back to north up.
    recenter: function () {
      if (!me) return;
      if (mode === 'follow') { setMode('compass'); return; }
      if (mode === 'compass') { setMode('follow'); map.easeTo({ bearing: 0, duration: 500 }); return; }
      setMode('follow');
      map.easeTo({ center: me, zoom: Math.max(map.getZoom(), 16.5), pitch: PITCH, duration: 700 });
    },
    focus: function (lat, lng) { focus(lng, lat); },
    setTarget: function (t) { nav.setTarget(t ? [t.lng, t.lat] : null); },
    setFriends: function (list) { figures.setFriends(list); }
  };

  // On a tilted map a building's roof is drawn up and away from where the building stands, so
  // the ground under a finger on a roof lies behind the building. Follow the finger's line of
  // sight instead and hide the friend where it first meets a building: on a roof or a wall.
  function spotAt(point) {
    var ground = map.unproject(point);
    if (!styleLoaded || !map.getLayer('building-3d') || !map.transform.getCameraPosition) return ground;
    // MapLibre's own hit test is generous (a merged block of small buildings matches almost
    // anywhere), so it only suggests buildings; the line-of-sight test below decides.
    var near = map.queryRenderedFeatures([[point.x - 6, point.y - 6], [point.x + 6, point.y + 6]], { layers: ['building-3d'] });
    if (!near.length) return ground;
    var cam = map.transform.getCameraPosition();
    // Metres east and north of the ground point.
    var mx = 111320 * Math.cos(ground.lat * Math.PI / 180), my = 111320;
    var cx = (cam.lngLat.lng - ground.lng) * mx, cy = (cam.lngLat.lat - ground.lat) * my;
    // The line of sight at height z; it reaches the ground (z = 0) at the ground point.
    function sight(z) { var k = z / cam.altitude; return [cx * k, cy * k]; }
    // Of the places it meets a building, keep the highest: coming down from the camera, that's
    // the surface it reaches first, the one under the finger.
    var hit = null;
    near.forEach(function (f) {
      var top = Number(f.properties.render_height), base = Number(f.properties.render_min_height) || 0;
      if (!(top > base) || (hit && top <= hit.z)) return;
      var polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
        : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      var rings = polygons.map(function (poly) {
        return poly[0].map(function (c) { return [(c[0] - ground.lng) * mx, (c[1] - ground.lat) * my]; });
      });
      var roof = sight(top), foot = sight(base), meet = null;
      if (rings.some(function (ring) { return inside(roof, ring); })) meet = { t: 0, p: roof };
      else {
        // In through a wall: the first edge it crosses on the way down from roof height.
        var t = Infinity;
        rings.forEach(function (ring) {
          for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) t = Math.min(t, crossing(roof, foot, ring[j], ring[i]));
        });
        if (t < Infinity) meet = { t: t, p: along(roof, foot, t) };
      }
      var z = meet ? top - meet.t * (top - base) : -Infinity;
      if (meet && (!hit || z > hit.z)) hit = { z: z, p: meet.p };
    });
    return hit ? { lng: ground.lng + hit.p[0] / mx, lat: ground.lat + hit.p[1] / my } : ground;
  }
  function along(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function inside(p, ring) {
    var odd = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var a = ring[i], b = ring[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) odd = !odd;
    }
    return odd;
  }
  // How far along a→b (0 to 1) it crosses the edge c–d, or Infinity if it doesn't.
  function crossing(a, b, c, d) {
    var rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
    var den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return Infinity;
    var t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
    var u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : Infinity;
  }

  // Long-press = hide a test friend at that real spot.
  var press = null;
  function cancelPress() { if (press) { clearTimeout(press.timer); press = null; } }
  map.on('touchstart', function (e) {
    cancelPress();
    var touches = e.originalEvent && e.originalEvent.touches;
    if (!touches || touches.length !== 1) return;
    var point = e.point;
    press = { point: point, timer: setTimeout(function () {
      press = null;
      var spot = spotAt(point);
      post({ type: 'longpress', lat: spot.lat, lng: spot.lng });
    }, 650) };
  });
  map.on('touchmove', function (e) {
    if (!press) return;
    var dx = e.point.x - press.point.x, dy = e.point.y - press.point.y;
    if (dx * dx + dy * dy > 144) cancelPress();
  });
  map.on('touchend', cancelPress);
  map.on('touchcancel', cancelPress);

  post({ type: 'boot' });
})();
</script>
</body>
</html>`;
