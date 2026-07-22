// رسم ثلاثي الأبعاد تسويقي لهيكل الألواح — وجه اللوح مواجه للقارئ، صبّة تحت كل رجل،
// الطاولة الأمامية واطية والخلفية أعلى (أرجل أطول). يتولّد حسب عدد ألواح العرض.

const PANEL_W_M = 1.13; // عرض اللوح (على الصف)
const PANEL_L_M = 1.9; // طول اللوح (طابق واحد على الميل)
const TILT_DEG = 20;
const FRONT_H_M = 0.5; // ارتفاع أرجل الطاولة الأمامية
const BACK_EXTRA_H_M = 1.15; // زيادة ارتفاع أرجل الطاولة الخلفية

export function panelCountFromItems(items) {
  let n = 0;
  for (const it of items || []) {
    const d = String(it.description || '');
    if (/ألواح|الواح|لوح/.test(d) && !/هيكل|صبات|صبّات|كيبل|كابل|بورد|حماية/.test(d)) {
      n += Number(it.quantity) || 0;
    }
  }
  return n;
}

// طاولتان (أمامية + خلفية)، كل طاولة طابقان × أعمدة. 24 لوح ← 2×6 + 2×6.
export function splitTables(panelCount) {
  const n = Math.max(0, Math.round(panelCount));
  if (n <= 0) return [];
  const frontCols = Math.ceil(n / 4);
  const backCols = Math.floor(n / 4);
  const tables = [{ label: 'الطاولة الأمامية', rows: 2, cols: frontCols }];
  if (backCols > 0) tables.push({ label: 'الطاولة الخلفية', rows: 2, cols: backCols });
  return tables.filter((t) => t.cols > 0);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r1 = (x) => Math.round(x * 100) / 100;

// ===== إسقاط أمامي 3/4: الصف يمتد لليمين صاعداً، والعمق يذهب لأعلى-اليمين، y للأعلى =====
// النتيجة: وجه اللوح المائل يواجه القارئ (أسفل-يسار)، والهيكل تحته.
const SC = 46;
function proj(x, y, z) {
  return { x: (x * 1.0 + z * 0.52) * SC, y: (-x * 0.17 - y * 1.0 - z * 0.30) * SC };
}
const P = (p) => `${r1(p.x)},${r1(p.y)}`;
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const prj = (p) => proj(p.x, p.y, p.z);

// صندوق (صبّة كونكريت/قاعدة) — وجه علوي + وجهان أماميان
function box(x0, z0, sx, sz, h, yb, cTop, cFront, cRight) {
  const x1 = x0 + sx, z1 = z0 + sz, yt = yb + h;
  const T = [proj(x0, yt, z0), proj(x1, yt, z0), proj(x1, yt, z1), proj(x0, yt, z1)];
  const fb0 = proj(x0, yb, z0), fb1 = proj(x1, yb, z0), rb1 = proj(x1, yb, z1);
  return (
    `<polygon points="${P(T[0])} ${P(T[1])} ${P(fb1)} ${P(fb0)}" fill="${cFront}"/>` +
    `<polygon points="${P(T[1])} ${P(T[2])} ${P(rb1)} ${P(fb1)}" fill="${cRight}"/>` +
    `<polygon points="${P(T[0])} ${P(T[1])} ${P(T[2])} ${P(T[3])}" fill="${cTop}"/>`
  );
}

// خطوط خلايا داخل وحدة لوح
function cells(p1, p2, p3, p4) {
  const line = (a, b) => `<line x1="${r1(a.x)}" y1="${r1(a.y)}" x2="${r1(b.x)}" y2="${r1(b.y)}" stroke="#9fb2df" stroke-width="0.5" opacity="0.5"/>`;
  let s = '';
  for (let i = 1; i < 6; i++) { const t = i / 6; s += line(prj(lerp(p1, p2, t)), prj(lerp(p4, p3, t))); }
  for (let j = 1; j < 3; j++) { const t = j / 3; s += line(prj(lerp(p1, p4, t)), prj(lerp(p2, p3, t))); }
  return s;
}

// طاولة واحدة: أرجل + صبّات تحت الأرجل + سطح الألواح المواجه للقارئ
function mountTable(ox, oz, baseH, cols) {
  const beta = (TILT_DEG * Math.PI) / 180;
  const W = cols * PANEL_W_M;
  const L2 = 2 * PANEL_L_M;
  const rise = L2 * Math.sin(beta);
  const depth = L2 * Math.cos(beta);
  const FL = { x: ox, y: baseH, z: oz }, FR = { x: ox + W, y: baseH, z: oz };
  const BL = { x: ox, y: baseH + rise, z: oz + depth }, BR = { x: ox + W, y: baseH + rise, z: oz + depth };
  let svg = '';

  // ظل أرضي
  svg += `<polygon points="${P(proj(FL.x, 0, FL.z))} ${P(proj(FR.x, 0, FR.z))} ${P(proj(BR.x, 0, BR.z))} ${P(proj(BL.x, 0, BL.z))}" fill="#000" opacity="0.08"/>`;

  // أرجل + صبّات (عند كل عمودين تقريباً، أمامي وخلفي)
  const step = Math.max(1, Math.round(cols / 4));
  const cs = 0.34;
  for (let c = 0; c <= cols; c += step) {
    const x = ox + (c / cols) * W;
    // صبّة أمامية + رجل أمامية
    svg += box(x - cs / 2, oz - cs / 2, cs, cs, 0.3, 0, '#e2e5e9', '#c2c7cd', '#cfd4d9');
    const fb = proj(x, 0, oz), ft = proj(x, baseH, oz);
    svg += `<line x1="${r1(fb.x)}" y1="${r1(fb.y)}" x2="${r1(ft.x)}" y2="${r1(ft.y)}" stroke="#6b7480" stroke-width="3.4" stroke-linecap="round"/>`;
    // صبّة خلفية + رجل خلفية (أطول)
    svg += box(x - cs / 2, oz + depth - cs / 2, cs, cs, 0.3, 0, '#e2e5e9', '#c2c7cd', '#cfd4d9');
    const bb = proj(x, 0, oz + depth), bt = proj(x, baseH + rise, oz + depth);
    svg += `<line x1="${r1(bb.x)}" y1="${r1(bb.y)}" x2="${r1(bt.x)}" y2="${r1(bt.y)}" stroke="#6b7480" stroke-width="3.4" stroke-linecap="round"/>`;
    // دعامة قطرية (مثلث الهيكل)
    svg += `<line x1="${r1(fb.x)}" y1="${r1(fb.y)}" x2="${r1(bt.x)}" y2="${r1(bt.y)}" stroke="#6b7480" stroke-width="2"/>`;
  }
  // عارضة أفقية تحت السطح (أمامية)
  svg += `<line x1="${r1(proj(FL.x, FL.y, FL.z).x)}" y1="${r1(proj(FL.x, FL.y, FL.z).y)}" x2="${r1(proj(FR.x, FR.y, FR.z).x)}" y2="${r1(proj(FR.x, FR.y, FR.z).y)}" stroke="#5b6673" stroke-width="2"/>`;

  // سطح الألواح: 2 طابق × cols، وجه اللوح مواجه للقارئ
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols, u1 = (c + 1) / cols, v0 = r / 2, v1 = (r + 1) / 2;
      const tA = lerp(FL, FR, u0), bA = lerp(BL, BR, u0), tB = lerp(FL, FR, u1), bB = lerp(BL, BR, u1);
      const p1 = lerp(tA, bA, v0), p2 = lerp(tB, bB, v0), p3 = lerp(tB, bB, v1), p4 = lerp(tA, bA, v1);
      svg += `<polygon points="${P(prj(p1))} ${P(prj(p2))} ${P(prj(p3))} ${P(prj(p4))}" fill="url(#pv)" stroke="#0e1e3c" stroke-width="1.1"/>`;
      svg += cells(p1, p2, p3, p4);
    }
  }
  const surf = `${P(prj(FL))} ${P(prj(FR))} ${P(prj(BR))} ${P(prj(BL))}`;
  svg += `<polygon points="${surf}" fill="url(#gloss)" opacity="0.4"/>`;
  svg += `<polygon points="${surf}" fill="none" stroke="#0a1830" stroke-width="2.4"/>`;

  const corners = [proj(FL.x, 0, FL.z), prj(FL), prj(FR), prj(BL), prj(BR), proj(ox + W, 0, oz + depth)];
  return { svg, corners };
}

