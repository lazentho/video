import { writeScript } from '../lib/script.js';
import { renderVideo } from '../lib/render.js';
const script = await writeScript('test');
const out = await renderVideo(script, 'output/smoke', (m, p) => console.log(Math.round(p * 100) + '%', m));
console.log('wrote', out);
