// رسم ثلاثي الأبعاد تسويقي واقعي لهيكل الألواح — منصّة كونكريت + قوالب بالاست +
// أرجل هيكل + ألواح بنسيج خلايا، يتولّد حسب عدد ألواح العرض ويلتصق بآخر الـPDF.

const PANEL_W_M = 1.134;
const PANEL_L_M = 2.05;
const TILT_DEG = 24;
const FRONT_POST_M = 0.55;

// كشف بنود الألواح ضمن قائمة العرض (يستثني الهيكل والصبات والكيبلات)
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

// تقسيم الألواح لطاولتين (أمامية + خلفية)، كل طاولة طابقان × أعمدة.
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

// ===== منظور آيزومتري =====
const ISO_COS = Math.cos(Math.PI / 6);
const ISO_SIN = Math.sin(Math.PI / 6);
const S = 40;
function iso(x, y, z) {
  return { x: (x - z) * ISO_COS * S, y: ((x + z) * ISO_SIN - y) * S };
}
const pt = (p) => `${r1(p.x)},${r1(p.y)}`;
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

// مكعب آيزومتري (منصّة/قالب كونكريت): وجه علوي + وجهان جانبيان
function isoBox(x0, z0, sx, sz, h, yb, cTop, cL, cR) {
  const x1 = x0 + sx, z1 = z0 + sz, yt = yb + h;
  const A = iso(x0, yt, z0), B = iso(x1, yt, z0), C = iso(x1, yt, z1), D = iso(x0, yt, z1);
  const b = iso(x1, yb, z0), c = iso(x1, yb, z1), d = iso(x0, yb, z1);
  return (
    `<polygon points="${pt(B)} ${pt(C)} ${pt(c)} ${pt(b)}" fill="${cR}"/>` +
    `<polygon points="${pt(D)} ${pt(C)} ${pt(c)} ${pt(d)}" fill="${cL}"/>` +
    `<polygon points="${pt(A)} ${pt(B)} ${pt(C)} ${pt(D)}" fill="${cTop}"/>`
  );
}

// خطوط خلايا داخل وحدة لوح (شبكة رفيعة تعطي مظهر اللوح الواقعي)
// p1=أمامي-يسار، p2=أمامي-يمين، p3=خلفي-يمين، p4=خلفي-يسار (بإحداثيات السطح)
function moduleCells(p1, p2, p3, p4) {
  const sp = (p) => iso(p.x, p.y, p.z);
  const line = (a, b) => `<line x1="${r1(a.x)}" y1="${r1(a.y)}" x2="${r1(b.x)}" y2="${r1(b.y)}" stroke="#93a7da" stroke-width="0.5" opacity="0.55"/>`;
  let s = '';
  for (let i = 1; i < 6; i++) { const t = i / 6; s += line(sp(lerp(p1, p2, t)), sp(lerp(p4, p3, t))); }
  for (let j = 1; j < 3; j++) { const t = j / 3; s += line(sp(lerp(p1, p4, t)), sp(lerp(p2, p3, t))); }
  return s;
}

// طاولة واحدة: سطح الألواح المائل + أعمدة + دعامات + قوالب بالاست بالصف الأمامي
function isoTable(ox, oz, cols) {
  const beta = (TILT_DEG * Math.PI) / 180;
  const W = cols * PANEL_W_M;
  const slope = 2 * PANEL_L_M;
  const dyBack = slope * Math.sin(beta);
  const dzBack = slope * Math.cos(beta);
  const fH = FRONT_POST_M;
  const FL = { x: ox, y: fH, z: oz }, FR = { x: ox + W, y: fH, z: oz };
  const BL = { x: ox, y: fH + dyBack, z: oz + dzBack }, BR = { x: ox + W, y: fH + dyBack, z: oz + dzBack };
  const shapes = [];

  // ظل أرضي
  shapes.push({ depth: -2, svg: `<polygon points="${pt(iso(FL.x, 0, FL.z))} ${pt(iso(FR.x, 0, FR.z))} ${pt(iso(BR.x, 0, BR.z))} ${pt(iso(BL.x, 0, BL.z))}" fill="#000" opacity="0.10"/>` });

  // قوالب بالاست كونكريتية بالصف الأمامي (واحد لكل عمود تقريباً)
  const nBallast = Math.max(2, Math.round(cols));
  let ball = '';
  for (let i = 0; i <= nBallast; i++) {
    const bx = ox + (i / nBallast) * W - 0.2;
    ball += isoBox(bx, oz - 0.62, 0.4, 0.4, 0.36, 0, '#e0e3e7', '#b6bcc4', '#c8cdd3');
  }
  shapes.push({ depth: oz - 0.4, svg: ball });

  // أعمدة أمامية وخلفية (عند الأركان + منتصف كل عمودين)
  function leg(x, zf, yTop) {
    const bot = iso(x, 0, zf), top = iso(x, yTop.y, yTop.z);
    return `<line x1="${r1(bot.x)}" y1="${r1(bot.y)}" x2="${r1(top.x)}" y2="${r1(top.y)}" stroke="#6b7480" stroke-width="3.5" stroke-linecap="round"/>`;
  }
  let posts = '';
  const step = Math.max(1, Math.round(cols / 3));
  for (let c = 0; c <= cols; c += step) {
    const x = ox + (c / cols) * W;
    posts += leg(x, oz, { y: fH, z: oz }); // أمامي
    posts += leg(x, oz + dzBack, { y: fH + dyBack, z: oz + dzBack }); // خلفي
    // دعامة قطرية (مثلث الهيكل)
    const f = iso(x, 0, oz), bk = iso(x, fH + dyBack, oz + dzBack);
    posts += `<line x1="${r1(f.x)}" y1="${r1(f.y)}" x2="${r1(bk.x)}" y2="${r1(bk.y)}" stroke="#6b7480" stroke-width="2"/>`;
  }
  shapes.push({ depth: oz + 0.3, svg: posts });

  // سطح الألواح: شبكة 2 طابق × cols
  let grid = '';
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols, u1 = (c + 1) / cols, v0 = r / 2, v1 = (r + 1) / 2;
      const tA = lerp(FL, FR, u0), bA = lerp(BL, BR, u0), tB = lerp(FL, FR, u1), bB = lerp(BL, BR, u1);
      const p1 = lerp(tA, bA, v0), p2 = lerp(tB, bB, v0), p3 = lerp(tB, bB, v1), p4 = lerp(tA, bA, v1);
      const P = (p) => pt(iso(p.x, p.y, p.z));
      grid += `<polygon points="${P(p1)} ${P(p2)} ${P(p3)} ${P(p4)}" fill="url(#pv)" stroke="#0e1e3c" stroke-width="1.2"/>`;
      grid += moduleCells(p1, p2, p3, p4);
    }
  }
  const surf = `${pt(iso(FL.x, FL.y, FL.z))} ${pt(iso(FR.x, FR.y, FR.z))} ${pt(iso(BR.x, BR.y, BR.z))} ${pt(iso(BL.x, BL.y, BL.z))}`;
  const gloss = `<polygon points="${surf}" fill="url(#gloss)" opacity="0.45"/>`;
  const frame = `<polygon points="${surf}" fill="none" stroke="#0a1830" stroke-width="2.5"/>`;
  shapes.push({ depth: (FL.z + BL.z) / 2 + 0.5, svg: grid + gloss + frame });

  return { shapes };
}

