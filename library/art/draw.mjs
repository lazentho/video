// Hand-made scene art for library videos, drawn as SVG and rendered to JPG.
// Run: node library/art/draw.mjs   (needs Playwright + Chromium; only needed to redraw the art)
import fs from 'node:fs/promises';
import path from 'node:path';

const W = 1920, H = 1080;
let uid = 0;
const id = p => `${p}${++uid}`;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PAL = {
  blue: ['#060a2a', '#132064', '#2b2f8f', '#4de1ff', '#ff5fd2'],
  purple: ['#0d0420', '#2a0b4d', '#5a1677', '#ff5fd2', '#4de1ff'],
  teal: ['#03121a', '#08303d', '#0f5566', '#4de1ff', '#ffb84d'],
  red: ['#14040b', '#4a0c1e', '#7c1730', '#ff7a3d', '#4de1ff'],
  dark: ['#030409', '#080b18', '#121833', '#4de1ff', '#ff9a3d']
};

const DEFS = `<defs>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="softglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="bigglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="40"/></filter>
<filter id="blur80" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="80"/></filter>
</defs>`;

// ---------- backgrounds ----------
function bg(pal, seed, { stars = 220, nebula = true, cx = 50, cy = 45 } = {}) {
  const [c0, c1, c2, a1, a2] = PAL[pal];
  const r = rng(seed), g = id('bg');
  let s = `<radialGradient id="${g}" cx="${cx}%" cy="${cy}%" r="80%"><stop offset="0" stop-color="${c2}"/><stop offset=".55" stop-color="${c1}"/><stop offset="1" stop-color="${c0}"/></radialGradient>
  <rect width="${W}" height="${H}" fill="url(#${g})"/>`;
  if (nebula) {
    s += `<g filter="url(#blur80)" opacity=".35">
      <ellipse cx="${300 + r() * 400}" cy="${200 + r() * 200}" rx="420" ry="220" fill="${a2}"/>
      <ellipse cx="${1300 + r() * 400}" cy="${700 + r() * 200}" rx="480" ry="240" fill="${a1}"/></g>`;
  }
  for (let i = 0; i < stars; i++) {
    const x = r() * W, y = r() * H, sz = r() < 0.92 ? 0.8 + r() * 1.8 : 2.5 + r() * 2;
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${sz.toFixed(1)}" fill="#fff" opacity="${(0.35 + r() * 0.65).toFixed(2)}"/>`;
  }
  for (let i = 0; i < 10; i++) s += sparkle(r() * W, r() * H, 6 + r() * 10, r() < 0.5 ? a1 : '#ffffff', 0.8);
  return s;
}

function sparkle(x, y, s, color = '#fff', op = 1) {
  return `<path d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z" fill="${color}" opacity="${op}"/>`;
}

function hills(color = '#0a0d24', y = 860, seed = 1) {
  const r = rng(seed);
  let d = `M0 ${H} L0 ${y}`;
  for (let x = 0; x <= W; x += 160) d += ` Q${x + 80} ${y - 40 - r() * 70} ${x + 160} ${y + r() * 20}`;
  return `<path d="${d} L${W} ${H}Z" fill="${color}"/>`;
}

// ---------- objects ----------
function planet(x, y, r, c1, c2, { ring = false, bands = true, glow = true } = {}) {
  const g = id('pl');
  let s = `<radialGradient id="${g}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`;
  if (glow) s += `<circle cx="${x}" cy="${y}" r="${r * 1.25}" fill="${c1}" opacity=".35" filter="url(#bigglow)"/>`;
  if (ring) s += `<ellipse cx="${x}" cy="${y}" rx="${r * 1.8}" ry="${r * 0.45}" fill="none" stroke="${c1}" stroke-width="${r * 0.12}" opacity=".8" transform="rotate(-15 ${x} ${y})"/>`;
  s += `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${g})"/>`;
  if (bands) for (let i = -2; i <= 2; i++) s += `<path d="M${x - r * 0.8} ${y + i * r * 0.3} q${r * 0.8} ${r * 0.12} ${r * 1.6} 0" stroke="${c2}" stroke-width="${r * 0.08}" fill="none" opacity=".35" stroke-linecap="round"/>`;
  s += `<path d="M${x - r * 0.55} ${y - r * 0.6} A${r * 0.8} ${r * 0.8} 0 0 1 ${x + r * 0.25} ${y - r * 0.82}" stroke="#fff" stroke-width="${r * 0.09}" fill="none" stroke-linecap="round" opacity=".75"/>`;
  return s;
}

function sun(x, y, r) {
  return `<circle cx="${x}" cy="${y}" r="${r * 1.4}" fill="#ffb84d" opacity=".45" filter="url(#bigglow)"/>
  <circle cx="${x}" cy="${y}" r="${r * 1.12}" fill="#c9752a" opacity=".55"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="#ffb21f"/><circle cx="${x}" cy="${y}" r="${r * 0.82}" fill="#ffd23f"/>
  <path d="M${x + r * 0.2} ${y - r * 0.68} A${r * 0.7} ${r * 0.7} 0 0 1 ${x + r * 0.62} ${y - r * 0.15}" stroke="#fff" stroke-width="${r * 0.1}" fill="none" stroke-linecap="round"/>`;
}

