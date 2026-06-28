$ErrorActionPreference = "Stop"

$backendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$jdkDir = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
$nodeDir = "C:\nvm4w\nodejs"

if (-not (Test-Path (Join-Path $jdkDir "bin\java.exe"))) {
  throw "JDK 17 not found at $jdkDir"
}

if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
  throw "Node.js not found at $nodeDir"
}

$env:JAVA_HOME = $jdkDir
$env:PATH = "$jdkDir\bin;$nodeDir;$env:PATH"

$existing = Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue
if ($existing) {
  $existing | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
}

Set-Location $backendDir
& (Join-Path $nodeDir "node.exe") "server.mjs"
