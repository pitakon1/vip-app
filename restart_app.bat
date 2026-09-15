@echo off
setlocal enabledelayedexpansion

rem ============================================================
rem  VIP Rental App frontend one-click start / restart
rem  Full chain covered:
rem    0) locate adb / emulator
rem    1) detect running emulator (reuse if online)
rem    2) stop old Metro on port 8081
rem    3) start Metro (Expo dev server, port 8081)
rem    4) boot Android emulator (AVD: vip_rental)
rem    5) wait until device fully boots (sys.boot_completed)
rem    6) adb reverse 8081/8000 and open Expo Go
rem ============================================================

cd /d "%~dp0"

set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
set "EMU=%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe"
set "EXPO_URL=exp://127.0.0.1:8081"

echo.
echo === VIP Rental App frontend launcher ===
echo.

rem ------- 0) environment check -------
echo [0/6] Checking environment...
if not exist "%ADB%" (
    echo   [ERROR] adb not found: %ADB%
    echo           Install Android SDK platform-tools first.
    goto :fail
)
if not exist "%EMU%" (
    echo   [ERROR] emulator not found: %EMU%
    echo           Install Android SDK emulator first.
    goto :fail
)
echo   adb / emulator found.

rem ------- 1) detect running emulator -------
echo [1/6] Checking emulator state...
"%ADB%" devices | findstr /R "emulator-[0-9]" >nul 2>&1
if not errorlevel 1 (
    echo   Emulator online, reusing it.
    goto :ports
)
echo   No emulator running, booting one now.

rem ------- 2) stop old Metro on 8081 -------
echo [2/6] Stopping old Metro if any...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8081" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
    echo   Killed PID %%a
)
timeout /t 1 /nobreak >nul

rem ------- 3) start Metro -------
echo [3/6] Starting Metro on http://localhost:8081 ...
start "VIP-Metro" cmd /k "cd /d ""%~dp0mobile-app"" && npx expo start --port 8081"
timeout /t 6 /nobreak >nul

rem ------- 4) boot emulator -------
echo [4/6] Booting Android emulator (vip_rental) ...
"%EMU%" -avd vip_rental -no-snapshot-load >nul 2>&1

rem ------- 5) wait for full boot -------
echo [5/6] Waiting for device boot (first boot may take 1-2 min)...
"%ADB%" wait-for-device
:wait_boot
set "BOOT="
for /f "delims=" %%b in ('"%ADB%" shell getprop sys.boot_completed 2^>nul') do set "BOOT=%%b"
if not "!BOOT!"=="1" (
    timeout /t 3 /nobreak >nul
    goto wait_boot
)
echo   Device ready.

:ports
rem ------- 6) port reverse + open app -------
echo [6/6] Setting up adb reverse and opening App...
"%ADB%" reverse tcp:8081 tcp:8081
"%ADB%" reverse tcp:8000 tcp:8000
"%ADB%" shell am start -a android.intent.action.VIEW -d "%EXPO_URL%" >nul 2>&1

echo.
echo Done. App will open in Expo Go after Metro finishes bundling.
echo.
echo Tips:
echo   - In the "VIP-Metro" window: press r to reload, m for dev menu
echo   - Rerun this script anytime; it reuses an online emulator
echo.
pause
exit /b 0

:fail
echo.
echo Setup failed. Fix the issue above and rerun.
pause
exit /b 1