function rings(x, y, n, color, gap = 45, w = 7, start = 60) {
  let s = `<g filter="url(#softglow)">`;
  for (let i = 0; i < n; i++) s += `<circle cx="${x}" cy="${y}" r="${start + i * gap}" fill="none" stroke="${color}" stroke-width="${w}" opacity="${(1 - i / (n + 1)).toFixed(2)}"/>`;
  return s + `</g>`;
}

function arcs(x, y, n, color, angle = 0, gap = 55, spread = 70) {
  let s = `<g filter="url(#softglow)" transform="rotate(${angle} ${x} ${y})">`;
  for (let i = 1; i <= n; i++) {
    const r = i * gap, a = (spread * Math.PI) / 180;
    s += `<path d="M${x + r * Math.cos(-a / 2)} ${y + r * Math.sin(-a / 2)} A${r} ${r} 0 0 1 ${x + r * Math.cos(a / 2)} ${y + r * Math.sin(a / 2)}" stroke="${color}" stroke-width="12" fill="none" stroke-linecap="round" opacity="${(1 - i / (n + 2)).toFixed(2)}"/>`;
  }
  return s + `</g>`;
}

function dish(x, y, s = 1, angle = -30, color = '#4de1ff') {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-70" y="40" width="140" height="40" rx="10" fill="#566089"/><rect x="-30" y="-20" width="60" height="80" rx="10" fill="#8a94c4"/>
    <rect x="-110" y="76" width="220" height="30" rx="12" fill="#3a4170"/>
    <g transform="rotate(${angle})">
      <ellipse cx="0" cy="-60" rx="170" ry="70" fill="none" stroke="${color}" stroke-width="16" filter="url(#glow)" opacity=".8"/>
      <ellipse cx="0" cy="-60" rx="170" ry="70" fill="#dfe6ff"/><ellipse cx="0" cy="-48" rx="140" ry="50" fill="#aab4dd"/>
      <path d="M-120 -80 L0 -200 M120 -80 L0 -200" stroke="#6b7398" stroke-width="10"/>
      <circle cx="0" cy="-205" r="22" fill="#dfe6ff"/><path d="M-60 -95 A120 50 0 0 1 60 -95" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>
    </g></g>`;
}

// Big Ear style flat reflector on the ground
function bigEar(x, y, s = 1) {
  let grid = '';
  for (let i = 0; i <= 12; i++) grid += `<path d="M${-420 + i * 70} 0 L${-360 + i * 70} -150" stroke="#9fb4ff" stroke-width="3" opacity=".6"/>`;
  for (let j = 1; j <= 3; j++) grid += `<path d="M${-420 + j * 15} ${-j * 37} L${420 + j * 15} ${-j * 37}" stroke="#9fb4ff" stroke-width="3" opacity=".6"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-440 20 L460 20 L520 -150 L-380 -150Z" fill="#4de1ff" opacity=".35" filter="url(#glow)"/>
    <path d="M-420 0 L420 0 L480 -150 L-360 -150Z" fill="#c9d4ff"/>${grid}
    <path d="M-380 -150 Q60 -330 480 -150" fill="none" stroke="#dfe6ff" stroke-width="22"/>
    <path d="M-380 -150 Q60 -330 480 -150" fill="none" stroke="#6b7398" stroke-width="8"/>
    <rect x="-470" y="0" width="980" height="40" rx="8" fill="#3a4170"/></g>`;
}

function stopwatch(x, y, r, hand = 60, color = '#ff9a3d') {
  let ticks = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ticks += `<line x1="${x + Math.sin(a) * r * 0.78}" y1="${y - Math.cos(a) * r * 0.78}" x2="${x + Math.sin(a) * r * 0.9}" y2="${y - Math.cos(a) * r * 0.9}" stroke="#2a2f55" stroke-width="${r * 0.04}" stroke-linecap="round"/>`;
  }
  const ha = (hand / 360) * Math.PI * 2;
  return `<circle cx="${x}" cy="${y}" r="${r * 1.2}" fill="${color}" opacity=".4" filter="url(#bigglow)"/>
  <rect x="${x - r * 0.15}" y="${y - r * 1.32}" width="${r * 0.3}" height="${r * 0.25}" rx="${r * 0.05}" fill="${color}"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/><circle cx="${x}" cy="${y}" r="${r * 0.86}" fill="#fff5e6"/>${ticks}
  <line x1="${x}" y1="${y}" x2="${x + Math.sin(ha) * r * 0.7}" y2="${y - Math.cos(ha) * r * 0.7}" stroke="#e5484d" stroke-width="${r * 0.05}" stroke-linecap="round"/>
  <circle cx="${x}" cy="${y}" r="${r * 0.07}" fill="#2a2f55"/>`;
}

function waveform(x, y, w, h, color = '#4de1ff', seed = 3, spike = 0.5, spikeH = 1) {
  const r = rng(seed);
  let d = `M${x} ${y}`;
  for (let i = 0; i <= 160; i++) {
    const px = x + (i / 160) * w, dist = Math.abs(i / 160 - spike);
    const amp = dist < 0.03 ? h * spikeH * (1 - dist / 0.03) : h * 0.06 * r();
    d += ` L${px.toFixed(1)} ${(y - amp * (i % 2 ? 1 : -0.3)).toFixed(1)}`;
  }
  return `<path d="${d}" stroke="${color}" stroke-width="6" fill="none" stroke-linejoin="round" filter="url(#glow)"/>`;
}

function bars(x, y, w, h, color = '#4de1ff', seed = 4, n = 70) {
  const r = rng(seed);
  let s = `<g filter="url(#softglow)">`;
  for (let i = 0; i < n; i++) {
    const bh = h * (0.15 + 0.85 * Math.pow(r(), 2));
    s += `<rect x="${(x + (i * w) / n).toFixed(1)}" y="${(y - bh).toFixed(1)}" width="${(w / n) * 0.55}" height="${bh.toFixed(1)}" rx="3" fill="${color}"/>`;
  }
  return s + `</g>`;
}

function printout(x, y, w, h, rot = 0, seed = 7, { code = false, circle = false, wow = false } = {}) {
  const r = rng(seed);
  const chars = '1111112222334561';
  let txt = '';
  const cols = Math.floor(w / 46), rows = Math.floor(h / 40);
  for (let c = 0; c < cols; c++) for (let j = 0; j < rows; j++) {
    const isCode = code && c === Math.floor(cols / 2) && j >= 2 && j < 8;
    const ch = isCode ? '6EQUJ5'[j - 2] : chars[Math.floor(r() * chars.length)];
    txt += `<text x="${x - w / 2 + 30 + c * 46}" y="${y - h / 2 + 50 + j * 40}" font-family="DejaVu Sans Mono, monospace" font-size="30" font-weight="${isCode ? 700 : 400}" fill="${isCode ? '#1b1f3a' : '#5b6285'}">${ch}</text>`;
  }
  const cx = x - w / 2 + 30 + Math.floor(cols / 2) * 46 + 9, cy = y - h / 2 + 50 + 4.5 * 40;
  let extra = '';
  if (circle) extra += `<ellipse cx="${cx}" cy="${cy}" rx="44" ry="150" fill="none" stroke="#e5243b" stroke-width="10" stroke-linecap="round" transform="rotate(-4 ${cx} ${cy})"/>`;
  if (wow) extra += `<text x="${cx - 60}" y="${y - h / 2 + 50 + 1 * 40}" font-family="DejaVu Sans, sans-serif" font-style="italic" font-weight="700" font-size="120" fill="#e5243b" transform="rotate(-8 ${cx} ${cy})">Wow!</text>`;
  let lines = '';
  for (let i = 0; i < 10; i++) lines += `<circle cx="${x - w / 2 + 14}" cy="${y - h / 2 + 30 + i * (h - 60) / 9}" r="6" fill="#c9cfe6"/>`;
  return `<g transform="rotate(${rot} ${x} ${y})">
    <rect x="${x - w / 2 + 16}" y="${y - h / 2 + 20}" width="${w}" height="${h}" rx="10" fill="#000" opacity=".35"/>
    <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="10" fill="#f6f4ea"/>${lines}${txt}${extra}</g>`;
}

function marker(x, y, rot = 35) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-30" y="-200" width="60" height="230" rx="18" fill="#e5243b"/><rect x="-30" y="-200" width="60" height="70" rx="18" fill="#b81c2f"/>
    <path d="M-22 30 L22 30 L8 70 L-8 70Z" fill="#f2f2f2"/><path d="M-8 70 L8 70 L0 88Z" fill="#e5243b"/>
    <rect x="-14" y="-180" width="10" height="170" rx="5" fill="#fff" opacity=".45"/></g>`;
}

