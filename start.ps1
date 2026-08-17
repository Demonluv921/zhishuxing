<#
.SYNOPSIS
  启动智刷星 Web 服务
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path -LiteralPath $node)) {
  $node = "node"
}

Write-Host "正在启动智刷星..." -ForegroundColor Cyan
& $node (Join-Path $root 'server.js')
