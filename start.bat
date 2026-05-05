@echo off
title Stockman
echo.
echo  ==========================================
echo    STOCKMAN - Personal Portfolio Tracker
echo  ==========================================
echo.

cd /d "%~dp0"

REM Setup venv if missing
if not exist "backend\venv\Scripts\python.exe" (
    echo Setting up Python environment - please wait...
    python -m venv backend\venv
    backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies.
        pause
        exit /b 1
    )
)

REM Always rebuild frontend to pick up latest changes
echo Building frontend - please wait...
cd frontend
call npm install --silent
call npm run build --silent
cd ..

echo.
echo  Starting Stockman on http://localhost:8888
echo  Keep this window open while using the app.
echo  Press Ctrl+C to stop.
echo.

REM Open browser after short delay
start "" cmd /c "timeout /t 2 >nul && start http://localhost:8888"

REM Start backend using venv python directly (no activation needed)
backend\venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8888

pause