export function buildStructureSvg(panelCount) {
  const tables = splitTables(panelCount);
  if (!tables.length) return '';
  const frontCols = tables[0].cols;
  const backCols = tables[1] ? tables[1].cols : 0;
  const beta = (TILT_DEG * Math.PI) / 180;
  const depth = 2 * PANEL_L_M * Math.cos(beta);

  // نرسم الخلفية أولاً (خلف وأعلى)، ثم الأمامية
  const parts = [];
  const pts = [];
  if (backCols) {
    const t = mountTable(-1.8, depth + 1.4, FRONT_H_M + BACK_EXTRA_H_M, backCols);
    parts.push(t.svg); t.corners.forEach((p) => pts.push(p));
  }
  const f = mountTable(0, 0, FRONT_H_M, frontCols);
  parts.push(f.svg); f.corners.forEach((p) => pts.push(p));

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), pad = 34;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const w = maxX - minX, h = maxY - minY;

  return `<svg viewBox="${r1(minX)} ${r1(minY)} ${r1(w)} ${r1(h)}" width="${r1(w)}" height="${r1(h)}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pv" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#556aae"/><stop offset="0.5" stop-color="#33478c"/><stop offset="1" stop-color="#22346e"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="0.5">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.42" stop-color="#fff" stop-opacity="0.42"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.6"/><stop offset="0.58" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${parts.join('')}
  </svg>`;
}

