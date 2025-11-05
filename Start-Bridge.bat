@echo off
setlocal EnableExtensions EnableDelayedExpansion
title TRAE-Ollama-Bridge
cd /d "%~dp0"

rem Use UTF-8 code page to avoid garbled output
chcp 65001 >nul

echo [TRAE] Checking dependencies...
if not exist "node_modules" (
  echo First run detected. Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed. Please verify your Node.js/npm setup.
    pause
    exit /b 1
  )
)

rem Load PORT and HTTPS_ENABLED from .env if present
if exist ".env" (
  for /f "usebackq tokens=1* delims==" %%A in (".env") do (
    if /I "%%~A"=="PORT" set PORT=%%~B
    if /I "%%~A"=="HTTPS_ENABLED" set HTTPS_ENABLED=%%~B
  )
)

if "%PORT%"=="" set PORT=3000
if "%HTTPS_ENABLED%"=="" set HTTPS_ENABLED=false

echo [TRAE] Starting bridge service: PORT=%PORT% HTTPS_ENABLED=%HTTPS_ENABLED%
set "SCHEME=http"
if /I "%HTTPS_ENABLED%"=="true" set "SCHEME=https"

start "" %SCHEME%://localhost:%PORT%/
node server.js

endlocal