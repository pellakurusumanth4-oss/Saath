// How the map looks: a MapLibre style, plus anything it adds once loaded. Pasted into mapHtml.ts.
//
// "Golden hour Pune": a warm late-afternoon city drawn from OpenFreeMap's vector tiles (OpenStreetMap
// data in the OpenMapTiles schema, no API key). Asphalt roads with sidewalks and lane marks,
// sandstone walls under terracotta roofs, teal water and lawns, lit by a low sun behind your left
// shoulder. Once loaded, decorateMap adds what a style can't: soft blue shadows on the ground,
// round leafy trees and a warm haze towards the horizon.

/** The ground. The page background matches it so loading doesn't flash. */
const LAND = '#E6DAC2';
const WATER = '#307B90';
/** Far away, everything fades into this. */
const HAZE = '#EED9C1';
/** The sun: degrees clockwise from the top of the screen (it turns with the map), and its height. */
const SUN_AZ = 232;
const SUN_EL = 34;

const OMT = 'openmaptiles';
const NAME = ['coalesce', ['get', 'name:latin'], ['get', 'name_en'], ['get', 'name']];
const LINES = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const AREAS = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const POINTS = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false];
const is = (key: string, ...values: string[]) => ['match', ['get', key], values, true, false];
const isNot = (key: string, ...values: string[]) => ['match', ['get', key], values, false, true];
const byZoom = (...stops: unknown[]) => ['interpolate', ['linear'], ['zoom'], ...stops];
const rgb = (hex: string) => [1, 3, 5].map((i) => +(parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4));

// Roads come in five sizes: big (motorway, trunk), primary, medium (secondary, tertiary),
// street (minor) and lane (service, track).
const ROADS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'busway', 'service', 'track'];
const bySize = (big: unknown, primary: unknown, medium: unknown, street: unknown, lane: unknown) =>
  ['match', ['get', 'class'], ['motorway', 'trunk'], big, 'primary', primary, ['secondary', 'tertiary'], medium,
    ['minor', 'busway'], street, lane];
// Widths in pixels at each zoom: about twice the real width up close, so the streets read well.
const ROAD_ZOOMS = [12, 13, 14, 15, 16, 17, 18, 19];
const ROAD_WIDTH = {
  big: [2.2, 3.2, 5, 8, 13, 20, 30, 44],
  primary: [1.8, 2.8, 4.5, 7, 11.5, 18, 27, 40],
  medium: [1.1, 1.9, 3.3, 5.5, 9, 14.5, 22, 33],
  street: [0, 0.8, 1.8, 3.5, 6.5, 11, 17, 26],
  lane: [0, 0, 0.8, 1.6, 3.2, 6, 10, 16],
};
// The pale sidewalk either side of the asphalt, both sides together.
const SIDEWALK = [1, 1.5, 2.2, 3, 4.5, 7, 10, 14];
const roadWidth = (edge: boolean) => ['interpolate', ['exponential', 1.5], ['zoom'],
  ...ROAD_ZOOMS.flatMap((zoom, i) => {
    const w = (sizes: number[]) => (sizes[i] > 0 && edge ? sizes[i] + SIDEWALK[i] : sizes[i]);
    const s = ROAD_WIDTH;
    return [zoom, bySize(w(s.big), w(s.primary), w(s.medium), w(s.street), w(s.lane))];
  })];
const ROAD_FILL = bySize('#7A7067', '#7E746B', '#847A70', '#8A8076', '#968C81');
const PAVEMENT = '#EFE5D2';
const CURB = '#D6C8AE';

const road = (id: string, brunnel: unknown, color: unknown, edge: boolean, paint: object = {}) => ({
  id, type: 'line', source: OMT, 'source-layer': 'transportation',
  filter: ['all', LINES, brunnel, is('class', ...ROADS)],
  layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': bySize(5, 4, 3, 2, 1) },
  paint: { 'line-color': color, 'line-width': roadWidth(edge), ...paint },
});

// Footpaths: a pale paved ribbon with a soft curb.
const PATHS = ['all', LINES, is('class', 'path', 'pedestrian'), isNot('subclass', 'platform', 'corridor'),
  isNot('brunnel', 'tunnel')];

// Sandstone walls under terracotta, tin and concrete roofs. OpenFreeMap merges a block of
// same-height buildings into one feature, so a colour picked from the feature's id covers a whole
// block; decorateMap gives each house near the middle of the map a roof of its own.
// MapLibre's light only darkens, so these are the design's colours brightened by what it takes off
// (design walls #EBD8B8 #F2E7D3 #E4BE90 #DDA478 #D3C7B3 #E9D0A6, roofs #B9663F #CDC3B1 #8E8780
// #DCD0BB #A95D3C #C9B79A): a sunlit wall then comes out as the design's sunlit wall.
const WALLS = ['#FFE6BB', '#FFF6D7', '#FBCA93', '#F3AF7A', '#E8D4B6', '#FFDDA9'];
const ROOFS = ['#D27146', '#E8D8C3', '#A1958D', '#F9E6CE', '#C06742', '#E4CAAA'];
const ROOF_LID = 0.4; // metres
// Ids are the OSM id times ten (plus a digit for the OSM type), so drop that digit before picking.
// Walls step through their colours more slowly than roofs, so a wall doesn't always get the same roof.
const byId = (colors: string[], step: number) => ['match', ['%', ['floor', ['/', ['to-number', ['id'], 0], step]], colors.length],
  ...colors.slice(0, -1).flatMap((color, i) => [i, color]), colors[colors.length - 1]];
const WALL_BY_ID = byId(WALLS, 70);
const ROOF_BY_ID = byId(ROOFS, 10);

// Tree crowns: [sunlit, middle, shaded] greens, one set per kind of tree.
const TREES = [['#C6D67E', '#7DA24A', '#365F2F'], ['#B5CF73', '#6A9443', '#2E5A2E'],
  ['#D2D489', '#8EA552', '#46633A'], ['#A9C96D', '#5C8C41', '#284F2C']];
const SHADOW = '#34406A';
const SHADOW_ALPHA = 0.34;

const PARKS = ['park', 'garden', 'golf', 'playground'];
const SIGHTS = ['castle', 'monument', 'museum', 'attraction', 'stadium', 'zoo', 'aquarium', 'amusement_park', 'theatre'];
const HALO = '#F7F0E3';
const poiColor = ['match', ['get', 'class'], PARKS, '#4D7A2C', ['railway', 'bus'], '#2D6AA8',
  ['place_of_worship'], '#94505F', 'college', '#86601C', '#6B5590'];
const poi = (id: string, minzoom: number, which: unknown, size: number) => ({
  id, type: 'symbol', source: OMT, 'source-layer': 'poi', minzoom,
  filter: ['all', POINTS, which, ['has', 'name']],
  layout: {
    'icon-image': ['match', ['get', 'subclass'], 'subway', 'railway_metro', ['get', 'class']], 'icon-size': 0.8,
    'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-size': size, 'text-max-width': 8,
    'text-anchor': 'top', 'text-offset': [0, 0.85], 'text-padding': 4, 'symbol-sort-key': ['get', 'rank'],
  },
  paint: { 'text-color': poiColor, 'text-halo-color': HALO, 'text-halo-width': 1.6 },
});

