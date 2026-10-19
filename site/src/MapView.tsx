// The City Day map: a bright tilted 3D city where each shop's mascot is its pin and its own ad stands on a billboard
// beside it. Pins and billboards are HTML markers that React renders into through portals.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import maplibregl, { type Map as MapLibreMap, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Point } from 'geojson';
import { MAP_STYLE } from '../../src/mapStyle';
import { distanceM, type LatLng } from '../../src/geo';
import Ad from './Ad';
import { boardOf, hostOf, orderOf, portraitOf, dollars, sectionOf, type ShopWithMenu } from './shops';
import { Icon, SaveChip } from './ui';

/** Where the map opens: JM Road and Apte Road, where five demo shops stand close together. */
const DECCAN: [number, number] = [73.8448, 18.5194];
export type Padding = { top: number; bottom: number; left: number; right: number };
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
// Pastel blocks by feature id, in the style's own byId form (id / 70, floored: a bare id % 5 matched nothing).
const BUILDING_COLOURS = ['match', ['%', ['floor', ['/', ['to-number', ['id'], 0], 70]], 5], 0, '#FFFFFF', 1, '#FFE8EF', 2, '#ECE8FF', 3, '#E3F6FF', '#FFF2DC'];

/** City Day's colours over the shared map style (src/mapStyle.ts is the app's too, so it is changed here, at run time). */
function cityDay(map: MapLibreMap) {
  const paint = (id: string, prop: string, value: unknown) => {
    try {
      map.setPaintProperty(id, prop, value);
    } catch {
      // a layer without that property keeps its own
    }
  };
  for (const layer of map.getStyle().layers ?? []) {
    const source = (layer as { 'source-layer'?: string })['source-layer'];
    if (layer.type === 'background') paint(layer.id, 'background-color', '#E6F4EA');
    else if (layer.id === 'building') paint(layer.id, 'fill-color', '#FFFFFF');
    else if (layer.id === 'building-3d') {
      // A data-driven colour set over the style's own never re-rendered, so City Day draws its own pastel blocks.
      map.setLayoutProperty(layer.id, 'visibility', 'none');
      map.addLayer({
        id: 'city-buildings', type: 'fill-extrusion', source: (layer as { source: string }).source, 'source-layer': 'building', minzoom: 14,
        paint: {
          'fill-extrusion-color': BUILDING_COLOURS as unknown as string,
          'fill-extrusion-height': ['get', 'render_height'],
          'fill-extrusion-base': ['get', 'render_min_height'],
          'fill-extrusion-opacity': 0.95,
        },
      } as maplibregl.FillExtrusionLayerSpecification, layer.id);
    } else if (layer.id === 'building-roof') map.setLayoutProperty(layer.id, 'visibility', 'none');
    else if (source === 'water' || source === 'waterway') paint(layer.id, layer.type === 'line' ? 'line-color' : 'fill-color', '#7FD3F7');
    else if (layer.type === 'fill' && (source === 'park' || source === 'landcover')) paint(layer.id, 'fill-color', '#B6E8C4');
    else if (layer.type === 'fill' && source === 'landuse') paint(layer.id, 'fill-color', '#E6F4EA');
    else if (layer.type === 'line' && source === 'transportation' && !/rail|metro/.test(layer.id)) {
      paint(layer.id, 'line-color', /edge|casing/.test(layer.id) ? '#D2E3D8' : '#FFFFFF');
    }
  }
  // White light: the shared style's warm one (#F2E6C2) tints every pastel block tan.
  map.setLight({ anchor: 'viewport', color: '#FFFFFF', intensity: 0.35, position: [1.15, 210, 30] });
}

const youFeature = (me: LatLng | null): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: me ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [me.lng, me.lat] }, properties: {} }] : [],
});

/** Billboards scale with zoom: 1 at 17, 0.75 at 16.3, and they hide below 15.8 (the pins stay). */
const boardScale = (zoom: number) => (zoom < 15.8 ? 0 : Math.max(0.6, Math.min(1.15, 0.75 + ((zoom - 16.3) / 0.7) * 0.25)));

type Slot = { pin: HTMLElement; board: HTMLElement; markers: maplibregl.Marker[] };

