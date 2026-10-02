@echo off
setlocal
chcp 65001 >nul
if "%~1"=="" (
  echo 用法: 提取主UI三大道具.cmd ^<14280553b.cc313.png路径^> [输出目录]
  exit /b 2
)
set ATLAS=%~1
set OUT=%~2
if "%OUT%"=="" set OUT=..\_extracted_gameplay_props
python "%~dp0extract_cocos_spriteframes.py" --atlas "%ATLAS%" --manifest "%~dp0..\community_index\gameplay_prop_spriteframes_v09.csv" --out "%OUT%" --rotation ccw --reconstruct-original
endlocal
