@echo off
rem ============================================================================
rem  harden-addins-acl.cmd - launcher for harden-addins-acl.ps1
rem
rem  Why this is a separate .ps1 (2026-11-01): the first version did the work in
rem  cmd and self-elevated with
rem      powershell ... Start-Process -FilePath '%~f0' -ArgumentList '%~1' -Verb RunAs
rem  With no argument that is -ArgumentList '' (an empty string), and the window
rem  closed on the failure path before anything could be read - "it flashes and
rem  goes". Two fixes: no empty ArgumentList, and the elevated window is started
rem  with -NoExit so a failure STAYS ON SCREEN.
rem
rem  Also: execution policy on this box is Restricted, so a bare .ps1 invocation
rem  fails. -ExecutionPolicy Bypass is REQUIRED, exactly as install-engine.cmd
rem  already does for show-engine-builds.ps1.
rem
rem  Usage:
rem    harden-addins-acl.cmd          apply
rem    harden-addins-acl.cmd undo     restore inherited permissions
rem ============================================================================
setlocal EnableExtensions
set "PS1=%~dp0harden-addins-acl.ps1"

if not exist "%PS1%" (
    echo *** ABORT: missing "%PS1%"
    pause
    exit /b 1
)

net session >nul 2>&1
if not errorlevel 1 goto :RUN

echo Not elevated - requesting administrator rights...
echo.
if "%~1"=="" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File','%PS1%' -Verb RunAs"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File','%PS1%','%~1' -Verb RunAs"
)
if errorlevel 1 (
    echo.
    echo *** Could not elevate. ***
    echo Right-click this file and choose "Run as administrator", or start an
    echo elevated PowerShell and run:
    echo     powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
    echo.
    pause
)
exit /b

:RUN
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %1
echo.
echo Log written to: %~dp0harden-addins-acl.log
pause
exit /b 0
