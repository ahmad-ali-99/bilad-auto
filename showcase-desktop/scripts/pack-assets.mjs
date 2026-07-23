// يضغط مجلدات الأصول الثقيلة (public/city وغيرها) لملفات zip جاهزة للرفع
// على GitHub Releases (سقف GitHub: 2GB للملف الواحد — نقسم عند 1.9GB).
// الاستخدام: node scripts/pack-assets.mjs [مجلد داخل public، الافتراضي city]
// الناتج بمجلد release-assets/ — يُرفع يدوياً أو عبر gh release upload.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const target = process.argv[2] || 'city';
const src = path.join('public', target);
if (!existsSync(src)) {
  console.error(`ماكو مجلد ${src} — حط الأصول بيه أول ثم أعد التشغيل.`);
  process.exit(1);
}
mkdirSync('release-assets', { recursive: true });
const out = path.join('release-assets', `assets-${target}.zip`);
// -s 1900m: تقسيم تلقائي لأجزاء .z01 .z02... إذا تجاوز الحجم (تفك بـ7-Zip)
execSync(`zip -r -s 1900m ${JSON.stringify(out)} ${JSON.stringify(src)}`, { stdio: 'inherit' });
console.log(`\nتم — ارفع كل ملفات release-assets/ على GitHub Release واحد.`);
