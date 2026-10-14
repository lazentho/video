"""Offline natural voice with Kokoro (https://github.com/thewh1teagle/kokoro-onnx), with word timings.

Usage: python3 tools/kokoro_tts.py <model.onnx> <voices.bin> <voice> <scenes.json> <out.wav> <words.json>
  <voice>       one voice (am_liam) or a blend (am_liam*0.7+am_fenrir*0.3)
  <scenes.json> list of narration strings, one per scene
  <words.json>  written: [{"w": word, "scene": i, "start": sec, "end": sec}, ...]

Each sentence is spoken separately with a natural pause after it,
so every sentence starts exactly where we say it does.
Inside a sentence, word boundaries are placed by phoneme count and then snapped to the
quietest moment nearby in the audio, which lines captions up with the voice.
"""
import json
import re
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

SPEED = 1.0          # natural pace; the pauses between sentences give it room to breathe
# Breathing room after a sentence and after a question (seconds)
GAP_SENTENCE, GAP_QUESTION = 0.55, 0.7
SNAP = 0.14          # how far a word boundary may move to find a quiet spot, seconds

model, voices, voice, scenes_file, out_wav, out_words = sys.argv[1:7]
k = Kokoro(model, voices)
style = (sum(k.get_voice_style(n) * float(w) for n, w in (p.split('*') for p in voice.split('+')))
         if '*' in voice else voice)
lang = 'en-gb' if voice.startswith('b') else 'en-us'

scenes = json.load(open(scenes_file, encoding='utf-8'))
words = [(w, i) for i, text in enumerate(scenes) for w in text.split()]

# Group words into sentences; Kokoro pauses naturally at commas, we add a breath between sentences
sentences, gaps, cur = [], [], []
for item in words:
    cur.append(item)
    end = re.search(r'([.!?])["\')]*$', item[0])
    if end:
        sentences.append(cur)
        gaps.append(GAP_QUESTION if end.group(1) == '?' else GAP_SENTENCE)
        cur = []
if cur:
    sentences.append(cur)
    gaps.append(GAP_SENTENCE)


def envelope(audio, rate, win=0.02, hop=0.005):
    w, h = int(win * rate), int(hop * rate)
    frames = [np.sqrt(np.mean(audio[i:i + w] ** 2)) for i in range(0, max(1, len(audio) - w), h)]
    return np.array(frames), hop


def weight(word):
    clean = re.sub(r'[^\w\'-]', '', word)
    phon = re.sub(r'[ˈˌ ]', '', k.tokenizer.phonemize(clean, lang)) if clean else ''
    pause = 0
    return max(2, len(phon)) + pause


out, timings, t = [], [], 0.0
rate = 24000
for sent, gap in zip(sentences, gaps):
    text = ' '.join(w for w, _ in sent)
    audio, rate = k.create(text, voice=style, speed=SPEED, lang=lang)
    env, hop = envelope(audio, rate)
    loud = np.where(env > max(env.max() * 0.04, 1e-4))[0]
    s0 = max(0, loud[0] * hop - 0.03) if len(loud) else 0
    s1 = min(len(audio) / rate, loud[-1] * hop + 0.12) if len(loud) else len(audio) / rate
    audio = audio[int(s0 * rate):int(s1 * rate)]
    env, hop = envelope(audio, rate)
    speech_end = len(audio) / rate - 0.09

    # Estimated boundaries by phoneme weight, then snapped to the quietest nearby frame
    ws = [weight(w) for w, _ in sent]
    total = sum(ws)
    bounds, acc = [0.03], 0
    for x in ws[:-1]:
        acc += x
        est = 0.03 + (speech_end - 0.03) * acc / total
        lo, hi = int((est - SNAP) / hop), int((est + SNAP) / hop)
        lo, hi = max(lo, int((bounds[-1] + 0.08) / hop)), min(hi, len(env) - 1)
        snapped = (lo + int(np.argmin(env[lo:hi + 1]))) * hop if hi > lo else est
        bounds.append(max(snapped, bounds[-1] + 0.08))
    bounds.append(max(speech_end, bounds[-1] + 0.08))

    for j, (w, scene) in enumerate(sent):
        timings.append({'w': w, 'scene': scene, 'start': round(t + bounds[j], 3), 'end': round(t + bounds[j + 1], 3)})
    out.append(audio)
    out.append(np.zeros(int(gap * rate), dtype=audio.dtype))
    t += len(audio) / rate + gap

sf.write(out_wav, np.concatenate(out), rate)
json.dump(timings, open(out_words, 'w', encoding='utf-8'), indent=1)
