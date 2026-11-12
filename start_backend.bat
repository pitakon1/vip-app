@echo off
setlocal

rem ============================================================
rem  VIP Rental backend - local development launcher
rem  Starts uvicorn in reload mode through backend\dev_server.py.
rem  (On Windows plain `uvicorn --reload` hangs on restart:
rem   it kills the worker with CTRL_C_EVENT and blocks in join().
rem   dev_server.py keeps --reload but terminates the worker.)
rem  Production: backend/Dockerfile runs uvicorn --workers
rem  (no --reload); never use this script there.
rem ============================================================

cd /d "%~dp0"

set "PY=%~dp0backend\.venv\Scripts\python.exe"
set "ENTRY=%~dp0backend\dev_server.py"
set "LOG=%~dp0backend\logs\uvicorn-dev.log"

if not exist "%PY%" (
    echo [ERROR] virtualenv python not found: %PY%
    echo         create it first: python -m venv .venv ^&^& .venv\Scripts\pip install -r requirements.txt
    exit /b 1
)
if not exist "%ENTRY%" (
    echo [ERROR] dev entry not found: %ENTRY%
    exit /b 1
)

echo [1/3] Stopping ALL old backend processes ^(reloader + worker^)...
rem Kill every python.exe that belongs to this backend:
rem   - uvicorn app.main:app  (reloader / intermediate / worker, any layer)
rem   - dev_server.py         (new entry point)
rem plus their child processes, then anything still LISTENING on 8000.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' }; $t=@($p | Where-Object { $_.CommandLine -match 'app\.main:app' -or $_.CommandLine -match 'dev_server\.py' } | ForEach-Object { $_.ProcessId }); do { $m=@($p | Where-Object { ($t -contains $_.ParentProcessId) -and ($t -notcontains $_.ProcessId) } | ForEach-Object { $_.ProcessId }); $t += $m } while ($m.Count -gt 0); $u=@($t | Sort-Object -Unique); if ($u.Count -eq 0) { Write-Host '  no old backend process found.' } else { $u | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue; Write-Host ('  killed PID ' + $_) } }"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
    echo   killed PID %%a ^(port 8000 holder^)
)

echo [2/3] Waiting for port 8000 to be released...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 15;$i++){ if(-not (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)){ $ok=$true; break }; Start-Sleep -Seconds 1 }; if(-not $ok){ exit 1 }"
if errorlevel 1 (
    echo [ERROR] port 8000 is still in use. Check with: netstat -ano ^| findstr :8000
    exit /b 1
)

echo [3/3] Starting uvicorn in reload mode on http://127.0.0.1:8000
echo       entry: %ENTRY%
echo       log  : %LOG%
echo       docs : http://127.0.0.1:8000/docs
"%PY%" "%ENTRY%"
