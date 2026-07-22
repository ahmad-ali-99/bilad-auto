// رسم آيزومتري لهيكل الألواح مطابق للرفرنس — يتقسّم تلقائياً حسب عدد ألواح العرض:
// طاولتان تنزاحان قطرياً للخلف (أعلى-يسار)، الألواح بميل يُظهر وجوهها للقارئ،
// قوالب بالاست كونكريتية بصف أمامي، أرجل ودعامات، ومنصّة كونكريت تحت الكل.

const PANEL_W_M = 1.05; // عرض عمود اللوح (أفقي على الصف)
const TIER_H_M = 0.62; // ارتفاع الطابق الواحد على الميل (لاندسكيب → أوسع من أطول)
const SLOPE_DEPTH = 1.9; // إسقاط عمق السطح المائل (طابقان)
const RISE = 1.15; // ارتفاع الحافة الخلفية عن الأمامية (ميل ~31°)
const FRONT_H = 0.45; // ارتفاع أرجل الطاولة الأمامية
const BACK_LIFT = 0.7; // زيادة ارتفاع الطاولة الخلفية

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

// إسقاط آيزومتري مضبوط على الرفرنس:
// x = عرض الصف (يمين وأوطى قليلاً)، y = العمق للخلف (يسار وأعلى)، z = الارتفاع
const SC = 52;
function proj(x, y, z) {
  return { x: (x * 0.94 - y * 0.56) * SC, y: (x * 0.3 - y * 0.42 - z) * SC };
}
const A = (p) => `${r1(p.x)},${r1(p.y)}`;
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const pj = (p) => proj(p.x, p.y, p.z);

// صندوق كونكريت (منصّة/بالاست): وجه علوي + وجه أمامي + وجه يمين
function box(x0, y0, sx, sy, h, zb, cTop, cFront, cRight) {
  const x1 = x0 + sx, y1 = y0 + sy, zt = zb + h;
  const T0 = proj(x0, y0, zt), T1 = proj(x1, y0, zt), T2 = proj(x1, y1, zt), T3 = proj(x0, y1, zt);
  const F0 = proj(x0, y0, zb), F1 = proj(x1, y0, zb), R2 = proj(x1, y1, zb);
  return (
    `<polygon points="${A(T0)} ${A(T1)} ${A(F1)} ${A(F0)}" fill="${cFront}"/>` +
    `<polygon points="${A(T1)} ${A(T2)} ${A(R2)} ${A(F1)}" fill="${cRight}"/>` +
    `<polygon points="${A(T0)} ${A(T1)} ${A(T2)} ${A(T3)}" fill="${cTop}"/>`
  );
}

function cells(p1, p2, p3, p4) {
  const L = (a, b) => `<line x1="${r1(a.x)}" y1="${r1(a.y)}" x2="${r1(b.x)}" y2="${r1(b.y)}" stroke="#9fb2df" stroke-width="0.5" opacity="0.5"/>`;
  let s = '';
  for (let i = 1; i < 6; i++) { const t = i / 6; s += L(pj(lerp(p1, p2, t)), pj(lerp(p4, p3, t))); }
  for (let j = 1; j < 3; j++) { const t = j / 3; s += L(pj(lerp(p1, p4, t)), pj(lerp(p2, p3, t))); }
  return s;
}