function galaxy(x, y, r, color = '#b9a6ff', seed = 9, tilt = 0.45) {
  const rand = rng(seed);
  let arms = '', dots = '';
  for (let arm = 0; arm < 2; arm++) {
    let d = '';
    for (let i = 0; i <= 80; i++) {
      const t = 0.08 + (i / 80) * 0.92, a = arm * Math.PI + t * Math.PI * 2.6, rr = t * r;
      d += `${i ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr * tilt).toFixed(1)} `;
    }
    arms += `<path d="${d}" stroke="${color}" stroke-width="${r * 0.16}" fill="none" stroke-linecap="round" opacity=".45" filter="url(#bigglow)"/>
    <path d="${d}" stroke="${color}" stroke-width="${r * 0.05}" fill="none" stroke-linecap="round" opacity=".8" filter="url(#softglow)"/>`;
    for (let i = 0; i < 220; i++) {
      const t = 0.08 + rand() * 0.92, a = arm * Math.PI + t * Math.PI * 2.6, rr = t * r;
      const jx = (rand() - 0.5) * r * 0.16, jy = (rand() - 0.5) * r * 0.16;
      dots += `<circle cx="${(x + Math.cos(a) * rr + jx).toFixed(1)}" cy="${(y + Math.sin(a) * rr * tilt + jy * tilt).toFixed(1)}" r="${(1.5 + rand() * 4 * (1 - t)).toFixed(1)}" fill="${rand() < 0.4 ? '#ffffff' : color}" opacity="${(0.6 + rand() * 0.4).toFixed(2)}"/>`;
    }
  }
  return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * tilt}" fill="${color}" opacity=".22" filter="url(#bigglow)"/>${arms}${dots}
  <ellipse cx="${x}" cy="${y}" rx="${r * 0.2}" ry="${r * 0.2 * tilt * 1.4}" fill="#ffe9b0" opacity=".7" filter="url(#bigglow)"/>
  <ellipse cx="${x}" cy="${y}" rx="${r * 0.09}" ry="${r * 0.09 * tilt * 1.4}" fill="#fffaf0" filter="url(#glow)"/>`;
}

function earth(x, y, r) {
  return `<circle cx="${x}" cy="${y}" r="${r * 1.2}" fill="#4de1ff" opacity=".35" filter="url(#bigglow)"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="#2f7bff"/>
  <path d="M${x - r * 0.6} ${y - r * 0.3} q${r * 0.3} ${-r * 0.4} ${r * 0.6} ${-r * 0.1} q${r * 0.2} ${r * 0.3} ${-r * 0.1} ${r * 0.5} q${-r * 0.4} ${r * 0.1} ${-r * 0.5} ${-r * 0.4}Z" fill="#3ecf6e"/>
  <path d="M${x + r * 0.1} ${y + r * 0.1} q${r * 0.4} ${-r * 0.2} ${r * 0.6} ${r * 0.2} q${-r * 0.1} ${r * 0.4} ${-r * 0.4} ${r * 0.4} q${-r * 0.3} ${-r * 0.2} ${-r * 0.2} ${-r * 0.6}Z" fill="#3ecf6e"/>
  <path d="M${x - r * 0.55} ${y - r * 0.65} A${r * 0.8} ${r * 0.8} 0 0 1 ${x + r * 0.2} ${y - r * 0.85}" stroke="#fff" stroke-width="${r * 0.08}" fill="none" stroke-linecap="round" opacity=".7"/>`;
}

function beam(x1, y1, x2, y2, color = '#4de1ff', w = 40) {
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15, my = (y1 + y2) / 2 - (x2 - x1) * 0.15;
  return `<path d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}" stroke="${color}" stroke-width="${w * 1.8}" fill="none" opacity=".35" filter="url(#bigglow)" stroke-linecap="round"/>
  <path d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" filter="url(#glow)"/>
  <path d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}" stroke="#fff" stroke-width="${w * 0.25}" fill="none" stroke-linecap="round" opacity=".8"/>`;
}

