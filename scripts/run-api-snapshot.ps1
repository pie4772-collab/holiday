# DB 사본으로 서버를 띄워 API 스냅샷을 녹화합니다.
#   powershell -File scripts/run-api-snapshot.ps1 -Out before.json [-Driver sqljs|node|postgres]
#   postgres는 -PgUrl 데이터베이스를 비운 뒤 시작하므로, 서버가 SQLite 사본을 자동 이전하는 과정까지 검증합니다.
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Driver = 'node',
  [string]$SourceDb = 'database/holiday.db',
  [string]$AdminUser = '2022019',
  [int]$Port = 3999,
  [string]$PgUrl = 'postgres://holiday:holiday@127.0.0.1:54329/holiday'
)

$ErrorActionPreference = 'Stop'
$work = Join-Path $env:TEMP 'holiday-api-snapshot'
New-Item -ItemType Directory -Force $work | Out-Null
$db = Join-Path $work 'snapshot.db'
Remove-Item "$db*" -Force -ErrorAction SilentlyContinue
Copy-Item $SourceDb $db

$env:DB_PATH = $db
$env:PORT = "$Port"
$env:SERVE_STATIC = 'false'
Remove-Item Env:DB_DRIVER -ErrorAction SilentlyContinue
if ($Driver -eq 'sqljs') { $env:DB_DRIVER = 'sqljs' }
if ($Driver -eq 'postgres') {
  $env:DB_CLIENT = 'postgres'
  $env:DATABASE_URL = $PgUrl
  node -e "const pg=require('pg');const c=new pg.Client(process.env.DATABASE_URL);c.connect().then(()=>c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')).then(()=>c.end()).catch(e=>{console.error(e.message);process.exit(1)})"
  if ($LASTEXITCODE -ne 0) { throw 'postgres reset failed' }
} else {
  Remove-Item Env:DB_CLIENT -ErrorAction SilentlyContinue
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}

$server = Start-Process node -ArgumentList 'server/index.js' -PassThru -NoNewWindow `
  -RedirectStandardOutput (Join-Path $work 'server.log') -RedirectStandardError (Join-Path $work 'server.err')
try {
  $up = $false
  for ($i = 0; $i -lt 90; $i++) {
    try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/health" -TimeoutSec 2 | Out-Null; $up = $true; break } catch { Start-Sleep 1 }
  }
  if (-not $up) { Get-Content (Join-Path $work 'server.err'); throw 'server did not start' }
  $env:BASE = "http://127.0.0.1:$Port"
  $env:ADMIN_USER = $AdminUser
  node scripts/api-snapshot.mjs $Out
  if ($LASTEXITCODE -ne 0) { throw 'snapshot failed' }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  $err = Get-Content (Join-Path $work 'server.err') -ErrorAction SilentlyContinue
  if ($err) { Write-Host '--- server stderr'; $err | Select-Object -Last 20 }
}
