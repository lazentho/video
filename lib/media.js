// Step 2: images and voiceover. OpenAI when a key is set, offline fallbacks otherwise.
import fs from 'node:fs/promises';
import { run, duration } from './util.js';

const W = 1080, H = 1920;

export async function makeImage(scene, index, file) {
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.IMAGE_MODEL || 'gpt-image-1',
        prompt: `Cinematic, dramatic, photorealistic, vertical. ${scene.visual}. No text or letters.`,
        size: '1024x1536'
      })
    });
    if (!res.ok) throw new Error(`Image API error ${res.status}: ${await res.text()}`);
    const b64 = (await res.json()).data[0].b64_json;
    await fs.writeFile(file, Buffer.from(b64, 'base64'));
    return;
  }
  // Demo mode: procedural star field with a soft glow, different position per scene.
  const cx = 200 + ((index * 337) % 700), cy = 500 + ((index * 211) % 900);
  const lum = `if(gt(random(0),0.9985),255,10+60*exp(-((X-${cx})^2+(Y-${cy})^2)/(2*320^2)))`;
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `nullsrc=s=${W}x${H}`,
    '-vf', `geq=lum='${lum}':cb='128+${18 + (index % 3) * 12}':cr='118',gblur=sigma=0.6`,
    '-frames:v', '1', file]);
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
