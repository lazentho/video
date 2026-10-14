// Step 2: images and voiceover. OpenAI when a key is set, offline fallbacks otherwise.
import fs from 'node:fs/promises';
import { run, duration } from './util.js';

export async function makeImage(scene, index, file, { w, h }) {
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.IMAGE_MODEL || 'gpt-image-1',
        prompt: `Flat vector cartoon illustration, glossy 2D game-art style, glowing neon cyan, orange and magenta accents, dark blue space background with small stars, one big simple centered subject with empty space in the middle for a caption: ${scene.visual}. No text, no letters, no words.`,
        size: w >= h ? '1536x1024' : '1024x1536'
      })
    });
    if (!res.ok) throw new Error(`Image API error ${res.status}: ${await res.text()}`);
    const b64 = (await res.json()).data[0].b64_json;
    await fs.writeFile(file, Buffer.from(b64, 'base64'));
    return;
  }
  // Demo mode: glowing neon signal rings over a star field, different centre per scene.
  const cx = Math.round(w * (0.3 + ((index * 0.23) % 0.4))), cy = Math.round(h * (0.35 + ((index * 0.17) % 0.3)));
  const lum = `if(gt(random(0),0.9988),255,16+170*pow(max(0,sin(hypot(X-${cx},Y-${cy})/16)),10)*exp(-hypot(X-${cx},Y-${cy})/${Math.round(h * 0.45)}))`;
  const cr = [90, 150, 110][index % 3], cb = [190, 160, 200][index % 3];
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `nullsrc=s=${w}x${h}`,
    '-vf', `geq=lum='${lum}':cb='${cb}':cr='${cr}',gblur=sigma=1.2`, '-frames:v', '1', file]);
}

export async function makeVoice(text, file) {
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
    await run('espeak-ng', ['-s', '150', '-w', file, text]);
  } catch {
    const secs = Math.max(2.5, text.split(/\s+/).length / 2.6);
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(secs), file]);
  }
}

export { duration };
