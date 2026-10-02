param(
  [Parameter(Mandatory=$true)][string]$DownloadedDir,
  [Parameter(Mandatory=$true)][string]$V012Root
)
$ErrorActionPreference = 'Stop'
$py='python'
$tool=Join-Path $PSScriptRoot 'extract_cocos_spriteframes.py'
$manifest=Join-Path $PSScriptRoot '..\community_index\block_spriteframes_full.csv'
$atlas=Join-Path $DownloadedDir '1bb1ee4cb.e456b.png'
if (!(Test-Path $atlas)) { throw "missing block atlas: $atlas" }
$cards=Join-Path $V012Root 'assets\art\cards'
New-Item -ItemType Directory -Force -Path $cards | Out-Null
& $py $tool --atlas $atlas --manifest $manifest --out $cards --reconstruct-original
if ($LASTEXITCODE -ne 0) { throw 'card extraction failed' }
$wechat=Join-Path $V012Root 'wechat_full\assets\art\cards'
New-Item -ItemType Directory -Force -Path $wechat | Out-Null
Copy-Item (Join-Path $cards '*.png') $wechat -Force
Write-Host "OK: block_bg + block_1..16 extracted to v0.12 art paths"
