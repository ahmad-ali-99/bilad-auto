@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo === تنصيب أول مرة — ممكن ياخذ دقايق ===
  call npm install || goto :err
)
if not exist public\assets\models\photoscans\010\scan.bin (
  echo === تنزيل وتجهيز أصول المدينة — مرة وحدة، حوالي 900 ميغا ===
  call node scripts\prepare-assets.mjs || goto :err
)
if not exist dist (
  echo === بناء الواجهة ===
  call npm run build || goto :err
)
call npm start
exit /b 0
:err
echo.
echo صار خطأ — تأكد أن Node.js منصّب (nodejs.org) وأعد المحاولة.
pause
