// Step 3: one voiceover for the whole video, scenes timed by how many words they hold,
// each with a different camera move and big one-word-at-a-time captions.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { run, duration } from './util.js';
import { makeImage, makeVoice } from './media.js';

const FONT = process.env.FONT ||
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Helvetica.ttc']
    .find(f => existsSync(f));
const SIZES = { landscape: { w: 1920, h: 1080 }, vertical: { w: 1080, h: 1920 } };
const COLORS = ['0xFFE14D', '0x4DE1FF', '0xFF9A3D', '0x7CFF6B', '0xFF5FD2', '0xFFFFFF'];
const CONCURRENCY = process.env.OPENAI_API_KEY ? 4 : 2; // free image services rate-limit

const weight = w => w.replace(/[^\w]/g, '').length + 2 + (/[.,!?]$/.test(w) ? 3 : 0);
const wordsOf = text => text.split(/\s+/).filter(Boolean);

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

// One big word at a time, timed in proportion to its length within the scene.
async function wordFilters(text, dur, dir, i, h, colorOffset) {
  const words = wordsOf(text);
  const total = words.reduce((n, w) => n + weight(w), 0);
  const font = FONT ? `fontfile=${FONT}:` : '';
  let t = 0;
  return Promise.all(words.map(async (word, k) => {
    const a = t, b = (t += (weight(word) / total) * dur);
    const file = path.join(dir, `s${i}w${k}.txt`);
    await fs.writeFile(file, word.replace(/[.,!?]+$/, '').toUpperCase());
    const size = `${Math.round(h * 0.16)}*(1+0.35*max(0\\,1-(t-${a.toFixed(3)})*9))`;
    const end = k === words.length - 1 ? dur + 1 : b;
    return `drawtext=${font}textfile=${file}:fontcolor=${COLORS[(k + colorOffset) % COLORS.length]}:fontsize='${size}':borderw=${Math.round(h * 0.012)}:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t\\,${a.toFixed(3)}\\,${end.toFixed(3)})'`;
  }));
}

// AI-chosen effect for the start of a scene (applied under the captions).
function effectFilter(effect, w, h) {
  switch (effect) {
    case 'flash': return `fade=t=in:st=0:d=0.3:color=white`;
    case 'glitch': return `rgbashift=rh=-14:bh=14:gv=6:enable='lt(mod(t\\,0.6)\\,0.12)',noise=alls=35:allf=t:enable='lt(mod(t\\,0.6)\\,0.12)'`;
    case 'shake': return `scale=${Math.round(w * 1.06)}:${Math.round(h * 1.06)},crop=${w}:${h}:x='(iw-${w})/2+sin(t*47)*${Math.round(w * 0.012)}':y='(ih-${h})/2+cos(t*53)*${Math.round(h * 0.012)}'`;
    case 'pulse': return `eq=brightness='0.10*sin(t*12)':saturation='1+0.3*sin(t*12)':eval=frame`;
    default: return null;
  }
}

// Cycle through zoom in, zoom out, pan left, pan right.
function motion(i, frames, w, h) {
  const z = 0.16 / frames, c = { x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' };
  const moves = [
    { z: `min(1+${z}*on,1.16)`, ...c },
    { z: `max(1.16-${z}*on,1)`, ...c },
    { z: '1.14', x: `(iw-iw/zoom)*(1-on/${frames})`, y: c.y },
    { z: '1.14', x: `(iw-iw/zoom)*(on/${frames})`, y: c.y }
  ];
  const m = moves[i % moves.length];
  return `zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${frames}:s=${w}x${h}:fps=30`;
}

export async function renderVideo(script, dir, onProgress = () => {}, { aspect = 'landscape' } = {}) {
  const { w, h } = SIZES[aspect] || SIZES.landscape;
  await fs.mkdir(dir, { recursive: true });
  const scenes = script.scenes;
  const n = scenes.length;

  onProgress('Recording the voiceover', 0.03);
  const voice = path.join(dir, 'voice.mp3');
  await makeVoice(scenes.map(s => s.narration).join(' '), voice);
  const total = await duration(voice);

  // Each scene lasts as long as its words take to say.
  const weights = scenes.map(s => wordsOf(s.narration).reduce((a, x) => a + weight(x), 0));
  const sum = weights.reduce((a, x) => a + x, 0);
  const durs = weights.map((x, i) => (x / sum) * total + (i === n - 1 ? 0.8 : 0));

  let done = 0;
  const clips = await pool(scenes, CONCURRENCY, async (s, i) => {
    const img = path.join(dir, `s${i}.png`), clip = path.join(dir, `s${i}.mp4`);
    await makeImage(s, i, img, { w, h, style: script.style });
    const dur = durs[i], frames = Math.max(2, Math.ceil(dur * 30));
    const vf = [
      `scale=${Math.round(w * 1.2)}:${Math.round(h * 1.2)}:force_original_aspect_ratio=increase`,
      `crop=${Math.round(w * 1.2)}:${Math.round(h * 1.2)}`,
      motion(i, frames, w, h),
      ...[effectFilter(s.effect, w, h)].filter(Boolean),
      ...(await wordFilters(s.narration, dur, dir, i, h, i * 2))
    ].join(',');
    await run('ffmpeg', ['-y', '-loop', '1', '-i', img, '-vf', vf, '-t', dur.toFixed(3), '-r', '30',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', clip]);
    onProgress(`Scene ${++done} of ${n}`, 0.05 + 0.85 * (done / n));
    return clip;
  });

  onProgress('Putting it all together', 0.93);
  const list = path.join(dir, 'list.txt');
  await fs.writeFile(list, clips.map(c => `file '${path.resolve(c)}'`).join('\n'));
  const out = path.join(dir, 'video.mp4');
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', voice,
    '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-af', 'apad', '-shortest', '-movflags', '+faststart', out]);
  return out;
}
