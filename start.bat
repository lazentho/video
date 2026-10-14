@echo off
title Mystery Video Maker
rem Double-click to start Mystery Video Maker on Windows. The first run installs everything it needs.
cd /d "%~dp0"
set NEED_RESTART=0

where node >nul 2>nul || (echo Installing Node.js... & winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements & set NEED_RESTART=1)
where ffmpeg >nul 2>nul || (echo Installing ffmpeg... & winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements & set NEED_RESTART=1)
where python >nul 2>nul || (echo Installing Python... & winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements & set NEED_RESTART=1)
if "%NEED_RESTART%"=="1" (
  echo.
  echo Done installing. Close this window and double-click start.bat again.
  pause
  exit /b 0
)

rem Desktop shortcut, so next time you can start it from your desktop
if not exist "%USERPROFILE%\Desktop\Mystery Video Maker.lnk" powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Mystery Video Maker.lnk');$s.TargetPath='%~dp0start.bat';$s.WorkingDirectory='%~dp0';$s.Save()" >nul 2>nul

where edge-tts >nul 2>nul || (echo Installing the online voice... & python -m pip install --user -q edge-tts)
python -c "import kokoro_onnx, soundfile" >nul 2>nul || (echo Installing the offline voice... & python -m pip install --user -q kokoro-onnx soundfile)
for /f "delims=" %%i in ('python -c "import site,os;print(os.path.join(site.USER_BASE,'Scripts'))"') do set "PATH=%PATH%;%%i"
for /f "delims=" %%i in ('python -c "import site,os,sys;print(os.path.join(site.USER_BASE,'Python%%d%%d' %% sys.version_info[:2],'Scripts'))"') do set "PATH=%PATH%;%%i"

if not exist models\kokoro mkdir models\kokoro
set "BASE=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
if not exist models\kokoro\kokoro-v1.0.int8.onnx (echo Downloading the voice model, about 90 MB... & curl -L --fail -o models\kokoro\kokoro-v1.0.int8.onnx %BASE%/kokoro-v1.0.int8.onnx)
if not exist models\kokoro\voices-v1.0.bin (echo Downloading voices... & curl -L --fail -o models\kokoro\voices-v1.0.bin %BASE%/voices-v1.0.bin)

echo.
echo Starting Mystery Video Maker. Your browser will open. Keep this window open while you use it.
node server.js
pause
