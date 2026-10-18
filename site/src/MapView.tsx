import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Point } from 'geojson';
import { MAP_STYLE } from '../../src/mapStyle';
import type { LatLng } from '../../src/geo';
import { hostOf, pinOf, portraitOf, sectionOf, type Shop } from './shops';

const PUNE: [number, number] = [73.8567, 18.5204];

/** A shop on the map: its mascot's round portrait bobbing over its section's pin, and its name. */
function shopMarker(shop: Shop, index: number, onPick: (shop: Shop) => void): HTMLElement {
  const section = sectionOf(shop);
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = `shop-marker is-${shop.status}`;
  marker.style.setProperty('--section', section.color);
  marker.style.setProperty('--bob-delay', `${(index * 0.37) % 2}s`);
  const face = document.createElement('img');
  face.className = 'shop-marker-face';
  face.src = portraitOf(hostOf(shop));
  face.alt = '';
  const pinSrc = pinOf(shop);
  const pin = document.createElement(pinSrc ? 'img' : 'span');
  pin.className = pinSrc ? 'shop-marker-pin is-art' : 'shop-marker-pin';
  if (pin instanceof HTMLImageElement) {
    pin.src = pinSrc!;
    pin.alt = '';
  } else {
    pin.textContent = section.icon;
  }
  const name = document.createElement('span');
  name.className = 'shop-marker-name';
  name.textContent = shop.name; // the owner's words: text, never HTML
  marker.append(face, pin, name);
  marker.addEventListener('click', (event) => {
    event.stopPropagation();
    onPick(shop);
  });
  return marker;
}

const youFeature = (me: LatLng | null): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: me
    ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [me.lng, me.lat] }, properties: {} }]
    : [],
});

export default function MapView({ me, shops, focus, focusKey, settingSpot, onSetSpot, onPickShop }: {
  me: LatLng | null;
  shops: Shop[];
  focus: LatLng | null;
  /** Changes whenever focus is set again, even to the same spot, so the camera re-flies. */
  focusKey: string;
  settingSpot: boolean;
  onSetSpot: (p: LatLng) => void;
  onPickShop: (shop: Shop) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const pickShop = useRef(onPickShop);
  pickShop.current = onPickShop;

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE as maplibregl.StyleSpecification,
      center: PUNE,
      zoom: 12.4,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    map.dragRotate.disable();
    map.on('load', () => {
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // The blue "you" dot with a soft halo: built once when the style is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.addSource('saath-you', { type: 'geojson', data: youFeature(me) });
    map.addLayer({
      id: 'you-halo', type: 'circle', source: 'saath-you',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 14, 16, 26],
        'circle-color': '#2E7CF6', 'circle-opacity': 0.25,
      },
    });
    map.addLayer({
      id: 'you', type: 'circle', source: 'saath-you',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 7, 16, 11],
        'circle-color': '#2E7CF6', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5,
      },
    });
    // Built once per map load; later changes go through the data effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // The shops, as HTML markers so the hosts can bob with CSS; rebuilt when the list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = shops.map((shop, index) => {
      const element = shopMarker(shop, index, (picked) => pickShop.current(picked));
      const marker = new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat([shop.lng, shop.lat]).addTo(map);
      element.setAttribute('aria-label', `${shop.name}, ${sectionOf(shop).label}`); // addTo() sets a generic "Map marker"
      return marker;
    });
    return () => markers.forEach((marker) => marker.remove());
  }, [ready, shops]);

  // Keep the blue "you" dot in step with my location.
  useEffect(() => {
    const source = mapRef.current?.getSource('saath-you') as maplibregl.GeoJSONSource | undefined;
    source?.setData(youFeature(me));
  }, [ready, me]);

  // Fly the camera to whatever we're focusing on.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: Math.max(map.getZoom(), 14.5),
      duration: 900,
      essential: true,
    });
    // focusKey re-triggers the flight even when the target is unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusKey]);

  // In "set my spot" mode, the next click on the map becomes my location.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !settingSpot) return;
    map.getCanvas().style.cursor = 'crosshair';
    const pick = (event: MapMouseEvent) => {
      onSetSpot({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    };
    map.on('click', pick);
    return () => {
      map.getCanvas().style.cursor = '';
      map.off('click', pick);
    };
  }, [ready, settingSpot, onSetSpot]);

  return <div ref={containerRef} className="map" data-setting={settingSpot ? 'true' : undefined} />;
}
