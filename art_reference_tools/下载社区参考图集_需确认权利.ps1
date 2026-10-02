param(
  [switch]$IUnderstandSourceRights,
  [string]$OutputDir = "$PSScriptRoot\downloaded_reference"
)
$ErrorActionPreference = 'Stop'
if (-not $IUnderstandSourceRights) {
  throw "本脚本只从公开源仓库下载参考文件。请先核对 LICENSE/README 与你的使用场景；确认后加 -IUnderstandSourceRights。"
}
$manifest = Join-Path $PSScriptRoot '..\community_index\native_asset_files.csv'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Import-Csv $manifest | ForEach-Object {
  $name = Split-Path $_.native_path -Leaf
  $out = Join-Path $OutputDir $name
  Write-Host "Downloading $($_.role) -> $name"
  Invoke-WebRequest -Uri $_.raw_url -OutFile $out
  $size=(Get-Item $out).Length
  if ($size -ne [int64]$_.size_bytes) {
    throw "size mismatch: $name expected=$($_.size_bytes) actual=$size"
  }
}
Write-Host "OK: files saved to $OutputDir"
