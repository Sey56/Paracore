@echo off
rem ============================================================================
rem  install-engine.cmd - deploy the freshly built CoreScript.Engine into the
rem  Revit 2025 addin folder.
rem
rem  WHY THIS SCRIPT EXISTS / WHY IT MUST BE ELEVATED
rem  ------------------------------------------------
rem  C:\ProgramData\Autodesk\Revit\Addins\2025\Paracore was written by the
rem  elevated installer, so its ACL grants BUILTIN\Users only:
rem      (I)(OI)(CI)(RX)       -> files: READ + EXECUTE
rem      (I)(CI)(WD,AD,WEA,WA) -> dir:   CREATE new files only
rem  A new file can therefore be created there, but overwriting or renaming an
rem  EXISTING file needs write/DELETE on the file, which Users does not have.
rem  That is what makes a plain `cp` fail with "Permission denied" - it is an
rem  ACL, NOT a Revit file lock (verified: Revit closed, no module loaded, and
rem  the Restart Manager reports no lockers, yet the write still fails).
rem  => Only an elevated process can install.
rem
rem  Double-click this file; accept the UAC prompt.
rem ============================================================================
setlocal EnableExtensions

set "SRC=%~dp0..\CoreScript.Engine\bin\Debug\net8.0-windows\win-x64"
set "DST=C:\ProgramData\Autodesk\Revit\Addins\2025\Paracore"

rem ---- 1. elevate if needed -------------------------------------------------
net session >nul 2>&1
if errorlevel 1 (
    echo Not elevated - requesting administrator rights...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
echo Running elevated. OK.

rem ---- 2. Revit must be closed (a loaded module is locked for write) --------
tasklist /FI "IMAGENAME eq Revit.exe" 2>nul | find /I "Revit.exe" >nul
if not errorlevel 1 (
    echo.
    echo *** ABORT: Revit.exe is running. ***
    echo Close Revit completely, then run this script again.
    echo.
    pause
    exit /b 1
)

rem ---- 3. sanity-check the build output -------------------------------------
if not exist "%SRC%\CoreScript.Engine.dll" (
    echo *** ABORT: build output not found: "%SRC%\CoreScript.Engine.dll"
    echo Run:  dotnet build CoreScript.Engine\CoreScript.Engine.csproj -c Debug --no-restore
    pause
    exit /b 1
)

rem ---- 3b. report which build is where, and refuse a STALE one --------------
rem  TWO build loops write different binaries into the SAME addin folder:
rem    dotnet build -c Debug  ->  %SRC%                       (THIS script copies that)
rem    build-addin.ps1        ->  bin\Release\...\publish     (the Inno installer copies that)
rem  The engine has no #if DEBUG, so the swap is invisible and harmless-looking - but it
rem  makes "did my change take effect?" unanswerable. On 2026-09-17 that cost a whole
rem  debugging cycle: a Release engine was live while a Debug engine was being reasoned about.
rem  The report prints the hashes so you can SEE which config is live, and exits:
rem      0 = Debug build exists and is current
rem      2 = a source file is newer than the Debug build (installing would deploy OLD code)
rem      3 = the Debug build does not exist
rem  NB: every execution-policy scope is Undefined on this box (= Restricted), so a bare
rem  script invocation fails with "running scripts is disabled on this system".
rem  -ExecutionPolicy Bypass is REQUIRED.
echo.
echo ---- engine build report (BEFORE copy) ----
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0show-engine-builds.ps1"
if errorlevel 3 (
    echo *** ABORT: there is no Debug build to install.
    pause
    exit /b 1
)
if errorlevel 2 goto :STALE_BUILD
goto :DO_COPY

:STALE_BUILD
echo.
echo *** The Debug build is STALE - installing it would deploy OLD code. ***
set "GO="
set /p GO=Install the old build anyway? [y/N] 
if /I not "%GO%"=="y" (
    echo.
    echo Aborted. Rebuild first, then run this script again:
    echo   dotnet build CoreScript.Engine\CoreScript.Engine.csproj -c Debug --no-restore
    pause
    exit /b 1
)

:DO_COPY
rem ---- 4. copy dll + pdb + xml ----------------------------------------------
echo.
echo Source: %SRC%
echo Dest  : %DST%
echo.
for %%F in (CoreScript.Engine.dll CoreScript.Engine.pdb CoreScript.Engine.xml) do (
    if exist "%SRC%\%%F" (
        copy /Y "%SRC%\%%F" "%DST%\%%F" >nul
        if errorlevel 1 (
            echo   FAILED  %%F
            set "FAIL=1"
        ) else (
            echo   copied  %%F
        )
    ) else (
        echo   skipped %%F ^(not in build output^)
    )
)

rem ---- 5. verify ------------------------------------------------------------
echo.
if defined FAIL (
    echo *** INSTALL FAILED ***
    pause
    exit /b 1
)
echo ---- engine build report (AFTER copy) ----
rem  Expect: INSTALLED hash == Debug hash, and "LIVE IN REVIT: Debug".
rem  If INSTALLED does not match Debug, the copy did not land.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0show-engine-builds.ps1"
echo.
echo Now restart Revit (or reload the addin) and run the gates:
echo   python .repl\baseline.py check
echo   python .repl\g.py .repl\skirting_d21.cs
echo.
pause
