// مخطط تخيّلي لهيكل الألواح الشمسية — يتولّد تلقائياً حسب عدد ألواح العرض،
// ويلتصق بصفحته الخاصة بآخر ملف الـPDF. الهيكل طابقان (صفّان بورتريت فوق بعض)
// مقسوم على طاولتين: أمامية واطية + خلفية أعلى (مثل تصميم الشركة المعتمد).

// أبعاد اللوح القياسية (بورتريت) — لوح ثنائي الوجه 600–660 واط
const PANEL_W_M = 1.134; // عرض اللوح (بالمتر) — يمتد عرضياً على الطاولة
const PANEL_L_M = 2.384; // طول اللوح — يمتد على ميل الطاولة (طابقان = طولان)
const TILT_DEG = 30; // زاوية ميل مناسبة للعراق
const FRONT_POST_M = 0.6; // ارتفاع العمود الأمامي عن الأرض

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
// الأعمدة = المجموع ÷ 4 (لأن طاولتين × طابقين)، والزيادة الفردية تروح للطاولة الأمامية.
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
const r1 = (x) => Math.round(x * 10) / 10;

// شبكة ألواح طاولة واحدة (منظر مسطّح للسطح المائل) — كل خلية لوح أزرق بخطوط الوحدة
function tableGridSvg(x, y, cols, rows, cw, ch, label) {
  let s = `<g>`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = x + c * cw;
      const py = y + r * ch;
      s += `<rect x="${r1(px)}" y="${r1(py)}" width="${r1(cw)}" height="${r1(ch)}" fill="#1c3f7a" stroke="#dfe7f2" stroke-width="1"/>`;
      // خطوط الخلايا داخل اللوح (تفصيلتان أفقيتان + عمود منتصف)
      s += `<line x1="${r1(px)}" y1="${r1(py + ch / 3)}" x2="${r1(px + cw)}" y2="${r1(py + ch / 3)}" stroke="#3a5c96" stroke-width="0.6"/>`;
      s += `<line x1="${r1(px)}" y1="${r1(py + (2 * ch) / 3)}" x2="${r1(px + cw)}" y2="${r1(py + (2 * ch) / 3)}" stroke="#3a5c96" stroke-width="0.6"/>`;
      s += `<line x1="${r1(px + cw / 2)}" y1="${r1(py)}" x2="${r1(px + cw / 2)}" y2="${r1(py + ch)}" stroke="#3a5c96" stroke-width="0.6"/>`;
    }
  }
  const w = cols * cw;
  const h = rows * ch;
  // إطار الطاولة + عنوانها
  s += `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="none" stroke="#1a3a5c" stroke-width="1.5"/>`;
  s += `<text x="${r1(x + w / 2)}" y="${r1(y - 8)}" text-anchor="middle" font-family="Cairo" font-size="13" font-weight="700" fill="#1a3a5c">${esc(label)} — ${rows}×${cols}</text>`;
  s += `</g>`;
  return { svg: s, w, h };
}

// سهم بعد (خط مع طرفين) + نص القياس
function dim(x1, y1, x2, y2, text, horizontal = true) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  let s = `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="#b8860b" stroke-width="1" marker-start="url(#ar)" marker-end="url(#ar)"/>`;
  s += `<text x="${r1(midX)}" y="${r1(horizontal ? midY - 5 : midY)}" text-anchor="middle" font-family="Cairo" font-size="11" font-weight="700" fill="#8a5b00">${esc(text)}</text>`;
  return s;
}

