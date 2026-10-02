@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或以上版本。
  pause
  exit /b 1
)
node tools\start-full.js
if errorlevel 1 (
  echo 执行未通过，请保留上面的错误信息。
  pause
  exit /b 1
)
pause
