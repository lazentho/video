import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeScript } from './lib/script.js';
import { renderVideo } from './lib/render.js';
import { run } from './lib/util.js';
import { listMusic } from './lib/music.js';
import { loadIdeas, visible, generateIdeas, addIdea, updateIdea, deleteIdea } from './lib/ideas.js';

// Tiny .env loader (no dependencies)
try {
  for (const l of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*([^#\s]+)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

// Settings the setup screen can save. Values are written to .env and never sent back to the browser.
const SETTINGS = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];

function saveSettings(values) {
  let lines = [];
  try { lines = fs.readFileSync('.env', 'utf8').split('\n'); } catch {}
  for (const k of SETTINGS) {
    const v = typeof values[k] === 'string' ? values[k].trim() : '';
    if (!v || !/^[\w.\-]+$/.test(v)) continue;
    process.env[k] = v;
    const i = lines.findIndex(l => l.startsWith(k + '='));
    if (i >= 0) lines[i] = `${k}=${v}`; else lines.push(`${k}=${v}`);
  }
  fs.writeFileSync('.env', lines.filter((l, i) => l || i < lines.length - 1).join('\n') + '\n', { mode: 0o600 });
}

async function hasCommand(cmd) {
  try { await run(cmd, ['--help']); return true; } catch { return false; }
}

async function status() {
  const e = process.env;
  return {
    script: e.ANTHROPIC_API_KEY ? 'Claude' : e.GEMINI_API_KEY ? 'Gemini (free)' : null,
    images: e.IMAGE_PROVIDER === 'offline' ? 'Neon rings (offline)' : e.OPENAI_API_KEY ? 'OpenAI' : 'Pollinations (free)',
    voice: e.OPENAI_API_KEY ? 'OpenAI' : (await hasCommand('edge-tts')) ? 'edge-tts (free)' : null,
    ffmpeg: await hasCommand('ffmpeg'),
    keys: Object.fromEntries(SETTINGS.map(k => [k, !!e[k]]))
  };
}

// Free, natural-sounding edge-tts voices offered in the app.
const VOICES = ['kokoro:am_liam*0.7+am_fenrir*0.3', 'kokoro:am_liam', 'kokoro:am_michael', 'kokoro:am_fenrir', 'kokoro:af_heart', 'en-US-AndrewMultilingualNeural', 'en-US-BrianMultilingualNeural', 'en-US-ChristopherNeural', 'en-US-AvaMultilingualNeural', 'en-US-EmmaMultilingualNeural', 'en-GB-RyanNeural'];

const jobs = new Map();
const OUT = path.resolve('output');
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

async function readJson(req) {
  let body = '';
  for await (const c of req) body += c;
  return JSON.parse(body || '{}');
}

async function startJob(topic, aspect, idea, voice, music, musicStart) {
  const ideaId = idea?.id;
  const id = crypto.randomBytes(5).toString('hex');
  const job = { id, status: 'writing', message: 'Writing the script', progress: 0.02 };
  jobs.set(id, job);
  (async () => {
    try {
      if (ideaId) await updateIdea(ideaId, { status: 'making' });
      // Ideas from the library already have a full script, so no AI call is needed.
      job.script = idea?.scenes ? { title: idea.title, style: idea.style, art: idea.art, scenes: idea.scenes } : await writeScript(topic);
      job.status = 'rendering';
      await fs.promises.mkdir(path.join(OUT, id), { recursive: true });
      await fs.promises.writeFile(path.join(OUT, id, 'script.json'), JSON.stringify({ topic, ...job.script }, null, 2));
      await renderVideo(job.script, path.join(OUT, id), (message, progress) => Object.assign(job, { message, progress }), { aspect, voice, music, musicStart });
      Object.assign(job, { status: 'done', message: 'Done', progress: 1, url: `/video/${id}.mp4` });
      if (ideaId) await updateIdea(ideaId, { status: 'made', video: job.url, title: job.script.title || undefined });
    } catch (e) {
      Object.assign(job, { status: 'error', message: e.message });
      if (ideaId) await updateIdea(ideaId, { status: 'new' }).catch(() => {});
    }
  })();
  return job;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, fs.readFileSync('public/index.html'), 'text/html');
  if (req.method === 'POST' && url.pathname === '/api/generate') {
    const body = await readJson(req);
    let topic = (body.topic || '').trim();
    const idea = body.ideaId && (await loadIdeas()).find(i => i.id === body.ideaId);
    if (idea) topic = `${idea.title}. ${idea.hook}`;
    topic ||= 'a mysterious unexplained signal from space';
    return send(res, 200, await startJob(topic.slice(0, 400), body.aspect === 'vertical' ? 'vertical' : 'landscape', idea, VOICES.includes(body.voice) ? body.voice : undefined,
      ['ambient', 'none', ...(await listMusic())].includes(body.music) ? body.music : 'ambient',
      Math.min(Math.max(+body.musicStart || 0, 0), 3600)));
  }
  if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, await status());
  if (req.method === 'POST' && url.pathname === '/api/settings') {
    saveSettings(await readJson(req));
    return send(res, 200, await status());
  }
  try {
    if (url.pathname === '/api/music' && req.method === 'GET') return send(res, 200, await listMusic());
    if (url.pathname === '/api/ideas' && req.method === 'GET') return send(res, 200, visible(await loadIdeas()));
    if (url.pathname === '/api/ideas/generate' && req.method === 'POST') {
      const { count, theme } = await readJson(req);
      return send(res, 200, visible(await generateIdeas({ count, theme: String(theme || '') })));
    }
    if (url.pathname === '/api/ideas' && req.method === 'POST') {
      const { title, hook } = await readJson(req);
      if (!String(title || '').trim()) return send(res, 400, { error: 'title is required' });
      return send(res, 200, visible(await addIdea(String(title).trim(), String(hook || '').trim())));
    }
    const del = url.pathname.match(/^\/api\/ideas\/([\w-]+)$/);
    if (del && req.method === 'DELETE') return send(res, 200, visible(await deleteIdea(del[1])));
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
  const j = url.pathname.match(/^\/api\/jobs\/(\w+)$/);
  if (j) return jobs.has(j[1]) ? send(res, 200, jobs.get(j[1])) : send(res, 404, { error: 'not found' });
  const v = url.pathname.match(/^\/video\/(\w+)\.mp4$/);
  if (v) {
    const f = path.join(OUT, v[1], 'video.mp4');
    if (!fs.existsSync(f)) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': fs.statSync(f).size });
    return fs.createReadStream(f).pipe(res);
  }
  send(res, 404, { error: 'not found' });
}).listen(process.env.PORT || 3000, '127.0.0.1', () => {
  const link = `http://localhost:${process.env.PORT || 3000}`;
  console.log(`\n  Mystery Video Maker is running: ${link}\n  Keep this window open. Close it to stop the app.\n`);
  // Open the browser for you (set OPEN=0 to turn this off).
  if (process.env.OPEN !== '0') {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', link]]
      : process.platform === 'darwin' ? ['open', [link]] : ['xdg-open', [link]];
    run(cmd, args).catch(() => {});
  }
});
