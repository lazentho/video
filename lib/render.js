// Step 3: build the video.
// 1. Voiceover with word timings (exact phrase starts with Kokoro, estimated otherwise).
// 2. Shots: one picture each, covering one or more scenes (script.shots), timed by the words.
// 3. Each shot gets a smooth camera move and its effect; shots blend with soft transitions.
// 4. One caption pass on the whole video: one word at a time, in sync with the voice, plus grain and vignette.
// 5. Title cover as the first frame, then music mixed quietly under the voice.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { run, duration, wrap } from './util.js';
import { makeImage, makeVoiceTimed } from './media.js';
import { ambientBed, mixMusic, MUSIC_DIR } from './music.js';

const here = p => new URL(p, import.meta.url).pathname;
const FONT = process.env.FONT || [here('../fonts/Anton-Regular.ttf'), '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'].find(f => existsSync(f));
// classic = 4:3 like the reference TikToks (they are 768x576)
const SIZES = { classic: { w: 1440, h: 1080 }, landscape: { w: 1920, h: 1080 }, vertical: { w: 1080, h: 1920 } };
const CREAM = '0xFFF4DC', ACCENT = '0xFFD34D'; // cover title colours
const FPS = 30;
const T = 0.45;       // transition length, seconds
const TAIL = 1.2;     // picture stays this long after the last word
const COVER = 0.1;    // title cover at the very start, seconds
const TRANSITIONS = ['fade', 'smoothleft', 'fade', 'circleopen', 'fade', 'smoothright'];
const CONCURRENCY = process.env.OPENAI_API_KEY ? 4 : 2; // free image services rate-limit

const wordsOf = text => text.split(/\s+/).filter(Boolean);
const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

// Fallback timing when the voice can't report word times: spread words by length over the audio.
function estimateWords(scenes, total) {
  const all = scenes.flatMap((s, i) => wordsOf(s.narration).map(w => ({ w, scene: i })));
  const weight = w => w.replace(/[^\w]/g, '').length + 2 + (/[.,!?]$/.test(w) ? 3 : 0);
  const sum = all.reduce((a, x) => a + weight(x.w), 0);
  let t = 0;
  return all.map(x => { const start = t; t += (weight(x.w) / sum) * total; return { ...x, start, end: t }; });
}

// Shots from script.shots ([{scenes: [0,1,2], visual?, effect?}]) or one shot per scene.
function buildShots(script, words, total) {
  const n = script.scenes.length;
  const groups = script.shots?.length ? script.shots.map(s => ({ ...s, scenes: s.scenes }))
    : script.scenes.map((s, i) => ({ scenes: [i] }));
  const sceneStart = Array.from({ length: n }, (_, i) => words.find(x => x.scene === i)?.start);
  const shots = groups.map((g, k) => {
    const first = script.scenes[g.scenes[0]];
    return { ...g, index: k, visual: g.visual || first.visual, effect: g.effect || first.effect || 'none',
      start: k === 0 ? 0 : sceneStart[g.scenes[0]] ?? 0 };
  });
  shots.forEach((s, k) => { s.end = k < shots.length - 1 ? shots[k + 1].start : total + TAIL; });
  return shots;
}

// Smooth camera move (frame-accurate scaling, no zoompan wobble). Cycles zoom in, pan, zoom out, pan.
function motion(k, dur, w, h) {
  const z = 0.1;
  const cover = `scale=${Math.round(w * 1.2)}:${Math.round(h * 1.2)}:force_original_aspect_ratio=increase,crop=${Math.round(w * 1.2)}:${Math.round(h * 1.2)}`;
  const zoom = expr => `scale=w='trunc(${w}*(${expr})/2)*2':h=-2:eval=frame,crop=${w}:${h}`;
  const pan = dir => `scale=${Math.round(w * 1.1)}:-2,crop=${w}:${h}:x='(iw-${w})*${dir > 0 ? `t/${dur.toFixed(3)}` : `(1-t/${dur.toFixed(3)})`}':y='(ih-${h})/2'`;
  return [cover, [zoom(`1+${z}*t/${dur.toFixed(3)}`), pan(1), zoom(`1+${z}-${z}*t/${dur.toFixed(3)}`), pan(-1)][k % 4]];
}

