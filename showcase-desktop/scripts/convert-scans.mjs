// يحول مسوحات RealityCapture (OBJ ضخمة نصية) لصيغة ثنائية سريعة التحميل:
// scan.bin = [u32 طول JSON][JSON meta][Float32 positions][Float32 uvs][Float32 normals][Uint32 indices]
// التشغيل: node scripts/convert-scans.mjs   (مرة وحدة بعد فك ضغط المسوحات)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'public', 'assets', 'models', 'photoscans');

function findObj(dir) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) { const r = findObj(p); if (r) return r; }
    else if (e.endsWith('.obj')) return p;
  }
  return null;
}

function convert(objPath, outPath) {
  const t0 = Date.now();
  const txt = readFileSync(objPath, 'latin1');
  const vs = [], vts = [];
  // فهرسة زوج (v/vt) لرأس موحد — الـOBJ بلا نورمالات (نحسبها إحنا)
  const pairIndex = new Map();
  const pos = [], uv = [], idx = [];
  let lineStart = 0;
  const pushVert = (token) => {
    let vi, ti;
    const s = token.indexOf('/');
    if (s < 0) { vi = +token; ti = 0; }
    else { vi = +token.slice(0, s); ti = +token.slice(s + 1).split('/')[0]; }
    const key = vi * 4194304 + ti;
    let out = pairIndex.get(key);
    if (out === undefined) {
      out = pos.length / 3;
      pairIndex.set(key, out);
      const vo = (vi - 1) * 3, to = (ti - 1) * 2;
      pos.push(vs[vo], vs[vo + 1], vs[vo + 2]);
      uv.push(ti ? vts[to] : 0, ti ? vts[to + 1] : 0);
    }
    return out;
  };
  while (lineStart < txt.length) {
    let lineEnd = txt.indexOf('\n', lineStart);
    if (lineEnd < 0) lineEnd = txt.length;
    const c0 = txt.charCodeAt(lineStart), c1 = txt.charCodeAt(lineStart + 1);
    if (c0 === 118 && c1 === 32) { // 'v '
      const p = txt.slice(lineStart + 2, lineEnd).trim().split(/\s+/);
      vs.push(+p[0], +p[1], +p[2]);
    } else if (c0 === 118 && c1 === 116) { // 'vt'
      const p = txt.slice(lineStart + 3, lineEnd).trim().split(/\s+/);
      vts.push(+p[0], +p[1]);
    } else if (c0 === 102 && c1 === 32) { // 'f '
      const p = txt.slice(lineStart + 2, lineEnd).trim().split(/\s+/);
      const a = pushVert(p[0]);
      for (let i = 2; i < p.length; i++) idx.push(a, pushVert(p[i - 1]), pushVert(p[i]));
    }
    lineStart = lineEnd + 1;
  }
  // نورمالات ناعمة (تجميع نورمالات الوجوه على الرؤوس)
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const abx = pos[b] - pos[a], aby = pos[b + 1] - pos[a + 1], abz = pos[b + 2] - pos[a + 2];
    const acx = pos[c] - pos[a], acy = pos[c + 1] - pos[a + 1], acz = pos[c + 2] - pos[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    nrm[a] += nx; nrm[a + 1] += ny; nrm[a + 2] += nz;
    nrm[b] += nx; nrm[b + 1] += ny; nrm[b + 2] += nz;
    nrm[c] += nx; nrm[c + 1] += ny; nrm[c + 2] += nz;
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
  }
  const meta = { verts: pos.length / 3, tris: idx.length / 3 };
  let metaJson = JSON.stringify(meta);
  while ((4 + metaJson.length) % 4 !== 0) metaJson += ' '; // محاذاة 4 بايت للمصفوفات
  const metaBuf = Buffer.from(metaJson);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(metaBuf.length);
  const out = Buffer.concat([
    header, metaBuf,
    Buffer.from(new Float32Array(pos).buffer),
    Buffer.from(new Float32Array(uv).buffer),
    Buffer.from(nrm.buffer),
    Buffer.from(new Uint32Array(idx).buffer),
  ]);
  writeFileSync(outPath, out);
  console.log(`${path.basename(objPath)} → scan.bin  ${meta.verts.toLocaleString()}v ${meta.tris.toLocaleString()}t  ${(out.length / 1048576).toFixed(0)}MB  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

for (const n of readdirSync(ROOT).filter((d) => /^\d+$/.test(d)).sort()) {
  const obj = findObj(path.join(ROOT, n));
  if (obj) convert(obj, path.join(ROOT, n, 'scan.bin'));
}
console.log('تم.');
