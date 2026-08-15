// صفحة الهيكل بالـPDF: تضمّن صورة الرندر 3D الحقيقي (من structure3d.js) بهوية الشركة
// مع مميزات التركيب والصيانة 24/7. منطق التقسيم هنا (بلا three) حتى three يتحمّل
// ديناميكياً وقت التصدير فقط ولا يثقل الحزمة الرئيسية.

// قاعدة التقسيم: طابقان دائماً، أعمدة = نصف عدد الألواح، حد أقصى 8 أعمدة (2×8=16 لوح).
// عدد الستركجرات = ceil((n/2)/8)، توزيع متوازن، والإضافي يرفع أقدامه (tier).
export function splitStructures(panelCount) {
  const n = Math.max(0, Math.round(panelCount));
  if (n <= 0) return [];
  const totalCols = Math.round(n / 2);
  const nStruct = Math.max(1, Math.ceil(totalCols / 8));
  const base = Math.floor(totalCols / nStruct);
  const extra = totalCols % nStruct;
  return Array.from({ length: nStruct }, (_, i) => ({ rows: 2, cols: base + (i < extra ? 1 : 0), tier: i }));
}

// أقصى عدد ستركجرات تُرسم بالمشهد التوضيحي. المشاريع الكبيرة تطلّع عشرات
// الستركجرات فيصير الرسم مزدحماً وصغيراً وما يخدم العرض — والصفحة أصلاً مكتوب
// عليها «نموذج توضيحي». فنرسم عيّنة مقروءة، والعدد الحقيقي مذكور بالنص وبالجدول.
export const MAX_DRAWN_STRUCTURES = 3;

// ستركجرات الرسم فقط (مو الحساب): محدودة العدد وبأعمدة معقولة حتى يبقى المشهد واضحاً
export function structuresForRender(panelCount) {
  const all = splitStructures(panelCount);
  if (all.length <= MAX_DRAWN_STRUCTURES) return all;
  return all.slice(0, MAX_DRAWN_STRUCTURES).map((s, i) => ({ ...s, tier: i }));
}

// اسم قديم للتوافق
export function splitTables(panelCount) {
  return splitStructures(panelCount);
}

