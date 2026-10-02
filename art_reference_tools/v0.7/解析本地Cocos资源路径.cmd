@echo off
setlocal
set SCRIPT=%~dp0resolve_local_cocos_resources.py
if "%~1"=="" (
  echo 用法: 解析本地Cocos资源路径.cmd ^<assets\resources目录^> [输出CSV]
  exit /b 1
)
set OUT=%~2
if "%OUT%"=="" set OUT=resolved_resources.csv
py -3 "%SCRIPT%" "%~1" -o "%OUT%"
endlocal