export default function MapView({ me, shops, selected, spotlight, focus, focusKey, settingSpot, onSpotMove, onPick, padding, route = null, fit = null, follow = false, heading = null }: {
  me: LatLng | null;
  shops: ShopWithMenu[];
  /** The open shop's id: its billboard grows. */
  selected: string | null;
  /** The visitor picked it: its billboard stays lit and the rest of the city dims. */
  spotlight: boolean;
  focus: LatLng | null;
  /** Changes whenever focus is set again, even to the same spot, so the camera re-flies. */
  focusKey: string;
  /** "Pick your spot": a pin stays at the map's centre and each stop of the map reports where it points. */
  settingSpot: boolean;
  onSpotMove: (p: LatLng) => void;
  onPick: (shop: ShopWithMenu) => void;
  /** The screen edges covered by bars, sheets and panels, so the camera keeps shops clear of them. */
  padding: Padding;
  /** The walking route: the part walked (grey) and the part left (green). */
  route?: { done: LatLng[]; left: LatLng[] } | null;
  /** Points to frame once (the route preview); the key changes when they do. */
  fit?: { points: LatLng[]; key: string } | null;
  /** While walking the camera glides after "me". */
  follow?: boolean;
  /** The walker's heading in degrees, shown as a soft cone. */
  heading?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [scale, setScale] = useState(1);
  const pick = useRef(onPick);
  pick.current = onPick;
  const latest = useRef({ shops, selected, me, spotlight, padding });
  latest.current = { shops, selected, me, spotlight, padding };

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE as maplibregl.StyleSpecification,
      center: DECCAN,
      zoom: 16.2,
      pitch: 56,
      bearing: -17,
      maxPitch: 60,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    map.setPadding(latest.current.padding);
    map.on('load', () => {
      cityDay(map);
      // The spotlight sits between the city and the markers, so the open shop's billboard stays bright.
      const scrim = document.createElement('div');
      scrim.className = 'spotlight';
      map.getCanvasContainer().insertBefore(scrim, map.getCanvas().nextSibling);
      scrimRef.current = scrim;
      mapRef.current = map;
      (window as unknown as { saathMap?: MapLibreMap }).saathMap = map; // for the browser checks
      setScale(boardScale(map.getZoom()));
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // The blue "you" dot with a soft halo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.addSource('saath-you', { type: 'geojson', data: youFeature(null) });
    map.addLayer({ id: 'you-halo', type: 'circle', source: 'saath-you', paint: { 'circle-radius': 22, 'circle-color': '#2E7CF6', 'circle-opacity': 0.22 } });
    map.addLayer({ id: 'you', type: 'circle', source: 'saath-you', paint: { 'circle-radius': 9, 'circle-color': '#2E7CF6', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 } });
  }, [ready]);
  useEffect(() => {
    (mapRef.current?.getSource('saath-you') as maplibregl.GeoJSONSource | undefined)?.setData(youFeature(me));
  }, [ready, me]);

  // The walking route on the ground, under the "you" dot: a white casing, the part walked in grey, the rest in green.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const line = (points: LatLng[]): FeatureCollection => ({ type: 'FeatureCollection', features: points.length < 2 ? [] : [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) } }] });
    if (!map.getSource('route-whole')) {
      const layout = { 'line-cap': 'round', 'line-join': 'round' } as const;
      for (const [id, color, width] of [['whole', '#FFFFFF', 16], ['done', '#B6C2CF', 9], ['left', '#16A34A', 9]] as const) {
        map.addSource(`route-${id}`, { type: 'geojson', data: line([]) });
        map.addLayer({ id: `route-${id}`, type: 'line', source: `route-${id}`, layout, paint: { 'line-color': color, 'line-width': width } }, 'you-halo');
      }
    }
    const parts = { whole: route ? [...route.done, ...route.left.slice(1)] : [], done: route?.done ?? [], left: route?.left ?? [] };
    for (const [id, points] of Object.entries(parts)) (map.getSource(`route-${id}`) as maplibregl.GeoJSONSource).setData(line(points));
  }, [ready, route]);

  // The route preview frames the whole walk, clear of the bars and the sheet (the map's padding adds to this margin).
  const fitKey = fit?.key ?? '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fit || fit.points.length < 2) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const p of fit.points) bounds.extend([p.lng, p.lat]);
    map.fitBounds(bounds, { padding: 48, maxZoom: 17.6, pitch: 56, bearing: map.getBearing(), duration: reduced() ? 0 : 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey]);

  // While walking the camera glides after the walker; a drag pauses that for 8 s so the visitor can look around.
  const dragged = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onDrag = () => { dragged.current = Date.now(); };
    map.on('dragstart', onDrag);
    return () => { map.off('dragstart', onDrag); };
  }, [ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !follow || !me || Date.now() - dragged.current < 8000) return;
    map.easeTo({ center: [me.lng, me.lat], duration: reduced() ? 0 : 900, easing: (t) => t });
  }, [ready, follow, me]);

  // The heading cone: one marker, turned with the map so it points along the street.
  const cone = useRef<maplibregl.Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me || heading === null) {
      cone.current?.remove();
      cone.current = null;
      return;
    }
    if (!cone.current) {
      const el = document.createElement('div');
      el.className = 'heading-cone';
      cone.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' });
    }
    cone.current.setLngLat([me.lng, me.lat]).setRotation(heading).addTo(map);
  }, [ready, me, heading]);

  // A pin and a billboard per shop; rebuilt only when shops come, go or move.
  const placeKey = shops.map((shop) => `${shop.id}:${shop.lat},${shop.lng},${shop.board_lat},${shop.board_lng}`).join('|');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const made: Record<string, Slot> = {};
    for (const shop of latest.current.shops) {
      const pin = document.createElement('div');
      const board = document.createElement('div');
      const spot = boardOf(shop);
      const markers = [
        new maplibregl.Marker({ element: board, anchor: 'bottom' }).setLngLat([spot.lng, spot.lat]).addTo(map),
        new maplibregl.Marker({ element: pin, anchor: 'bottom' }).setLngLat([shop.lng, shop.lat]).addTo(map),
      ];
      // addTo() names each marker "Map marker"; the buttons inside carry the real names.
      pin.removeAttribute('aria-label');
      board.removeAttribute('aria-label');
      board.setAttribute('aria-hidden', 'true');
      // The board's layout box is bigger than the scaled board: only its panel takes taps, so pins under it stay tappable.
      board.style.pointerEvents = 'none';
      pin.style.zIndex = '2';
      made[shop.id] = { pin, board, markers };
    }
    setSlots(made);
    return () => {
      for (const slot of Object.values(made)) slot.markers.forEach((marker) => marker.remove());
    };
    // Rebuilt by placeKey: the shops' ids and spots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, placeKey]);

  // Billboards follow the zoom, the open shop's spotlight follows the camera, and overlapping billboards give way.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const spotlight = () => {
      const scrim = scrimRef.current;
      const { selected: id, shops: all, spotlight: on } = latest.current;
      const shop = id && on ? all.find((s) => s.id === id) : null;
      if (!scrim) return;
      scrim.classList.toggle('is-on', !!shop);
      if (!shop) return;
      const p = map.project([boardOf(shop).lng, boardOf(shop).lat]);
      scrim.style.setProperty('--x', `${p.x}px`);
      scrim.style.setProperty('--y', `${p.y - 110 * boardScale(map.getZoom())}px`);
    };
    const declutter = () => {
      const { selected: id, shops: all, me: here } = latest.current;
      const centre = map.getCenter();
      const from = here ?? { lat: centre.lat, lng: centre.lng };
      const ranked = [...all].sort((a, b) =>
        Number(b.id === id) - Number(a.id === id)
        || (orderOf(b, b.menu)?.saving ?? 0) - (orderOf(a, a.menu)?.saving ?? 0)
        || distanceM(from, a) - distanceM(from, b));
      const kept: DOMRect[] = [];
      for (const shop of ranked) {
        const el = containerRef.current?.querySelector<HTMLElement>(`[data-board="${shop.id}"]`);
        if (!el) continue;
        el.classList.remove('is-crowded');
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        const hit = kept.some((k) => r.left < k.right - 8 && r.right > k.left + 8 && r.top < k.bottom - 8 && r.bottom > k.top + 8);
        if (hit) el.classList.add('is-crowded');
        else kept.push(r);
      }
    };
    const onZoom = () => setScale(boardScale(map.getZoom()));
    const settle = () => {
      declutter();
      spotlight();
    };
    map.on('zoom', onZoom);
    map.on('move', spotlight);
    map.on('moveend', settle);
    const first = window.setTimeout(settle, 400);
    return () => {
      window.clearTimeout(first);
      map.off('zoom', onZoom);
      map.off('move', spotlight);
      map.off('moveend', settle);
    };
  }, [ready, slots]);

  // Selecting a shop: light its billboard and dim the city (when picked), and let the billboards make way.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.fire('move');
    map.fire('moveend');
  }, [ready, selected, spotlight]);

  // Keep the city clear of the bars, sheets and panels as they change.
  const padKey = `${padding.top},${padding.bottom},${padding.left},${padding.right}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ padding: latest.current.padding, duration: reduced() ? 0 : 300 });
  }, [ready, padKey]);

  // Fly the camera to whatever we're focusing on, clear of the sheet.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const camera = {
      center: [focus.lng, focus.lat] as [number, number],
      zoom: Math.max(map.getZoom(), 16.6),
      padding: latest.current.padding,
    };
    if (reduced()) map.jumpTo(camera);
    else map.flyTo({ ...camera, duration: 900, essential: true });
    // focusKey re-triggers the flight even when the target is unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusKey]);

  // "Pick your spot": the pin stays at the map's centre (padding included) while the city is dragged under it; a tap
  // glides the map there. The pin's tip, 4 px above its shadow, marks the spot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !settingSpot) return;
    const el = document.createElement('div');
    el.className = 'spot-pin';
    el.innerHTML = '<svg width="36" height="46" viewBox="0 0 36 46" aria-hidden="true"><ellipse cx="18" cy="43" rx="7" ry="2.5" fill="rgba(0,0,0,.25)"/><path d="M18 42 C10 30 4 24 4 16 A14 14 0 1 1 32 16 C32 24 26 30 18 42 Z" fill="#0E1726"/><circle cx="18" cy="16" r="6" fill="#5BE38F"/></svg>';
    const pin = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 4] }).setLngLat(map.getCenter()).addTo(map);
    const follow = () => pin.setLngLat(map.getCenter());
    const report = () => {
      const { lat, lng } = map.getCenter();
      onSpotMove({ lat, lng });
    };
    // MapLibre hears marker clicks before React can stop them: a tap on a pin or board is not a spot.
    const glide = (event: MapMouseEvent) => {
      if ((event.originalEvent.target as HTMLElement).closest('.pin, .board')) return;
      map.easeTo({ center: event.lngLat, duration: reduced() ? 0 : 400 });
    };
    map.on('move', follow);
    map.on('moveend', report);
    map.on('click', glide);
    report();
    return () => {
      map.off('move', follow);
      map.off('moveend', report);
      map.off('click', glide);
      pin.remove();
    };
  }, [ready, settingSpot, onSpotMove]);

  const savings = useMemo(() => Object.fromEntries(shops.map((shop) => [shop.id, orderOf(shop, shop.menu)?.saving ?? 0])), [shops]);

  return (
    <div className="map-wrap" style={{ '--board-scale': scale } as CSSProperties}>
      <div ref={containerRef} className={`map${scale === 0 ? ' is-far' : ''}${selected ? ' has-selected' : ''}`} data-setting={settingSpot ? 'true' : undefined} />
      <div className="map-fog" aria-hidden="true" />
      {shops.map((shop, index) => {
        const slot = slots[shop.id];
        if (!slot) return null;
        const isSelected = shop.id === selected;
        const dim = spotlight && !!selected && !isSelected;
        return [
          createPortal(<Pin key="pin" shop={shop} saving={savings[shop.id]} selected={isSelected} dim={dim} index={index} onPick={() => pick.current(shop)} />, slot.pin, `pin-${shop.id}`),
          createPortal(<Billboard key="board" shop={shop} selected={isSelected} dim={dim} index={index} onPick={() => pick.current(shop)} />, slot.board, `board-${shop.id}`),
        ];
      })}
    </div>
  );
}

/** The mascot is the pin: open = its colour ring and a glow, busy = amber + hourglass, closed = grey + moon. */
function Pin({ shop, saving, selected, dim, index, onPick }: {
  shop: ShopWithMenu; saving: number; selected: boolean; dim: boolean; index: number; onPick: () => void;
}) {
  const state = shop.status;
  return (
    <button type="button" className={`pin is-${state}${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`}
      style={{ '--c': sectionOf(shop).color, '--i': index } as CSSProperties}
      aria-label={`${shop.name}, ${state}${saving ? `, save ${dollars(saving)}` : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        onPick();
      }}>
      <span className="pin-face"><img src={portraitOf(hostOf(shop))} alt="" /></span>
      <svg className="pin-tail" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true"><path d="M0 0h14L7 9.5z" /></svg>
      {state !== 'open' && <span className="pin-badge"><Icon name={state === 'busy' ? 'hourglass' : 'moon'} size={11} color="#fff" stroke={2.8} /></span>}
      {saving > 0 && <SaveChip amount={saving} size="s" grey={state === 'closed'} />}
    </button>
  );
}

/** A roadside billboard with the shop's own ad: steel pole, catwalk with railing, a framed panel and three lamps. */
function Billboard({ shop, selected, dim, index, onPick }: {
  shop: ShopWithMenu; selected: boolean; dim: boolean; index: number; onPick: () => void;
}) {
  const off = shop.status === 'closed';
  return (
    <div data-board={shop.id} className={`board${off ? ' is-off' : ''}${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`}
      style={{ '--i': index } as CSSProperties} onClick={(event) => {
        event.stopPropagation();
        onPick();
      }}>
      <span className="board-shadow" />
      <span className="board-pole" />
      <span className="board-panel">
        <span className="board-lamps"><i /><i /><i /></span>
        <span className="board-frame"><Ad shop={shop} height={90} off={off} radius={2} /></span>
        <span className="board-walk" />
      </span>
    </div>
  );
}