export function buildStructurePageHtml(panelCount, company = {}) {
  const tables = splitTables(panelCount);
  if (!tables.length) return '';
  const svg = buildStructureSvg(panelCount);
  const logo = company.logo_path && String(company.logo_path).startsWith('data:') ? company.logo_path : null;
  const co = company.company_name || 'شركة بلاد اوتو للطاقة الشمسية';
  const feats = [
    ['🔧', 'تركيب احترافي', 'فريق فني متخصص وتنفيذ دقيق حسب المواصفات'],
    ['🛡️', 'هيكل مغلون متين', 'مقاوم للرياح والصدأ — يدوم لعشرات السنين'],
    ['🕐', 'صيانة ودعم 24/7', 'خدمة صيانة ومتابعة متوفرة على مدار الساعة'],
  ];
  const featHtml = feats
    .map((f) => `<div class="feat"><div class="ic">${f[0]}</div><div class="ft"><b>${esc(f[1])}</b><span>${esc(f[2])}</span></div></div>`)
    .join('');
  return `
<style>
.mkt-sheet * { box-sizing: border-box; }
.mkt-sheet { font-family: 'Cairo', sans-serif; direction: rtl; width: 794px; min-height: 1080px; padding: 0 0 26px; position: relative; overflow: hidden;
  display: flex; flex-direction: column; background:
  radial-gradient(120% 80% at 82% -12%, #ffe8a8 0%, rgba(255,232,168,0) 40%),
  linear-gradient(180deg, #dff0ff 0%, #eaf6ff 38%, #f3f6f4 70%, #e7eee0 100%); }
.mkt-sheet .sun { position: absolute; top: 44px; left: 58px; width: 88px; height: 88px; border-radius: 50%;
  background: radial-gradient(circle, #fff6cf 0%, #ffd451 55%, #ffbf2e 100%); box-shadow: 0 0 44px 15px rgba(255,197,64,0.5); }
.mkt-sheet .head { position: relative; display: flex; justify-content: space-between; align-items: center; padding: 22px 30px 0; }
.mkt-sheet .head .co { font-size: 1.05rem; font-weight: 800; color: #123; text-shadow: 0 1px 0 #fff; }
.mkt-sheet .head img { width: 54px; height: 54px; object-fit: contain; }
.mkt-sheet .hero { position: relative; text-align: center; margin: 8px 24px 0; }
.mkt-sheet .hero h1 { font-size: 1.68rem; font-weight: 800; color: #12305c; margin: 6px 0 2px; text-shadow: 0 1px 0 #fff; }
.mkt-sheet .hero p { font-size: 1rem; color: #2c4a72; margin: 0; font-weight: 600; }
.mkt-sheet .stage { position: relative; flex: 1; display: flex; align-items: center; justify-content: center; padding: 6px 22px; }
.mkt-sheet .stage svg { max-width: 100%; max-height: 520px; height: auto; filter: drop-shadow(0 20px 26px rgba(20,48,92,0.3)); }
.mkt-sheet .count { position: relative; text-align: center; margin: 0 0 10px; font-weight: 800; color: #12305c; font-size: 1.05rem; }
.mkt-sheet .count b { color: #f5a623; }
.mkt-sheet .feats { position: relative; display: flex; justify-content: center; gap: 12px; padding: 0 26px; flex-wrap: nowrap; }
.mkt-sheet .feat { flex: 1; background: rgba(255,255,255,0.9); border: 1px solid #cdd9e6; border-radius: 14px; padding: 12px 14px;
  display: flex; align-items: center; gap: 10px; box-shadow: 0 5px 12px rgba(20,48,92,0.1); }
.mkt-sheet .feat .ic { font-size: 1.6rem; line-height: 1; }
.mkt-sheet .feat .ft { display: flex; flex-direction: column; }
.mkt-sheet .feat .ft b { color: #12305c; font-size: 0.95rem; }
.mkt-sheet .feat .ft span { color: #4a5c72; font-size: 0.72rem; line-height: 1.3; }
.mkt-sheet .foot { position: relative; margin-top: 14px; text-align: center; color: #3a5372; font-size: 0.8rem; font-weight: 600; }
</style>
<div class="mkt-sheet">
  <div class="sun"></div>
  <div class="head"><div class="co">${esc(co)}</div>${logo ? `<img src="${logo}" alt=""/>` : ''}</div>
  <div class="hero">
    <h1>منظومتك الشمسية بتصميم احترافي</h1>
    <p>هيكل تركيب متين بأعلى المعايير — أداء يدوم لعشرات السنين</p>
  </div>
  <div class="stage">${svg}</div>
  <div class="count">إجمالي الألواح <b>${panelCount}</b> لوح — <b>${tables.length}</b> طاولة</div>
  <div class="feats">${featHtml}</div>
  <div class="foot">${esc(co)} — نموذج توضيحي، تُثبّت التفاصيل النهائية بعد الكشف الميداني</div>
</div>`;
}
