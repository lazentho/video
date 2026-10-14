#!/usr/bin/env bash
# Double-click (or run ./start.sh) to start Mystery Video Maker.
cd "$(dirname "$0")"
# Install what's missing (Mac: Homebrew, Linux: apt)
need=""
for tool in node ffmpeg python3; do command -v "$tool" >/dev/null 2>&1 || need="$need $tool"; done
if [ -n "$need" ]; then
  if command -v brew >/dev/null 2>&1; then
    echo "Installing:$need"
    brew install $(echo "$need" | sed 's/python3/python/')
  elif command -v apt-get >/dev/null 2>&1; then
    echo "Installing:$need (may ask for your password)"
    sudo apt-get install -y $(echo "$need" | sed 's/node/nodejs/') python3-pip
  else
    echo "Missing:$need"
    echo "Mac: install Homebrew first (https://brew.sh), then double-click this file again."
    read -r -p "Press Enter to close." _
    exit 1
  fi
fi
if ! command -v edge-tts >/dev/null 2>&1; then
  echo "Installing the free voice (edge-tts)..."
  python3 -m pip install --user edge-tts || python3 -m pip install --user --break-system-packages edge-tts
  export PATH="$PATH:$HOME/.local/bin:$(python3 -m site --user-base)/bin"
fi
# Offline natural voice (Kokoro): about 120 MB, downloaded once.
if ! python3 -c "import kokoro_onnx, soundfile" >/dev/null 2>&1; then
  echo "Installing the offline voice (Kokoro)..."
  python3 -m pip install --user kokoro-onnx soundfile || python3 -m pip install --user --break-system-packages kokoro-onnx soundfile
fi
mkdir -p models/kokoro
base=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  [ -s "models/kokoro/$f" ] || { echo "Downloading $f..."; curl -L --fail -o "models/kokoro/$f" "$base/$f" || rm -f "models/kokoro/$f"; }
done
node server.js
