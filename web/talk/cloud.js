// The cloud over a friend's head (the user, 18 Oct: "character speech appear like a cloud on his top, normally
// thinking cloud kind of"): a white, bumpy cloud with his current sentence, or three dots while he thinks, and a trail
// of little bubbles down to his head. Drawn on a 2D canvas, so the talk page shows it as is and the AR page as the
// texture of a card above him. drawCloud(canvas, { text, thinking, phase, flip }) clears the canvas and draws the
// cloud centred along its bottom edge (text wraps to fit; thinking: dots), its trail going down-left (flip: right), and
// returns { top, half }: where the cloud's top is (a fraction of the height from the top) and half its width (a fraction
// of the width), so a page can place it. Plain ES module, no dependencies.
const INK = '#1D2433', SHADOW = 'rgba(52, 64, 106, 0.28)';

// Words in lines no wider than max (canvas pixels), with ctx's current font.
function wrap(ctx, text, max) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? line + ' ' + word : word;
    if (line && ctx.measureText(next).width > max) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// A cloud filling the box (x, y, w, h): bumps round the edge of a rounded body, all filled as one shape so its shadow
// is one soft shadow.
function cloud(x, y, w, h) {
  const path = new Path2D(), r = Math.min(h * 0.32, w * 0.16);
  path.roundRect(x + r * 0.5, y + r * 0.5, w - r, h - r, r);
  const across = Math.max(2, Math.round((w - r) / (r * 1.25))), down = Math.max(1, Math.round((h - r) / (r * 1.4)));
  for (let i = 0; i <= across; i++) {   // top and bottom bumps, a little uneven like a real cloud
    const cx = x + r * 0.6 + ((w - r * 1.2) * i) / across, wob = 0.9 + 0.18 * ((i * 7) % 3) / 2;
    path.moveTo(cx + r * wob, y + r * 0.62); path.arc(cx, y + r * 0.62, r * wob, 0, Math.PI * 2);
    path.moveTo(cx + r * 0.9, y + h - r * 0.62); path.arc(cx, y + h - r * 0.62, r * 0.9, 0, Math.PI * 2);
  }
  for (let j = 0; j <= down; j++) {   // left and right bumps
    const cy = y + r * 0.62 + ((h - r * 1.24) * j) / down;
    path.moveTo(x + r * 0.62 + r * 0.85, cy); path.arc(x + r * 0.62, cy, r * 0.85, 0, Math.PI * 2);
    path.moveTo(x + w - r * 0.62 + r * 0.85, cy); path.arc(x + w - r * 0.62, cy, r * 0.85, 0, Math.PI * 2);
  }
  return path;
}

export function drawCloud(canvas, { text = '', thinking = false, phase = 0, flip = false } = {}) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height, s = W / 640;   // sizes are for a 640 px wide canvas
  ctx.clearRect(0, 0, W, H);
  const padX = 40 * s, padY = 34 * s, tail = 76 * s, room = H - tail - 24 * s;
  // The biggest letters, 34 px down to 22 px, whose lines fit: a long sentence gets smaller letters.
  let px = 34, lines = [];
  for (; !thinking; px -= 2) {
    ctx.font = `700 ${Math.round(px * s)}px system-ui, Roboto, sans-serif`;
    lines = wrap(ctx, text, W * 0.74);
    if (px <= 22 || lines.length * px * 1.24 * s + padY * 2 <= room) break;
  }
  const lineH = px * 1.24 * s;
  const w = thinking ? 210 * s : Math.min(W - 24 * s, Math.max(...lines.map((l) => ctx.measureText(l).width), 120 * s) + padX * 2);
  const h = thinking ? 120 * s : Math.min(room, lines.length * lineH + padY * 2);
  const x = (W - w) / 2, y = H - tail - h;
  ctx.save();
  ctx.shadowColor = SHADOW; ctx.shadowBlur = 26 * s; ctx.shadowOffsetY = 8 * s;
  ctx.fillStyle = '#fff';
  ctx.fill(cloud(x, y, w, h));
  for (const [dx, dy, r] of [[-0.05, 22, 15], [-0.11, 48, 10], [-0.15, 66, 6]]) {   // the trail of bubbles down to his head
    ctx.beginPath(); ctx.arc(W / 2 + (flip ? -dx : dx) * w, y + h + dy * s, r * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (thinking) {
    for (let i = 0; i < 3; i++) {   // three dots that take turns to hop
      const hop = Math.max(0, Math.sin((phase * 2 * Math.PI) - i * 0.9)) * 9 * s;
      ctx.beginPath(); ctx.arc(W / 2 + (i - 1) * 34 * s, y + h / 2 - hop, 9 * s, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    const top = y + h / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lineH));
  }
  return { top: y / H, half: w / 2 / W };
}