// طاولة واحدة (ox,oy = ركن أمامي-يمين، baseH = ارتفاع الأرجل الأمامية)
function table(ox, oy, baseH, cols) {
  const W = cols * PANEL_W_M;
  const FL = { x: ox, y: oy, z: baseH }, FR = { x: ox + W, y: oy, z: baseH };
  const BL = { x: ox, y: oy + SLOPE_DEPTH, z: baseH + RISE }, BR = { x: ox + W, y: oy + SLOPE_DEPTH, z: baseH + RISE };
  let svg = '';

  // ظل أرضي
  svg += `<polygon points="${A(proj(FL.x, FL.y, 0))} ${A(proj(FR.x, FR.y, 0))} ${A(proj(BR.x, BR.y, 0))} ${A(proj(BL.x, BL.y, 0))}" fill="#000" opacity="0.07"/>`;

  // قوالب بالاست كونكريتية بصف أمامي (واحد لكل عمود)
  for (let c = 0; c <= cols; c++) {
    const x = ox + (c / cols) * W - 0.24;
    svg += box(x, oy - 0.66, 0.48, 0.48, 0.42, 0, '#e4e7eb', '#c3c8ce', '#d2d6db');
  }

  // أرجل + دعامات (كل ~3 أعمدة)
  const step = Math.max(1, Math.round(cols / 3));
  for (let c = 0; c <= cols; c += step) {
    const x = ox + (c / cols) * W;
    const fB = proj(x, oy, 0), fT = proj(x, oy, baseH);
    const bB = proj(x, oy + SLOPE_DEPTH, 0), bT = proj(x, oy + SLOPE_DEPTH, baseH + RISE);
    svg += `<line x1="${r1(fB.x)}" y1="${r1(fB.y)}" x2="${r1(fT.x)}" y2="${r1(fT.y)}" stroke="#6b7480" stroke-width="3.2" stroke-linecap="round"/>`;
    svg += `<line x1="${r1(bB.x)}" y1="${r1(bB.y)}" x2="${r1(bT.x)}" y2="${r1(bT.y)}" stroke="#6b7480" stroke-width="3.2" stroke-linecap="round"/>`;
    svg += `<line x1="${r1(fB.x)}" y1="${r1(fB.y)}" x2="${r1(bT.x)}" y2="${r1(bT.y)}" stroke="#6b7480" stroke-width="1.8"/>`; // دعامة مثلث
    svg += `<line x1="${r1(fT.x)}" y1="${r1(fT.y)}" x2="${r1(bT.x)}" y2="${r1(bT.y)}" stroke="#5b6673" stroke-width="1.6"/>`; // عارضة علوية
  }

  // سطح الألواح: 2 طابق × cols، الوجه للقارئ
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols, u1 = (c + 1) / cols, v0 = r / 2, v1 = (r + 1) / 2;
      const tA = lerp(FL, FR, u0), bA = lerp(BL, BR, u0), tB = lerp(FL, FR, u1), bB = lerp(BL, BR, u1);
      const p1 = lerp(tA, bA, v0), p2 = lerp(tB, bB, v0), p3 = lerp(tB, bB, v1), p4 = lerp(tA, bA, v1);
      svg += `<polygon points="${A(pj(p1))} ${A(pj(p2))} ${A(pj(p3))} ${A(pj(p4))}" fill="url(#pv)" stroke="#0e1e3c" stroke-width="1.1"/>`;
      svg += cells(p1, p2, p3, p4);
    }
  }
  const surf = `${A(pj(FL))} ${A(pj(FR))} ${A(pj(BR))} ${A(pj(BL))}`;
  svg += `<polygon points="${surf}" fill="url(#gloss)" opacity="0.4"/>`;
  svg += `<polygon points="${surf}" fill="none" stroke="#0a1830" stroke-width="2.3"/>`;

  const pts = [proj(ox, oy - 0.7, 0), proj(ox + W, oy, 0), pj(FL), pj(FR), pj(BL), pj(BR), proj(ox, oy + SLOPE_DEPTH, 0)];
  return { svg, pts };
}

export function buildStructureSvg(panelCount) {
  const tables = splitTables(panelCount);
  if (!tables.length) return '';
  const frontCols = tables[0].cols;
  const backCols = tables[1] ? tables[1].cols : 0;
  const frontW = frontCols * PANEL_W_M;

  const drawn = [];
  const pts = [];
  // الطاولة الخلفية أعمق (أعلى-يسار) وأعلى قليلاً — ترسم أولاً
  if (backCols) {
    const t = table(-1.2, SLOPE_DEPTH + 1.4, FRONT_H + BACK_LIFT, backCols);
    drawn.push(t.svg); t.pts.forEach((p) => pts.push(p));
  }
  const f = table(0, 0, FRONT_H, frontCols);
  drawn.push(f.svg); f.pts.forEach((p) => pts.push(p));

  // منصّة كونكريت تحت الكل (ترسم أولاً)
  const backW = backCols ? backCols * PANEL_W_M : frontW;
  const minPx = Math.min(0, -1.2) - 0.9, maxPx = Math.max(frontW, -1.2 + backW) + 0.9;
  const minPy = -0.9, maxPy = (backCols ? SLOPE_DEPTH + 1.4 : 0) + SLOPE_DEPTH + 0.9;
  const platform = box(minPx, minPy, maxPx - minPx, maxPy - minPy, 0.3, -0.3, '#d6dade', '#aeb4bb', '#c1c6cc');
  [proj(minPx, minPy, 0), proj(maxPx, minPy, 0), proj(maxPx, maxPy, 0), proj(minPx, maxPy, 0)].forEach((p) => pts.push(p));

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), pad = 30;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const w = maxX - minX, h = maxY - minY;

  return `<svg viewBox="${r1(minX)} ${r1(minY)} ${r1(w)} ${r1(h)}" width="${r1(w)}" height="${r1(h)}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pv" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#5a6fb2"/><stop offset="0.5" stop-color="#35498e"/><stop offset="1" stop-color="#24366e"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="0.5">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.42" stop-color="#fff" stop-opacity="0.4"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.58"/><stop offset="0.58" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${platform}${drawn.join('')}
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
.mkt-sheet .stage svg { max-width: 100%; max-height: 540px; height: auto; filter: drop-shadow(0 20px 26px rgba(20,48,92,0.28)); }
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
