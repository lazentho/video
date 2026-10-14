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
node server.js
