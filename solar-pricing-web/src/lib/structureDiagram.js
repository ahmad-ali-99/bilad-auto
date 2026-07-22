// رسم ثلاثي الأبعاد تسويقي لهيكل الألواح الشمسية — يتولّد تلقائياً حسب عدد ألواح
// العرض ويلتصق بصفحته الخاصة بآخر ملف الـPDF. طابقان (صفّان بورتريت) مقسومان على
// طاولتين (أمامية + خلفية) بمنظور آيزومتري بألواح لامعة وأعمدة وقواعد كونكريت.

const PANEL_W_M = 1.134; // عرض اللوح (يمتد عرضياً على الصف)
const PANEL_L_M = 2.10; // طول اللوح على الميل (طابق واحد)
const TILT_DEG = 25;
const FRONT_POST_M = 0.6;

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

// تقسيم عدد الألواح لطاولتين (أمامية + خلفية)، كل طاولة طابقان (صفّان) × أعمدة.
// الأعمدة = المجموع ÷ 4، والزيادة الفردية تروح للطاولة الأمامية.
// مثال: 24 لوح ← أمامية 2×6 + خلفية 2×6 ؛ 10 ألواح ← أمامية 2×3 + خلفية 2×2.
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
const ISO_COS = Math.cos(Math.PI / 6); // 30°
const ISO_SIN = Math.sin(Math.PI / 6);
const S = 40; // بكسل لكل متر
// نقطة عالم (x=عرض الصف, y=ارتفاع, z=عمق) → إحداثيات شاشة
function iso(x, y, z) {
  return { x: (x - z) * ISO_COS * S, y: ((x + z) * ISO_SIN - y) * S };
}
const pt = (p) => `${r1(p.x)},${r1(p.y)}`;
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

// طاولة واحدة: سطح مائل مجسّم بالألواح + أعمدة + قواعد كونكريت + ظل أرضي
function isoTable(ox, oz, cols) {
  const beta = (TILT_DEG * Math.PI) / 180;
  const W = cols * PANEL_W_M;
  const slope = 2 * PANEL_L_M;
  const dyBack = slope * Math.sin(beta);
  const dzBack = slope * Math.cos(beta);
  const frontH = FRONT_POST_M;
  // أركان سطح الألواح (بالعالم)
  const FL = { x: ox, y: frontH, z: oz };
  const FR = { x: ox + W, y: frontH, z: oz };
  const BL = { x: ox, y: frontH + dyBack, z: oz + dzBack };
  const BR = { x: ox + W, y: frontH + dyBack, z: oz + dzBack };
  const shapes = [];

  // ظل أرضي ناعم تحت الطاولة
  const g = (p) => ({ x: p.x, y: 0.02, z: p.z });
  shapes.push({
    depth: -1,
    svg: `<polygon points="${pt(iso(g(FL).x, 0, g(FL).z))} ${pt(iso(g(FR).x, 0, g(FR).z))} ${pt(iso(g(BR).x, 0, g(BR).z))} ${pt(iso(g(BL).x, 0, g(BL).z))}" fill="#000" opacity="0.12"/>`,
  });

  // القواعد الكونكريتية والأعمدة عند الأركان الأربعة
  function post(cornerTop) {
    const base = { x: cornerTop.x, y: 0, z: cornerTop.z };
    const top = iso(cornerTop.x, cornerTop.y, cornerTop.z);
    const bot = iso(base.x, 0, base.z);
    // قاعدة كونكريت (مكعب آيزومتري صغير)
    const cs = 0.28;
    const c000 = iso(base.x - cs, 0, base.z - cs), c100 = iso(base.x + cs, 0, base.z - cs);
    const c110 = iso(base.x + cs, 0, base.z + cs), c010 = iso(base.x - cs, 0, base.z + cs);
    const h = 0.32;
    const t000 = iso(base.x - cs, h, base.z - cs), t100 = iso(base.x + cs, h, base.z - cs);
    const t110 = iso(base.x + cs, h, base.z + cs), t010 = iso(base.x - cs, h, base.z + cs);
    const cube =
      `<polygon points="${pt(t000)} ${pt(t100)} ${pt(t110)} ${pt(t010)}" fill="#d9dde2"/>` +
      `<polygon points="${pt(t100)} ${pt(c100)} ${pt(c110)} ${pt(t110)}" fill="#a9b0b8"/>` +
      `<polygon points="${pt(t010)} ${pt(t110)} ${pt(c110)} ${pt(c010)}" fill="#bcc2c9"/>`;
    const leg = `<line x1="${r1(bot.x)}" y1="${r1(bot.y)}" x2="${r1(top.x)}" y2="${r1(top.y)}" stroke="#5b6673" stroke-width="4" stroke-linecap="round"/>`;
    return { z: cornerTop.z, svg: cube + leg };
  }
  // الأعمدة الخلفية أعمق (ترسم أولاً)، ثم الأمامية
  shapes.push({ depth: BL.z + 0.5, svg: post(BL).svg });
  shapes.push({ depth: BR.z + 0.5, svg: post(BR).svg });
  shapes.push({ depth: FL.z + 0.4, svg: post(FL).svg });
  shapes.push({ depth: FR.z + 0.4, svg: post(FR).svg });

  // دعامة قطرية جانبية (مثلث الهيكل) على الجهتين
  const braceL = `<line x1="${r1(iso(FL.x, 0, FL.z).x)}" y1="${r1(iso(FL.x, 0, FL.z).y)}" x2="${r1(iso(BL.x, BL.y, BL.z).x)}" y2="${r1(iso(BL.x, BL.y, BL.z).y)}" stroke="#5b6673" stroke-width="2.5"/>`;
  const braceR = `<line x1="${r1(iso(FR.x, 0, FR.z).x)}" y1="${r1(iso(FR.x, 0, FR.z).y)}" x2="${r1(iso(BR.x, BR.y, BR.z).x)}" y2="${r1(iso(BR.x, BR.y, BR.z).y)}" stroke="#5b6673" stroke-width="2.5"/>`;
  shapes.push({ depth: FL.z + 0.45, svg: braceL + braceR });

  // سطح الألواح: شبكة 2 طابق × cols عمود، كل خلية لوح لامع
  let grid = '';
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols, u1 = (c + 1) / cols, v0 = r / 2, v1 = (r + 1) / 2;
      const topA = lerp(FL, FR, u0), botA = lerp(BL, BR, u0);
      const topB = lerp(FL, FR, u1), botB = lerp(BL, BR, u1);
      const p1 = lerp(topA, botA, v0), p2 = lerp(topB, botB, v0);
      const p3 = lerp(topB, botB, v1), p4 = lerp(topA, botA, v1);
      const P = (p) => pt(iso(p.x, p.y, p.z));
      grid += `<polygon points="${P(p1)} ${P(p2)} ${P(p3)} ${P(p4)}" fill="url(#pv)" stroke="#0d1f3c" stroke-width="1"/>`;
    }
  }
  // إطار خارجي + لمعة قطرية على السطح كامل
  const surf = `${pt(iso(FL.x, FL.y, FL.z))} ${pt(iso(FR.x, FR.y, FR.z))} ${pt(iso(BR.x, BR.y, BR.z))} ${pt(iso(BL.x, BL.y, BL.z))}`;
  const gloss = `<polygon points="${surf}" fill="url(#gloss)" opacity="0.5"/>`;
  const frame = `<polygon points="${surf}" fill="none" stroke="#0a1830" stroke-width="2.5"/>`;
  shapes.push({ depth: (FL.z + BL.z) / 2, svg: grid + gloss + frame });

  return { shapes, W, minZ: FL.z, maxZ: BL.z };
}

