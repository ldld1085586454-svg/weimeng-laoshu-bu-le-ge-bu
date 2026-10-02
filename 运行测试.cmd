@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更高版本。
  pause
  exit /b 1
)
node tools/run-tests.js
set "RESULT=%ERRORLEVEL%"
if "%RESULT%"=="0" (echo 验证或操作完成。) else (echo 执行失败，请查看错误和日志。)
pause
exit /b %RESULT%
