@echo off
REM Double-click this file, then open the network address it prints on your
REM iPhone or iPad. See README.md for the one-time certificate setup.
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py serve.py --https %*
  goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
  python serve.py --https %*
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
