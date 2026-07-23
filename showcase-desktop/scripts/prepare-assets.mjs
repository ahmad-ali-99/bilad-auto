// تجهيز أصول المدينة بأمر واحد (يشتغل مرة وحدة على حاسوبك):
//   node scripts/prepare-assets.mjs
// ينزّل المسوحات الست من GitHub Release (ريبو عام — بلا توكن)، يفك الضغط،
// يرتب المجلدات، يحوّل OBJ ← scan.bin السريع، وينزّل سماوات HDRI من Poly Haven.
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync, linkSync, copyFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';

const REL = 'https://github.com/ahmad-ali-99/bilad-auto/releases/download/photoscans-v1';
const ZIPS = [
  'residential-buildings-ancient-villages.zip',      // 004
  'residential-buildings-ancient-villages.1.zip',    // 006 (داخله 7z)
  'residential-buildings-ancient-villages.2.zip',    // 010
  'residential-buildings-ancient-villages.3.zip',    // 009
  'residential-buildings-villages-country-house.zip',   // 002
  'residential-buildings-villages-country-house.2.zip', // 003
];
const HDRIS = ['qwantani_afternoon_puresky_4k.hdr', 'kloofendal_48d_partly_cloudy_puresky_4k.hdr'];
const HDRI_NAMES = { qwantani_afternoon_puresky_4k: 'qwantani_afternoon_4k', kloofendal_48d_partly_cloudy_puresky_4k: 'kloofendal_48d_4k' };

const ROOT = path.join('public', 'assets', 'models', 'photoscans');
const HDRI_DIR = path.join('public', 'assets', 'hdri');
const TMP = path.join('assets-download');
mkdirSync(ROOT, { recursive: true });
mkdirSync(HDRI_DIR, { recursive: true });
mkdirSync(TMP, { recursive: true });

async function dl(url, dest) {
  if (existsSync(dest) && statSync(dest).size > 0) { console.log('موجود:', path.basename(dest)); return; }
  console.log('تنزيل:', path.basename(dest), '...');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`فشل تنزيل ${url} (${res.status})`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}
const extract = (archive, dest) => {
  mkdirSync(dest, { recursive: true });
  // tar بويندوز 10+ ولينكس (bsdtar) يفك zip و7z
  execSync(`tar -xf "${archive}" -C "${dest}"`, { stdio: 'inherit' });
};
function findFile(dir, test) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) { const r = findFile(p, test); if (r) return r; }
    else if (test(e)) return p;
  }
  return null;
}

for (const z of ZIPS) {
  const zp = path.join(TMP, z);
  await dl(`${REL}/${z}`, zp);
  const stage = path.join(TMP, z.replace(/\.zip$/, ''));
  if (!existsSync(stage)) extract(zp, stage);
  // الأرشيف الداخلي source/2025..._NNN_OUTPUT_LODxx.(zip|7z) — منه نعرف رقم المسح
  const inner = findFile(stage, (n) => /_OUTPUT_LOD\d+\.(zip|7z)$/.test(n));
  if (!inner) { console.error('ما لگيت أرشيف داخلي بـ', z); continue; }
  const id = inner.match(/_(\d{3})_OUTPUT/)[1];
  const dest = path.join(ROOT, id);
  if (!existsSync(path.join(dest, 'scan.bin'))) {
    extract(inner, dest);
    const diff = findFile(dest, (n) => n.endsWith('_diffuse.png'));
    const out = path.join(dest, 'diffuse_8k.png');
    if (diff && !existsSync(out)) { try { linkSync(diff, out); } catch { copyFileSync(diff, out); } }
    console.log(`مسح ${id} جاهز.`);
  } else console.log(`مسح ${id} محوّل من قبل.`);
}

for (const h of HDRIS) {
  const name = HDRI_NAMES[h.replace('.hdr', '')] + '.hdr';
  await dl(`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/${h}`, path.join(HDRI_DIR, name));
}

console.log('\nتحويل المسوحات لصيغة سريعة (scan.bin)...');
execSync('node scripts/convert-scans.mjs', { stdio: 'inherit' });
console.log('\nتم — الأصول كاملة. شغّل: npm run build ثم npm start');