export const MAP_STYLE: string | object = {
  version: 8,
  name: 'Saath golden hour',
  sources: { [OMT]: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
  sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  // Warm, low sunlight from behind your left shoulder, so the walls you look at are lit.
  light: { anchor: 'viewport', color: '#F2E6C2', intensity: 0.34, position: [1.3, SUN_AZ, 90 - SUN_EL] },
  // Only shows when the map is tilted far back.
  sky: {
    'sky-color': '#5E98D2', 'horizon-color': '#F3D2AC', 'fog-color': HAZE, 'sky-horizon-blend': 0.7,
    'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.6, 'atmosphere-blend': 0,
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': LAND } },
    {
      id: 'landuse', type: 'fill', source: OMT, 'source-layer': 'landuse',
      filter: is('class', 'commercial', 'retail', 'industrial', 'railway', 'garages', 'school', 'college', 'university',
        'kindergarten', 'library', 'education', 'hospital', 'military', 'cemetery', 'stadium', 'pitch', 'track', 'playground'),
      paint: {
        'fill-color': ['match', ['get', 'class'], ['commercial', 'retail'], '#E8D8BE', ['industrial', 'railway', 'garages'], '#DDD4C6',
          ['school', 'college', 'university', 'kindergarten', 'library', 'education'], '#EADDC0', 'hospital', '#EBD6C9',
          'military', '#DCD4BC', 'cemetery', '#B4C590', '#B2C98A'],
      },
    },
    {
      id: 'landcover', type: 'fill', source: OMT, 'source-layer': 'landcover',
      filter: is('class', 'grass', 'wood', 'farmland', 'sand', 'wetland'),
      paint: {
        'fill-color': ['match', ['get', 'class'], 'wood', '#86A85E', 'farmland', '#D8D2A4', 'sand', '#E9D8AE', 'wetland', '#A8C7AA',
          ['match', ['get', 'subclass'], ['park', 'garden', 'recreation_ground', 'golf_course', 'village_green'], '#A7C47A',
            'scrub', '#AFC583', '#ADC882']],
      },
    },
    { id: 'park', type: 'fill', source: OMT, 'source-layer': 'park', paint: { 'fill-color': '#93B868' } },
    {
      id: 'green-edge', type: 'line', source: OMT, 'source-layer': 'landcover', minzoom: 14,
      filter: is('class', 'grass', 'wood'),
      paint: { 'line-color': '#8AA862', 'line-width': byZoom(14, 0.6, 18, 2), 'line-opacity': 0.7 },
    },
    {
      id: 'park-edge', type: 'line', source: OMT, 'source-layer': 'park',
      paint: { 'line-color': '#7E9F58', 'line-width': byZoom(12, 0.8, 18, 2.2), 'line-opacity': 0.8 },
    },
    {
      id: 'pitch-lines', type: 'line', source: OMT, 'source-layer': 'landuse', minzoom: 16,
      filter: is('class', 'pitch', 'stadium', 'track', 'playground'),
      paint: { 'line-color': '#F4F0E2', 'line-width': byZoom(16, 1, 19, 3), 'line-opacity': 0.75 },
    },
    {
      id: 'waterway', type: 'line', source: OMT, 'source-layer': 'waterway', filter: isNot('brunnel', 'tunnel'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': WATER,
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 12, ['match', ['get', 'class'], ['river', 'canal'], 1.5, 0.6],
          18, ['match', ['get', 'class'], ['river', 'canal'], 10, 4]],
      },
    },
    { id: 'water', type: 'fill', source: OMT, 'source-layer': 'water', filter: isNot('brunnel', 'tunnel'), paint: { 'fill-color': WATER } },
    {
      // A light rim just inside the shore, like sunlit shallows.
      id: 'water-shine', type: 'line', source: OMT, 'source-layer': 'water', minzoom: 12, filter: isNot('brunnel', 'tunnel'),
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#9CCAD0', 'line-width': byZoom(12, 1, 16, 2.5, 19, 5), 'line-offset': byZoom(12, 1, 16, 3, 19, 6),
        'line-blur': 2, 'line-opacity': 0.7,
      },
    },
    {
      id: 'water-edge', type: 'line', source: OMT, 'source-layer': 'water', filter: isNot('brunnel', 'tunnel'),
      paint: { 'line-color': '#2B7489', 'line-width': byZoom(12, 0.6, 16, 1.2, 19, 2) },
    },
    {
      id: 'aeroway-area', type: 'fill', source: OMT, 'source-layer': 'aeroway', minzoom: 11, filter: AREAS,
      paint: { 'fill-color': '#DDD5C8', 'fill-opacity': 0.8 },
    },
    {
      id: 'aeroway-runway', type: 'line', source: OMT, 'source-layer': 'aeroway', minzoom: 11,
      filter: ['all', LINES, is('class', 'runway', 'taxiway')],
      paint: {
        'line-color': '#9A9086',
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 11, ['match', ['get', 'class'], 'runway', 3, 0.5],
          17, ['match', ['get', 'class'], 'runway', 50, 8]],
      },
    },
    {
      id: 'pedestrian-area', type: 'fill', source: OMT, 'source-layer': 'transportation', minzoom: 14,
      filter: ['all', AREAS, is('class', 'path', 'pedestrian')],
      paint: { 'fill-color': '#EBE1CC', 'fill-outline-color': CURB },
    },
    road('road-tunnel-edge', is('brunnel', 'tunnel'), CURB, true, { 'line-dasharray': [1, 0.6], 'line-opacity': 0.6 }),
    road('road-tunnel', is('brunnel', 'tunnel'), '#D3C9B8', false),
    road('road-edge', isNot('brunnel', 'bridge', 'tunnel'), PAVEMENT, true),
    road('road', isNot('brunnel', 'bridge', 'tunnel'), ROAD_FILL, false),
    {
      id: 'rail', type: 'line', source: OMT, 'source-layer': 'transportation', minzoom: 12, filter: ['all', LINES, is('class', 'rail')],
      paint: { 'line-color': '#A39787', 'line-width': byZoom(12, 0.8, 16, 1.6, 19, 3) },
    },
    {
      id: 'rail-ties', type: 'line', source: OMT, 'source-layer': 'transportation', minzoom: 15, filter: ['all', LINES, is('class', 'rail')],
      paint: { 'line-color': '#A39787', 'line-dasharray': [0.2, 3], 'line-width': byZoom(15, 3, 19, 9) },
    },
    {
      id: 'path-edge', type: 'line', source: OMT, 'source-layer': 'transportation', minzoom: 14.5, filter: PATHS,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': CURB, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 14.5, 1.8, 16, 4.4, 17, 6.8, 18, 10.4, 19, 15] },
    },
    {
      id: 'path', type: 'line', source: OMT, 'source-layer': 'transportation', minzoom: 14.5, filter: PATHS,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': PAVEMENT, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 14.5, 1, 16, 3, 17, 5, 18, 8, 19, 12] },
    },
    {
      id: 'path-steps', type: 'line', source: OMT, 'source-layer': 'transportation', minzoom: 15,
      filter: ['all', PATHS, is('subclass', 'steps')],
      paint: { 'line-color': '#BFAF94', 'line-dasharray': [0.35, 0.35], 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 15, 2, 17, 4, 19, 9] },
    },
    road('bridge-shadow', is('brunnel', 'bridge'), 'rgba(52, 64, 106, 0.3)', true,
      { 'line-translate': [0, 4], 'line-translate-anchor': 'viewport', 'line-blur': 3 }),
    road('bridge-edge', is('brunnel', 'bridge'), '#DCD0BA', true),
    road('bridge', is('brunnel', 'bridge'), ROAD_FILL, false),
    {
      // Dashed white lane marks down the middle of the street.
      id: 'road-lanes', type: 'line', source: OMT, 'source-layer': 'transportation', minzoom: 15.5,
      filter: ['all', LINES, isNot('brunnel', 'tunnel'), is('class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor')],
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#F6EFE1', 'line-dasharray': [5, 7], 'line-width': byZoom(15.5, 0.6, 17, 1.1, 19, 2.2),
        'line-opacity': byZoom(15.5, 0, 16.2, 0.8),
      },
    },
    {
      // Pune's metro runs up on pillars: a dusty lilac line over the roads.
      id: 'metro', type: 'line', source: OMT, 'source-layer': 'transportation', minzoom: 12, filter: ['all', LINES, is('class', 'transit')],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#9C8FB8', 'line-width': byZoom(12, 1.2, 15, 2.5, 18, 6) },
    },
    {
      id: 'building', type: 'fill', source: OMT, 'source-layer': 'building', minzoom: 13, maxzoom: 14.5,
      paint: { 'fill-color': ROOF_BY_ID, 'fill-opacity': byZoom(13, 0.5, 14, 0.9), 'fill-outline-color': '#CBB79A' },
    },
    {
      // The long-press code ray-casts against exactly these heights: keep them un-interpolated.
      id: 'building-3d', type: 'fill-extrusion', source: OMT, 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-extrusion-color': WALL_BY_ID,
        'fill-extrusion-height': ['get', 'render_height'],
        'fill-extrusion-base': ['get', 'render_min_height'],
        'fill-extrusion-opacity': byZoom(14, 0.6, 15, 1),
        // Below ~100 m tall its gradient is just a flat 12% darker.
        'fill-extrusion-vertical-gradient': false,
      },
    },
    {
      // A thin roof on each block. Near the middle of the map, decorateMap stacks one of its own on
      // every single house.
      id: 'building-roof', type: 'fill-extrusion', source: OMT, 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-extrusion-color': ROOF_BY_ID,
        'fill-extrusion-base': ['get', 'render_height'],
        'fill-extrusion-height': ['+', ['to-number', ['get', 'render_height'], 0], ROOF_LID],
        'fill-extrusion-opacity': byZoom(14, 0.6, 15, 1),
      },
    },
    {
      id: 'road-name-small', type: 'symbol', source: OMT, 'source-layer': 'transportation_name', minzoom: 15,
      filter: ['all', LINES, is('class', 'minor', 'service', 'track', 'busway')],
      layout: {
        'symbol-placement': 'line', 'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-size': byZoom(15, 10.5, 17, 12, 19, 14),
        'text-letter-spacing': 0.02, 'symbol-spacing': 300, 'text-padding': 4, 'text-max-angle': 30,
        'text-rotation-alignment': 'map', 'text-pitch-alignment': 'viewport',
      },
      paint: { 'text-color': '#6B5E52', 'text-halo-color': HALO, 'text-halo-width': 1.5 },
    },
    {
      id: 'path-name', type: 'symbol', source: OMT, 'source-layer': 'transportation_name', minzoom: 16.5,
      filter: ['all', LINES, is('class', 'path')],
      layout: {
        'symbol-placement': 'line', 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': byZoom(16.5, 10.5, 19, 13),
        'symbol-spacing': 300, 'text-padding': 4, 'text-max-angle': 30, 'text-rotation-alignment': 'map', 'text-pitch-alignment': 'viewport',
      },
      paint: { 'text-color': '#8A6A52', 'text-halo-color': HALO, 'text-halo-width': 1.5 },
    },
    {
      id: 'road-name-big', type: 'symbol', source: OMT, 'source-layer': 'transportation_name', minzoom: 12.5,
      filter: ['all', LINES, is('class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary')],
      layout: {
        'symbol-placement': 'line', 'text-field': NAME, 'text-font': ['Noto Sans Bold'],
        'text-size': byZoom(12.5, 10.5, 15, 12.5, 17, 14, 19, 16), 'text-letter-spacing': 0.03, 'symbol-spacing': 320,
        'text-padding': 6, 'text-max-angle': 30, 'text-rotation-alignment': 'map', 'text-pitch-alignment': 'viewport',
      },
      paint: { 'text-color': '#4A3F37', 'text-halo-color': HALO, 'text-halo-width': 1.8 },
    },
    {
      id: 'waterway-name', type: 'symbol', source: OMT, 'source-layer': 'waterway', minzoom: 12, filter: LINES,
      layout: {
        'symbol-placement': 'line', 'symbol-spacing': 400, 'text-field': NAME, 'text-font': ['Noto Sans Bold'],
        'text-size': 13, 'text-letter-spacing': 0.12, 'text-max-angle': 30, 'text-pitch-alignment': 'viewport',
      },
      paint: { 'text-color': '#E6F3F2', 'text-halo-color': 'rgba(30, 90, 106, 0.6)', 'text-halo-width': 1.2 },
    },
    {
      id: 'water-name-line', type: 'symbol', source: OMT, 'source-layer': 'water_name', filter: LINES,
      layout: {
        'symbol-placement': 'line', 'symbol-spacing': 400, 'text-field': NAME, 'text-font': ['Noto Sans Bold'],
        'text-size': 14, 'text-letter-spacing': 0.12, 'text-max-angle': 30, 'text-pitch-alignment': 'viewport',
      },
      paint: { 'text-color': '#E6F3F2', 'text-halo-color': 'rgba(30, 90, 106, 0.6)', 'text-halo-width': 1.2 },
    },
    {
      id: 'water-name-point', type: 'symbol', source: OMT, 'source-layer': 'water_name', filter: POINTS,
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-letter-spacing': 0.1, 'text-max-width': 6 },
      paint: { 'text-color': '#E6F3F2', 'text-halo-color': 'rgba(30, 90, 106, 0.6)', 'text-halo-width': 1.2 },
    },
    poi('poi-small', 17, is('class', 'place_of_worship', 'cinema', 'college', 'ice_cream', 'cafe', 'bakery', 'playground'), 11),
    poi('poi-landmark', 14.5, is('class', ...SIGHTS, ...PARKS), 12),
    poi('poi-transit', 14, ['any', is('class', 'railway'), is('subclass', 'bus_station')], 12),
    {
      id: 'place-area', type: 'symbol', source: OMT, 'source-layer': 'place', minzoom: 12, maxzoom: 18.5,
      filter: is('class', 'suburb', 'quarter', 'neighbourhood'),
      layout: {
        'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-transform': 'uppercase', 'text-letter-spacing': 0.16,
        'text-max-width': 8, 'text-padding': 8,
        'text-size': byZoom(12, ['match', ['get', 'class'], 'suburb', 12, 10], 16, ['match', ['get', 'class'], 'suburb', 16, 13]),
      },
      paint: { 'text-color': '#7D6A8E', 'text-halo-color': 'rgba(247, 240, 227, 0.9)', 'text-halo-width': 2, 'text-opacity': byZoom(16, 1, 18, 0.7) },
    },
    {
      id: 'place-city', type: 'symbol', source: OMT, 'source-layer': 'place', maxzoom: 14, filter: is('class', 'city', 'town'),
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-size': byZoom(8, 14, 13, 20), 'text-max-width': 8 },
      paint: { 'text-color': '#3F3656', 'text-halo-color': HALO, 'text-halo-width': 2.2 },
    },
  ],
};

