// Background music: a built-in calm ambient bed (generated, no copyright) or your own file from music/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { run } from './util.js';

export const MUSIC_DIR = new URL('../music/', import.meta.url).pathname;

export async function listMusic() {
  try {
    return (await fs.readdir(MUSIC_DIR)).filter(f => /\.(mp3|m4a|wav|ogg|aac)$/i.test(f)).sort();
  } catch { return []; }
}

// Slow, mysterious chord loop (Am, F, C, G), soft pads with a gentle swell on each chord.
const CHORDS = [[110, 220, 261.63, 329.63], [87.31, 174.61, 220, 261.63], [65.41, 130.81, 164.81, 196], [98, 196, 246.94, 293.66]];

export async function ambientBed(file, seconds) {
  const tone = f => `sin(2*PI*${f}*t)+0.35*sin(2*PI*${f * 2.003}*t)`;
  const chord = c => `(${c.map((f, i) => `${i ? 1 : 1.4}*(${tone(f)})`).join('+')})`;
  const sel = CHORDS.map((c, i) => `between(mod(t,16),${i * 4},${i * 4 + 4})*${chord(c)}`).join('+');
  const expr = `0.035*(${sel})*pow(sin(PI*mod(t,4)/4),0.6)*(0.85+0.15*sin(2*PI*0.2*t))`;
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=44100:d=${Math.ceil(seconds) + 1}`,
    '-af', 'lowpass=f=1800,aecho=0.8:0.7:120|240:0.35|0.25,afade=t=in:d=2', '-ac', '2', file]);
}

// Mix music under the voice: quiet, ducked while the voice speaks, faded out at the end.
export async function mixMusic(videoIn, voiceFile, music, out, total) {
  const fadeAt = Math.max(0, total - 2.5).toFixed(2);
  // Voice at -16 LUFS, music 15 LU quieter, then ducked further while the voice speaks.
  const filter = `[2:a]aresample=44100,loudnorm=I=-31:TP=-6,atrim=duration=${total.toFixed(2)},afade=t=out:st=${fadeAt}:d=2.5[m];` +
    `[1:a]aresample=44100,loudnorm=I=-16:TP=-1.5,apad=whole_dur=${total.toFixed(2)},asplit=2[v][key];` +
    `[m][key]sidechaincompress=threshold=0.05:ratio=4:attack=40:release=600[duck];` +
    `[v][duck]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.89[a]`;
  await run('ffmpeg', ['-y', '-i', videoIn, '-i', voiceFile, '-stream_loop', '-1', '-i', music,
    '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-ar', '44100', '-ac', '2', '-shortest', '-movflags', '+faststart', out]);
}
