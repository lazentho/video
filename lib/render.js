// Step 3: one voiceover for the whole video, scenes timed by how many words they hold,
// each with a different camera move and big one-word-at-a-time captions.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { run, duration, wrap } from './util.js';
import { makeImage, makeVoice } from './media.js';
import { ambientBed, mixMusic, MUSIC_DIR } from './music.js';

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

// Cover frame: first scene's art, darkened, with the title. Phones and TikTok show this as the preview.
async function makeCover(script, firstImage, dir, w, h) {
  const lines = wrap((script.title || '').toUpperCase(), w > h ? 16 : 11).split('\n').slice(0, 3);
  const size = Math.round(h * (w > h ? 0.15 : 0.085)), gap = Math.round(size * 1.15);
  const top = Math.round(h / 2 - (lines.length * gap) / 2);
  const font = FONT ? `fontfile=${FONT}:` : '';
  const text = await Promise.all(lines.map(async (line, k) => {
    const file = path.join(dir, `cover${k}.txt`);
    await fs.writeFile(file, line);
    return `drawtext=${font}textfile=${file}:fontcolor=${k % 2 ? '0x4DE1FF' : '0xFFE14D'}:fontsize=${size}:borderw=${Math.round(size * 0.08)}:bordercolor=black:x=(w-text_w)/2:y=${top + k * gap}`;
  }));
  const jpg = path.join(dir, 'cover.jpg'), clip = path.join(dir, 'cover.mp4');
  await run('ffmpeg', ['-y', '-i', firstImage, '-vf', [`scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`,
    'eq=brightness=-0.12:saturation=1.15', 'vignette=PI/4', ...text].join(','), '-frames:v', '1', '-q:v', '2', jpg]);
  // 3 frames (0.1 s) at the very start, so the first frame of the video is the cover
  await run('ffmpeg', ['-y', '-loop', '1', '-i', jpg, '-t', '0.1', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', clip]);
  return { jpg, clip };
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

export async function renderVideo(script, dir, onProgress = () => {}, { aspect = 'landscape', voice: voiceName, music = 'ambient', musicStart = 0 } = {}) {
  const { w, h } = SIZES[aspect] || SIZES.landscape;
  await fs.mkdir(dir, { recursive: true });
  const scenes = script.scenes;
  const n = scenes.length;

  onProgress('Recording the voiceover', 0.03);
  let voice = path.join(dir, 'voice.mp3');
  await makeVoice(scenes.map(s => s.narration).join(' '), voice, voiceName);
  const total = await duration(voice);

  // Each scene lasts as long as its words take to say.
  const weights = scenes.map(s => wordsOf(s.narration).reduce((a, x) => a + weight(x), 0));
  const sum = weights.reduce((a, x) => a + x, 0);
  const durs = weights.map((x, i) => (x / sum) * total + (i === n - 1 ? 0.8 : 0));

  let done = 0;
  const clips = await pool(scenes, CONCURRENCY, async (s, i) => {
    const img = path.join(dir, `s${i}.png`), clip = path.join(dir, `s${i}.mp4`);
    await makeImage(s, i, img, { w, h, style: script.style, art: script.art });
    const dur = durs[i], frames = Math.max(2, Math.ceil(dur * 30));
    const vf = [
      `scale=${Math.round(w * 1.2)}:${Math.round(h * 1.2)}:force_original_aspect_ratio=increase`,
      `crop=${Math.round(w * 1.2)}:${Math.round(h * 1.2)}`,
      motion(i, frames, w, h),
      ...[effectFilter(i === 0 && s.effect === 'flash' ? 'none' : s.effect, w, h)].filter(Boolean),
      ...(await wordFilters(s.narration, dur, dir, i, h, i * 2))
    ].join(',');
    await run('ffmpeg', ['-y', '-loop', '1', '-i', img, '-vf', vf, '-t', dur.toFixed(3), '-r', '30',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', clip]);
    onProgress(`Scene ${++done} of ${n}`, 0.05 + 0.85 * (done / n));
    return clip;
  });

  onProgress('Putting it all together', 0.93);
  const cover = await makeCover(script, path.join(dir, 's0.png'), dir, w, h);
  const list = path.join(dir, 'list.txt');
  await fs.writeFile(list, [cover.clip, ...clips].map(c => `file '${path.resolve(c)}'`).join('\n'));
  // Shift the voice by the cover's 0.1 s so captions stay in sync
  const voiceIn = voice;
  voice = path.join(dir, 'voice_cover.wav');
  await run('ffmpeg', ['-y', '-i', voiceIn, '-af', 'adelay=100:all=1', voice]);
  const out = path.join(dir, 'video_raw.mp4'), final = path.join(dir, 'video.mp4');
  const attachCover = () => run('ffmpeg', ['-y', '-i', out, '-i', cover.jpg, '-map', '0', '-map', '1', '-c', 'copy',
    '-disposition:v:1', 'attached_pic', '-movflags', '+faststart', final]).then(() => final);
  if (music && music !== 'none') {
    const silent = path.join(dir, 'video_nomusic.mp4');
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'copy', silent]);
    let track = path.join(MUSIC_DIR, path.basename(music));
    if (music === 'ambient') { track = path.join(dir, 'music.wav'); await ambientBed(track, total + 2); }
    await mixMusic(silent, voice, track, out, total + 0.9, music === 'ambient' ? 0 : musicStart);
    return attachCover();
  }
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', voice,
    '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,apad', '-shortest', '-movflags', '+faststart', out]);
  return attachCover();
}
