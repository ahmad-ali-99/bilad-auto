@echo off
cd /d "%~dp0"
echo Joining installer parts, please wait...
copy /b "BiladAuto-Setup-1.0.0.exe.part00"+"BiladAuto-Setup-1.0.0.exe.part01" "BiladAuto-Solar-Pricing-Setup-1.0.0.exe" >nul
if exist "BiladAuto-Solar-Pricing-Setup-1.0.0.exe" (
  echo.
  echo Done! Run: BiladAuto-Solar-Pricing-Setup-1.0.0.exe
) else (
  echo ERROR: make sure both part files are in the same folder.
)
pause
