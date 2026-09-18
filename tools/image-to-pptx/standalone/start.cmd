@echo off
rem Keep this file ASCII-only: cmd.exe mis-parses batch lines when the active
rem codepage is UTF-8, so the UTF-8 console switch lives in Node instead.
setlocal
cd /d "%~dp0"
node --version >nul 2>nul
if errorlevel 1 (
  echo [image-to-fig-pptx] Node.js not found. Install Node.js 20.19+ from https://nodejs.org
  pause
  exit /b 1
)
node "%~dp0bin\image-to-fig-pptx.cjs" %*
if errorlevel 1 pause
endlocal