// المشهد الكامل: طاولتان (أمامية أقرب، خلفية أعمق وأعلى) بترتيب رسم صحيح للعمق
export function buildStructureSvg(panelCount) {
  const tables = splitTables(panelCount);
  if (!tables.length) return '';
  const frontCols = tables[0].cols;
  const backCols = tables[1] ? tables[1].cols : 0;

  const collected = [];
  // الطاولة الخلفية أعمق وأزحناها بالعرض حتى تبين خلف الأمامية (مثل الصورة)
  if (backCols) {
    const back = isoTable(-1.4, 4.6, backCols);
    for (const s of back.shapes) collected.push(s);
  }
  const front = isoTable(0, 0, frontCols);
  for (const s of front.shapes) collected.push(s);

  // ترتيب حسب العمق (الأعمق أولاً)
  collected.sort((a, b) => b.depth - a.depth);
  const body = collected.map((s) => s.svg).join('');

  // احسب صندوق الإحاطة من كل النقاط المرسومة تقريبياً عبر عينات الأركان
  const beta = (TILT_DEG * Math.PI) / 180;
  const slope = 2 * PANEL_L_M;
  const pts = [];
  const addTable = (ox, oz, cols) => {
    const W = cols * PANEL_W_M;
    [
      iso(ox - 0.4, 0, oz - 0.4), iso(ox + W + 0.4, 0, oz - 0.4),
      iso(ox, FRONT_POST_M, oz), iso(ox + W, FRONT_POST_M, oz),
      iso(ox, FRONT_POST_M + slope * Math.sin(beta), oz + slope * Math.cos(beta)),
      iso(ox + W, FRONT_POST_M + slope * Math.sin(beta), oz + slope * Math.cos(beta)),
    ].forEach((p) => pts.push(p));
  };
  addTable(0, 0, frontCols);
  if (backCols) addTable(-1.4, 4.6, backCols);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const pad = 30;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const w = maxX - minX, h = maxY - minY;

  return `<svg viewBox="${r1(minX)} ${r1(minY)} ${r1(w)} ${r1(h)}" width="${r1(w)}" height="${r1(h)}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pv" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a5aa8"/><stop offset="0.5" stop-color="#173a78"/><stop offset="1" stop-color="#0e2350"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="0.6">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.7"/><stop offset="0.56" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${body}
  </svg>`;
}

