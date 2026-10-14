@echo off
rem Double-click to start Mystery Video Maker on Windows.
cd /d "%~dp0"
where node >nul 2>nul || (echo Missing Node.js. Install it from https://nodejs.org & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo Missing ffmpeg. Run: winget install --id Gyan.FFmpeg --exact & pause & exit /b 1)
where python >nul 2>nul || (echo Missing Python. Install it from https://www.python.org/downloads/ & pause & exit /b 1)
where edge-tts >nul 2>nul || (echo Installing the free voice... & python -m pip install --user edge-tts)
for /f "delims=" %%i in ('python -c "import site,os;print(os.path.join(site.USER_BASE,'Python'+''.join(__import__('sys').version.split('.')[:2]),'Scripts'))"') do set "PATH=%PATH%;%%i"
for /f "delims=" %%i in ('python -c "import site,os;print(os.path.join(site.USER_BASE,'Scripts'))"') do set "PATH=%PATH%;%%i"
python -c "import kokoro_onnx, soundfile" >nul 2>nul || (echo Installing the offline voice... & python -m pip install --user kokoro-onnx soundfile)
if not exist models\kokoro mkdir models\kokoro
set "BASE=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
if not exist models\kokoro\kokoro-v1.0.int8.onnx (echo Downloading voice model... & curl -L --fail -o models\kokoro\kokoro-v1.0.int8.onnx %BASE%/kokoro-v1.0.int8.onnx)
if not exist models\kokoro\voices-v1.0.bin curl -L --fail -o models\kokoro\voices-v1.0.bin %BASE%/voices-v1.0.bin
node server.js
pause
