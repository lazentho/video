# Mystery Video Maker

Type a topic (or leave it empty) and get a short vertical video about things humans haven't figured out yet, like the Wow! signal.

## Start it
1. Install [Node.js](https://nodejs.org), [Python](https://www.python.org/downloads/) and ffmpeg (Windows: `winget install --id Gyan.FFmpeg --exact`, Mac: `brew install ffmpeg`).
2. Double-click the start file: `start.bat` (Windows), `start.command` (Mac) or `start.sh` (Linux).
3. Your browser opens the app. If anything is missing, the Setup box tells you what to do.

## Ideas
- `library/ideas.json`: ideas with full scripts written by Claude. These make videos with no AI key at all.
- `ideas.json`: your own ideas and AI-generated ones, plus which ones you already made. Edit it by hand if you like.
- Each video folder in `output/` also gets a `script.json`.

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
