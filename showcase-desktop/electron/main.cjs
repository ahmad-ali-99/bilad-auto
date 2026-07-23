// نافذة إلكترون — وضع الشاشة (كيوسك): شاشة كاملة افتراضياً، وإذا أكو شاشة
// خارجية ثانية (شاشة العرض بالمكتب) تفتح عليها تلقائياً.
// F11 يبدّل الشاشة الكاملة، Esc يطلع منها، وخيار --window يشغّل نافذة عادية.
const { app, BrowserWindow, screen, globalShortcut } = require('electron');
const path = require('path');

const windowed = process.argv.includes('--window');

function pickDisplay() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  // الشاشة الخارجية = أي شاشة غير الرئيسية؛ نأخذ الأكبر مساحة إذا أكو أكثر من وحدة
  const externals = displays.filter((d) => d.id !== primary.id);
  if (!externals.length) return primary;
  return externals.reduce((a, b) =>
    a.workAreaSize.width * a.workAreaSize.height >= b.workAreaSize.width * b.workAreaSize.height ? a : b
  );
}

function createWindow() {
  const display = pickDisplay();
  const { x, y, width, height } = display.bounds;

  const win = new BrowserWindow({
    x: x + 40,
    y: y + 40,
    width: windowed ? 1600 : width,
    height: windowed ? 950 : height,
    fullscreen: !windowed,
    title: 'بلاد أوتو — العرض الهندسي (سطح المكتب)',
    backgroundColor: '#1a3a5c',
    webPreferences: { contextIsolation: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  globalShortcut.register('F11', () => win.setFullScreen(!win.isFullScreen()));
  globalShortcut.register('Escape', () => {
    if (win.isFullScreen()) win.setFullScreen(false);
  });
}

app.whenReady().then(createWindow);
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
