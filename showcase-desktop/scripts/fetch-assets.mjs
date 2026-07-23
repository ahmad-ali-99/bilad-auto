// ينزّل ملفات آخر Release من ريبو التطبيق ويحطها بمجلد assets-download/
// (للأصول الثقيلة مثل موديل المدينة اللي ما تدخل بالريبو نفسه).
// الاستخدام:  set GITHUB_TOKEN=... ثم  node scripts/fetch-assets.mjs
// التوكن مطلوب لأن الريبو خاص (Settings → Developer settings → Tokens).
// بعد التنزيل: فك ملفات zip داخل public/ (بـ7-Zip أو كليك يمين → Extract).
import { createWriteStream, mkdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const REPO = process.env.SHOWCASE_REPO || 'ahmad-ali-99/bilad-showcase-desktop';
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('حط التوكن أول: set GITHUB_TOKEN=ghp_xxx (ويندوز) أو export GITHUB_TOKEN=... (ماك/لينكس)');
  process.exit(1);
}
const hdr = { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };

const rel = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: hdr });
if (!rel.ok) {
  console.error(`فشل جلب آخر Release (${rel.status}) — تأكد من التوكن وصلاحياته على ${REPO}`);
  process.exit(1);
}
const { tag_name, assets } = await rel.json();
if (!assets?.length) {
  console.log(`آخر Release (${tag_name}) ما بيه ملفات.`);
  process.exit(0);
}
mkdirSync('assets-download', { recursive: true });
for (const a of assets) {
  const dest = path.join('assets-download', a.name);
  console.log(`تنزيل ${a.name} (${(a.size / 1048576).toFixed(0)}MB)...`);
  const res = await fetch(a.url, { headers: { ...hdr, Accept: 'application/octet-stream' } });
  if (!res.ok) {
    console.error(`فشل تنزيل ${a.name} (${res.status})`);
    process.exit(1);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}
console.log(`\nتم — الملفات بمجلد assets-download/. فك ملفات zip داخل مجلد public/ وبعدها npm run build.`);