// The effect lands on the cut (local time `at`), not at the start of the overlapping transition.
function effectFilter(effect, at, w, h) {
  const a = at.toFixed(3);
  switch (effect) {
    case 'flash': return `eq=brightness='0.55*max(0\\,1-abs(t-${a})/0.18)':eval=frame`;
    case 'glitch': return `rgbashift=rh=-12:bh=12:gv=5:enable='between(t\\,${a}\\,${a}+0.12)+between(t\\,${a}+0.5\\,${a}+0.58)',noise=alls=30:allf=t:enable='between(t\\,${a}\\,${a}+0.12)'`;
    case 'shake': return `scale=${Math.round(w * 1.04)}:-2,crop=${w}:${h}:x='(iw-${w})/2+sin(t*47)*${Math.round(w * 0.008)}*max(0\\,1-abs(t-${a}-0.3)/0.5)':y='(ih-${h})/2+cos(t*53)*${Math.round(h * 0.008)}*max(0\\,1-abs(t-${a}-0.3)/0.5)'`;
    case 'pulse': return `eq=brightness='0.06*sin(t*6)':saturation='1+0.15*sin(t*6)':eval=frame`;
    default: return null;
  }
}

// One word at a time on the final timeline, drawn white onto a mask. A word stays until the next one,
// or until shortly after it ends when the voice pauses.
async function captionMask(words, dir, h) {
  const size = Math.round(h * 0.12);
  const font = FONT ? `fontfile='${esc(FONT)}':` : '';
  return Promise.all(words.map(async (x, k) => {
    const text = x.w.replace(/[.,;:"“”()]+/g, '').toUpperCase();
    const file = path.join(dir, `w${k}.txt`);
    await fs.writeFile(file, text);
    const a = x.start, next = words[k + 1] ? words[k + 1].start : Infinity;
    const b = Math.min(next, x.end + 0.35);
    return `drawtext=${font}textfile='${esc(file)}':fontcolor=white:fontsize='${size}*(1+0.12*max(0\\,1-(t-${a.toFixed(3)})*8))'` +
      `:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t\\,${a.toFixed(3)}\\,${b.toFixed(3)})'`;
  }));
}

// Captions filled with the scene's own colours (a brightened copy of the picture shows through the letters),
// on a soft dark shadow so they always read. Then film grain and a vignette.
export async function captionGraph(words, dir, w, h, length) {
  const blank = `color=c=black:s=${w}x${h}:r=${FPS}:d=${length.toFixed(3)}`;
  return [
    '[0:v]split=2[base][src]',
    '[src]eq=brightness=0.28:saturation=1.9:contrast=1.15,curves=preset=lighter[fill]',
    `${blank},format=gray,\n${(await captionMask(words, dir, h)).join(',\n')}[mask]`,
    '[mask]split=2[m1][m2]',
    `[m2]gblur=sigma=${Math.round(h * 0.012)},curves=all='0/0 0.25/0.9 1/1'[mb]`,
    `${blank},format=yuv420p[blk]`,
    '[blk][mb]alphamerge[shadow]',
    '[fill][m1]alphamerge[txt]',
    '[base][shadow]overlay=format=auto[b1]',
    '[b1][txt]overlay=format=auto,noise=alls=6:allf=t,vignette=angle=PI/5,format=yuv420p[v]'
  ].join(';\n');
}

// Cover frame: first picture, darkened, with the title. Phones and TikTok show this as the preview.
async function makeCover(script, firstImage, dir, w, h) {
  const lines = wrap((script.title || '').toUpperCase(), w > h ? 18 : 12).split('\n').slice(0, 3);
  const size = Math.round(h * (w > h ? 0.17 : 0.095)), gap = Math.round(size * 1.12);
  const top = Math.round(h / 2 - (lines.length * gap) / 2);
  const font = FONT ? `fontfile='${esc(FONT)}':` : '';
  const text = await Promise.all(lines.map(async (line, k) => {
    const file = path.join(dir, `cover${k}.txt`);
    await fs.writeFile(file, line);
    return `drawtext=${font}textfile='${esc(file)}':fontcolor=${k % 2 ? ACCENT : CREAM}:fontsize=${size}:borderw=${Math.round(size * 0.05)}:bordercolor=black@0.85:shadowx=0:shadowy=${Math.round(size * 0.06)}:shadowcolor=black@0.5:x=(w-text_w)/2:y=${top + k * gap}`;
  }));
  const jpg = path.join(dir, 'cover.jpg'), clip = path.join(dir, 'cover.mp4');
  await run('ffmpeg', ['-y', '-i', firstImage, '-vf', [`scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`,
    'eq=brightness=-0.15:saturation=1.1', 'vignette=angle=PI/4', ...text].join(','), '-frames:v', '1', '-q:v', '2', jpg]);
  await run('ffmpeg', ['-y', '-loop', '1', '-framerate', String(FPS), '-i', jpg, '-t', String(COVER), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', clip]);
  return { jpg, clip };
}

export async function renderVideo(script, dir, onProgress = () => {}, { aspect = 'classic', voice: voiceName, music = 'ambient', musicStart = 0 } = {}) {
  const { w, h } = SIZES[aspect] || SIZES.classic;
  await fs.mkdir(dir, { recursive: true });

  onProgress('Recording the voiceover', 0.03);
  const voice = path.join(dir, 'voice.wav');
  const timed = await makeVoiceTimed(script.scenes.map(s => s.narration), voice, voiceName, dir);
  const total = await duration(voice);
  const words = timed || estimateWords(script.scenes, total);
  await fs.writeFile(path.join(dir, 'words.json'), JSON.stringify(words, null, 1));

  const shots = buildShots(script, words, total);
  const n = shots.length;
  let done = 0;
  const clips = await pool(shots, CONCURRENCY, async (shot, k) => {
    const img = path.join(dir, `shot${k}.png`), clip = path.join(dir, `shot${k}.mp4`);
    await makeImage({ visual: shot.visual }, shot.scenes[0], img, { w, h, style: script.style, art: script.art, photos: script.photos, shot: k });
    // Overlap neighbours by T/2 on each side so transitions are centred on the cut
    const from = k === 0 ? 0 : shot.start - T / 2, to = k === n - 1 ? shot.end : shot.end + T / 2;
    const dur = to - from, at = shot.start - from;
    const vf = [...motion(k, dur, w, h), ...[effectFilter(k === 0 && shot.effect === 'flash' ? 'none' : shot.effect, at, w, h)].filter(Boolean),
      `fps=${FPS}`, 'format=yuv420p'].join(',');
    await run('ffmpeg', ['-y', '-loop', '1', '-framerate', String(FPS), '-i', img, '-vf', vf, '-t', dur.toFixed(3),
      '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-an', clip]);
    onProgress(`Picture ${++done} of ${n}`, 0.08 + 0.7 * (done / n));
    return clip;
  });

  // Soft transitions between all shots
  onProgress('Blending the shots', 0.8);
  const body = path.join(dir, 'body.mp4');
  if (n === 1) await fs.copyFile(clips[0], body);
  else {
    const chain = [];
    let prev = '[0:v]';
    for (let k = 1; k < n; k++) {
      const out = k === n - 1 ? '[v]' : `[x${k}]`;
      chain.push(`${prev}[${k}:v]xfade=transition=${TRANSITIONS[k % TRANSITIONS.length]}:duration=${T}:offset=${(shots[k].start - T / 2).toFixed(3)}${out}`);
      prev = out;
    }
    await run('ffmpeg', ['-y', ...clips.flatMap(c => ['-i', c]), '-filter_complex', chain.join(';'), '-map', '[v]',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', body]);
  }

  // Captions in sync with the voice, plus film grain and a soft vignette
  onProgress('Adding captions', 0.88);
  const captioned = path.join(dir, 'captioned.mp4');
  const capScript = path.join(dir, 'captions.txt');
  await fs.writeFile(capScript, [...(await captionFilters(words, dir, h, 0)), 'noise=alls=6:allf=t', 'vignette=angle=PI/5'].join(',\n'));
  await run('ffmpeg', ['-y', '-i', body, '-filter_script:v', capScript, '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', captioned]);

  // Title cover first (0.1 s), voice shifted by the same amount so everything stays in sync
  onProgress('Putting it all together', 0.95);
  const cover = await makeCover(script, path.join(dir, 'shot0.png'), dir, w, h);
  const list = path.join(dir, 'list.txt');
  await fs.writeFile(list, [cover.clip, captioned].map(c => `file '${path.resolve(c)}'`).join('\n'));
  const video = path.join(dir, 'video_nomusic.mp4');
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
  const voiceShifted = path.join(dir, 'voice_cover.wav');
  await run('ffmpeg', ['-y', '-i', voice, '-af', `adelay=${COVER * 1000}:all=1`, voiceShifted]);

  const length = COVER + total + TAIL;
  const out = path.join(dir, 'video_raw.mp4'), final = path.join(dir, 'video.mp4');
  if (music && music !== 'none') {
    let track = path.join(MUSIC_DIR, path.basename(music));
    if (music === 'ambient') { track = path.join(dir, 'music.wav'); await ambientBed(track, length + 2); }
    await mixMusic(video, voiceShifted, track, out, length, music === 'ambient' ? 0 : musicStart);
  } else {
    await run('ffmpeg', ['-y', '-i', video, '-i', voiceShifted, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-ar', '44100', '-ac', '2', '-af', `loudnorm=I=-14:TP=-1.5:LRA=11,apad=whole_dur=${length.toFixed(2)}`, '-shortest', out]);
  }
  await run('ffmpeg', ['-y', '-i', out, '-i', cover.jpg, '-map', '0', '-map', '1', '-c', 'copy',
    '-disposition:v:1', 'attached_pic', '-movflags', '+faststart', final]);
  return final;
}
