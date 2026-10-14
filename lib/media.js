// Step 2: images and voiceover. OpenAI when a key is set, offline fallbacks otherwise.
import fs from 'node:fs/promises';
import { run, duration } from './util.js';

const DEFAULT_STYLE = 'flat vector cartoon illustration, glossy 2D game-art style, glowing neon accents, dark space background';
const prompt = (scene, style) => `${style || DEFAULT_STYLE}. Full-frame flat illustration, bold simple shapes, empty space in the middle for a caption: ${scene.visual}. No text, no letters, no words.`;

async function fetchOk(url, opts, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(90000) });
      if (res.ok) return res;
      err = new Error(`HTTP ${res.status}`);
    } catch (e) { err = e; }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  throw err;
}

// Procedural fallback: glowing neon signal rings over stars. Always works, no network.
async function proceduralImage(index, file, { w, h }) {
  const cx = Math.round(w * (0.3 + ((index * 0.23) % 0.4))), cy = Math.round(h * (0.35 + ((index * 0.17) % 0.3)));
  const lum = `if(gt(random(0),0.9988),255,16+170*pow(max(0,sin(hypot(X-${cx},Y-${cy})/16)),10)*exp(-hypot(X-${cx},Y-${cy})/${Math.round(h * 0.45)}))`;
  const cr = [90, 150, 110][index % 3], cb = [190, 160, 200][index % 3];
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `nullsrc=s=${w}x${h}`,
    '-vf', `geq=lum='${lum}':cb='${cb}':cr='${cr}',gblur=sigma=1.2`, '-frames:v', '1', file]);
}

// Order: OpenAI (paid, best) -> Pollinations (free AI images) -> procedural rings.
// Set IMAGE_PROVIDER=offline to skip the network entirely.
export async function makeImage(scene, index, file, size) {
  const { w, h } = size;
  const provider = process.env.IMAGE_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'pollinations');
  try {
    if (provider === 'openai') {
      const res = await fetchOk('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.IMAGE_MODEL || 'gpt-image-1', prompt: prompt(scene, size.style), size: w >= h ? '1536x1024' : '1024x1536' })
      }, 2);
      await fs.writeFile(file, Buffer.from((await res.json()).data[0].b64_json, 'base64'));
      return;
    }
    if (provider === 'pollinations') {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt(scene, size.style))}?width=${w >= h ? 1280 : 720}&height=${w >= h ? 720 : 1280}&model=flux&nologo=true&seed=${index + 1}`;
      const res = await fetchOk(url, {});
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5000) throw new Error('image too small');
      await fs.writeFile(file, buf);
      return;
    }
  } catch (e) {
    console.warn(`[images] scene ${index + 1}: ${provider} failed (${e.message}), using fallback visual`);
  }
  await proceduralImage(index, file, size);
}

export async function makeVoice(text, file, voiceName) {
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.TTS_MODEL || 'gpt-4o-mini-tts', voice: process.env.VOICE || 'onyx', input: text,
        instructions: 'Calm, curious, slightly mysterious documentary narrator.', response_format: 'mp3' })
    });
    if (!res.ok) throw new Error(`Voice API error ${res.status}: ${await res.text()}`);
    await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
    return;
  }
  try {
    await run('edge-tts', ['--voice', voiceName || process.env.EDGE_VOICE || 'en-US-AndrewMultilingualNeural', '--rate=+5%', '--text', text, '--write-media', file]);
    if ((await fs.stat(file)).size > 1000) return;
  } catch (e) {
    console.warn(`[voice] edge-tts unavailable (${e.message.split('\n')[0].slice(0, 80)}), using fallback voice`);
  }
  try {
    await run('espeak-ng', ['-s', '150', '-w', file, text]);
  } catch {
    const secs = Math.max(2.5, text.split(/\s+/).length / 2.6);
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(secs), file]);
  }
}

export { duration };