function burst(x, y, r, color = '#ffe14d', points = 14, seed = 2) {
  const rand = rng(seed);
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2, rr = i % 2 ? r * (0.35 + rand() * 0.15) : r * (0.8 + rand() * 0.4);
    d += `${i ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)} `;
  }
  return `<circle cx="${x}" cy="${y}" r="${r * 1.3}" fill="${color}" opacity=".5" filter="url(#bigglow)"/>
  <path d="${d}Z" fill="${color}" filter="url(#glow)"/><circle cx="${x}" cy="${y}" r="${r * 0.3}" fill="#fff"/>`;
}

function calendar(x, y, s = 1, rot = 0, { top = 'AUG', big = '1977', grid = false, highlight = [] } = {}) {
  let cells = '';
  if (grid) for (let i = 0; i < 35; i++) {
    const cx = -150 + (i % 7) * 50, cy = -40 + Math.floor(i / 7) * 44, hl = highlight.includes(i);
    cells += `<rect x="${cx}" y="${cy}" width="40" height="34" rx="6" fill="${hl ? '#ff5fd2' : '#e8e2d0'}" ${hl ? 'filter="url(#softglow)"' : ''}/>`;
  }
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <rect x="-200" y="-190" width="400" height="420" rx="34" fill="#c9751f"/>
    <rect x="-190" y="-200" width="380" height="410" rx="30" fill="#ffb21f"/>
    <rect x="-170" y="-110" width="340" height="300" rx="14" fill="#fffaf0"/>
    <rect x="-60" y="-185" width="120" height="40" rx="20" fill="#fff6d8"/>
    ${grid ? cells : `<text x="0" y="-10" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="64" fill="#c9751f">${top}</text>
    <text x="0" y="110" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="96" fill="#5a3b12">${big}</text>`}</g>`;
}

function monolith(x, y, h) {
  return `<ellipse cx="${x}" cy="${y}" rx="${h * 0.35}" ry="${h * 0.6}" fill="#ff7a1a" opacity=".45" filter="url(#bigglow)" transform="translate(0 ${-h / 2})"/>
  <path d="M${x - 70} ${y} L${x - 55} ${y - h} L${x} ${y - h - 70} L${x + 55} ${y - h} L${x + 70} ${y}Z" fill="#ff7a1a"/>
  <path d="M${x} ${y - h - 70} L${x + 55} ${y - h} L${x + 70} ${y} L${x + 10} ${y}Z" fill="#d95a0c"/>
  <path d="M${x - 40} ${y - h + 20} L${x - 25} ${y - h - 20}" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".8"/>`;
}

function atom(x, y, r, color = '#4de1ff') {
  let s = `<circle cx="${x}" cy="${y}" r="${r * 1.2}" fill="${color}" opacity=".25" filter="url(#bigglow)"/><g filter="url(#softglow)">`;
  for (const a of [0, 60, 120]) s += `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.35}" fill="none" stroke="${color}" stroke-width="10" transform="rotate(${a} ${x} ${y})"/>`;
  s += `</g>`;
  for (const a of [20, 140, 260]) {
    const t = (a * Math.PI) / 180;
    s += `<circle cx="${x + Math.cos(t) * r * 0.95}" cy="${y + Math.sin(t) * r * 0.35}" r="${r * 0.07}" fill="#fff" transform="rotate(${a / 2} ${x} ${y})" filter="url(#softglow)"/>`;
  }
  return s + planet(x, y, r * 0.22, '#ff9ae6', '#b0217f', { bands: false, glow: true });
}

