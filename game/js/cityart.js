// The city's vertical layer: pseudo-3D rooftops with long afternoon shadows, rooftop machinery,
// neon shop signs, palms, lamps and beach furniture. Everything draws in world space, sorted by
// depth, and culled to the camera's view.

import { PALETTE } from './config.js';
import { rgba, roundRect, shade } from './utils.js';

/** Whether a world-space box touches the camera view, padded for tall roofs and shadows. */
function inView(view, x, y, w, h, pad = 120) {
  return x + w > view.x - pad && x < view.x + view.w + pad && y + h > view.y - pad && y < view.y + view.h + pad;
}

/** A building: shadow, walls, roof, rooftop furniture and any shop sign. */
export function drawBuilding(ctx, b, time = 0) {
  const lift = b.lift;
  const roofX = b.x - lift * 0.22;
  const roofY = b.y - lift;

  // Long shadow to the south-east.
  ctx.fillStyle = 'rgba(24, 22, 34, 0.20)';
  roundRect(ctx, b.x + lift * 0.36 + 16, b.y + lift * 0.46 + 20, b.w, b.h, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(24, 22, 34, 0.22)';
  roundRect(ctx, b.x + lift * 0.3 + 8, b.y + lift * 0.4 + 10, b.w, b.h, 4);
  ctx.fill();

  // Walls: the visible band of the footprint under the lifted roof.
  ctx.fillStyle = shade(b.wall, -0.3);
  roundRect(ctx, b.x, b.y, b.w, b.h, 2);
  ctx.fill();
  // Sunlit rim on the roof-facing wall.
  ctx.fillStyle = shade(b.wall, 0.12);
  ctx.fillRect(b.x, b.y + b.h - 4, b.w, 4);

  // Windows on the wall band that shows at the bottom and right.
  const glass = b.style === 'towers' ? PALETTE.glass : shade(b.wall, -0.5);
  ctx.fillStyle = rgba(glass, 0.55);
  const cols = Math.max(2, Math.floor(b.w / 42));
  for (let i = 0; i < cols; i += 1) {
    const wx = b.x + 12 + i * ((b.w - 24) / cols);
    ctx.fillRect(wx, b.y + b.h - lift * 0.55, Math.min(18, b.w / cols - 8), Math.max(3, lift * 0.3));
  }
  ctx.fillStyle = rgba('#0e1420', 0.35);
  ctx.fillRect(b.x + b.w - 6, b.y + 8, 6, b.h - 16);

  // Roof.
  ctx.fillStyle = b.roof;
  roundRect(ctx, roofX, roofY, b.w, b.h, 3);
  ctx.fill();
  const light = ctx.createLinearGradient(roofX, roofY, roofX + b.w, roofY + b.h);
  light.addColorStop(0, 'rgba(255, 245, 225, 0.22)');
  light.addColorStop(0.55, 'rgba(255, 245, 225, 0.02)');
  light.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
  ctx.fillStyle = light;
  roundRect(ctx, roofX, roofY, b.w, b.h, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 22, 28, 0.45)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, roofX, roofY, b.w, b.h, 3);
  ctx.stroke();
  // Parapet highlight.
  ctx.strokeStyle = 'rgba(255, 250, 236, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(roofX + 2, roofY + 2);
  ctx.lineTo(roofX + b.w - 2, roofY + 2);
  ctx.stroke();

  // Rooftop machinery: AC boxes, vents and a water tank.
  for (const unit of b.ac) {
    const ux = roofX + unit.x * b.w;
    const uy = roofY + unit.y * b.h;
    const uw = unit.w * b.w;
    const uh = unit.h * b.h;
    ctx.fillStyle = 'rgba(25, 25, 32, 0.28)';
    ctx.fillRect(ux + 4, uy + 5, uw, uh);
    ctx.fillStyle = '#a3a8a8';
    ctx.fillRect(ux, uy, uw, uh);
    ctx.strokeStyle = 'rgba(40, 44, 50, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ux, uy, uw, uh);
    ctx.fillStyle = 'rgba(60, 66, 70, 0.55)';
    ctx.fillRect(ux + 2, uy + 2, uw - 4, uh * 0.35);
    ctx.strokeStyle = 'rgba(230, 235, 230, 0.22)';
    ctx.beginPath();
    ctx.arc(ux + uw / 2, uy + uh * 0.68, Math.min(uw, uh) * 0.22, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (b.tank) {
    const tx = roofX + b.w * 0.24;
    const ty = roofY + b.h * 0.66;
    const tr = Math.min(16, Math.min(b.w, b.h) * 0.13);
    ctx.fillStyle = 'rgba(20, 22, 28, 0.3)';
    ctx.beginPath();
    ctx.ellipse(tx + 3, ty + 5, tr, tr * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8b7a63';
    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(50, 42, 32, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 245, 220, 0.18)';
    ctx.beginPath();
    ctx.arc(tx - tr * 0.3, ty - tr * 0.3, tr * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  if (b.deck) {
    const hx = roofX + b.w * 0.72;
    const hy = roofY + b.h * 0.3;
    const r = Math.min(26, Math.min(b.w, b.h) * 0.19);
    ctx.strokeStyle = 'rgba(240, 236, 220, 0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(240, 236, 220, 0.65)';
    ctx.font = `bold ${r}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', hx, hy + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  if (b.sign) {
    const pulse = 0.72 + Math.sin(time * 3.2 + b.x) * 0.16;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.shadowColor = b.signColor;
    ctx.shadowBlur = 14;
    ctx.fillStyle = b.signColor;
    ctx.fillRect(b.x + b.w * 0.12, b.y + b.h - 8, b.w * 0.76, 5);
    ctx.restore();
    ctx.fillStyle = 'rgba(16, 18, 26, 0.82)';
    ctx.fillRect(b.x + b.w * 0.18, b.y + b.h - 15, b.w * 0.64, 9);
    ctx.fillStyle = b.signColor;
    ctx.font = 'bold 7px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.sign, b.x + b.w * 0.5, b.y + b.h - 8);
    ctx.textAlign = 'left';
  }
}

/** A palm seen from above: a leaning trunk and a burst of fronds with a hot-weather shadow. */
export function drawPalm(ctx, p) {
  const topX = p.x + p.lean * p.len * 0.7;
  const topY = p.y - p.len;
  ctx.fillStyle = 'rgba(24, 30, 26, 0.22)';
  ctx.beginPath();
  ctx.ellipse(p.x + 16, p.y + 10, p.len * 0.55, p.len * 0.3, 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#7b6045';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.quadraticCurveTo(p.x + p.lean * p.len * 0.4, p.y - p.len * 0.55, topX, topY);
  ctx.stroke();

  const fronds = 7;
  for (let i = 0; i < fronds; i += 1) {
    const angle = (i / fronds) * Math.PI * 2 + p.seed * 0.01;
    const reach = p.len * (0.62 + ((p.seed >> i) & 3) * 0.05);
    const sway = Math.sin(p.seed + i) * 0.18;
    ctx.strokeStyle = i % 2 === 0 ? '#3d6b45' : '#548452';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      topX + Math.cos(angle + sway) * reach * 0.6,
      topY + Math.sin(angle + sway) * reach * 0.6,
      topX + Math.cos(angle + sway) * reach,
      topY + Math.sin(angle + sway) * reach,
    );
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180, 210, 140, 0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.lineTo(topX + Math.cos(angle + sway) * reach * 0.85, topY + Math.sin(angle + sway) * reach * 0.85);
    ctx.stroke();
  }
  ctx.fillStyle = '#5d4a2e';
  ctx.beginPath();
  ctx.arc(topX, topY, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = 'butt';
}

/** Small street and beach props, each a handful of shapes. */
export function drawProp(ctx, p, time = 0) {
  switch (p.type) {
    case 'palm':
      drawPalm(ctx, p);
      break;
    case 'lamp': {
      ctx.fillStyle = 'rgba(20, 22, 28, 0.22)';
      ctx.beginPath();
      ctx.ellipse(p.x + 12, p.y + 8, 18, 9, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3b3f46';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y - 26);
      ctx.stroke();
      ctx.fillStyle = '#22262d';
      ctx.beginPath();
      ctx.ellipse(p.x + 5, p.y - 26, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 220, 150, 0.5)';
      ctx.beginPath();
      ctx.arc(p.x + 5, p.y - 26, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'hydrant':
      ctx.fillStyle = '#b64a3f';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d9dad2';
      ctx.fillRect(p.x - 6, p.y - 1.5, 12, 3);
      break;
    case 'bin':
      ctx.fillStyle = '#3e4a44';
      roundRect(ctx, p.x - 6, p.y - 5, 12, 10, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(p.x - 5, p.y - 4, 10, 2);
      break;
    case 'bench':
      ctx.fillStyle = 'rgba(20, 22, 28, 0.2)';
      ctx.fillRect(p.x - 12, p.y + 3, 30, 6);
      ctx.fillStyle = '#7d5a3d';
      ctx.fillRect(p.x - 14, p.y - 5, 28, 8);
      ctx.fillStyle = '#a17a53';
      ctx.fillRect(p.x - 14, p.y - 5, 28, 2);
      break;
    case 'awning':
      ctx.fillStyle = rgba(p.color, 0.85);
      ctx.fillRect(p.x - 34, p.y - 8, 68, 9);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      for (let i = 0; i < 5; i += 1) ctx.fillRect(p.x - 34 + i * 15, p.y - 8, 7, 9);
      break;
    case 'crates':
      ctx.fillStyle = '#8a7148';
      ctx.fillRect(p.x - 16, p.y - 12, 20, 20);
      ctx.fillStyle = '#a08352';
      ctx.fillRect(p.x + 2, p.y - 4, 18, 18);
      ctx.strokeStyle = 'rgba(60, 40, 20, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x - 16, p.y - 12, 20, 20);
      ctx.strokeRect(p.x + 2, p.y - 4, 18, 18);
      break;
    case 'umbrella': {
      ctx.fillStyle = 'rgba(30, 24, 20, 0.24)';
      ctx.beginPath();
      ctx.ellipse(p.x + 12, p.y + 10, 26, 14, 0.4, 0, Math.PI * 2);
      ctx.fill();
      const seg = 8;
      for (let i = 0; i < seg; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? p.color : '#f4ead6';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, 26, (i / seg) * Math.PI * 2, ((i + 1) / seg) * Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#5d4a2e';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'towel':
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = 'rgba(255, 245, 220, 0.78)';
      ctx.fillRect(-16, -9, 32, 18);
      ctx.fillStyle = 'rgba(220, 120, 90, 0.6)';
      ctx.fillRect(-16, -3, 32, 3);
      ctx.restore();
      break;
    case 'lifeguard': {
      ctx.fillStyle = 'rgba(25, 25, 30, 0.25)';
      ctx.fillRect(p.x - 18, p.y - 4, 46, 26);
      ctx.fillStyle = '#e5ddc8';
      ctx.fillRect(p.x - 22, p.y - 16, 44, 30);
      ctx.fillStyle = '#d2604f';
      ctx.fillRect(p.x - 22, p.y - 16, 44, 7);
      ctx.fillStyle = '#7a4a33';
      ctx.fillRect(p.x - 4, p.y - 12, 8, 22);
      ctx.strokeStyle = '#5a5a52';
      ctx.beginPath();
      ctx.moveTo(p.x + 18, p.y - 16);
      ctx.lineTo(p.x + 18, p.y - 34);
      ctx.stroke();
      ctx.fillStyle = '#ffce6a';
      ctx.fillRect(p.x + 18, p.y - 34, 12, 7);
      break;
    }
    case 'sign': {
      ctx.fillStyle = 'rgba(20, 22, 28, 0.3)';
      ctx.fillRect(p.x - 2, p.y - 14, 4, 14);
      ctx.fillStyle = rgba(p.color ?? PALETTE.gold, 0.9);
      ctx.fillRect(p.x - 16, p.y - 24, 32, 12);
      break;
    }
    default:
      break;
  }
}

/** Draws every building and prop in the view, back to front, so shadows land correctly. */
export function drawCity(ctx, world, view, time) {
  const items = [];
  for (const b of world.buildings) {
    if (inView(view, b.x, b.y - b.lift, b.w, b.h + b.lift)) items.push({ depth: b.y + b.h, draw: drawBuilding, item: b });
  }
  for (const p of world.props) {
    if (inView(view, p.x - 30, p.y - 70, 60, 90)) items.push({ depth: p.y, draw: drawProp, item: p });
  }
  items.sort((a, b) => a.depth - b.depth);
  for (const entry of items) entry.draw(ctx, entry.item, time);
}

/** The warm late-afternoon light pass over the world, with a vignette at the edges. */
export function drawLighting(ctx, view, width, height) {
  const sun = ctx.createLinearGradient(view.x, view.y, view.x + view.w, view.y + view.h);
  sun.addColorStop(0, 'rgba(255, 196, 120, 0.10)');
  sun.addColorStop(0.45, 'rgba(255, 170, 100, 0.03)');
  sun.addColorStop(1, 'rgba(40, 50, 90, 0.10)');
  ctx.fillStyle = sun;
  ctx.fillRect(view.x, view.y, view.w, view.h);
  const vignette = ctx.createRadialGradient(view.x + view.w / 2, view.y + view.h / 2, view.w * 0.2, view.x + view.w / 2, view.y + view.h / 2, view.w * 0.72);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(8, 9, 16, 0.42)');
  ctx.fillStyle = vignette;
  ctx.fillRect(view.x, view.y, view.w, view.h);
}
