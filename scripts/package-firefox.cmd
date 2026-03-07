@echo off
setlocal

cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package.ps1" -Target firefox
if errorlevel 1 (
  echo.
  echo Packaging for Firefox failed.
  pause
  exit /b 1
)

echo.
echo Packaging for Firefox finished.
pause