function magnetar(x, y, r, color = '#b98bff') {
  let s = `<g filter="url(#softglow)">`;
  for (let i = 1; i <= 4; i++) {
    const k = 1 + i * 0.9;
    s += `<ellipse cx="${x - r * k}" cy="${y}" rx="${r * k}" ry="${r * k * 0.55}" fill="none" stroke="${i % 2 ? color : '#4de1ff'}" stroke-width="8" opacity="${1 - i * 0.18}"/>`;
    s += `<ellipse cx="${x + r * k}" cy="${y}" rx="${r * k}" ry="${r * k * 0.55}" fill="none" stroke="${i % 2 ? color : '#4de1ff'}" stroke-width="8" opacity="${1 - i * 0.18}"/>`;
  }
  s += `</g><path d="M${x} ${y - r * 7} L${x} ${y + r * 7}" stroke="#fff" stroke-width="14" opacity=".75" filter="url(#glow)"/>`;
  return s + `<circle cx="${x}" cy="${y}" r="${r * 2.2}" fill="#fff" opacity=".6" filter="url(#bigglow)"/><circle cx="${x}" cy="${y}" r="${r}" fill="#fff" filter="url(#glow)"/>`;
}

function person(x, y, s = 1, { shirt = '#ff7a3d', skin = '#c98a5e', hair = '#2a1a12' } = {}) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-90 160 Q-90 30 0 30 Q90 30 90 160Z" fill="${shirt}"/>
    <rect x="-22" y="-5" width="44" height="45" fill="${skin}"/>
    <circle cx="0" cy="-50" r="62" fill="${skin}"/>
    <path d="M-64 -55 Q-60 -125 0 -122 Q60 -125 64 -55 Q40 -95 0 -92 Q-40 -95 -64 -55Z" fill="${hair}"/>
    <circle cx="-22" cy="-48" r="7" fill="#1b1f3a"/><circle cx="22" cy="-48" r="7" fill="#1b1f3a"/>
    <path d="M-16 -18 Q0 -8 16 -18" stroke="#1b1f3a" stroke-width="5" fill="none" stroke-linecap="round"/></g>`;
}

function desk(x, y, w = 900) {
  return `<rect x="${x - w / 2}" y="${y}" width="${w}" height="40" rx="10" fill="#6b3f1f"/><rect x="${x - w / 2 + 30}" y="${y + 40}" width="30" height="200" fill="#4a2a14"/><rect x="${x + w / 2 - 60}" y="${y + 40}" width="30" height="200" fill="#4a2a14"/>`;
}

function lamp(x, y) {
  return `<path d="M${x} ${y} L${x + 60} ${y - 160} L${x + 150} ${y - 140}" stroke="#2a2f55" stroke-width="14" fill="none" stroke-linecap="round"/>
  <path d="M${x + 110} ${y - 170} L${x + 220} ${y - 130} L${x + 170} ${y - 70}Z" fill="#ffd23f"/>
  <path d="M${x + 195} ${y - 100} L${x + 420} ${y + 10} L${x + 120} ${y + 10}Z" fill="#ffe9a0" opacity=".25"/>
  <ellipse cx="${x}" cy="${y + 5}" rx="50" ry="14" fill="#2a2f55"/>`;
}

function questionStars(x, y, s = 1, color = '#ffe14d', seed = 5) {
  const r = rng(seed);
  const pts = [];
  for (let t = 0; t <= 1; t += 0.035) {
    const a = Math.PI * (1.1 - t * 1.6);
    pts.push([x + Math.cos(a) * 140 * s, y - 120 * s - Math.sin(a) * 140 * s]);
  }
  for (let t = 0; t <= 1; t += 0.12) pts.push([x + 10 * s, y - 20 * s + t * 120 * s]);
  let out = '';
  for (const [px, py] of pts) out += sparkle(px + (r() - 0.5) * 10, py + (r() - 0.5) * 10, 12 + r() * 10, color, 0.95);
  out += sparkle(x + 10 * s, y + 190 * s, 34 * s, color);
  return `<g filter="url(#softglow)">${out}</g>`;
}

function eye(x, y, s = 1) {
  let lashes = '';
  for (let i = -3; i <= 3; i++) lashes += `<path d="M${x + i * 60 * s} ${y - 40 * s + Math.abs(i) * 14 * s} l${i * 10 * s} ${-46 * s}" stroke="#1b1f3a" stroke-width="${12 * s}" stroke-linecap="round"/>`;
  const almond = `M${x - 280 * s} ${y} Q${x} ${y - 200 * s} ${x + 280 * s} ${y} Q${x} ${y + 200 * s} ${x - 280 * s} ${y}Z`, c = id('eye');
  return `<clipPath id="${c}"><path d="${almond}"/></clipPath><path d="${almond}" fill="#ffffff"/>
  <g clip-path="url(#${c})"><circle cx="${x}" cy="${y}" r="${95 * s}" fill="#2bb3d9"/><circle cx="${x}" cy="${y}" r="${48 * s}" fill="#0b1034"/>
  <circle cx="${x + 25 * s}" cy="${y - 28 * s}" r="${18 * s}" fill="#fff"/></g>
  <path d="M${x - 300 * s} ${y + 10 * s} Q${x} ${y - 230 * s} ${x + 300 * s} ${y + 10 * s} L${x + 300 * s} ${y - 40 * s} Q${x} ${y - 70 * s} ${x - 300 * s} ${y - 40 * s}Z" fill="#f2c9a0"/>
  <path d="M${x - 290 * s} ${y - 40 * s} Q${x} ${y - 70 * s} ${x + 290 * s} ${y - 40 * s}" stroke="#1b1f3a" stroke-width="${16 * s}" fill="none" stroke-linecap="round"/>${lashes}
  <path d="M${x - 280 * s} ${y} Q${x} ${y + 200 * s} ${x + 280 * s} ${y}" stroke="#1b1f3a" stroke-width="${10 * s}" fill="none" stroke-linecap="round"/>`;
}

function meter(x, y, h, level, color = '#7cff6b') {
  let segs = '';
  const n = 10;
  for (let i = 0; i < n; i++) {
    const on = i < level * n, c = i > 7 ? '#ff5f5f' : i > 5 ? '#ffe14d' : color;
    segs += `<rect x="${x - 70}" y="${y - (i + 1) * (h / n) + 6}" width="140" height="${h / n - 12}" rx="10" fill="${on ? c : '#1d2240'}" ${on ? 'filter="url(#softglow)"' : ''}/>`;
  }
  return `<rect x="${x - 95}" y="${y - h - 20}" width="190" height="${h + 40}" rx="24" fill="#0c1030" stroke="#4de1ff" stroke-width="6"/>${segs}`;
}

function clock(x, y, r) {
  let nums = '';
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    nums += `<circle cx="${x + Math.sin(a) * r * 0.8}" cy="${y - Math.cos(a) * r * 0.8}" r="${r * (i % 3 ? 0.03 : 0.055)}" fill="#4de1ff"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="${r * 1.15}" fill="#4de1ff" opacity=".3" filter="url(#bigglow)"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="#0c1030" stroke="#4de1ff" stroke-width="${r * 0.05}" filter="url(#softglow)"/>${nums}
  <line x1="${x}" y1="${y}" x2="${x + r * 0.45}" y2="${y - r * 0.3}" stroke="#ff5fd2" stroke-width="${r * 0.05}" stroke-linecap="round"/>
  <line x1="${x}" y1="${y}" x2="${x - r * 0.1}" y2="${y - r * 0.68}" stroke="#fff" stroke-width="${r * 0.035}" stroke-linecap="round"/>
  <circle cx="${x}" cy="${y}" r="${r * 0.06}" fill="#fff"/>`;
}

function puzzle(x, y, s = 1, color = '#4de1ff') {
  const piece = (px, py, c, op = 1, dash = '') => `<path transform="translate(${px} ${py})" d="M0 0 h60 q0 -40 30 -40 q30 0 30 40 h60 v60 q40 0 40 30 q0 30 -40 30 v60 h-180Z" fill="${c}" opacity="${op}" stroke="${color}" stroke-width="6" ${dash} filter="url(#softglow)"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">${piece(-200, -200, '#2b2f8f')}${piece(20, -200, '#5a1677')}${piece(-200, 20, '#0f5566')}${piece(20, 20, 'none', 0.9, 'stroke-dasharray="18 14"')}</g>`;
}