// نعدّ فقط بند الألواح الشمسية الحقيقي. نشترط كلمة لوح/ألواح + مؤشر شمسي/ضوئي،
// ونستبعد بنوداً تذكر «ألواح» عرضاً (الانفيرتر «يستقبل ألواح»، البطارية «للوحدة»)
// أو بنود الهيكل/الصبّات/الكيبل/البورد — حتى يطابق العدد بالتصميم عددَ ألواح الأفر.
export function panelCountFromItems(items) {
  let n = 0;
  for (const it of items || []) {
    const d = String(it.description || '');
    const hasPanelWord = /ألواح|الواح|لوح|بانل|panel|module|pv/i.test(d);
    const isSolar = /شمسي|ضوئي|solar|بانل|panel|module|pv/i.test(d);
    const isOther = /هيكل|صب|كيبل|كابل|بورد|حماي|انفرتر|انفيرتر|inverter|بطاري|batter|شاحن|منظم|رصاص/i.test(d);
    if (hasPanelWord && isSolar && !isOther) n += Number(it.quantity) || 0;
  }
  return n;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// imgDataUrl = صورة PNG للرندر 3D (renderStructurePng). إذا فارغة تُرجع '' فتُتخطى الصفحة.
// capability (اختياري): { nightHours, dayAmps, ampNight, ampDay, batteries, inverters }
// نفس أرقام «قدرة المنظومة» اللي يشوفها البياع أثناء اختيار البطاريات والانفيرترات
// بند الكابينة من بنود العرض المحفوظ: العدد من الكمية، والسعة والقدرة من الوصف.
// نعتمد الوصف لأن البنود المحفوظة ما تحمل مواصفات المادة، وصفحة الغلاف تنبني بلا شبكة.
// ملاحظة: «كيلوواط·ساعة» و«kWh» لازم ما تنقرأ كقدرة — ولهذا النفي بعد كل صيغة.
export function integratedFromItems(items) {
  const line = (items || []).find((i) => /كابينة|hess|hoyultra/i.test(String(i.description || '')));
  if (!line) return null;
  const text = String(line.description || '');
  const kwh = Number((text.match(/([\d.]+)\s*(?:kwh|كيلوواط[·.]?\s*ساعة)/i) || [])[1]) || 0;
  const kw = Number((text.match(/([\d.]+)\s*(?:kw(?!h)|كيلوواط(?![·.]?\s*ساعة))/i) || [])[1]) || 0;
  return { units: Math.max(1, Math.round(Number(line.quantity) || 1)), kwh, kw };
}

// integrated (اختياري): { units, kwh, kw } — بالسستم المتكامل نعرض صورة الكابينة
// بدل رندر الستركجر، لأن مصفوفة بمئات الألواح تطلع مشوّهة وما تخدم العرض.
export function buildStructurePageHtml(panelCount, company = {}, imgDataUrl = '', capability = null, integrated = null) {
  const structs = splitStructures(panelCount);
  if (!imgDataUrl) return '';
  if (!integrated && !structs.length) return '';
  const logo = company.logo_path && String(company.logo_path).startsWith('data:') ? company.logo_path : null;
  const co = company.company_name || 'شركة بلاد اوتو للطاقة الشمسية';
  const feats = integrated
    ? [
        ['🔧', 'تركيب احترافي', 'فريق فني متخصص وتنفيذ دقيق حسب المواصفات'],
        ['❄️', 'تبريد سائل كامل', 'أداء بلا تخفيض حتى 50°م — بطاريات وانفيرتر بجهاز واحد'],
        ['🕐', 'صيانة ودعم 24/7', 'خدمة صيانة ومتابعة متوفرة على مدار الساعة'],
      ]
    : [
        ['🔧', 'تركيب احترافي', 'فريق فني متخصص وتنفيذ دقيق حسب المواصفات'],
        ['🛡️', 'هيكل مغلون متين', 'مقاوم للرياح والصدأ — يدوم لعشرات السنين'],
        ['🕐', 'صيانة ودعم 24/7', 'خدمة صيانة ومتابعة متوفرة على مدار الساعة'],
      ];
  // بطاقات القدرة الفعلية للمنظومة — تُبنى من أرقام هذا العرض تحديداً
  const cap = capability || {};
  const capCards = [];
  // بالسستم المتكامل ماكو بطاريات ولا انفيرترات منفصلة — الكابينة هي الاثنين
  if (cap.nightHours != null && Number(cap.ampNight) > 0) {
    capCards.push([
      '🔋',
      `${integrated ? 'الكابينة تُجهّز' : 'البطاريات تُجهّز'} ${esc(cap.ampNight)} أمبير ليلياً`,
      `لمدة ≈${esc(cap.nightHours)} ساعة${!integrated && cap.batteries ? ` — ${esc(cap.batteries)} بطارية` : ''}`,
    ]);
  }
  if (cap.dayAmps != null) {
    capCards.push([
      '⚡',
      `${integrated ? 'الكابينة تتحمل' : 'الانفيرترات تتحمل'} ≈${esc(cap.dayAmps)} أمبير نهاراً`,
      integrated || !cap.inverters ? 'قدرة التشغيل النهاري' : `${esc(cap.inverters)} انفيرتر بالمنظومة`,
    ]);
  }
  const capHtml = capCards.length
    ? `<div class="caps">${capCards.map((c) => `<div class="cap"><span class="ci">${c[0]}</span><span class="ct"><b>${c[1]}</b><small>${c[2]}</small></span></div>`).join('')}</div>`
    : '';
  const featHtml = feats
    .map((f) => `<div class="feat"><div class="ic">${f[0]}</div><div class="ft"><b>${esc(f[1])}</b><span>${esc(f[2])}</span></div></div>`)
    .join('');
  return `
<style>
.mkt-sheet, .mkt-sheet * { box-sizing: border-box; }
/* font-synthesis: none — بلاها المتصفح يزيّف الوزن 800 المستعمل بالعناوين ويلزق
   الحروف العربية ببعضها (يبان بأندرويد أكثر من iOS). الوزن الحقيقي محمّل بـmain.jsx */
.mkt-sheet { font-family: 'Cairo', sans-serif; font-synthesis: none; -webkit-font-synthesis: none;
  direction: rtl; width: 794px; height: 1122px; padding: 0 0 26px; position: relative; overflow: hidden;
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
.mkt-sheet .stage { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 6px 20px; }
.mkt-sheet .stage img { max-width: 100%; max-height: 100%; height: auto; object-fit: contain; filter: drop-shadow(0 16px 22px rgba(20,48,92,0.22)); }
.mkt-sheet .count { position: relative; text-align: center; margin: 0 0 10px; font-weight: 800; color: #12305c; font-size: 1.05rem; }
.mkt-sheet .count b { color: #f5a623; }
.mkt-sheet .caps { position: relative; display: flex; justify-content: center; gap: 10px; padding: 0 26px; margin: 0 0 12px; flex-wrap: nowrap; }
.mkt-sheet .cap { background: linear-gradient(180deg, #ffffff 0%, #f2f7fd 100%); border: 1px solid #bcd0e6; border-left: 5px solid #f5a623;
  border-radius: 12px; padding: 9px 13px; display: flex; align-items: center; gap: 9px; box-shadow: 0 4px 10px rgba(20,48,92,0.09); }
.mkt-sheet .cap .ci { font-size: 1.25rem; line-height: 1; }
.mkt-sheet .cap .ct { display: flex; flex-direction: column; }
.mkt-sheet .cap .ct b { color: #12305c; font-size: 0.92rem; white-space: nowrap; }
.mkt-sheet .cap .ct small { color: #4a5c72; font-size: 0.72rem; }
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
    <h1>${integrated ? 'منظومة تخزين متكاملة' : 'منظومتك الشمسية بتصميم احترافي'}</h1>
    <p>${integrated
      ? 'كابينة تجمع البطاريات والانفيرتر بجهاز واحد — تركيب أسرع ومساحة أقل'
      : 'هيكل تركيب متين بأعلى المعايير — أداء يدوم لعشرات السنين'}</p>
  </div>
  <div class="stage"><img src="${imgDataUrl}" alt="${integrated ? 'الكابينة المتكاملة' : 'مخطط الهيكل'}"/></div>
  <div class="count">${integrated
    ? `<b>${integrated.units}</b> ${integrated.units === 1 ? 'كابينة' : 'كابينات'}` +
      (integrated.kwh ? ` — السعة <b>${integrated.kwh * integrated.units}</b> كيلوواط·ساعة` : '') +
      (integrated.kw ? ` — القدرة <b>${integrated.kw * integrated.units}</b> كيلوواط` : '') +
      (panelCount > 0 ? ` — <b>${panelCount}</b> لوح شمسي` : '')
    : `إجمالي الألواح <b>${panelCount}</b> لوح`}</div>
  ${capHtml}
  <div class="feats">${featHtml}</div>
  <div class="foot">${esc(co)} — نموذج توضيحي، تُثبّت التفاصيل النهائية بعد الكشف الميداني</div>
</div>`;
}