// المخطط الكامل: منظر علوي للطاولات + مقطع جانبي بالميل والأبعاد
export function buildStructureSvg(panelCount) {
  const tables = splitTables(panelCount);
  if (!tables.length) return '';
  const PXM = 60; // بكسل لكل متر
  const cw = PANEL_W_M * PXM; // عرض خلية اللوح
  const ch = PANEL_L_M * PXM; // طول اللوح (طابق واحد)
  const maxCols = Math.max(...tables.map((t) => t.cols));
  const planW = maxCols * cw;
  const marginX = 70;
  const width = Math.max(560, planW + marginX * 2);

  const tilt = (TILT_DEG * Math.PI) / 180;
  const slopeM = 2 * PANEL_L_M; // طول الميل (طابقان)
  const baseM = slopeM * Math.cos(tilt); // العمق الأرضي
  const riseM = slopeM * Math.sin(tilt); // الارتفاع
  const backPostM = FRONT_POST_M + riseM;

  let body = '';
  let y = 40;
  const cx = width / 2;
  for (const t of tables) {
    const w = t.cols * cw;
    const g = tableGridSvg(cx - w / 2, y, t.cols, 2, cw, ch, t.label);
    body += g.svg;
    // بعد العرض أسفل الطاولة
    body += dim(cx - w / 2, y + g.h + 22, cx + w / 2, y + g.h + 22, `العرض ${r1(t.cols * PANEL_W_M)} م`);
    y += g.h + 60;
  }

  // بعد الطول على الميل (يسار أول طاولة)
  const h2 = 2 * ch;
  body += dim(marginX - 28, 40, marginX - 28, 40 + h2, `${r1(slopeM)} م (طابقان)`, false);

  // ===== المقطع الجانبي =====
  y += 10;
  const sideY = y;
  const sideBaseX = marginX;
  const basePx = baseM * PXM;
  const risePx = riseM * PXM;
  const frontPx = FRONT_POST_M * PXM;
  const groundY = sideY + risePx + frontPx + 30;
  body += `<text x="${r1(cx)}" y="${r1(sideY - 6)}" text-anchor="middle" font-family="Cairo" font-size="13" font-weight="700" fill="#1a3a5c">المقطع الجانبي (زاوية الميل ${TILT_DEG}°)</text>`;
  // الأرض
  body += `<line x1="${r1(sideBaseX - 10)}" y1="${r1(groundY)}" x2="${r1(sideBaseX + basePx + 40)}" y2="${r1(groundY)}" stroke="#555" stroke-width="2"/>`;
  const frontX = sideBaseX + basePx; // العمود الأمامي (الأقرب/الأوطى) على اليمين بصرياً
  const backX = sideBaseX;
  const frontTopY = groundY - frontPx;
  const backTopY = groundY - frontPx - risePx;
  // العمودان
  body += `<line x1="${r1(frontX)}" y1="${r1(groundY)}" x2="${r1(frontX)}" y2="${r1(frontTopY)}" stroke="#1a3a5c" stroke-width="3"/>`;
  body += `<line x1="${r1(backX)}" y1="${r1(groundY)}" x2="${r1(backX)}" y2="${r1(backTopY)}" stroke="#1a3a5c" stroke-width="3"/>`;
  // سطح الألواح المائل
  body += `<line x1="${r1(frontX)}" y1="${r1(frontTopY)}" x2="${r1(backX)}" y2="${r1(backTopY)}" stroke="#1c3f7a" stroke-width="8" stroke-linecap="round"/>`;
  // دعامة قطرية
  body += `<line x1="${r1(backX)}" y1="${r1(groundY)}" x2="${r1(frontX)}" y2="${r1(frontTopY)}" stroke="#7a8a99" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  // أبعاد
  body += dim(frontX + 22, frontTopY, frontX + 22, groundY, `${r1(FRONT_POST_M)} م`, false);
  body += dim(backX - 26, backTopY, backX - 26, groundY, `${r1(backPostM)} م`, false);
  body += dim(backX, groundY + 24, frontX, groundY + 24, `العمق ${r1(baseM)} م`);
  // قوس الزاوية عند العمود الأمامي
  body += `<path d="M ${r1(frontX - 34)} ${r1(groundY)} A 34 34 0 0 1 ${r1(frontX - 34 * Math.cos(tilt))} ${r1(groundY - 34 * Math.sin(tilt))}" fill="none" stroke="#8a5b00" stroke-width="1"/>`;
  body += `<text x="${r1(frontX - 44)}" y="${r1(groundY - 12)}" font-family="Cairo" font-size="11" font-weight="700" fill="#8a5b00">${TILT_DEG}°</text>`;

  const height = groundY + 60;
  return `<svg viewBox="0 0 ${r1(width)} ${r1(height)}" width="${r1(width)}" height="${r1(height)}" xmlns="http://www.w3.org/2000/svg">
  <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M1,1 L7,4 L1,7" fill="none" stroke="#b8860b" stroke-width="1"/></marker></defs>
  <rect x="0" y="0" width="${r1(width)}" height="${r1(height)}" fill="#ffffff"/>
  ${body}
  </svg>`;
}

// صفحة كاملة للـPDF: ترويسة العنوان بهوية الشركة + المخطط + جدول المواصفات
export function buildStructurePageHtml(panelCount, company = {}) {
  const tables = splitTables(panelCount);
  if (!tables.length) return '';
  const svg = buildStructureSvg(panelCount);
  const arrange = tables.map((t) => `${t.label.replace('الطاولة ', '')} ${t.rows}×${t.cols}`).join(' + ');
  const tilt = (TILT_DEG * Math.PI) / 180;
  const backPostM = FRONT_POST_M + 2 * PANEL_L_M * Math.sin(tilt);
  const specs = [
    ['إجمالي الألواح', `${panelCount} لوح`],
    ['عدد الطاولات', `${tables.length}`],
    ['ترتيب الطاولات', arrange],
    ['أبعاد اللوح', `${PANEL_W_M} م × ${PANEL_L_M} م (بورتريت)`],
    ['زاوية الميل', `${TILT_DEG}°`],
    ['ارتفاع العمود الأمامي', `${FRONT_POST_M} م`],
    ['ارتفاع العمود الخلفي', `${r1(backPostM)} م`],
  ];
  const rows = specs.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join('');
  const logo = company.logo_path && String(company.logo_path).startsWith('data:') ? company.logo_path : null;
  return `
<style>
.struct-sheet * { box-sizing: border-box; }
.struct-sheet { font-family: 'Cairo', sans-serif; direction: rtl; width: 794px; padding: 28px; background: #fff; color: #1a1a1a; }
.struct-sheet .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1a3a5c; padding-bottom: 8px; margin-bottom: 10px; }
.struct-sheet .head .co { font-size: 1.05rem; font-weight: 700; color: #1a3a5c; }
.struct-sheet .head img { width: 46px; height: 46px; object-fit: contain; }
.struct-sheet .title-bar { background: #1a3a5c; color: #fff; text-align: center; font-weight: 700; font-size: 1.05rem; padding: 7px; border-radius: 3px; margin-bottom: 14px; }
.struct-sheet .diagram { text-align: center; margin-bottom: 14px; }
.struct-sheet .specs { width: 60%; border-collapse: collapse; margin: 0 auto; }
.struct-sheet .specs td { border: 1px solid #c7d2db; padding: 6px 12px; font-size: 0.9rem; }
.struct-sheet .specs .k { background: #eef3f8; font-weight: 700; color: #1a3a5c; width: 45%; }
.struct-sheet .note { text-align: center; color: #667; font-size: 0.78rem; margin-top: 12px; }
</style>
<div class="struct-sheet">
  <div class="head">
    <div class="co">${esc(company.company_name || 'شركة بلاد اوتو للطاقة الشمسية')}</div>
    ${logo ? `<img src="${logo}" alt=""/>` : ''}
  </div>
  <div class="title-bar">المخطط التخيّلي لهيكل الألواح الشمسية</div>
  <div class="diagram">${svg}</div>
  <table class="specs"><tbody>${rows}</tbody></table>
  <div class="note">مخطط توضيحي بالأبعاد التقريبية — الأبعاد النهائية تُثبّت بعد الكشف الميداني.</div>
</div>`;
}
