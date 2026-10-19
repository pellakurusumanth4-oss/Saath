// Saath AR simulator: rooms and phone scripts.
// Rooms: x and z extents and height in metres, the floor at y = 0; the phone starts at `start` (x, z), `eye` m up, facing
// -z. Boxes are furniture. texture: how much detail ARCore finds on a surface (0-1). light.level: 1 a bright room, 0.3 a
// dim one (planes come slower, and a slower turn already blurs them away); ambient and lamp feed the light estimate.
// Script steps, played in order (angles in degrees: yaw 0 is where the phone faced at Start, pitch < 0 looks down):
//   hold: s | look: {pitch, yaw}, s | lookAt: box name or [x, y, z] | sweep: ±deg, s, pitch (a look left and right every s)
//   walkTo: 'friend', dist | eye: m (sit 1.05, stand 1.45) | clips: every gesture of his in turn
//   follow: max s, yaw: does what the page's tip says (aims at the floor a few steps ahead, nearer or further when told,
//     taps once the ring is on the floor) until he is out
//   talk: what you say, press: s held, s | jump: {camera | anchor: [dx, dy, dz]} (a map re-fix, or one anchor moving)
//   lose: true on any step: no tracking during it.

export const FRIENDS = { juno: ['Juno', 1.4], rosa: ['Chef Rosa', 1.72], kiran: ['Kiran', 1.72], otto: ['Grandpa Otto', 1.72],
  sunny: ['Sunny', 1.72], nia: ['Auntie Nia', 1.72], mika: ['Mika', 1.72], max: ['Max', 1.4], omar: ['Omar', 1.72],
  lina: ['Lina', 1.72], sana: ['Sana', 1.72], kai: ['Kai', 1.4] };   // src/friends.ts, scripts/build-rigs.mjs

export const ROOMS = {
  open: { x: [-2, 2], z: [-4.5, 0.8], h: 2.6, eye: 1.45, start: [0, 0.3],
    floor: { color: '#b48d64', tiles: 0.25, texture: 0.9 },   // wooden boards: lots of detail
    wall: { color: '#e9e3d8', texture: 0.2 },
    light: { level: 1, ambient: 0.55, lamp: { dir: [-0.4, 0.8, 0.45], intensity: 0.35 } },
    boxes: [
      { name: 'sofa', x: [-2, -1.15], z: [-3.8, -1.8], h: 0.45, color: '#6f8fb8', texture: 0.7 },
      { name: 'table', x: [0.9, 1.5], z: [-1.4, -0.8], h: 0.45, color: '#a87c50', texture: 0.6 },
    ] },
  // The user's room (18 Oct): about 3 x 3.5 m, a bed and a desk, a bag and clothes on the floor, one dim light.
  small: { x: [-1.5, 1.5], z: [-3.0, 0.5], h: 2.6, eye: 1.45, start: [0.05, 0.25],
    floor: { color: '#cbbfa8', tiles: 0.6, texture: 0.45 },   // big plain tiles: little detail
    wall: { color: '#d9d2c4', texture: 0.2 },
    light: { level: 0.3, ambient: 0.14, lamp: { dir: [0.6, 0.7, -0.2], intensity: 0.1 } },
    boxes: [
      { name: 'bed', x: [-1.5, -0.55], z: [-3.0, -1.0], h: 0.5, color: '#7e6aa8', texture: 0.7 },
      { name: 'desk', x: [0.85, 1.5], z: [-2.4, -1.2], h: 0.75, color: '#8a6a4a', texture: 0.6 },
      { name: 'chair', x: [0.35, 0.8], z: [-2.0, -1.55], h: 0.48, color: '#3d3d44', texture: 0.4 },
      { name: 'bag', x: [-0.2, 0.2], z: [-1.0, -0.72], h: 0.35, color: '#2f5d8a', texture: 0.6 },
      { name: 'clothes', x: [0.25, 0.7], z: [-0.5, -0.1], h: 0.15, color: '#b04a4a', texture: 0.8 },
    ] },
};

