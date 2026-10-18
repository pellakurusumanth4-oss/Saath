// Somewhere to walk near each friend. A random spot can be in a lake, in someone's house or on private ground, so the
// page looks round each friend's spot for paths and roads in the map's own vector tiles and tells the app the nearest
// points on them; src/placement.ts keeps the first that is still in the friend's ring. Pasted into mapHtml.ts.
//
// The tiles come from OpenFreeMap, which already serves the map, so no other service learns where anyone's places are.
// MapLibre only keeps the tiles in view and friends stand up to 5 km away, so this fetches the z14 tiles round each
// spot itself (the browser caches them: a tile's URL never changes) and reads them with a small reader of its own.

/**
 * Runs inside the map page. createWalk(tilejson, post) returns walkable(spots): it looks round each {lat, lng} it hasn't
 * seen before, then posts {type: 'walkable', found: [{spot, near: [{lat, lng}, …]}]}: up to 8 points on different ways,
 * nearest first, or none. A spot whose tiles fail to load is left out, and looked at again when asked again.
 */
export const WALK_JS = `
  function createWalk(tilejson, post) {
    var Z = 14, N = 16384, REACH_M = 250, MAX = 8, EARTH = 40075016.7;
    var urls = null, asked = {};

    // Lines you can walk along: roads and paths, but not motorways, tunnels or underpasses, ways inside a building or
    // on one of its floors, platforms, driveways or car parks, nor private ones (a foot tag, where there is one,
    // decides over access).
    function canWalk(p) {
      return /^(primary|secondary|tertiary|minor|service|track|path|pedestrian)$/.test(p['class']) &&
        (p.foot ? /^(yes|designated|permissive)$/.test(p.foot) : p.access !== 'no') && p.brunnel !== 'tunnel' &&
        !(p.layer < 0) && !p.indoor && !p.level && !/^(platform|corridor)$/.test(p.subclass) &&
        !/^(driveway|parking_aisle)$/.test(p.service);
    }

    // The lines of one layer of a vector tile (Mapbox Vector Tile 2.1), each with its feature's properties, in tile units.
    function tileLines(buf, layer) {
      var pos = 0, text = new TextDecoder(), out = [];
      function int() { var x = 0, m = 1, b; do { b = buf[pos++]; x += (b & 127) * m; m *= 128; } while (b > 127); return x; }
      // Calls on(field, value) for each field of the message ending at end: a number's value, or where its bytes end.
      function each(end, on) {
        while (pos < end) {
          var key = int(), wire = key & 7;
          if (wire === 0) on(key >> 3, int());
          else if (wire === 2) { var stop = int() + pos; on(key >> 3, stop); pos = stop; }
          else pos += wire === 1 ? 8 : 4;
        }
      }
      each(buf.length, function (field, end) {
        if (field !== 3) return;
        var name = '', keys = [], values = [], features = [], extent = 4096;
        each(end, function (f, v) {
          if (f === 1) name = text.decode(buf.subarray(pos, v));
          else if (f === 2) features.push([pos, v]);
          else if (f === 3) keys.push(text.decode(buf.subarray(pos, v)));
          else if (f === 4) {
            var value = null;
            each(v, function (g, w) { value = g === 1 ? text.decode(buf.subarray(pos, w)) : g === 6 ? (w % 2 ? -(w + 1) / 2 : w / 2) : w; });
            values.push(value);
          } else if (f === 5) extent = v;
        });
        if (name !== layer) return;
        features.forEach(function (r) {
          var props = {}, type = 0, geometry = null;
          pos = r[0];
          each(r[1], function (f, v) {
            if (f === 2) while (pos < v) { var k = keys[int()]; props[k] = values[int()]; }
            else if (f === 3) type = v;
            else if (f === 4) geometry = [pos, v];
          });
          if (type !== 2 || !geometry) return;
          var x = 0, y = 0, line = null;
          for (pos = geometry[0]; pos < geometry[1];) {
            var c = int(), cmd = c & 7;
            for (var n = cmd === 7 ? 0 : c >> 3; n > 0; n--) {
              var dx = int(), dy = int();
              x += dx % 2 ? -(dx + 1) / 2 : dx / 2;
              y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
              if (cmd === 1) out.push(line = { props: props, extent: extent, pts: [] });
              line.pts.push([x, y]);
            }
          }
        });
      });
      return out;
    }

    // The walkable lines of tile (x, y) in Web Mercator units (0..1). x may run past the antimeridian.
    function tile(x, y) {
      return urls.then(function (url) {
        return fetch(url.replace('{z}', Z).replace('{x}', ((x % N) + N) % N).replace('{y}', y));
      }).then(function (r) {
        if (!r.ok) throw new Error('tile ' + r.status);
        return r.arrayBuffer();
      }).then(function (b) {
        return tileLines(new Uint8Array(b), 'transportation').filter(function (l) { return canWalk(l.props); }).map(function (l) {
          return l.pts.map(function (p) { return [(x + p[0] / l.extent) / N, (y + p[1] / l.extent) / N]; });
        });
      });
    }

    // The point of a line nearest (x, y), and its squared distance.
    function nearest(line, x, y) {
      var best = null;
      for (var i = 1; i < line.length; i++) {
        var a = line[i - 1], vx = line[i][0] - a[0], vy = line[i][1] - a[1], l2 = vx * vx + vy * vy;
        var t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l2)) : 0;
        var qx = a[0] + vx * t, qy = a[1] + vy * t, d = (qx - x) * (qx - x) + (qy - y) * (qy - y);
        if (!best || d < best[2]) best = [qx, qy, d];
      }
      return best;
    }

    return function walkable(spots) {
      if (!urls) urls = fetch(tilejson).then(function (r) { return r.json(); }).then(function (j) { return j.tiles[0]; });
      var tiles = {}, failed = 0;
      Promise.all(spots.map(function (s) {
        var key = s.lat + ',' + s.lng;
        if (asked[key]) return null;
        asked[key] = true;
        var lat = s.lat * Math.PI / 180, x = (s.lng + 180) / 360, y = 0.5 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / (2 * Math.PI);
        // Every tile within REACH_M of the spot: 1 to 4 of them where tiles are 2 km across. The nearest point is
        // exact out to REACH_M; beyond that it is the nearest in those tiles.
        var r = REACH_M / (EARTH * Math.cos(lat)), wanted = [];
        for (var tx = Math.floor((x - r) * N); tx <= Math.floor((x + r) * N); tx++) {
          for (var ty = Math.max(0, Math.floor((y - r) * N)); ty <= Math.min(N - 1, Math.floor((y + r) * N)); ty++) {
            wanted.push(tiles[tx + '/' + ty] || (tiles[tx + '/' + ty] = tile(tx, ty)));
          }
        }
        return Promise.all(wanted).then(function (all) {
          var found = [], near = [], tiny = 2 / (EARTH * Math.cos(lat));
          all.forEach(function (lines) { lines.forEach(function (l) { var q = nearest(l, x, y); if (q) found.push(q); }); });
          found.sort(function (a, b) { return a[2] - b[2]; });
          // One point per way: a road in two tiles, or cut in parts, gives the same point more than once.
          found.forEach(function (q) {
            if (near.length < MAX && !near.some(function (o) { return Math.abs(o[0] - q[0]) + Math.abs(o[1] - q[1]) < tiny; })) near.push(q);
          });
          return { spot: s, near: near.map(function (q) {
            return { lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * q[1]))) * 180 / Math.PI, lng: ((q[0] * 360 + 360) % 360) - 180 };
          }) };
        }).catch(function () {
          asked[key] = false;
          urls = null;
          failed++;
          return null;
        });
      })).then(function (found) {
        found = found.filter(Boolean);
        if (found.length) post({ type: 'walkable', found: found });
        // Never the spots themselves: they would give away roughly where someone's home is.
        if (failed) post({ type: 'log', msg: 'Could not read the map tiles round ' + failed + ' friend spot(s)' });
      });
    };
  }
`;
