// Step 1: write the script. Uses Claude when ANTHROPIC_API_KEY is set, else a built-in sample.
const SAMPLE = {
  title: 'The Signal Nobody Can Explain',
  scenes: [
    ['In 1977 a telescope in Ohio', 'a big radio telescope dish under a purple night sky'],
    ['picked up a radio signal', 'glowing cyan radio waves reaching a dish'],
    ['from deep space.', 'a glowing purple planet with signal rings'],
    ['It lasted seventy two seconds.', 'a giant stopwatch glowing orange'],
    ['That is a very long time', 'a flipping calendar page'],
    ['for a signal like this.', 'a wavy audio spectrum glowing blue'],
    ['An astronomer saw it on paper,', 'a printout covered in numbers'],
    ['circled it in red,', 'a red marker circling a number sequence'],
    ['and wrote one word. Wow!', 'a red marker scribbling a big circle on paper'],
    ['It came from Sagittarius,', 'a glowing galaxy with a target marker'],
    ['and it never came back.', 'an empty dark void with a tiny fading star'],
    ['So who sent it?', 'a mysterious glowing orange monolith in the dark']
  ].map(([narration, visual], i) => ({ narration, visual, effect: ['flash', 'none', 'pulse', 'none', 'shake', 'none', 'none', 'pulse', 'glitch', 'flash', 'glitch', 'pulse'][i] }))
};

const PROMPT = topic => `You write scripts for 50 to 70 second "mind-blowing facts" videos about things humans have not figured out yet (mysterious signals, unexplained discoveries, open questions in science).

Topic: ${topic}

Rules:
- Only use real, well documented facts. If something is uncertain, say so ("scientists still don't know"). Never invent numbers, dates or quotes.
- Start with a hook that makes people stay. End with an open question or a chill.
- 25 to 35 scenes, about 150 to 180 spoken words in total. Each scene's narration is a short phrase of 3 to 7 words, and read in order the scenes form one flowing narration (a phrase may continue into the next scene). No hashtags, no emojis.
- "visual" names ONE big simple object or icon for the scene (telescope, satellite dish, glowing signal rings, flipping calendar, planet), drawn as a flat cartoon. No text in the image.
- Punchy, playful tone, short words, like a fast TikTok explainer.

- "effect" is the video effect for the scene's first moments, one of: "flash" (bright flash, for reveals), "glitch" (digital glitch, for scary or signal moments), "shake" (camera shake, for impacts), "pulse" (glowing pulse, for waves and energy), "none". Use "none" for about half the scenes.

Reply with ONLY JSON: {"title": string, "scenes": [{"narration": string, "visual": string, "effect": string}]}`;

const EFFECTS = ['flash', 'glitch', 'shake', 'pulse', 'none'];

function parseScript(text) {
  const script = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  if (!Array.isArray(script.scenes) || !script.scenes.length) throw new Error('Script had no scenes');
  for (const sc of script.scenes) if (!EFFECTS.includes(sc.effect)) sc.effect = 'none';
  return script;
}

async function viaClaude(topic, key) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: PROMPT(topic) }]
    })
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  return (await res.json()).content.map(b => b.text || '').join('');
}

// Free option: Google AI Studio key (https://aistudio.google.com/apikey)
async function viaGemini(topic, key) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(topic) }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  return (await res.json()).candidates[0].content.parts.map(p => p.text || '').join('');
}

export async function writeScript(topic) {
  if (process.env.ANTHROPIC_API_KEY) return parseScript(await viaClaude(topic, process.env.ANTHROPIC_API_KEY));
  if (process.env.GEMINI_API_KEY) return parseScript(await viaGemini(topic, process.env.GEMINI_API_KEY));
  return { ...SAMPLE, demo: true };
}
