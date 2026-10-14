// Video ideas, kept in ideas.json so you can read, edit or back them up.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { askAI } from './script.js';

const FILE = process.env.IDEAS_FILE || 'ideas.json';

// Used when no AI key is set yet: real, well documented open mysteries.
const STARTERS = [
  ['The Wow! Signal', 'A 72-second radio signal from 1977 that was never heard again'],
  ['Fast Radio Bursts', 'Millisecond flashes from distant galaxies, some of which repeat'],
  ["Tabby's Star", 'A star that dims by up to 22 percent in ways nobody predicted'],
  ["'Oumuamua", 'The first known interstellar object sped up as it left the Sun'],
  ['The Voynich Manuscript', 'A 600-year-old book in a writing system nobody can read'],
  ['The Antikythera Mechanism', 'A 2,000-year-old Greek gear computer that tracked the sky'],
  ['The Great Attractor', 'Something hidden behind our galaxy is pulling us toward it'],
  ['Dark Matter', 'Most of the matter in the universe is invisible and we do not know what it is'],
  ['The Hessdalen Lights', 'Glowing lights over a Norwegian valley that scientists still study'],
  ['Ball Lightning', 'Floating glowing spheres in storms that are almost impossible to study']
];

const PROMPT = (count, theme, existing) => `Suggest ${count} ideas for 60-second "mind-blowing facts" explainer videos about things humans still have not figured out.
${theme ? `Theme: ${theme}\n` : ''}Each must be a real, well documented mystery or open question (no hoaxes, no conspiracy theories, nothing already solved).
Do not repeat these: ${existing.join('; ') || 'none'}.

Reply with ONLY JSON: {"ideas": [{"title": string (2-6 words), "hook": string (one sentence that would stop someone scrolling)}]}`;

// Ideas with full scripts written ahead of time (no AI key needed to make these).
const LIBRARY = new URL('../library/ideas.json', import.meta.url);

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return []; }
}

// Your ideas.json plus the library. Library text always comes from the library file,
// your progress (made, deleted) comes from ideas.json.
export async function loadIdeas() {
  const mine = await readJson(FILE);
  const lib = await readJson(LIBRARY);
  const byId = new Map(mine.map(i => [i.id, i]));
  const merged = mine.map(i => {
    const l = lib.find(x => x.id === i.id);
    return l ? { ...i, ...l, status: i.status, video: i.video, hidden: i.hidden } : i;
  });
  for (const l of lib) if (!byId.has(l.id)) merged.unshift({ ...l, createdAt: '2026-10-14T00:00:00.000Z' });
  return merged;
}

export const visible = ideas => ideas.filter(i => !i.hidden);

async function saveIdeas(ideas) {
  await fs.writeFile(FILE, JSON.stringify(ideas, null, 2) + '\n');
  return ideas;
}

const make = (title, hook = '', source = 'you') => ({
  id: crypto.randomBytes(4).toString('hex'), title: title.slice(0, 120), hook: hook.slice(0, 300),
  source, status: 'new', createdAt: new Date().toISOString()
});

export async function generateIdeas({ count = 10, theme = '' } = {}) {
  const ideas = await loadIdeas();
  const existing = ideas.map(i => i.title);
  const text = await askAI(PROMPT(Math.min(Math.max(+count || 10, 1), 30), theme.slice(0, 200), existing));
  let fresh;
  if (text) {
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    fresh = (json.ideas || []).filter(i => i && i.title).map(i => make(String(i.title), String(i.hook || ''), 'ai'));
  } else {
    fresh = STARTERS.filter(([t]) => !existing.includes(t)).map(([t, h]) => make(t, h, 'starter'));
  }
  return saveIdeas([...ideas, ...fresh]);
}

export async function addIdea(title, hook) {
  return saveIdeas([...(await loadIdeas()), make(title, hook)]);
}

export async function updateIdea(id, changes) {
  const ideas = await loadIdeas();
  const idea = ideas.find(i => i.id === id);
  if (idea) Object.assign(idea, changes);
  return saveIdeas(ideas);
}

export async function deleteIdea(id) {
  const ideas = await loadIdeas();
  // Library ideas are hidden rather than removed, so they don't come back on the next load.
  return saveIdeas(id.startsWith('lib-') ? ideas.map(i => i.id === id ? { ...i, hidden: true } : i) : ideas.filter(i => i.id !== id));
}
