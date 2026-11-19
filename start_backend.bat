@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem ============================================================
rem  VIP Rental - local development launcher (three-in-one)
rem  Spawns three independent cmd windows:
rem   [1] backend       dev_server.py (uvicorn --reload)  :8000
rem   [2] frontend-web  vite dev                          :3000
rem   [3] mobile-app    Expo Metro (CI=1)                 :8081
rem
rem  Before start, anything LISTENING on 8000 / 3000 / 8081
rem  is killed so each service owns its port.
rem
rem  IMPORTANT (do not "fix" this by rewriting the file):
rem   - This file MUST use CRLF line endings and ASCII only.
rem     cmd.exe does not parse LF-only batch files reliably: it
rem     merges lines and then tries to execute comment text as
rem     commands (e.g. "'uvicorn' is not recognized"). Non-ASCII
rem     comments also break under the default OEM codepage.
rem   - Expo 52 ignores --non-interactive, use CI=1 instead.
rem   - Keep it exactly "set CI=1&&" (no space before &&):
rem     "set CI=1 &&" sets CI to "1 " and Expo throws NoBoolean.
rem   - Sub-services use "start TITLE /D DIR cmd /k 'cmd'" so the
rem     working dir is set before the relative command runs.
rem ============================================================

cd /d "%~dp0"
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo [0/4] Killing old listeners on ports 8000 / 3000 / 8081 ...
set "KILLED="
for %%p in (8000 3000 8081) do (
    rem netstat lists the same PID twice for IPv4 and IPv6 listeners; dedupe
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%%p .*LISTENING"') do (
        if not "%%a"=="0" if not "%%a"=="4" if not "%%a"=="!KILLED!" (
            set "KILLED=%%a"
            taskkill /PID %%a /T /F >nul 2>&1
            echo   killed PID %%a ^(port %%p^)
        )
    )
)

rem Kill leftover backend python processes (dev_server.py / app.main:app)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -match 'dev_server\.py|app\.main:app' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

rem ------------------------------------------------------------
rem [1] Backend - cd to backend/ then run the venv python
rem ------------------------------------------------------------
echo [1/4] Starting backend on http://127.0.0.1:8000
if not exist "%ROOT%\backend\.venv\Scripts\python.exe" (
    echo   [SKIP] venv python not found: %ROOT%\backend\.venv\Scripts\python.exe
) else if not exist "%ROOT%\backend\dev_server.py" (
    echo   [SKIP] dev_server.py not found
) else (
    start "VIP-Backend" /D "%ROOT%\backend" cmd /k ""%ROOT%\backend\.venv\Scripts\python.exe" "%ROOT%\backend\dev_server.py""
)

rem ------------------------------------------------------------
rem [2] Frontend Web (Vite)
rem ------------------------------------------------------------
echo [2/4] Starting frontend-web on http://localhost:3000
if not exist "%ROOT%\frontend-web\node_modules" (
    echo   [SKIP] frontend-web\node_modules missing - run npm install first
) else (
    start "VIP-FrontendWeb" /D "%ROOT%\frontend-web" cmd /k "npm.cmd run dev"
)

rem ------------------------------------------------------------
rem [3] Mobile App (Expo Metro)
rem ------------------------------------------------------------
echo [3/4] Starting mobile-app (Expo Metro) on http://localhost:8081
if not exist "%ROOT%\mobile-app\node_modules" (
    echo   [SKIP] mobile-app\node_modules missing - run npm install first
) else (
    start "VIP-MobileApp" /D "%ROOT%\mobile-app" cmd /k "set CI=1&& npx.cmd expo start"
)

echo [4/4] Done. Three new command windows should open:
echo       VIP-Backend       http://127.0.0.1:8000    docs /docs
echo       VIP-FrontendWeb   http://localhost:3000
echo       VIP-MobileApp     http://localhost:8081
echo.
echo       Close any window to stop that service.
echo.

rem ------------------------------------------------------------
rem Backend smoke check (max ~20s), so a failed start is visible
rem ------------------------------------------------------------
echo Waiting for backend /health (max 20s) ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 20;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2; Write-Host ('  backend health: HTTP ' + [int]$r.StatusCode); $ok=$true; break } catch { Start-Sleep -Seconds 1 } }; if(-not $ok){ Write-Host '  [WARN] backend did not answer http://127.0.0.1:8000/health in 20s.'; Write-Host '         Check the VIP-Backend window and backend\logs\uvicorn-dev.log' }"

endlocal
