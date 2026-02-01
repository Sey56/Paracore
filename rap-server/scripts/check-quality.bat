@echo off
echo [🛡️ Paracore Quality Check]
echo.

cd /d "%~dp0"

echo | set /p="[Python] Running Ruff... "
cd ..\server
call uv run ruff check . --fix
if %ERRORLEVEL% EQU 0 (
    echo PASS ✅
) else (
    echo FAIL ❌
)

echo | set /p="[Logic] AI Extraction... "
call uv run python test_logic_generator.py > nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo PASS ✅
) else (
    echo FAIL ❌
)

echo | set /p="[Logic] Working Set... "
call uv run python test_working_set.py > nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo PASS ✅
) else (
    echo FAIL ❌
)

echo | set /p="[Frontend] Running ESLint... "
cd ..\..\rap-web
call npm run lint -- --quiet
if %ERRORLEVEL% EQU 0 (
    echo PASS ✅
) else (
    echo FAIL ❌
)

echo.
echo [🏁 Audit Complete]
pause
