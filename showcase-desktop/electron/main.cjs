// نافذة إلكترون بسيطة تعرض بناء Vite — كل الأصول محلية أوفلاين
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 950,
    title: 'بلاد أوتو — العرض الهندسي (سطح المكتب)',
    backgroundColor: '#1a3a5c',
    webPreferences: { contextIsolation: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