// صفحة كاملة للـPDF: خلفية سماوية متدرجة + شمس + العنوان التسويقي + الرسم المجسّم + شارة
export function buildStructurePageHtml(panelCount, company = {}) {
  const tables = splitTables(panelCount);
  if (!tables.length) return '';
  const svg = buildStructureSvg(panelCount);
  const logo = company.logo_path && String(company.logo_path).startsWith('data:') ? company.logo_path : null;
  const co = company.company_name || 'شركة بلاد اوتو للطاقة الشمسية';
  return `
<style>
.mkt-sheet * { box-sizing: border-box; }
.mkt-sheet { font-family: 'Cairo', sans-serif; direction: rtl; width: 794px; min-height: 1080px; padding: 0 0 34px; background:
  radial-gradient(120% 80% at 80% -10%, #ffe8a8 0%, rgba(255,232,168,0) 42%),
  linear-gradient(180deg, #dff0ff 0%, #eaf6ff 40%, #f4f7f2 72%, #e8efe1 100%);
  position: relative; overflow: hidden; display: flex; flex-direction: column; }
.mkt-sheet .sun { position: absolute; top: 46px; left: 60px; width: 92px; height: 92px; border-radius: 50%;
  background: radial-gradient(circle, #fff6cf 0%, #ffd451 55%, #ffbf2e 100%); box-shadow: 0 0 46px 16px rgba(255,197,64,0.55); }
.mkt-sheet .ground { position: absolute; left: 0; right: 0; bottom: 0; height: 34%;
  background: linear-gradient(180deg, rgba(180,205,150,0) 0%, #cfe0b6 60%, #bcd39c 100%); }
.mkt-sheet .head { position: relative; display: flex; justify-content: space-between; align-items: center; padding: 22px 30px 0; }
.mkt-sheet .head .co { font-size: 1.05rem; font-weight: 800; color: #123; text-shadow: 0 1px 0 #fff; }
.mkt-sheet .head img { width: 54px; height: 54px; object-fit: contain; }
.mkt-sheet .hero { position: relative; text-align: center; margin: 6px 24px 0; }
.mkt-sheet .hero h1 { font-size: 1.7rem; font-weight: 800; color: #12305c; margin: 8px 0 2px; text-shadow: 0 1px 0 #fff; }
.mkt-sheet .hero p { font-size: 1rem; color: #2c4a72; margin: 0; font-weight: 600; }
.mkt-sheet .stage { position: relative; flex: 1; display: flex; align-items: center; justify-content: center; padding: 10px 24px; }
.mkt-sheet .stage svg { max-width: 100%; max-height: 560px; height: auto; filter: drop-shadow(0 20px 26px rgba(20,48,92,0.3)); }
.mkt-sheet .badges { position: relative; display: flex; justify-content: center; gap: 14px; margin: 4px 0 0; flex-wrap: wrap; }
.mkt-sheet .badge { background: rgba(255,255,255,0.86); border: 1px solid #cdd9e6; border-radius: 40px; padding: 7px 20px;
  font-weight: 800; color: #12305c; font-size: 0.95rem; box-shadow: 0 4px 10px rgba(20,48,92,0.12); }
.mkt-sheet .badge b { color: #f5a623; }
.mkt-sheet .foot { position: relative; margin-top: 14px; text-align: center; color: #3a5372; font-size: 0.82rem; font-weight: 600; }
</style>
<div class="mkt-sheet">
  <div class="sun"></div>
  <div class="ground"></div>
  <div class="head">
    <div class="co">${esc(co)}</div>
    ${logo ? `<img src="${logo}" alt=""/>` : ''}
  </div>
  <div class="hero">
    <h1>منظومتك الشمسية بتصميم احترافي</h1>
    <p>نموذج تخيّلي لهيكل تركيب الألواح — جودة تدوم لعشرات السنين</p>
  </div>
  <div class="stage">${svg}</div>
  <div class="badges">
    <span class="badge">إجمالي الألواح <b>${panelCount}</b></span>
    <span class="badge">عدد الطاولات <b>${tables.length}</b></span>
    <span class="badge">هيكل مغلون مقاوم للرياح</span>
  </div>
  <div class="foot">${esc(co)} — نموذج توضيحي، تُثبّت التفاصيل النهائية بعد الكشف الميداني</div>
</div>`;
}