export const STYLE_CSS = `
html,body,#map{background:${LAND}}
`;

/**
 * Runs inside the map page. decorateMap(map, raster) is called on every style load, before the
 * app adds its own layers. raster = the vector tiles failed and the OpenStreetMap raster fallback is showing.
 */
export const STYLE_JS = `
  // Toys on the map, from one GeoJSON source: tree trunks at fixed pseudo-random spots in the parks,
  // gardens and woods and along the streets, and a lid (now and then with a black water tank) on
  // each building (the tiles merge whole blocks of buildings into one feature, so only here can each
  // house get its own colour). Three small WebGL layers draw what a style can't, from the same trees
  // and houses: the leafy crowns, the shadows everything casts, and the haze. It all covers the area
  // around the middle of the map and is rebuilt after the map settles or new tiles arrive, never per frame.
  var TREE_CELL = 8.95e-8;   // at most one tree per ~3.4 m square (in Web Mercator units, at Pune)
  // The nearest TREE_NEAR trees get rounder crowns than the rest.
  var TREE_MAX = 2400, TREE_NEAR = 400, ROOF_MAX = 3500;
  var ROOF_COLORS = ${JSON.stringify(ROOFS)};
  var SUN_AZ = ${SUN_AZ}, SUN_EL = ${SUN_EL}, RAD = Math.PI / 180;
  var toys = { map: null, timer: null, firstAsk: 0, key: '', dirty: true, hooked: false };

  function decorateMap(map, raster) {
    if (raster || !map.getSource('openmaptiles') || map.getSource('style-toys')) return;
    map.addSource('style-toys', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, maxzoom: 16, tolerance: 0 });
    // Shadows lie on the ground, under the buildings; the haze covers everything but the labels.
    map.addLayer(shade.layer, 'building-3d');
    map.addLayer({ id: 'style-toys', type: 'fill-extrusion', source: 'style-toys', minzoom: 15, paint: {
      'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'],
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.6, 1] } }, 'road-name-small');
    map.addLayer(grove.layer, 'road-name-small');
    map.addLayer(air.layer, 'road-name-small');
    toys.map = map;
    toys.key = '';
    if (!toys.hooked) {
      toys.hooked = true;
      map.on('moveend', function () { askToys(false); });
      map.on('sourcedata', function (e) { if (e.sourceId === 'openmaptiles' && e.tile) askToys(true); });
    }
    askToys(true);
  }

  function askToys(dirty) {
    var now = Date.now();
    if (dirty) toys.dirty = true;
    if (toys.timer) clearTimeout(toys.timer); else toys.firstAsk = now;
    // Wait for the map to settle, but no more than 1.5 s while it keeps gliding.
    toys.timer = setTimeout(buildToys, Math.max(0, Math.min(350, toys.firstAsk + 1500 - now)));
  }

  function buildToys() {
    var map = toys.map, source = map.getSource('style-toys');
    toys.timer = null;
    if (!source || map.getZoom() < 14.8) return;
    var started = Date.now(), zoom = map.getZoom(), c = map.getCenter();
    var cx = (c.lng + 180) / 360, cy = mercY(c.lat);
    var unit = 40075016.7 * Math.cos(c.lat * RAD);   // metres per Web Mercator unit here
    var reach = reachOf(map, c) / unit;
    var key = Math.round(3 * cx / reach) + ',' + Math.round(3 * cy / reach) + ',' + Math.round(2 * zoom) + ',' + reach;
    if (key === toys.key && !toys.dirty) return;
    toys.key = key;
    toys.dirty = false;
    var roofs = findRoofs(map, cx, cy, reach).slice(0, ROOF_MAX);
    var trees = findTrees(map, cx, cy, reach, roofs).slice(0, TREE_MAX);
    var features = [];
    // The trunk is a toy; the crown is drawn by the trees layer.
    trees.forEach(function (t) { features.push(treePart(t.x, t.y, 0.09 * t.r / unit, 6, 0, t.hc, '#5B4636')); });
    roofs.forEach(function (r) { roofFeatures(features, r.house, 1 / unit); });
    source.setData({ type: 'FeatureCollection', features: features });
    // Past the last tree or house kept, there are no shadows: fade them out before that.
    var cut = reach;
    if (roofs.length === ROOF_MAX) cut = Math.min(cut, Math.sqrt(roofs[roofs.length - 1].d) * reach);
    if (trees.length === TREE_MAX) cut = Math.min(cut, Math.sqrt(trees[trees.length - 1].d));
    setScene(trees, roofs, cx, cy, cut, 1 / unit);
    map.styleToys = { trees: trees.length, roofs: roofs.length, reach: Math.round(reach * unit), cut: Math.round(cut * unit), ms: Date.now() - started };
  }

  // How far out the toys go, in metres: about to the top of the screen, which is far away on a
  // tilted map.
  function reachOf(map, c) {
    var tr = map.transform, top = Math.max(0, tr.height / 2 - tr.getHorizon()) + 0.06 * tr.height;
    var far = map.unproject([tr.width / 2, top]);
    var d = Math.sqrt(Math.pow((far.lng - c.lng) * 111320 * Math.cos(c.lat * RAD), 2) + Math.pow((far.lat - c.lat) * 110574, 2));
    return Math.min(1000, Math.max(250, Math.round(d / 50) * 50 || 250));
  }

  // Trees: in woods, parks and gardens (so many square metres of each per tree) and along the
  // streets, never in a house or on a road. Each gets a crown radius r and the height hc of its
  // middle, in metres.
  // (The design's park and garden counts come out about one per 55 and 80 m².)
  var GREEN_M2 = { wood: 45, park: 55, recreation_ground: 55, village_green: 55, garden: 80, scrub: 150, golf_course: 300 };
  function findTrees(map, cx, cy, reach, roofs) {
    var roads = findRoads(map, cx, cy, reach), free = openGround(roofs, roads), taken = {}, list = [];
    function plant(x, y, r, look, turn) {
      var k = Math.floor(x / TREE_CELL) * 16777216 + Math.floor(y / TREE_CELL);
      if (taken[k] || !free(x, y)) return;
      taken[k] = true;
      list.push({ x: x, y: y, d: (x - cx) * (x - cx) + (y - cy) * (y - cy), r: r, hc: 1.55 * r + 1.5, look: look, turn: turn });
    }
    function green(features, m2Of) {
      features.forEach(function (f) {
        var m2 = m2Of(f.properties), g = f.geometry, p = 11.56 / m2;   // the chance a 3.4 m square has one
        var polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        polygons.forEach(function (polygon) {
          var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          var rings = polygon.map(function (ring) {
            return ring.map(function (p) {
              var x = (p[0] + 180) / 360, y = mercY(p[1]);
              if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
              return [x, y];
            });
          });
          var i1 = Math.floor(Math.min(x1, cx + reach) / TREE_CELL), j1 = Math.floor(Math.min(y1, cy + reach) / TREE_CELL);
          for (var i = Math.floor(Math.max(x0, cx - reach) / TREE_CELL); i <= i1; i++) {
            for (var j = Math.floor(Math.max(y0, cy - reach) / TREE_CELL); j <= j1; j++) {
              if (toyHash(i, j, 1) >= p) continue;
              var x = (i + 0.15 + 0.7 * toyHash(i, j, 2)) * TREE_CELL, y = (j + 0.15 + 0.7 * toyHash(i, j, 3)) * TREE_CELL;
              if (insideRings(x, y, rings)) plant(x, y, 2.4 + 2.6 * toyHash(i, j, 4), toyHash(i, j, 5), 6.2832 * toyHash(i, j, 6));
            }
          }
        });
      });
    }
    green(map.querySourceFeatures('openmaptiles', { sourceLayer: 'landcover', filter: ['match', ['get', 'class'], ['wood', 'grass'], true, false] }),
      function (p) { return GREEN_M2[p['class'] === 'wood' ? 'wood' : p.subclass] || 90; });
    green(map.querySourceFeatures('openmaptiles', { sourceLayer: 'park' }), function () { return 300; });
    // Street trees: every 13 m (from 5 m in), about two spots in five get one, just off the road on
    // one side or the other.
    roads.forEach(function (road) {
      if (!road.street) return;
      var t = road.tile, p = road.pts, mpu = 40075016.7 * Math.cos(latOf(t[1] + t[2] / 2) * RAD), off = (road.w / 2 + 1.6) / mpu;
      for (var i = 1, run = 0, next = 5; i < p.length; i++) {
        var dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1], l = Math.sqrt(dx * dx + dy * dy), len = l * mpu;
        for (; len > 0 && next <= run + len; next += 13) {
          var f = (next - run) / len, x = p[i - 1][0] + dx * f, y = p[i - 1][1] + dy * f;
          // A road on a tile's edge is in the next tile too: that copy plants the trees past the edge.
          if (x < t[0] || y < t[1] || x >= t[0] + t[2] || y >= t[1] + t[2] || Math.abs(x - cx) > reach || Math.abs(y - cy) > reach) continue;
          var gx = Math.round(x * 4e7), gy = Math.round(y * 4e7), side = toyHash(gx, gy, 12) < 0.5 ? off : -off;
          if (toyHash(gx, gy, 11) < 0.42) plant(x - dy / l * side, y + dx / l * side, 2.2 + 2.4 * toyHash(gx, gy, 13), toyHash(gx, gy, 14), 6.2832 * toyHash(gx, gy, 15));
        }
        run += len;
      }
    });
    list.sort(function (a, b) { return a.d - b.d; });
    return list;
  }

  // Every road and path near the middle, as lines in Web Mercator units: how wide it is (m),
  // whether it gets street trees, and its tile's corner and size.
  var ROAD_W = { motorway: 15, trunk: 15, primary: 13, secondary: 11, tertiary: 9, minor: 6.5, busway: 6.5, service: 4.2, track: 3, path: 2.4 };
  function findRoads(map, cx, cy, reach) {
    var list = [];
    map.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation',
      filter: ['all', ['match', ['get', 'class'], Object.keys(ROAD_W), true, false], ['!=', ['get', 'brunnel'], 'tunnel']] }).forEach(function (f) {
      var vt = f._vectorTileFeature, tile = f.tile, p = f.properties;
      if (!vt || !tile || vt.type !== 2) return;
      var n = Math.pow(2, tile.z), ox = tile.x / n, oy = tile.y / n, k = 1 / (n * vt.extent);
      if (Math.max(ox - cx, 0, cx - ox - 1 / n) > reach || Math.max(oy - cy, 0, cy - oy - 1 / n) > reach) return;
      var street = /^(trunk|primary|secondary|tertiary|minor)$/.test(p['class']) && p.brunnel !== 'bridge';
      vt.loadGeometry().forEach(function (line) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        var pts = line.map(function (q) {
          var x = ox + q.x * k, y = oy + q.y * k;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          return [x, y];
        });
        if (x1 > cx - reach && x0 < cx + reach && y1 > cy - reach && y0 < cy + reach) list.push({ pts: pts, w: ROAD_W[p['class']], street: street, tile: [ox, oy, 1 / n] });
      });
    });
    return list;
  }

  // Whether a tree can stand at a spot: not in a house, not on a road. A grid of ~16 m squares
  // lists the houses and the bits of road that reach into each.
  var BLOCK = 4.2e-7;
  function openGround(roofs, roads) {
    var cells = {};
    function put(x0, y0, x1, y1, item) {
      for (var i = Math.floor(x0 / BLOCK), i1 = Math.floor(x1 / BLOCK); i <= i1; i++) {
        for (var j = Math.floor(y0 / BLOCK), j1 = Math.floor(y1 / BLOCK); j <= j1; j++) {
          var key = i * 16777216 + j;
          (cells[key] || (cells[key] = [])).push(item);
        }
      }
    }
    roofs.forEach(function (r) {
      var h = r.house, n = Math.pow(2, h.tile.z), k = 1 / (n * h.size), ox = h.tile.x / n, oy = h.tile.y / n;
      if (!h.merc) h.merc = h.rings.map(function (ring) { return ring.map(function (p) { return [ox + p.x * k, oy + p.y * k]; }); });
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      h.merc[0].forEach(function (p) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; });
      put(x0, y0, x1, y1, h);
    });
    roads.forEach(function (road) {
      var p = road.pts, w = road.w / 2 / (40075016.7 * Math.cos(latOf(p[0][1]) * RAD));
      for (var i = 1; i < p.length; i++) {
        var a = p[i - 1], b = p[i];
        put(Math.min(a[0], b[0]) - w, Math.min(a[1], b[1]) - w, Math.max(a[0], b[0]) + w, Math.max(a[1], b[1]) + w, [a[0], a[1], b[0], b[1], w * w]);
      }
    });
    return function (x, y) {
      var items = cells[Math.floor(x / BLOCK) * 16777216 + Math.floor(y / BLOCK)] || [];
      for (var i = 0; i < items.length; i++) {
        var s = items[i];
        if (s.merc ? insideRings(x, y, s.merc) : nearSegment(x, y, s)) return false;
      }
      return true;
    };
  }
  // Whether (x, y) is within the square root of s[4] of the segment from (s[0], s[1]) to (s[2], s[3]).
  function nearSegment(x, y, s) {
    var vx = s[2] - s[0], vy = s[3] - s[1], l2 = vx * vx + vy * vy;
    var t = l2 > 0 ? Math.max(0, Math.min(1, ((x - s[0]) * vx + (y - s[1]) * vy) / l2)) : 0;
    var dx = s[0] + vx * t - x, dy = s[1] + vy * t - y;
    return dx * dx + dy * dy < s[4];
  }

  // A prism n sides round, standing from base to top metres. Counter-clockwise, as GeoJSON wants.
  function treePart(x, y, r, n, base, top, color) {
    var ring = [];
    for (var a = 0; a <= n; a++) {
      var t = (a % n) * 2 * Math.PI / n + 0.3;
      ring.push([(x + r * Math.cos(t)) * 360 - 180, latOf(y - r * Math.sin(t))]);
    }
    return { type: 'Feature', properties: { b: base, h: top, c: color }, geometry: { type: 'Polygon', coordinates: [ring] } };
  }

  // Each building near the middle. They're read straight from the tile (cheaper than the GeoJSON
  // querySourceFeatures makes) and only once per tile.
  var houseCache = {};
  function findRoofs(map, cx, cy, reach) {
    var list = [], seen = {};
    map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' }).forEach(function (f) {
      var vt = f._vectorTileFeature, tile = f.tile, top = Number(f.properties.render_height);
      if (!vt || !tile || !(top > 0)) return;
      var n = Math.pow(2, tile.z), gx = Math.max(tile.x / n - cx, 0, cx - (tile.x + 1) / n), gy = Math.max(tile.y / n - cy, 0, cy - (tile.y + 1) / n);
      if (gx * gx + gy * gy > reach * reach) return;
      var id = typeof vt._geometry === 'number' ? tile.z + '/' + tile.x + '/' + tile.y + '/' + vt._geometry : null;
      var houses = (id && houseCache[id]) || splitHouses(vt, tile, top);
      if (id) seen[id] = houses;
      // The middle of the map and the reach, in this tile's own units.
      var size = vt.extent, mx = (cx * n - tile.x) * size, my = (cy * n - tile.y) * size;
      var r2 = reach * n * size * reach * n * size;
      houses.forEach(function (house) {
        var dx = house.x - mx, dy = house.y - my, d = dx * dx + dy * dy;
        if (d <= r2) list.push({ d: d / r2, house: house });
      });
    });
    houseCache = seen;
    list.sort(function (a, b) { return a.d - b.d; });
    return list;
  }

  // One feature can hold a whole block: split it into houses (an outer ring and its holes).
  function splitHouses(vt, tile, top) {
    var houses = [], polygon = null, outer = 0, size = vt.extent, n = Math.pow(2, tile.z);
    function keep(rings) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      rings[0].forEach(function (p) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; });
      var x = (x0 + x1) / 2, y = (y0 + y1) / 2;
      // A house on the tile's edge is in the next tile too: that copy counts if its middle is there.
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      var gx = tile.x * size + Math.round(x), gy = tile.y * size + Math.round(y), look = toyHash(gx, gy, 7);
      // A water tank on about four roofs in ten, somewhere on the roof, if the roof is big enough.
      var metres = 40075016.7 * Math.cos(latOf((tile.y + y / size) / n) * RAD) / (n * size), tank = null;
      if (toyHash(gx, gy, 8) < 0.4 && (x1 - x0) * metres > 6 && (y1 - y0) * metres > 6) {
        var tx = x0 + (x1 - x0) * (0.25 + 0.5 * toyHash(gx, gy, 9)), ty = y0 + (y1 - y0) * (0.25 + 0.5 * toyHash(gx, gy, 10));
        if (insideRings(tx, ty, [rings[0].map(function (p) { return [p.x, p.y]; })])) tank = [tx, ty];
      }
      houses.push({ x: x, y: y, rings: rings, tile: tile, size: size, top: top, tank: tank,
        color: ROOF_COLORS[Math.floor(look * ROOF_COLORS.length)] });
    }
    vt.loadGeometry().forEach(function (ring) {
      var area = ringArea(ring);
      if (!area) return;
      if (!outer) outer = area;
      if ((area > 0) === (outer > 0)) { if (polygon) keep(polygon); polygon = [ring]; }
      else if (polygon) polygon.push(ring);
    });
    if (polygon) keep(polygon);
    return houses;
  }

  // The lid sits just above the style's own roof layer, so the two never share a face.
  function roofFeatures(out, house, m) {
    var n = Math.pow(2, house.tile.z), k = 1 / (n * house.size), x = house.tile.x / n, y = house.tile.y / n;
    var rings = house.rings.map(function (ring) {
      return ring.map(function (p) { return [(x + p.x * k) * 360 - 180, latOf(y + p.y * k)]; });
    });
    var lid = house.top + ${ROOF_LID};
    out.push({ type: 'Feature', properties: { b: lid, h: lid + ${ROOF_LID}, c: house.color }, geometry: { type: 'Polygon', coordinates: rings } });
    if (house.tank) out.push(treePart(x + house.tank[0] * k, y + house.tank[1] * k, 0.65 * m, 8, lid + ${ROOF_LID}, lid + 1.6, '#34363B'));
  }

  function ringArea(ring) {
    var sum = 0;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j].x - ring[i].x) * (ring[i].y + ring[j].y);
    return sum;
  }

  function mercY(lat) { var s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); }
  function latOf(y) { var v = Math.PI * (1 - 2 * y); return Math.atan((Math.exp(v) - Math.exp(-v)) / 2) * 180 / Math.PI; }

  function insideRings(x, y, rings) {
    var odd = false;
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      for (var a = 0, b = ring.length - 1; a < ring.length; b = a++) {
        var ya = ring[a][1], yb = ring[b][1];
        if ((ya > y) !== (yb > y) && x < (ring[b][0] - ring[a][0]) * (y - ya) / (yb - ya) + ring[a][0]) odd = !odd;
      }
    }
    return odd;
  }

  // The same three whole numbers always give the same number in [0, 1).
  function toyHash(i, j, k) {
    var h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791);
    h = Math.imul(h ^ (h >>> 16), 73244475);
    h = Math.imul(h ^ (h >>> 16), 73244475);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ---- The scene layers --------------------------------------------------------------------
  // Their geometry is in Web Mercator units around an origin near the middle of the map (floats
  // alone would wobble by metres at street zoom), with heights in metres.
  var shade = { n: 0, data: null, dirty: false, ox: 0, oy: 0, cut: 1, on: false, fade: 0, gl: null, broken: false, w: 0, h: 0 };
  var grove = { n: 0, data: null, dirty: false, ox: 0, oy: 0, cut: 1, gl: null, broken: false };
  var air = { gl: null, broken: false };

  // What the trees and houses look like to the layers: each blob of a tree's crown, and each wall
  // whose shadow falls on the ground.
  function setScene(trees, roofs, ox, oy, cut, m) {
    var blobs = [], walls = [];
    trees.forEach(function (t) {
      var r = t.r, hc = t.hc, look = Math.floor(t.look * 4) % 4, seed = t.look * 7.3, x = t.x - ox, y = t.y - oy;
      var ex = Math.cos(t.turn) * r * m, ey = Math.sin(t.turn) * r * m;
      // One big ball, a smaller one up on either side and a small one on top, lower ones darker.
      blobs.push(x, y, hc - 0.08 * r, r, look, seed, 0.86, 0.92);
      blobs.push(x + 0.45 * ex, y + 0.45 * ey, hc + 0.28 * r, 0.66 * r, look, seed + 1, 0.94, 0.92);
      blobs.push(x - 0.42 * ex, y - 0.42 * ey, hc + 0.34 * r, 0.6 * r, look, seed + 2, 0.94, 0.92);
      blobs.push(x + 0.02 * ex, y + 0.02 * ey, hc + 0.62 * r, 0.52 * r, look, seed + 3, 1, 0.92);
      // Its shadow: the crown as a drum that casts the same shadow as a ball in this sun, and the trunk.
      drum(walls, x, y, 0.92 * r * m, 8, hc - 0.59 * r, hc + 0.59 * r, true);
      drum(walls, x, y, 0.09 * r * m, 4, 0, hc - 0.59 * r, false);
    });
    roofs.forEach(function (r) {
      var h = r.house, n = Math.pow(2, h.tile.z), k = 1 / (n * h.size), x = h.tile.x / n - ox, y = h.tile.y / n - oy;
      h.rings.forEach(function (ring) {
        for (var i = 1; i < ring.length; i++) wall(walls, x + ring[i - 1].x * k, y + ring[i - 1].y * k, x + ring[i].x * k, y + ring[i].y * k, 0, h.top);
      });
    });
    grove.data = new Float32Array(blobs); grove.n = blobs.length / 8; grove.near = 4 * Math.min(trees.length, TREE_NEAR);
    grove.ox = ox; grove.oy = oy; grove.cut = cut; grove.dirty = true;
    shade.data = new Float32Array(walls); shade.n = walls.length / 3; shade.ox = ox; shade.oy = oy; shade.cut = cut; shade.dirty = true;
    toys.map.triggerRepaint();
  }
  // A wall from a to b, h0 to h1 metres up: on the ground its shadow is the quad it sweeps.
  function wall(out, ax, ay, bx, by, h0, h1) {
    out.push(ax, ay, h0, bx, by, h0, bx, by, h1, ax, ay, h0, bx, by, h1, ax, ay, h1);
  }
  // Walls round a circle, and with fill, a disc halfway up to cover the inside of the shadow.
  function drum(out, x, y, r, n, h0, h1, fill) {
    for (var i = 0; i < n; i++) {
      var a = i * 2 * Math.PI / n, b = a + 2 * Math.PI / n, hm = (h0 + h1) / 2;
      var ax = x + r * Math.cos(a), ay = y + r * Math.sin(a), bx = x + r * Math.cos(b), by = y + r * Math.sin(b);
      wall(out, ax, ay, bx, by, h0, h1);
      if (fill) out.push(x, y, hm, ax, ay, hm, bx, by, hm);
    }
  }

  function glProgram(gl, vs, fs, attrs) {
    function shader(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    }
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    attrs.forEach(function (name, i) { gl.bindAttribLocation(p, i, name); });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i++) { var info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }
  function quadBuffer(gl) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    return b;
  }
  // The camera matrix moved to a local origin, worked out in doubles.
  var LOCAL = new Float32Array(16);
  function localMatrix(m, ox, oy) {
    for (var i = 0; i < 12; i++) LOCAL[i] = m[i];
    for (i = 0; i < 4; i++) LOCAL[12 + i] = m[i] * ox + m[4 + i] * oy + m[12 + i];
    return LOCAL;
  }
  function metreAt(y) { return 1 / (40075016.7 * Math.cos(latOf(y) * RAD)); }
  function sceneFade() { return toys.map ? Math.max(0, Math.min(1, (toys.map.getZoom() - 15) / 0.6)) : 0; }
  function failed(what, err) { post({ type: 'log', msg: 'Map ' + what + ' off: ' + (err && err.message) }); }
  var QUAD_VS = 'attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }';
  var HIGHP = '#ifdef GL_FRAGMENT_PRECISION_HIGH\\nprecision highp float;\\n#else\\nprecision mediump float;\\n#endif\\n';

  // ---- Shadows -----------------------------------------------------------------------------
  // Every wall's shadow is drawn into a half-size offscreen picture, four times with the sun
  // nudged a little, so the edges come out soft and grow softer away from the wall. Within each
  // pass, a pixel is only counted once (the whole pass sits at one depth, nearer than the pass
  // before, and the depth test refuses repeats), so overlapping shadows don't get darker. That
  // picture is then laid over the ground in one soft blue-violet.
  var SHADE_VS = [
    'precision highp float;',
    'uniform mat4 u_m; uniform vec2 u_sun; uniform vec2 u_jit; uniform float u_cut;',
    'attribute vec3 a_pos;',
    'varying float v_fade;',
    'void main() {',
    '  vec4 c = u_m * vec4(a_pos.xy + a_pos.z * u_sun, 0.0, 1.0);',
    '  v_fade = 1.0 - smoothstep(0.75, 1.0, length(a_pos.xy) / u_cut);',
    '  gl_Position = vec4(c.xy + u_jit * c.w, c.zw);',
    '}'
  ].join('\\n');
  var SHADE_FS = 'precision mediump float; varying float v_fade; void main() { gl_FragColor = vec4(0.25 * v_fade); }';
  var SHADE_OVER_FS = [
    'precision mediump float;',
    'uniform sampler2D u_tex; uniform vec2 u_inv; uniform vec4 u_col;',
    'void main() {',
    '  float a = texture2D(u_tex, gl_FragCoord.xy * u_inv).r * u_col.a;',
    '  gl_FragColor = vec4(u_col.rgb * a, a);',
    '}'
  ].join('\\n');
  // [degrees the sun turns, how much longer the shadow gets, nudge in offscreen pixels]
  var SHADE_PASSES = [[-3, 0.97, 0.5, -0.5], [3, 1.03, -0.5, 0.5], [-1, 1.07, 0.5, 0.5], [1, 0.93, -0.5, -0.5]];
  var SHADOW_RGBA = ${JSON.stringify([...rgb(SHADOW), SHADOW_ALPHA])};

  function shadeSetup(gl) {
    shade.gl = gl;
    shade.prog = glProgram(gl, SHADE_VS, SHADE_FS, ['a_pos']);
    shade.over = glProgram(gl, QUAD_VS, SHADE_OVER_FS, ['a_pos']);
    shade.buf = gl.createBuffer();
    shade.quad = quadBuffer(gl);
    shade.fbo = gl.createFramebuffer();
    shade.tex = gl.createTexture();
    shade.depth = gl.createRenderbuffer();
    shade.w = shade.h = 0;
    shade.dirty = true;
  }
  function shadeResize(gl, w, h) {
    shade.w = w; shade.h = h;
    gl.bindTexture(gl.TEXTURE_2D, shade.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, shade.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, shade.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shade.tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shade.depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('shadow picture incomplete');
  }
  // Before the map draws (MapLibre restores its own state and viewport afterwards).
  function shadeDraw(gl, matrix) {
    shade.on = false;
    shade.fade = sceneFade();
    if (shade.broken || !shade.n || !shade.fade) return;
    try {
      if (gl !== shade.gl || !gl.isProgram(shade.prog.p)) shadeSetup(gl);
      var w = Math.max(1, gl.drawingBufferWidth >> 1), h = Math.max(1, gl.drawingBufferHeight >> 1);
      if (w !== shade.w || h !== shade.h) shadeResize(gl, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shade.fbo);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
      gl.colorMask(true, true, true, true); gl.depthMask(true);
      gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
      var P = shade.prog;
      gl.useProgram(P.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, shade.buf);
      if (shade.dirty) { gl.bufferData(gl.ARRAY_BUFFER, shade.data, gl.STATIC_DRAW); shade.dirty = false; }
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
      gl.uniformMatrix4fv(P.u.u_m, false, localMatrix(matrix, shade.ox, shade.oy));
      gl.uniform1f(P.u.u_cut, shade.cut);
      // How far a shadow reaches per metre of height, in Mercator units.
      var len = metreAt(shade.oy) / Math.tan(SUN_EL * RAD), bearing = toys.map.getBearing();
      for (var i = 0; i < SHADE_PASSES.length; i++) {
        var p = SHADE_PASSES[i], az = (bearing + SUN_AZ + p[0]) * RAD;
        gl.uniform2f(P.u.u_sun, -Math.sin(az) * len * p[1], Math.cos(az) * len * p[1]);
        gl.uniform2f(P.u.u_jit, 2 * p[2] / w, 2 * p[3] / h);
        // A zero-width depth range puts the whole pass at one depth and still clips like the map.
        gl.depthRange(0.8 - 0.15 * i, 0.8 - 0.15 * i);
        gl.drawArrays(gl.TRIANGLES, 0, shade.n);
      }
      gl.disableVertexAttribArray(0);
      shade.on = true;
    } catch (err) { shade.broken = true; failed('shadows', err); }
  }
  // In its place among the layers: on the ground, under the buildings.
  function shadeOver(gl) {
    if (!shade.on || gl !== shade.gl) return;
    var P = shade.over;
    gl.useProgram(P.p);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shade.tex);
    gl.uniform1i(P.u.u_tex, 0);
    gl.uniform2f(P.u.u_inv, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    gl.uniform4f(P.u.u_col, SHADOW_RGBA[0], SHADOW_RGBA[1], SHADOW_RGBA[2], SHADOW_RGBA[3] * shade.fade);
    gl.bindBuffer(gl.ARRAY_BUFFER, shade.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(0);
  }
  shade.layer = { id: 'style-shadow', type: 'custom', renderingMode: '2d', prerender: shadeDraw, render: shadeOver };

  // ---- Trees -------------------------------------------------------------------------------
  // Each clump of leaves is one round, slightly lumpy ball, all drawn in one go (instanced),
  // shaded from dark to light green by the sun, darker underneath.
  var TREE_VS = [
    'precision highp float;',
    'uniform mat4 u_m; uniform float u_k; uniform float u_grow; uniform float u_cut;',
    'uniform vec3 u_lit[4]; uniform vec3 u_mid[4]; uniform vec3 u_dark[4];',
    'attribute vec3 a_pos;',   // on a unit ball
    'attribute vec4 a_blob;',  // x, y (Mercator, from the origin), height of its middle and radius (m)
    'attribute vec4 a_look;',  // which greens, seed, how shaded (lower clumps darker), squash
    'varying vec3 v_n; varying vec3 v_lit; varying vec3 v_mid; varying vec3 v_dark; varying vec2 v_look;',
    'void main() {',
    '  int i = int(a_look.x + 0.5);',
    '  v_lit = u_lit[i]; v_mid = u_mid[i]; v_dark = u_dark[i]; v_look = a_look.yz; v_n = a_pos;',
    '  float s = a_look.y;',
    '  float lump = 1.0 + 0.07 * sin(a_pos.x * 4.0 + s * 6.3) * sin(a_pos.y * 3.6 + s * 2.1) + 0.05 * sin(a_pos.z * 5.1 + s * 4.7);',
    '  float grow = u_grow * (1.0 - smoothstep(0.85, 1.0, length(a_blob.xy) / u_cut));',
    '  vec3 p = a_pos * vec3(1.0, 1.0, a_look.w) * a_blob.w * lump * grow;',
    '  gl_Position = u_m * vec4(a_blob.xy + p.xy * u_k, (a_blob.z * grow + p.z) * u_k, 1.0);',
    '}'
  ].join('\\n');
  var TREE_FS = [
    'precision mediump float;',
    'uniform vec3 u_sun;',
    'varying vec3 v_n; varying vec3 v_lit; varying vec3 v_mid; varying vec3 v_dark; varying vec2 v_look;',
    'void main() {',
    '  vec3 n = normalize(v_n);',
    // Sunlit where it faces the sun, mid green a little way round, dark green by the time it
    // faces away: the design's gradient from sunlit through mid (at 0.45) to shaded.
    '  float t = (1.0 - dot(n, u_sun)) * 1.2;',
    // Leafy clumps break up the smooth ball.
    '  float s = v_look.x * 6.2831;',
    '  t = clamp(t + 0.16 * sin(n.x * 9.0 + s) * sin(n.y * 8.0 + s * 1.7) * sin(n.z * 7.0 + s * 2.9), 0.0, 1.0);',
    '  vec3 c = t < 0.45 ? mix(v_lit, v_mid, t / 0.45) : mix(v_mid, v_dark, (t - 0.45) / 0.55);',
    '  c *= mix(0.84, 1.0, smoothstep(-0.8, 0.3, n.z)) * mix(0.82, 1.0, v_look.y);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\\n');
  var TREE_TONES = ${JSON.stringify([0, 1, 2].map((tone) => TREES.flatMap((t) => rgb(t[tone]))))};
  // Balls: an icosahedron split twice (320 triangles) for near trees, then split once (80) for far
  // ones, as plain triangles in one list.
  var BALL_NEAR = 960, BALL_FAR = 240;
  var BALL = (function () {
    var t = (1 + Math.sqrt(5)) / 2, out = [];
    var v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    var f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    function unit(p) { var l = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]); return [p[0] / l, p[1] / l, p[2] / l]; }
    function mid(a, b) { return unit([a[0] + b[0], a[1] + b[1], a[2] + b[2]]); }
    function split(a, b, c, depth) {
      if (!depth) { out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); return; }
      var ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      split(a, ab, ca, depth - 1); split(ab, b, bc, depth - 1); split(ca, bc, c, depth - 1); split(ab, bc, ca, depth - 1);
    }
    [2, 1].forEach(function (depth) { f.forEach(function (tri) { split(unit(v[tri[0]]), unit(v[tri[1]]), unit(v[tri[2]]), depth); }); });
    return new Float32Array(out);
  })();

  function groveSetup(gl) {
    var ext = gl.drawArraysInstanced ? null : gl.getExtension('ANGLE_instanced_arrays');
    if (!gl.drawArraysInstanced && !ext) throw new Error('no instancing');
    grove.gl = gl;
    grove.draw = ext ? function (first, n, count) { ext.drawArraysInstancedANGLE(gl.TRIANGLES, first, n, count); }
      : function (first, n, count) { gl.drawArraysInstanced(gl.TRIANGLES, first, n, count); };
    grove.divisor = ext ? function (i, d) { ext.vertexAttribDivisorANGLE(i, d); } : function (i, d) { gl.vertexAttribDivisor(i, d); };
    var P = grove.prog = glProgram(gl, TREE_VS, TREE_FS, ['a_pos', 'a_blob', 'a_look']);
    gl.useProgram(P.p);
    gl.uniform3fv(P.u.u_lit, TREE_TONES[0]); gl.uniform3fv(P.u.u_mid, TREE_TONES[1]); gl.uniform3fv(P.u.u_dark, TREE_TONES[2]);
    grove.ball = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, grove.ball);
    gl.bufferData(gl.ARRAY_BUFFER, BALL, gl.STATIC_DRAW);
    grove.buf = gl.createBuffer();
    grove.dirty = true;
  }
  // A 3D layer: MapLibre has set up the depth test it shares with the buildings.
  function groveDraw(gl, matrix) {
    var grow = sceneFade();
    if (grove.broken || !grove.n || !grow) return;
    try {
      if (gl !== grove.gl || !gl.isProgram(grove.prog.p)) groveSetup(gl);
      var P = grove.prog, az = (toys.map.getBearing() + SUN_AZ) * RAD, el = SUN_EL * RAD;
      gl.useProgram(P.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, grove.ball);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, grove.buf);
      if (grove.dirty) { gl.bufferData(gl.ARRAY_BUFFER, grove.data, gl.STATIC_DRAW); grove.dirty = false; }
      gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
      grove.divisor(1, 1); grove.divisor(2, 1);
      gl.uniformMatrix4fv(P.u.u_m, false, localMatrix(matrix, grove.ox, grove.oy));
      gl.uniform1f(P.u.u_k, metreAt(grove.oy));
      gl.uniform1f(P.u.u_grow, grow);
      gl.uniform1f(P.u.u_cut, grove.cut);
      // Towards the sun, in the same east / south / up axes as the balls.
      gl.uniform3f(P.u.u_sun, Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el));
      // Near blobs, then the rest from where they start in the list (instancing has no "first").
      [[0, BALL_NEAR, 0, grove.near], [BALL_NEAR, BALL_FAR, grove.near, grove.n - grove.near]].forEach(function (d) {
        if (d[3] <= 0) return;
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, d[2] * 32);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, d[2] * 32 + 16);
        grove.draw(d[0], d[1], d[3]);
      });
      grove.divisor(1, 0); grove.divisor(2, 0);
      gl.disableVertexAttribArray(0); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
    } catch (err) { grove.broken = true; failed('trees', err); }
  }
  grove.layer = { id: 'style-trees', type: 'custom', renderingMode: '3d', render: groveDraw };

  // ---- Haze --------------------------------------------------------------------------------
  // Warm haze rising towards the horizon (where MapLibre's sky starts), a soft glow on the sunny
  // side and a gentle vignette, drawn over the whole map but under the labels.
  var AIR_FS = HIGHP + [
    'uniform vec2 u_size; uniform float u_line; uniform vec3 u_haze; uniform vec3 u_glow; uniform vec3 u_dim;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_size;',
    '  float below = u_line - gl_FragCoord.y;',  // pixels under the horizon
    '  float h = pow(clamp(1.0 - below / (0.55 * u_size.y), 0.0, 1.0), 1.8) * 0.88;',
    '  h *= 1.0 - smoothstep(0.0, 0.07 * u_size.y, -below);',  // into the sky
    '  float gx = (uv.x - 0.15) / 0.6, gy = below / (0.25 * u_size.y);',
    '  float g = exp(-gx * gx - gy * gy) * 0.32;',
    '  vec3 haze = mix(u_haze, u_glow, clamp(g * 2.5, 0.0, 1.0));',
    '  float ha = max(h, g * 0.6);',
    '  float v = clamp((length((uv - vec2(0.5, 0.45)) / 0.75) - 0.55) / 0.45, 0.0, 1.0) * 0.34;',
    '  gl_FragColor = vec4(u_dim * v + haze * ha * (1.0 - v), 1.0 - (1.0 - ha) * (1.0 - v));',
    '}'
  ].join('\\n');
  var AIR_COLORS = ${JSON.stringify([rgb(HAZE), rgb('#FFE0AE'), rgb('#2A2238')])};
  function airDraw(gl) {
    var tr = toys.map && toys.map.transform;
    if (air.broken || !tr) return;
    try {
      if (gl !== air.gl || !gl.isProgram(air.prog.p)) { air.gl = gl; air.prog = glProgram(gl, QUAD_VS, AIR_FS, ['a_pos']); air.quad = quadBuffer(gl); }
      var P = air.prog, dpr = gl.drawingBufferHeight / tr.height;
      gl.useProgram(P.p);
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(P.u.u_size, gl.drawingBufferWidth, gl.drawingBufferHeight);
      // The same line MapLibre starts its sky at, in pixels up from the bottom.
      gl.uniform1f(P.u.u_line, (tr.height / 2 + tr.getHorizon()) * dpr);
      gl.uniform3fv(P.u.u_haze, AIR_COLORS[0]); gl.uniform3fv(P.u.u_glow, AIR_COLORS[1]); gl.uniform3fv(P.u.u_dim, AIR_COLORS[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, air.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(0);
    } catch (err) { air.broken = true; failed('haze', err); }
  }
  air.layer = { id: 'style-air', type: 'custom', renderingMode: '2d', render: airDraw };

  // For tests: what the scene layers hold and whether any of them gave up.
  window.__styleDebug = function () {
    return { shadows: shade.n, shadowsDrawn: shade.on, trees: grove.n, broken: [shade.broken, grove.broken, air.broken] };
  };
`;
