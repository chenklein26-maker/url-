@echo off
chcp 65001 >nul 2>&1
title Article Flow Desktop Starter

echo ============================================
echo       Article Flow Desktop Starter
echo ============================================
echo.

REM Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found. Please install: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Install deps on first run
if not exist "node_modules" (
    echo [INFO] First run, installing dependencies via npm install...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed. Please check network or npm registry.
        echo.
        pause
        exit /b 1
    )
    echo [INFO] Dependencies installed.
)

echo.
echo [INFO] Starting Article Flow desktop app...
echo [INFO] This will open the Electron window.
echo.

call npm run start

echo.
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Electron app exited with an error.
    echo [TIP] Common causes: missing dependencies, Electron install issues, or environment issues.
    echo.
)
echo [INFO] App exited. Press any key to close this window...
pause >nul

