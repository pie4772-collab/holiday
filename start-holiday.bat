@echo off
REM Holiday 연차 관리 - 원클릭 서버 실행
REM 기존 서버 종료 후 빌드+실행. 이 창을 닫으면 서버도 종료됩니다.
chcp 65001 >nul
cd /d "%~dp0"
title Holiday 연차 관리 서버
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\restart-prod.ps1"
echo.
echo 서버가 종료되었습니다.
pause
