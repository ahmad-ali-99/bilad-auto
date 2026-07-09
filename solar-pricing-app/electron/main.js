// غلاف سطح المكتب — يفتح التطبيق السحابي المستضاف (قاعدة بيانات مشتركة أونلاين)
// كل المنطق والبيانات صارت بالتطبيق السحابي؛ هذا الغلاف نافذة فقط.
const { app, BrowserWindow } = require('electron');

const APP_URL = 'https://ahmad-ali-99.github.io/bilad-auto/app/';

let mainWindow;

const OFFLINE_HTML = `data:text/html;charset=utf-8,` + encodeURIComponent(`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
body{font-family:sans-serif;background:#1a3a5c;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.box{max-width:420px;padding:30px}
h1{font-size:1.4rem}p{color:#b9cde0;line-height:1.8}
button{background:#fff;color:#1a3a5c;border:none;border-radius:8px;padding:12px 40px;font-size:1rem;font-weight:bold;cursor:pointer;margin-top:14px}
</style></head><body><div class="box">
<h1>لا يوجد اتصال بالإنترنت</h1>
<p>برنامج التسعير يعمل أونلاين بقاعدة بيانات مشتركة.<br>تحقق من اتصال الإنترنت ثم اضغط إعادة المحاولة.</p>
<button onclick="location.href='${APP_URL}'">إعادة المحاولة</button>
</div></body></html>`);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on('did-fail-load', (_e, errorCode) => {
    if (errorCode !== -3) mainWindow.loadURL(OFFLINE_HTML);
  });

  mainWindow.loadURL(APP_URL);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
