# DB 사본으로 전자결재·증명서·퇴사자 연차 수정 시나리오를 검증합니다.
#   powershell -File scripts/run-verify-documents.ps1 [-Driver node|sqljs|postgres]
#   postgres는 -PgUrl 데이터베이스를 비운 뒤 SQLite 사본을 자동 이전하고 검증합니다.
param(
  [string]$Driver = 'node',
  [string]$SourceDb = 'database/holiday.db',
  [string]$PgUrl = 'postgres://holiday:holiday@127.0.0.1:54329/holiday'
)

$ErrorActionPreference = 'Stop'
$work = Join-Path $env:TEMP 'holiday-verify-documents'
New-Item -ItemType Directory -Force $work | Out-Null
$db = Join-Path $work 'verify.db'
Remove-Item "$db*" -Force -ErrorAction SilentlyContinue
Copy-Item $SourceDb $db

$env:DB_PATH = $db
$env:SECRET_KEY_FILE = Join-Path $work 'secret.key'
$env:VERIFY_ON_COPY = '1'
Remove-Item Env:DB_DRIVER -ErrorAction SilentlyContinue
if ($Driver -eq 'sqljs') { $env:DB_DRIVER = 'sqljs' }
if ($Driver -eq 'postgres') {
  $env:APP_DB_CLIENT = 'postgres'
  $env:DATABASE_URL = $PgUrl
  node -e "const pg=require('pg');const c=new pg.Client(process.env.DATABASE_URL);c.connect().then(()=>c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')).then(()=>c.end()).catch(e=>{console.error(e.message);process.exit(1)})"
  if ($LASTEXITCODE -ne 0) { throw 'postgres reset failed' }
} else {
  Remove-Item Env:APP_DB_CLIENT -ErrorAction SilentlyContinue
  Remove-Item Env:DB_CLIENT -ErrorAction SilentlyContinue
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}

try {
  node scripts/verify-documents-certificates.mjs
  if ($LASTEXITCODE -ne 0) { throw 'verification failed' }
} finally {
  Remove-Item Env:VERIFY_ON_COPY -ErrorAction SilentlyContinue
}
