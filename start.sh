#!/usr/bin/env bash
# Double-click (or run ./start.sh) to start Mystery Video Maker.
cd "$(dirname "$0")"
missing=0
for tool in node ffmpeg python3; do
  if ! command -v "$tool" >/dev/null 2>&1; then echo "Missing: $tool"; missing=1; fi
done
if [ "$missing" = 1 ]; then
  echo
  echo "Install the missing tools first:"
  echo "  Mac:   install Homebrew (https://brew.sh), then: brew install node ffmpeg python"
  echo "  Linux: sudo apt install nodejs ffmpeg python3 python3-pip"
  read -r -p "Press Enter to close." _
  exit 1
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
for f in kokoro-v1.0.int8.onnx voices-v1.0.bin; do
  [ -s "models/kokoro/$f" ] || { echo "Downloading $f..."; curl -L --fail -o "models/kokoro/$f" "$base/$f" || rm -f "models/kokoro/$f"; }
done
node server.js
