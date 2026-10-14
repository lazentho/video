// Step 3: assemble scenes (slow zoom + captions + voice) into one MP4.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { run, duration } from './util.js';
import { makeImage, makeVoice } from './media.js';

const FONT = process.env.FONT ||
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Helvetica.ttc']
    .find(f => existsSync(f));

const SIZES = { landscape: { w: 1920, h: 1080 }, vertical: { w: 1080, h: 1920 } };
const COLORS = ['0xFFE14D', '0x4DE1FF', '0xFF7A3D', '0x7CFF6B', '0xFF5FD2', '0xFFFFFF'];

// One big word at a time, timed in proportion to its length across the voiceover.
function wordFilters(text, dur, dir, i, h) {
  const words = text.split(/\s+/).filter(Boolean);
  const weight = w => w.replace(/[^\w]/g, '').length + 2 + (/[.,!?]$/.test(w) ? 2 : 0);
  const total = words.reduce((n, w) => n + weight(w), 0);
  const speech = Math.max(0.5, dur - 0.5);
  const font = FONT ? `fontfile=${FONT}:` : '';
  let t = 0;
  return Promise.all(words.map(async (word, k) => {
    const a = t, b = (t += (weight(word) / total) * speech);
    const file = path.join(dir, `s${i}w${k}.txt`);
    await fs.writeFile(file, word.replace(/[.,!?]+$/, '').toUpperCase());
    const size = `${Math.round(h * 0.13)}*(1+0.35*max(0\\,1-(t-${a.toFixed(3)})*9))`;
    return `drawtext=${font}textfile=${file}:fontcolor=${COLORS[k % COLORS.length]}:fontsize='${size}':borderw=${Math.round(h * 0.012)}:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t\\,${a.toFixed(3)}\\,${(k === words.length - 1 ? dur : b).toFixed(3)})'`;
  }));
}

export async function renderVideo(script, dir, onProgress = () => {}, { aspect = 'landscape' } = {}) {
  const { w, h } = SIZES[aspect] || SIZES.landscape;
  await fs.mkdir(dir, { recursive: true });
  const clips = [];
  const n = script.scenes.length;
  for (let i = 0; i < n; i++) {
    const s = script.scenes[i];
    onProgress(`Scene ${i + 1} of ${n}: image and voice`, i / (n + 1));
    const img = path.join(dir, `s${i}.png`), voice = path.join(dir, `s${i}.mp3`);
    const clip = path.join(dir, `s${i}.mp4`);
    await Promise.all([makeImage(s, i, img, { w, h }), makeVoice(s.narration, voice)]);
    const dur = (await duration(voice)) + 0.5;
    const frames = Math.ceil(dur * 30);
    const vf = [
      `scale=${Math.round(w * 1.1)}:${Math.round(h * 1.1)}:force_original_aspect_ratio=increase`,
      `crop=${Math.round(w * 1.1)}:${Math.round(h * 1.1)}`,
      `zoompan=z='min(1+0.0004*on,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=30`,
      ...(await wordFilters(s.narration, dur, dir, i, h))
    ].join(',');
    await run('ffmpeg', ['-y', '-loop', '1', '-i', img, '-i', voice, '-vf', vf, '-af', 'apad',
      '-t', String(dur), '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', clip]);
    clips.push(clip);
  }
  onProgress('Putting it all together', n / (n + 1));
  const list = path.join(dir, 'list.txt');
  await fs.writeFile(list, clips.map(c => `file '${path.resolve(c)}'`).join('\n'));
  const out = path.join(dir, 'video.mp4');
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
  return out;
}
