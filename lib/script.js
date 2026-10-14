// Step 1: write the script. Uses Claude when ANTHROPIC_API_KEY is set, else a built-in sample.
const SAMPLE = {
  title: 'The Signal Nobody Can Explain',
  scenes: [
    { narration: 'In 1977, a telescope in Ohio caught a radio signal from deep space.', visual: 'a giant radio telescope under a starry night sky' },
    { narration: 'It lasted seventy two seconds, and it was thirty times louder than the background of space.', visual: 'a glowing radio waveform spike over a dark void' },
    { narration: 'An astronomer circled it on the printout and wrote one word: Wow.', visual: 'a printout of numbers with a red circle around a sequence' },
    { narration: 'It came from the direction of Sagittarius, and it has never been heard again.', visual: 'the constellation Sagittarius glowing in the Milky Way' },
    { narration: 'Nearly fifty years later, we still do not know who, or what, sent it.', visual: 'a lone figure looking up at an enormous galaxy' }
  ]
};

const PROMPT = topic => `You write scripts for 30 to 45 second vertical "mind-blowing facts" videos about things humans have not figured out yet (mysterious signals, unexplained discoveries, open questions in science).

Topic: ${topic}

Rules:
- Only use real, well documented facts. If something is uncertain, say so ("scientists still don't know"). Never invent numbers, dates or quotes.
- Start with a hook that makes people stay. End with an open question or a chill.
- 5 to 7 scenes. Each narration is one or two short spoken sentences. No hashtags, no emojis.
- "visual" describes one striking image for the scene (no text in the image).

Reply with ONLY JSON: {"title": string, "scenes": [{"narration": string, "visual": string}]}`;

export async function writeScript(topic) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ...SAMPLE, demo: true };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: PROMPT(topic) }]
    })
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const text = (await res.json()).content.map(b => b.text || '').join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const script = JSON.parse(json);
  if (!Array.isArray(script.scenes) || !script.scenes.length) throw new Error('Script had no scenes');
  return script;
}
