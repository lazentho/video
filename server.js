import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeScript } from './lib/script.js';
import { renderVideo } from './lib/render.js';
import { run } from './lib/util.js';

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

const jobs = new Map();
const OUT = path.resolve('output');
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

async function startJob(topic, aspect) {
  const id = crypto.randomBytes(5).toString('hex');
  const job = { id, status: 'writing', message: 'Writing the script', progress: 0.02 };
  jobs.set(id, job);
  (async () => {
    try {
      job.script = await writeScript(topic);
      job.status = 'rendering';
      await renderVideo(job.script, path.join(OUT, id), (message, progress) => Object.assign(job, { message, progress }), { aspect });
      Object.assign(job, { status: 'done', message: 'Done', progress: 1, url: `/video/${id}.mp4` });
    } catch (e) {
      Object.assign(job, { status: 'error', message: e.message });
    }
  })();
  return job;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, fs.readFileSync('public/index.html'), 'text/html');
  if (req.method === 'POST' && url.pathname === '/api/generate') {
    let body = '';
    for await (const c of req) body += c;
    const req_ = JSON.parse(body || '{}');
    const topic = (req_.topic || '').trim() || 'a mysterious unexplained signal from space';
    return send(res, 200, await startJob(topic.slice(0, 300), req_.aspect === 'vertical' ? 'vertical' : 'landscape'));
  }
  if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, await status());
  if (req.method === 'POST' && url.pathname === '/api/settings') {
    let body = '';
    for await (const c of req) body += c;
    saveSettings(JSON.parse(body || '{}'));
    return send(res, 200, await status());
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
}).listen(process.env.PORT || 3000, '127.0.0.1', () => console.log(`Open http://localhost:${process.env.PORT || 3000}`));
