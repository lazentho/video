# Mystery Video Maker

Makes short "things humans still don't know" videos: script, pictures, voice, captions and music, all free.

## How to use (the easy way)
1. On GitHub press **Code > Download ZIP**, then unzip it somewhere (for example your Documents).
2. Open the folder and double-click:
   - **Windows:** `start.bat`
   - **Mac:** `start.command` (the first time: right-click > Open)
3. The first time it installs what it needs (Node.js, ffmpeg, Python, the voices). On Windows it may ask you to close and double-click again once.
4. Your browser opens the app. Pick an idea, press **Use**, then **Make video**.
5. Next time, just double-click **Mystery Video Maker** on your desktop (Windows) or `start.command` again.

Videos are saved in the `output` folder, and you can download them from the app.

**Music:** put your own songs (mp3) in the `music` folder and pick one in the app. Use "Start the song at" to skip the intro.

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
