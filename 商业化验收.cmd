@echo off
cd /d "%~dp0"
node tools/run-tests.js
if errorlevel 1 goto failed
node tools/build-commerce.js
if errorlevel 1 goto failed
echo All local checks passed. This is not real WeChat advertising validation.
pause
exit /b 0
:failed
echo Check failed. See console output.
pause
exit /b 1
