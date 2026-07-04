#!/usr/bin/env bash
# بناء ملف تنصيب Windows (NSIS) من بيئة Linux
# المتطلبات: wine64 + wine32:i386 (لخطوة rcedit)، و Xvfb إذا كانت البيئة بدون شاشة
set -euo pipefail
cd "$(dirname "$0")/.."

BS3_VERSION=$(node -p "require('./node_modules/better-sqlite3/package.json').version")
# ABI الخاص بـ Electron 33 هو 130 — حدّثه إذا رفعت نسخة Electron
ABI=${MANUAL_ABI:-130}

BS3_NODE=node_modules/better-sqlite3/build/Release/better_sqlite3.node
WIN_TAR=/tmp/bs3-win-$BS3_VERSION.tar.gz

echo "==> تنزيل النسخة المبنية مسبقاً لويندوز من better-sqlite3 v$BS3_VERSION (ABI $ABI)"
curl -sSL -o "$WIN_TAR" \
  "https://registry.npmmirror.com/-/binary/better-sqlite3/v$BS3_VERSION/better-sqlite3-v$BS3_VERSION-electron-v$ABI-win32-x64.tar.gz"

echo "==> بناء واجهة المستخدم (vite)"
npx vite build

echo "==> استبدال المكوّن الأصلي بنسخة ويندوز مؤقتاً"
cp "$BS3_NODE" /tmp/bs3-linux-backup.node
tar -xzf "$WIN_TAR" -C node_modules/better-sqlite3/

restore() {
  cp /tmp/bs3-linux-backup.node "$BS3_NODE"
  echo "==> تمت إعادة نسخة Linux للتطوير المحلي"
}
trap restore EXIT

echo "==> بناء ملف التنصيب NSIS"
export ELECTRON_MIRROR="https://cdn.npmmirror.com/binaries/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://registry.npmmirror.com/-/binary/electron-builder-binaries/"
if [ -z "${DISPLAY:-}" ]; then
  xvfb-run -a --server-args="-screen 0 1024x768x24 -ac" npx electron-builder --win --x64 --config.npmRebuild=false
else
  npx electron-builder --win --x64 --config.npmRebuild=false
fi

echo "==> تم! ملف التنصيب في مجلد dist/"
ls -la dist/*.exe
