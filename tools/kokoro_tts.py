"""Offline natural voice with Kokoro (https://github.com/thewh1teagle/kokoro-onnx).
Usage: python3 tools/kokoro_tts.py <model.onnx> <voices.bin> <voice> <text_file> <out.wav>"""
import sys
import soundfile as sf
from kokoro_onnx import Kokoro

model, voices, voice, text_file, out = sys.argv[1:6]
text = open(text_file, encoding="utf-8").read()
samples, rate = Kokoro(model, voices).create(text, voice=voice, speed=1.05, lang="en-us")
sf.write(out, samples, rate)