function elliptical(x, y, r, color = '#ffb08a') {
  return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.65}" fill="${color}" opacity=".35" filter="url(#bigglow)"/>
  <ellipse cx="${x}" cy="${y}" rx="${r * 0.6}" ry="${r * 0.4}" fill="${color}" opacity=".55" filter="url(#glow)"/>
  <ellipse cx="${x}" cy="${y}" rx="${r * 0.22}" ry="${r * 0.15}" fill="#fff3e0" filter="url(#glow)"/>`;
}

function notebook(x, y) {
  return `<g transform="translate(${x} ${y}) rotate(-6)">
    <rect x="-470" y="-290" width="940" height="600" rx="24" fill="#2a1a40"/>
    <rect x="-450" y="-280" width="440" height="570" rx="12" fill="#f6f4ea"/><rect x="10" y="-280" width="440" height="570" rx="12" fill="#f6f4ea"/>
    ${rings(-230, 0, 4, '#5b6cff', 40, 6, 40)}${waveform(60, 40, 340, 180, '#ff5fd2', 11, 0.6, 1)}
    <path d="M-400 200 h300 M-400 240 h220 M60 200 h320 M60 240 h260" stroke="#c9cfe6" stroke-width="10" stroke-linecap="round"/></g>`;
}

function constellationSgr(x, y, s = 1) {
  const pts = [[0, 0], [120, -60], [240, -20], [260, 100], [130, 150], [0, 110], [-110, 40], [-150, -60], [340, -130], [380, 30]];
  const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 7], [2, 8], [3, 9], [8, 9]];
  let s1 = `<g transform="translate(${x} ${y}) scale(${s})"><g stroke="#9fb4ff" stroke-width="4" opacity=".7">`;
  for (const [a, b] of links) s1 += `<line x1="${pts[a][0]}" y1="${pts[a][1]}" x2="${pts[b][0]}" y2="${pts[b][1]}"/>`;
  s1 += `</g>`;
  for (const [px, py] of pts) s1 += `<circle cx="${px}" cy="${py}" r="14" fill="#fff" filter="url(#glow)"/>`;
  return s1 + `</g>`;
}

function milkyWay() {
  return `<g filter="url(#blur80)" opacity=".55" transform="rotate(-20 960 540)"><ellipse cx="960" cy="540" rx="1300" ry="160" fill="#c7b8ff"/><ellipse cx="960" cy="540" rx="900" ry="70" fill="#ffe9c9"/></g>`;
}

const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}${body}</svg>`;

// ---------- the scenes ----------
const ART = {
  'lib-wow': [
    () => bg('purple', 1) + hills('#120a2a', 840, 2) + bigEar(960, 860, 1.05),
    () => bg('purple', 2, { cy: 30 }) + hills('#120a2a', 900, 3) + bigEar(960, 930, 1.6),
    () => bg('blue', 3) + arcs(1500, 160, 6, '#4de1ff', 135, 70, 80) + hills('#0a0d24', 900, 4) + bigEar(820, 930, 1.1),
    () => bg('blue', 4) + hills('#0a0d24', 900, 5) + bigEar(760, 930, 1.1) + beam(1850, 60, 900, 760, '#4de1ff', 36) + burst(900, 760, 160, '#ffffff', 16),
    () => bg('dark', 5, { nebula: false }) + waveform(160, 760, 1600, 560, '#4de1ff', 6, 0.5, 1),
    () => bg('dark', 6, { stars: 420, nebula: false }) + waveform(160, 600, 1600, 80, '#2b6a8f', 8, 2, 0),
    () => bg('blue', 7) + stopwatch(960, 560, 300, 72 * 6),
    () => bg('dark', 8) + earth(760, 640, 260) + beam(860, 420, 1700, 120, '#ff5fd2', 18) + arcs(760, 640, 1, '#ffe14d', -60, 330, 120),
    () => bg('purple', 9) + `<circle cx="1180" cy="230" r="220" fill="#fff6d8" opacity=".5" filter="url(#bigglow)"/>` + beam(700, 1080, 1180, 260, '#ffe14d', 28) + sparkle(1180, 230, 60, '#fff'),
    () => bg('dark', 10, { stars: 60 }) + `<rect x="0" y="0" width="${W}" height="${H}" fill="#140c28" opacity=".6"/>` + lamp(1250, 700) + printout(1350, 600, 380, 180, -6, 3) + person(760, 590, 1.3, { shirt: '#5b6cff' }) + desk(960, 700, 1200),
    () => bg('purple', 11) + printout(960, 560, 1100, 760, -4, 12, { code: true }),
    () => bg('purple', 12) + printout(960, 560, 1100, 760, -4, 12, { code: true, circle: true }) + marker(1260, 520, 30),
    () => bg('red', 13) + printout(960, 560, 1100, 760, -4, 12, { code: true, circle: true, wow: true }) + marker(1480, 470, 25),
    () => bg('blue', 14, { stars: 320 }) + milkyWay() + constellationSgr(820, 560, 1.4),
    () => bg('teal', 15) + atom(960, 540, 360),
    () => bg('purple', 16) + galaxy(1300, 330, 420, '#ff9ae6', 3) + hills('#0d0420', 900, 6) + dish(560, 860, 1.4, -35),
    () => bg('blue', 17) + `<circle cx="1500" cy="200" r="70" fill="#ffe14d" filter="url(#glow)"/>` + hills('#0a0d24', 900, 7) + dish(420, 900, 0.9, -40) + dish(900, 880, 1.05, -35) + dish(1380, 900, 0.9, -25),
    () => bg('purple', 18) + calendar(560, 420, 0.7, -18, { top: 'JAN', big: '1985' }) + calendar(1360, 360, 0.8, 14, { top: 'JUL', big: '1999' }) + calendar(980, 700, 0.95, -4, { top: 'MAR', big: '2020' }),
    () => bg('dark', 19, { stars: 40, nebula: false }) + `<circle cx="960" cy="540" r="40" fill="#9fb4ff" opacity=".35" filter="url(#bigglow)"/>` + sparkle(960, 540, 22, '#cfd8ff', 0.7),
    () => bg('purple', 20) + notebook(960, 560),
    () => bg('red', 21) + `<g filter="url(#blur80)"><ellipse cx="960" cy="540" rx="520" ry="300" fill="#ff5fd2" opacity=".7"/><ellipse cx="900" cy="520" rx="300" ry="180" fill="#ffb84d" opacity=".8"/></g>` + burst(960, 540, 190, '#ffffff', 18, 4),
    () => bg('blue', 22, { stars: 300 }) + questionStars(960, 560, 1.4),
    () => bg('purple', 23, { stars: 300 }) + galaxy(960, 380, 700, '#b9a6ff', 8, 0.35) + hills('#0d0420', 920, 8) + dish(960, 930, 1, -10),
    () => bg('dark', 24, { stars: 260 }) + hills('#07091a', 960, 9) + monolith(960, 960, 560)
  ],
  'lib-frb': [
    () => bg('blue', 31, { stars: 300 }) + galaxy(960, 540, 640, '#b9a6ff', 31),
    () => bg('purple', 32) + galaxy(1550, 230, 300, '#ff9ae6', 32) + earth(330, 830, 160) + beam(1500, 260, 420, 760, '#4de1ff', 32),
    () => bg('blue', 33) + `<g filter="url(#glow)">` + [300, 540, 780].map((y, i) => `<path d="M80 ${y} ${Array.from({ length: 18 }, (_, k) => `L${80 + (k + 1) * 100} ${y + (k % 2 ? -90 : 90) * (i === 1 ? 1.4 : 0.8)}`).join(' ')}" stroke="${['#4de1ff', '#ff5fd2', '#ffe14d'][i]}" stroke-width="14" fill="none" stroke-linejoin="round"/>`).join('') + `</g>`,
    () => bg('dark', 34) + stopwatch(960, 560, 300, 2, '#4de1ff') + sparkle(1010, 330, 34, '#ffe14d'),
    () => bg('teal', 35) + eye(960, 520, 1.6) + sparkle(1420, 300, 40, '#ffe14d') + sparkle(500, 330, 30, '#4de1ff'),
    () => bg('dark', 36, { nebula: false }) + burst(960, 540, 420, '#ffffff', 22, 9) + `<circle cx="960" cy="540" r="600" fill="#4de1ff" opacity=".25" filter="url(#bigglow)"/>`,
    () => bg('purple', 37) + meter(960, 960, 760, 1) + [0, 1, 2, 3, 4, 5].map(i => sparkle(820 + i * 55, 150 - (i % 2) * 40, 26, '#ff5f5f')).join(''),
    () => bg('red', 38) + sun(620, 540, 280) + calendar(1360, 560, 0.95, 6, { top: 'DAYS', big: '3+' }),
    () => bg('blue', 39, { stars: 300 }) + hills('#0a0d24', 840, 10) + `<ellipse cx="960" cy="860" rx="520" ry="160" fill="#101436"/>` + dish(960, 780, 1.3, -25),
    () => bg('purple', 40) + printout(880, 640, 900, 520, -8, 21) + printout(1000, 560, 900, 520, 3, 22) + `<rect x="620" y="380" width="760" height="300" rx="16" fill="#0c1030"/>` + waveform(660, 560, 680, 150, '#ff5fd2', 23, 0.55, 1),
    () => bg('dark', 41, { stars: 500 }) + Array.from({ length: 22 }, (_, i) => { const r = rng(41 + i); return sparkle(120 + r() * 1680, 100 + r() * 880, 18 + r() * 28, ['#4de1ff', '#ff5fd2', '#ffe14d'][i % 3]); }).join(''),
    () => bg('dark', 42, { stars: 200, nebula: false }) + `<circle cx="960" cy="540" r="120" fill="#4de1ff" opacity=".3" filter="url(#bigglow)"/>` + `<circle cx="960" cy="540" r="260" fill="#4de1ff" opacity=".25" filter="url(#bigglow)"/>` + sparkle(960, 540, 150, '#bff4ff', 0.9) + sparkle(960, 540, 60, '#ffffff', 1),
    () => bg('blue', 43) + [0, 1, 2, 3, 4].map(i => `<circle cx="${260 + i * 350}" cy="540" r="${90 - i * 8}" fill="#4de1ff" opacity=".35" filter="url(#bigglow)"/>` + sparkle(260 + i * 350, 540, 70 - i * 6, '#fff', 1 - i * 0.12)).join('') + `<path d="M180 700 H1740" stroke="#4de1ff" stroke-width="6" stroke-dasharray="24 22" opacity=".6"/>`,
    () => bg('purple', 44) + calendar(960, 560, 1.5, -3, { grid: true, highlight: [1, 17, 33] }),
    () => bg('blue', 45) + clock(960, 540, 380),
    () => bg('blue', 46) + hills('#0a0d24', 900, 11) + dish(760, 900, 1.3, -30) + beam(1880, 80, 900, 560, '#ff5fd2', 30) + burst(900, 560, 120, '#ffffff', 14, 6),
    () => bg('purple', 47) + magnetar(960, 540, 60),
    () => bg('red', 48) + magnetar(960, 540, 70, '#ff7a3d'),
    () => bg('teal', 49) + puzzle(960, 560, 1.4),
    () => bg('blue', 50, { stars: 300 }) + galaxy(600, 420, 220, '#ff9ae6', 51) + galaxy(1200, 300, 180, '#b9a6ff', 52) + elliptical(1450, 700, 200) + galaxy(800, 760, 160, '#4de1ff', 53),
    () => bg('red', 51, { stars: 260 }) + elliptical(960, 540, 520, '#ffb08a') + questionStars(1500, 520, 0.7, '#ffe14d', 9),
    () => bg('dark', 52, { stars: 900, nebula: true }),
    () => bg('purple', 53) + `<circle cx="960" cy="540" r="200" fill="#ffffff" opacity=".7" filter="url(#bigglow)"/>` + `<g filter="url(#blur80)" opacity=".9"><ellipse cx="760" cy="560" rx="460" ry="260" fill="#5a1677"/><ellipse cx="1200" cy="520" rx="420" ry="240" fill="#2b2f8f"/></g>` + sparkle(960, 540, 70, '#fff')
  ]
};

// ---------- render ----------
const here = path.dirname(new URL(import.meta.url).pathname);
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await pw.chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const only = process.argv[2];
for (const [ideaId, scenes] of Object.entries(ART)) {
  const dir = path.join(here, ideaId);
  await fs.mkdir(dir, { recursive: true });
  for (let i = 0; i < scenes.length; i++) {
    if (only && only !== `${ideaId}/${i}` && only !== ideaId) continue;
    const s = svg(scenes[i]());
    await fs.writeFile(path.join(dir, `s${i}.svg`), s);
    await page.setContent(`<html><body style="margin:0;background:#000">${s}</body></html>`);
    await page.screenshot({ path: path.join(dir, `s${i}.jpg`), type: 'jpeg', quality: 88 });
  }
  console.log(ideaId, scenes.length, 'scenes');
}
await browser.close();
