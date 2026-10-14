import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeScript } from './lib/script.js';
import { renderVideo } from './lib/render.js';

// Tiny .env loader (no dependencies)
try {
  for (const l of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*([^#\s]+)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const jobs = new Map();
const OUT = path.resolve('output');
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

async function startJob(topic) {
  const id = crypto.randomBytes(5).toString('hex');
  const job = { id, status: 'writing', message: 'Writing the script', progress: 0.02 };
  jobs.set(id, job);
  (async () => {
    try {
      job.script = await writeScript(topic);
      job.status = 'rendering';
      await renderVideo(job.script, path.join(OUT, id), (message, progress) => Object.assign(job, { message, progress }));
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
    const topic = (JSON.parse(body || '{}').topic || '').trim() || 'a mysterious unexplained signal from space';
    return send(res, 200, await startJob(topic.slice(0, 300)));
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
}).listen(process.env.PORT || 3000, () => console.log(`Open http://localhost:${process.env.PORT || 3000}`));
