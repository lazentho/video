# Mystery Video Maker

Type a topic (or leave it empty) and get a short vertical video about things humans haven't figured out yet, like the Wow! signal.

## Run
    cp .env.example .env   # optional, add a free Gemini key
    pip install edge-tts   # free voice
    npm start              # then open http://localhost:3000

Needs Node 20+, ffmpeg and Python (for edge-tts).

## Free AI mode (default, no paid keys)
| Part | Used |
|---|---|
| Script and scene effects | Gemini free key (https://aistudio.google.com/apikey), set `GEMINI_API_KEY` |
| Images | Pollinations.ai, no key. If it is down, scenes fall back to neon rings |
| Voice | edge-tts, falls back to espeak or silence |

Add `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` to upgrade scripts, images and voice. They are used automatically when set.

## How it works
1. `lib/script.js`: the AI writes 25-35 short scenes, each with a picture idea and an effect (flash, glitch, shake, pulse)
2. `lib/media.js`: one voiceover plus an AI image per scene
3. `lib/render.js`: ffmpeg adds camera moves, the effect and big one-word captions, then joins everything into an MP4

With no keys at all it runs a demo with a sample script and neon rings.
