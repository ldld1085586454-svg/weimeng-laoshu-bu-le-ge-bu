@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或以上版本。
  pause
  exit /b 1
)
echo 浏览器打开 http://127.0.0.1:8791/
node tools\serve-integration.js
pause
