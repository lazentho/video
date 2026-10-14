"""Offline natural voice with Kokoro (https://github.com/thewh1teagle/kokoro-onnx).
Usage: python3 tools/kokoro_tts.py <model.onnx> <voices.bin> <voice> <text_file> <out.wav>
<voice> is one voice (am_liam) or a blend (am_liam*0.7+am_fenrir*0.3)."""
import sys
import soundfile as sf
from kokoro_onnx import Kokoro

model, voices, voice, text_file, out = sys.argv[1:6]
k = Kokoro(model, voices)
if '*' in voice:
    style = sum(k.get_voice_style(name) * float(w) for name, w in (p.split('*') for p in voice.split('+')))
else:
    style = voice
lang = 'en-gb' if voice.startswith('b') else 'en-us'
samples, rate = k.create(open(text_file, encoding='utf-8').read(), voice=style, speed=1.0, lang=lang)
sf.write(out, samples, rate)
