# Holiday 프로덕션 서버 재시작
# - 3001 포트 사용 중인 기존 프로세스 종료
# - npm run prod (빌드 + 서버 시작)
# 사용: npm run restart  또는 start-holiday.bat
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

$lines = netstat -ano | Select-String ":3001.*LISTENING"
foreach ($line in $lines) {
  $procId = ($line.ToString().Trim() -split "\s+")[-1]
  if ($procId -match "^\d+$") {
    Write-Host "기존 서버 종료 (PID $procId)..."
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}

if ($lines) {
  Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "Holiday 서버 시작 (빌드 + 실행)..."
Write-Host "이 창을 닫으면 서버가 종료됩니다."
Write-Host ""
npm run prod
