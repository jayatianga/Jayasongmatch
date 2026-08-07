@echo off
REM Double-click this file to start Jayasongmatch.
setlocal
cd /d "%~dp0"

where py >/dev/null 2>nul
if %errorlevel%==0 (
  py serve.py %*
  goto :end
)

where python >/dev/null 2>nul
if %errorlevel%==0 (
  python serve.py %*
  goto :end
)

echo.
echo Python was not found on this PC.
echo Install it from https://www.python.org/downloads/windows/ ^(tick "Add python.exe to PATH"^)
echo or from the Microsoft Store, then double-click this file again.
echo.
pause

:end
endlocal