export function buildStructureSvg(panelCount) {
  const tables = splitTables(panelCount);
  if (!tables.length) return '';
  const frontCols = tables[0].cols;
  const backCols = tables[1] ? tables[1].cols : 0;
  const layout = [{ ox: 0, oz: 0, cols: frontCols }];
  if (backCols) layout.unshift({ ox: -1.5, oz: 4.8, cols: backCols });

  const collected = [];
  for (const t of layout) for (const s of isoTable(t.ox, t.oz, t.cols).shapes) collected.push(s);
  collected.sort((a, b) => b.depth - a.depth);

  // صندوق الإحاطة من عيّنات الأركان
  const beta = (TILT_DEG * Math.PI) / 180, slope = 2 * PANEL_L_M;
  const pts = [];
  for (const t of layout) {
    const W = t.cols * PANEL_W_M;
    [
      iso(t.ox - 0.6, 0, t.oz - 0.6), iso(t.ox + W + 0.6, 0, t.oz - 0.6),
      iso(t.ox, FRONT_POST_M + slope * Math.sin(beta), t.oz + slope * Math.cos(beta)),
      iso(t.ox + W, FRONT_POST_M + slope * Math.sin(beta), t.oz + slope * Math.cos(beta)),
      iso(t.ox, 0, t.oz + slope * Math.cos(beta) + 0.6),
    ].forEach((p) => pts.push(p));
  }
  // المنصّة الكونكريتية تحت كل شيء
  const allX = layout.flatMap((t) => [t.ox, t.ox + t.cols * PANEL_W_M]);
  const allZ = layout.flatMap((t) => [t.oz, t.oz + slope * Math.cos(beta)]);
  const px0 = Math.min(...allX) - 0.8, px1 = Math.max(...allX) + 0.8;
  const pz0 = Math.min(...allZ) - 1.0, pz1 = Math.max(...allZ) + 0.9;
  const platform = isoBox(px0, pz0, px1 - px0, pz1 - pz0, 0.35, -0.35, '#d4d8dd', '#a9afb7', '#bcc1c8');
  [iso(px0, -0.35, pz0), iso(px1, 0, pz0), iso(px1, 0, pz1), iso(px0, 0, pz1)].forEach((p) => pts.push(p));

  const body = platform + collected.map((s) => s.svg).join('');
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), pad = 28;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const w = maxX - minX, h = maxY - minY;

  return `<svg viewBox="${r1(minX)} ${r1(minY)} ${r1(w)} ${r1(h)}" width="${r1(w)}" height="${r1(h)}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pv" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4a5fa8"/><stop offset="0.5" stop-color="#33478c"/><stop offset="1" stop-color="#1e2f66"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="0.55">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.44" stop-color="#fff" stop-opacity="0.5"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.65"/><stop offset="0.56" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${body}
  </svg>`;
}

// صفحة تسويقية: خلفية سماوية + شمس + عنوان + الرسم + مميزات التركيب والصيانة 24/7
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
.mkt-sheet .stage svg { max-width: 100%; max-height: 500px; height: auto; filter: drop-shadow(0 20px 26px rgba(20,48,92,0.3)); }
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
