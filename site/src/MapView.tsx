import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Point } from 'geojson';
import { FRIENDS } from '../../src/friends';
import { FACES } from '../../src/faces';
import { MAP_STYLE } from '../../src/mapStyle';
import type { LatLng } from '../../src/geo';

const PUNE: [number, number] = [73.8567, 18.5204];

const friendFeatures = (
  tagged: string[],
): FeatureCollection<Point, { id: string; color: string; tagged: boolean }> => ({
  type: 'FeatureCollection',
  features: FRIENDS.map((friend) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [friend.lng, friend.lat] },
    properties: {
      id: friend.id,
      color: friend.color,
      tagged: tagged.includes(friend.id),
    },
  })),
});

const youFeature = (me: LatLng | null): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: me
    ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [me.lng, me.lat] }, properties: {} }]
    : [],
});

export default function MapView({ me, tagged, focus, focusKey, settingSpot, onSetSpot, onPickFriend }: {
  me: LatLng | null;
  tagged: string[];
  focus: LatLng | null;
  /** Changes whenever focus is set again, even to the same spot, so the camera re-flies. */
  focusKey: string;
  settingSpot: boolean;
  onSetSpot: (p: LatLng) => void;
  onPickFriend: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);

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

  // Sources, layers and face images: built once when the style is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.addSource('saath-friends', { type: 'geojson', data: friendFeatures(tagged) });
    map.addSource('saath-you', { type: 'geojson', data: youFeature(me) });

    let cancelled = false;
    void Promise.all(
      FRIENDS.map((friend) =>
        map.loadImage(FACES[friend.character].met).then((image) => ({ friend, image })),
      ),
    ).then((loaded) => {
      if (cancelled || !loaded.every((entry) => entry.image)) return;
      for (const { friend, image } of loaded) {
        if (!map.hasImage(friend.id)) map.addImage(friend.id, image!.data, { pixelRatio: 2 });
      }
      map.addLayer({
        id: 'friend-ring', type: 'circle', source: 'saath-friends',
        paint: {
          // ~4px bigger than the face icon (192px image @ pixelRatio 2 = 48px radius at size 1)
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 24, 14, 34, 17, 47],
          'circle-color': ['case', ['get', 'tagged'], '#FFC83D', ['get', 'color']],
          'circle-stroke-color': '#111318', 'circle-stroke-width': 2.5,
        },
      });
      map.addLayer({
        id: 'friend-face', type: 'symbol', source: 'saath-friends',
        layout: {
          'icon-image': ['get', 'id'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.42, 14, 0.62, 17, 0.9],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
      // A bigger, invisible circle so taps on a phone land on the pin.
      map.addLayer({
        id: 'friend-hit', type: 'circle', source: 'saath-friends',
        paint: { 'circle-radius': 34, 'circle-color': 'transparent' },
      });
      map.on('click', 'friend-hit', (event) => {
        const feature = event.features?.[0];
        if (feature) onPickFriend(feature.properties?.id as string);
      });
      map.on('mouseenter', 'friend-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'friend-hit', () => { map.getCanvas().style.cursor = ''; });
    });

    // "You" — a blue dot with a soft halo.
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

    return () => { cancelled = true; };
    // Built once per map load; later changes go through the data effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Keep friend pins (and their gold rings) in step with tags.
  useEffect(() => {
    const source = mapRef.current?.getSource('saath-friends') as maplibregl.GeoJSONSource | undefined;
    source?.setData(friendFeatures(tagged));
  }, [ready, tagged]);

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