// What the page asks for: aim at the floor a few steps ahead, then tap the ring.
const FIND = [{ hold: 0.5 }, { look: { pitch: -30 }, s: 0.8 }, { follow: 30 }];

// ringWithin: the ring must show within this many seconds of Start.
// opts (optional): anchorNoise (m, each frame, default 0.002), seed.
export const SCENARIOS = {
  'good-room': { room: 'open', ringWithin: 5, script: [...FIND, { hold: 4 }, { clips: true }, { hold: 1 }] },
  // The simulated dim room maps floor 2.5 m ahead slowly (the ring at about 30 s); on the S24 (18 Oct) floor a few steps
  // ahead was found in about 8 s once the user looked there.
  'small-cluttered-dim': { room: 'small', ringWithin: 35, script: [
    { hold: 0.5 }, { look: { pitch: -30 }, s: 0.8 },
    { sweep: 50, s: 1.6, pitch: -40 },   // a quick wave round, too fast to map
    { look: { pitch: 15, yaw: 0 }, s: 1 }, { hold: 1.5 },   // held up like a camera, tipped a little too high
    { follow: 45 },
    { hold: 8 }, { eye: 1.05, s: 1.5 }, { hold: 6 }, { eye: 1.45, s: 1.5 }, { hold: 6 },   // sits down, stands up
  ] },
  'scan-near-clutter-first': { room: 'small', ringWithin: 40, script: [   // 12 s on clutter, then the slow dim-room floor
    { hold: 0.5 }, { lookAt: 'bag', s: 0.8 }, { sweep: 8, s: 3 }, { lookAt: 'clothes', s: 0.8 }, { sweep: 8, s: 3 },
    { lookAt: 'desk', s: 1 }, { sweep: 10, s: 3 }, { follow: 40 }, { hold: 6 },
  ] },
  'walk-closer': { room: 'open', ringWithin: 5, script: [...FIND, { hold: 4 }, { walkTo: 'friend', dist: 0.7 }, { hold: 2.5 }, { walkTo: 'friend', dist: 2 }, { hold: 2.5 }] },
  'tracking-loss': { room: 'open', ringWithin: 8, script: [
    { hold: 0.5 }, { look: { pitch: -30 }, s: 0.8 }, { sweep: 10, s: 3, pitch: -30 },
    { sweep: 20, s: 1.5, pitch: -30, lose: true },
    { follow: 30 }, { hold: 3 },
    { sweep: 15, s: 2, lose: true }, { jump: { camera: [0.04, 0, -0.03] } }, { hold: 5 },   // lost, then found again a few cm off
  ] },
  'anchor-jump': { room: 'open', ringWithin: 5, script: [
    ...FIND, { hold: 3 },
    { jump: { anchor: [0.12, 0, 0.05] } }, { hold: 3 },   // ARCore moves his anchor 13 cm
    // Map re-fixes of 5, 8, 15, 19 and 30 cm, each a new way: he must stay on his real spot through every one.
    ...[[0.05, 0, 0], [0.08, 0, 0], [0, 0, -0.15], [-0.18, 0, 0.06], [0.24, 0, 0.18]].flatMap((camera) => [{ jump: { camera } }, { hold: 3 }]),
  ] },
  talk: { room: 'open', ringWithin: 5, script: [...FIND, { hold: 4 }, { talk: 'what are you doing', press: 1.5, s: 14 }, { hold: 1 }] },
  // A shop's page opened him (?shop=): asked a price, he names the item and the menu card shows it at the shop's price.
  'shop-menu': { room: 'open', ringWithin: 5, shop: true, script: [...FIND, { hold: 3 }, { talk: 'how much is the chai?', press: 1.5, s: 12 }, { hold: 16 }] },   // his reply, then 8 s for the card to go
  // The quick pass over every friend (run.mjs all-friends): out, every gesture, one question.
  'friend-pass': { room: 'open', ringWithin: 5, script: [...FIND, { hold: 4 }, { clips: true }, { talk: 'hi', press: 1.2, s: 12 }] },
};
