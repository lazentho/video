// Step 3: assemble scenes (slow zoom + captions + voice) into one MP4.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { run, duration, wrap } from './util.js';
import { makeImage, makeVoice } from './media.js';

const FONT = process.env.FONT ||
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Helvetica.ttc']
    .find(f => existsSync(f));

export async function renderVideo(script, dir, onProgress = () => {}) {
  await fs.mkdir(dir, { recursive: true });
  const clips = [];
  const n = script.scenes.length;
  for (let i = 0; i < n; i++) {
    const s = script.scenes[i];
    onProgress(`Scene ${i + 1} of ${n}: image and voice`, i / (n + 1));
    const img = path.join(dir, `s${i}.png`), voice = path.join(dir, `s${i}.mp3`);
    const txt = path.join(dir, `s${i}.txt`), clip = path.join(dir, `s${i}.mp4`);
    await Promise.all([makeImage(s, i, img), makeVoice(s.narration, voice)]);
    const dur = (await duration(voice)) + 0.5;
    await fs.writeFile(txt, wrap(s.narration));
    const frames = Math.ceil(dur * 30);
    const font = FONT ? `fontfile=${FONT}:` : '';
    const vf = [
      'scale=1188:2112:force_original_aspect_ratio=increase', 'crop=1188:2112',
      `zoompan=z='min(1+0.0004*on,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30`,
      `drawtext=${font}textfile=${txt}:fontcolor=white:fontsize=64:line_spacing=14:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h*0.68`
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
