# Mystery Video Maker

Type a topic (or leave it empty) and get a short vertical video about things humans haven't figured out yet, like the Wow! signal.

## Run
    cp .env.example .env   # add keys (optional)
    npm start              # then open http://localhost:3000

Needs Node 20+ and ffmpeg.

## How it works
1. `lib/script.js`: Claude writes a 5-7 scene script (facts only, hook first, open question at the end)
2. `lib/media.js`: an image and a voiceover per scene (OpenAI), or offline demo fallbacks with no keys
3. `lib/render.js`: ffmpeg adds slow zoom and big captions, then joins the scenes into an MP4

Without API keys it runs in demo mode with a sample script and star-field visuals.
