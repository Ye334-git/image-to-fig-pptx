@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo [image-to-pptx] Node.js not found in PATH. Install Node.js 20.19+ & pause & exit /b 1)
node "%~dp0bin\image-to-pptx.cjs" %*
if errorlevel 1 pause
endlocal
