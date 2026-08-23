// محرك حساب منظومة الطاقة الشمسية - وحدة منطقية بحتة بدون أي اعتماد على Electron أو قاعدة البيانات
// كل الدوال هنا قابلة للاختبار بشكل مستقل (انظر tests/calc.test.js)
//
// القاعدة المعتمدة (طريقة عمل الشركة الفعلية):
//   ألواح التغذية = ceil( أمبير نهاراً ÷ أمبير اللوح الواحد )       حيث أمبير اللوح = panelRefAmps × (واطية اللوح ÷ panelRefWatt)
//   ألواح الشحن   = ceil( عدد البطاريات × chargePanelsPerBattery )
//   عدد الألواح   = ألواح التغذية + ألواح الشحن (المساحة لا تغيّر العدد — نقصها خطأ حاجب)

// شحن البطاريات يتم من الشبكة الوطنية والمجموعة كلها تكتمل خلال ~ساعتين مهما كان عددها،
// لذلك لا يوجد أي فحص لوقت الشحن — عدد البطاريات حر حسب حاجة الزبون

// قاعدة الشركة الثابتة: لوح 650 واط يعطي 2.18 أمبير — النسبة مدمجة بالكود وليست خياراً بالإعدادات
// واطية اللوح تؤخذ من مادة اللوح نفسها بالمخزون، والأمبير يشتق منها تلقائياً
import { ipOf } from './materialSpecs.js';

const PANEL_AMPS_PER_WATT = 2.18 / 650;
// الفولتية اللي انبنى عليها الرقم 2.18: لوح 650 واط على 220 فولت يعطي 2.95 أمبير
// اسمياً، والمقاس 2.18 — يعني معامل واقعي 0.738 (غيم وغبار وزاوية وحرارة وفقد).
const PANEL_AMPS_REF_VOLTAGE = 220;
const PANEL_REAL_YIELD = (PANEL_AMPS_PER_WATT * PANEL_AMPS_REF_VOLTAGE); // ≈0.7379

// أمبير اللوح الواحد بحسب واطيته وفولتية النظام (لوح 650 على 220 = 2.18).
// **لازم تدخل الفولتية**: البطاريات والانفيرتر يحسبون الحمل بـ(أمبير × فولت)،
// فلو الألواح انحسبت بالأمبير وحده تبقى المعادلتان متفقتين على 220 فولت بس،
// وبأي فولتية ثانية ينفصلون: على 48 فولت مثلاً الحمل ينزل ×4.6 بينما عدد
// الألواح يبقى مثل ما هو، فتطلع مصفوفة تجبر انفيرترات إضافية بلا سبب.
function panelAmpsFor(panelWatt, systemVoltage = PANEL_AMPS_REF_VOLTAGE) {
  const v = Number(systemVoltage) > 0 ? Number(systemVoltage) : PANEL_AMPS_REF_VOLTAGE;
  return (panelWatt * PANEL_REAL_YIELD) / v;
}

// عدد وحدات البطارية المطلوبة لتغطية الليل بساعات التجهيز المدخلة بالعرض.
// factor = معامل أمان المستوى (من الإعدادات): الحاجة تنضرب به قبل القسمة على سعة
// البطارية — 0.9 مثلاً يسمح لبطارية 16kWh وحدة تغطي حاجة 17.6kWh بدل ما نجبر ثنتين.
function batteriesRequired(ampNight, nightSupplyHours, { systemVoltage, dod }, batteryKwh, factor = 1) {
  if (ampNight <= 0) return 0;
  const nightEnergyKwh = (ampNight * systemVoltage * nightSupplyHours) / 1000;
  return Math.max(1, Math.ceil((nightEnergyKwh * factor) / dod / batteryKwh));
}

// معامل أمان الألواح: أمبير النهار ينضرب بـ1.25 قبل ما ينقسم على أمبير اللوح.
// قرار الشركة — اللوح ما ينتج قدرته الاسمية طول النهار (غيم وغبار وزاوية وحرارة)،
// ولازم يفضل فائض يشحن البطاريات مو بس يغطي الحمل اللحظي.
// مثال: 10 أمبير نهاراً بلوح 650 واط (2.18 أمبير) ← 10×1.25 ÷ 2.18 = 5.7 ← 6 ألواح
// تغذية، وبطارية وحدة تنطي لوحين شحن ← 8 ألواح (كانت 7 قبل المعامل).
// العروض المحفوظة قبل هذا المعامل تنحسب بـ1 (بلا معامل) حتى تبقى مثل ما هي —
// القيمة تنحفظ مع كل عرض، والعرض بلا قيمة محفوظة = عرض قديم = 1.
const PANEL_SAFETY_FACTOR = 1.25;
const LEGACY_PANEL_SAFETY_FACTOR = 1;
// الممتاز يزيد ألواح الشحن ربعاً إضافياً — شحن أسرع وهامش أوسع
const PREMIUM_CHARGE_PANEL_FACTOR = 1.25;

// عدد الألواح النهائي = تغذية النهار (بمعامل الأمان) + شحن البطاريات — العدد حر
function panelsRequired(ampDay, batteryCount, settings, panelWatt, chargeFactor = 1) {
  const safety = settings.panelSafetyFactor > 0 ? settings.panelSafetyFactor : PANEL_SAFETY_FACTOR;
  const feedPanels = ampDay > 0
    ? Math.ceil((ampDay * safety) / panelAmpsFor(panelWatt, settings.systemVoltage))
    : 0;
  const chargePanels = Math.ceil(batteryCount * settings.chargePanelsPerBattery * chargeFactor);
  return { feedPanels, chargePanels, total: feedPanels + chargePanels };
}

function requiredRoofArea(panelCount, { panelAreaM2 }) {
  return panelCount * panelAreaM2;
}

// نسبة تحميل الألواح المسموحة على الانفيرتر الهجين (Deye 8kW يقبل 10.4kW ألواح ≈ 1.3×،
// وGrowatt 5kW يقبل 6kW ≈ 1.2× — نعتمد 1.3 كحد معياري للهجينة LV)
const PV_OVERSIZE_RATIO = 1.3;

// قدرة الانفيرتر المطلوبة (واط): الأكبر بين حمل البيت بمعامل الأمان، ومصفوفة الألواح
// مقسومة على نسبة التحميل — حتى الانفيرتر ياخذ إنتاج الألواح كاملاً قبل كل شيء
function inverterCapacityRequired(ampDay, ampNight, { systemVoltage, inverterSafetyFactor }, panelArrayW = 0) {
  const loadW = Math.max(ampDay, ampNight) * systemVoltage * inverterSafetyFactor;
  const pvW = panelArrayW > 0 ? panelArrayW / PV_OVERSIZE_RATIO : 0;
  return Math.max(loadW, pvW);
}

// فحص شحن البطاريات من الألواح (تحذير غير حاجب — العرض يُحفظ ويُطبع بالحالتين):
// الشحن من الوطنية عادي وسريع (بورد الشحن يكمل البنك كله ~ساعتين مهما كان العدد — قاعدة الشركة).
// الفحص هنا فقط لحالة انقطاع الوطنية: الشحن من الألواح عبر الانفيرتر.
// قدرة الشحن = الأصغر بين إنتاج مصفوفة الألواح وقدرة الانفيرتر (شحن الهجين ≈ قدرته الاسمية:
// Deye 8K = 190A×48V ≈ 9.1kW، Growatt 5K = 100A ≈ 4.8kW)، بكفاءة 0.9.
// ساعات الشحن = الطاقة المسحوبة من البنك ÷ قدرة الشحن ≤ 7 ساعات شمس العراق، وإلا تحذير.
const IRAQ_SUN_HOURS = 7;
function chargingCheck({ panelArrayW, inverterW, bankKwh, dod }) {
  if (!bankKwh || bankKwh <= 0) return { ok: true };
  const chargeW = Math.min(inverterW, panelArrayW);
  if (chargeW <= 0) return { ok: true };
  const usedKwh = bankKwh * dod;
  const hoursNeeded = usedKwh / ((chargeW / 1000) * 0.9);
  if (hoursNeeded > IRAQ_SUN_HOURS) {
    return {
      ok: false,
      hoursNeeded,
      message:
        `ملاحظة الشحن: عند انقطاع الشبكة الوطنية، يستغرق شحن البطاريات من الألواح وحدها ~${Math.ceil(hoursNeeded)} ساعة ` +
        `(أكثر من ${IRAQ_SUN_HOURS} ساعات الشمس) — أضف ألواحاً أو استخدم انفيرتراً أكبر إذا كان العميل يعتمد على الشمس في الشحن. ` +
        'الشحن من الشبكة الوطنية طبيعي وسريع ولا يتأثر.',
    };
  }
  return { ok: true, hoursNeeded };
}

// حجم النظام بالأمبير المستخدم لمطابقة أجور العمل = الأكبر بين النهار والليل
function systemAmpSize(ampDay, ampNight) {
  return Math.max(ampDay, ampNight);
}

function pickLaborTier(laborTiers, systemAmps) {
  const candidates = laborTiers
    .filter((t) => t.system_amps >= systemAmps)
    .sort((a, b) => a.system_amps - b.system_amps);
  if (candidates.length === 0) return null;
  return candidates[0];
}

// يصنف التوليفات الممكنة لثلاث مستويات: economy / standard / premium
function classifyTiers(combos) {
  if (combos.length === 0) {
    return { economy: null, standard: null, premium: null, singleOption: false, insufficient: true, all: [] };
  }
  const sorted = [...combos].sort((a, b) => a.totalPrice - b.totalPrice);
  if (sorted.length === 1) {
    return { economy: sorted[0], standard: sorted[0], premium: sorted[0], singleOption: true, insufficient: false, all: sorted };
  }
  const economy = sorted[0];
  const premium = sorted[sorted.length - 1];
  const mid = (economy.totalPrice + premium.totalPrice) / 2;
  let standard = sorted[0];
  let bestDiff = Infinity;
  for (const c of sorted) {
    const diff = Math.abs(c.totalPrice - mid);
    if (diff < bestDiff) {
      bestDiff = diff;
      standard = c;
    }
  }
  return { economy, standard, premium, singleOption: false, insufficient: false, all: sorted };
}

// ===== دستور التسعير (الهندسة أولاً، الـIP قبل السعر — معتمد من الشركة) =====
// الهندسة ثابتة بكل المستويات: أقل عدد بطاريات وانفيرترات يغطي الأمبيرية بدقة،
// وعدد البطاريات يخضع لمعامل أمان لكل مستوى من الإعدادات (يضرب الحاجة قبل القسمة).
// economy (انفيرترات): أقل عدد ← أدنى فئة IP متوفرة (غير المذكور = IP21، سقف 65) ← الأرخص — معامل بطاريات 0.90.
// standard: أقل عدد ← أعلى حماية IP (مثل IP65) ← الأرخص عند التساوي — معامل 0.85.
// premium ≤120 أمبير: هويمايلز حصراً (انفيرتر + بطارية) — معامل بطاريات 0.80.
//   قاعدة الراحة: القدرة الكلية ≥ الطلب ×1.3 بتكبير حجم الجهاز بأقل عدد وحدات
//   (بلا توزيع إجباري ولا بطارية احتياط) — التعديد يصير طبيعياً بالأحجام الكبيرة فقط.
// premium >120 أمبير: نفس القاعدة لكن بكل الماركات (هويمايلز ما تغطي الأحجام الكبيرة).

// الحد الأعلى لحصر الممتاز بأجهزة هويمايلز — فوقه نرجع للقاعدة العامة
const HOYMILES_MAX_AMPS = 120;

// معاملات أمان البطاريات الافتراضية لكل مستوى (تتغير من الإعدادات — app_config).
// الاقتصادي والمتوسط أقل من 1 = **تسامح**: يسمحون لبطارية 16kWh تغطي حاجة 17.6kWh
// بدل ما نجبر ثنتين. الممتاز فوق 1 = **هامش أمان**: بنك أكبر من الحاجة بالربع،
// حتى المنظومة الممتازة تطلع فعلاً أكبر مو أصغر (كانت 0.8 وتنطي بطاريات أقل من
// الاقتصادي — عكس المقصود).
// معامل أمان البطاريات لكل مستوى — **أُلغي بقرار المستخدم**، فصار (1) للجميع.
//
// السبب: معامل الأمان الحقيقي موجود أصلاً بالإعدادات وهو **عمق التفريغ (DoD =
// 0.9)** — ما نستهلك كل سعة البطارية حتى يطول عمرها. ضربُ الحاجة بمعامل ثانٍ
// فوقه كان مضاعفةً للاحتياط نفسه مرتين، وبنتيجة غريبة: معامل «الاقتصادي» (0.9)
// أعلى من «المتوسط» (0.85) فيطلع الاقتصادي ببطاريات أكثر أحياناً. وأسوأ منها إن
// المعامل الأقل من 1 كان **يقبل نقصاً صامتاً بالساعات** — 9 أمبير × 8 ساعات
// كانت تنزل لبطارية وحدة تجهّز 7.3 ساعة بدل الـ8 المطلوبة.
//
// بعد الإلغاء: عدد البطاريات = الحاجة الحقيقية ÷ DoD ÷ سعة البطارية (تقريب
// للأعلى)، والمستويات تتفرق بـ**المواصفة** (درجة الحماية) وقواعد الاختيار — مو
// بكمية الطاقة المطلوبة. وهذا نفس قاعدة المستخدم: «لتقيس ع سعر، قيس المواصفات».
const DEFAULT_BATTERY_FACTORS = { economy: 1, standard: 1, premium: 1 };

// معاملات ما قبل الإلغاء. العروض المحفوظة قبل القرار ماكو عندها معاملات مخزونة
// بلقطتها، فتُقرأ بهذي القيم حتى ترجع بنفس عدد بطارياتها بالضبط عند إعادة الفتح
// — نفس قاعدة معامل أمان الألواح تماماً.
const LEGACY_BATTERY_FACTORS = { economy: 0.9, standard: 0.85, premium: 1.25 };

function materialText(material) {
  return `${material.brand || ''} ${material.model || ''} ${material.full_description || ''}`;
}

// درجة الحماية IP للمادة: الحقل المُدخل بالمخزون أولاً، وإلا المستنتج من نص
// الوصف (فولباك للمواد القديمة)، وإلا 0 = ماكو IP مكتوب.
function ipRatingOf(material) {
  return ipOf(material) ?? 0;
}

// هل المادة هويمايلز؟ بالاسم الصريح أو ببادئات موديلاتها (HIS/HYS/HIT/LB16D...)
function isHoymiles(material) {
  if (/hoymiles|هويمايلز/i.test(materialText(material))) return true;
  return /^(HIS|HYS|HIT|LB\d+D)/i.test(String(material.model || '').trim());
}

// الوسط سعراً ضمن مجموعة (مرتبة تصاعدياً)
function midByPrice(group) {
  const sorted = [...group].sort((a, b) => a.totalPrice - b.totalPrice);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

// ═══ سلّم المواصفة: هو اللي يقرر المستوى، مو السعر ═══════════════════════
// قرار المستخدم صراحةً: «لتقيس ع سعر، قيس المواصفات» — لأن السعر يُدخل بالإيد
// وممكن يبقى قديماً بالمخزون، فالترتيب عليه يطلع مستويات غلط.
//
// الطريقة: ناخذ قيم المواصفة الموجودة **فعلاً** بالمخزون (مو أرقاماً مثبتة
// بالكود)، نرتّبها، ونقسمها ثلاث درجات — الأدنى اقتصادي، والأعلى ممتاز،
// والوسط متوسط. فإذا يوم انضاف IP68 يصير هو الممتاز تلقائياً بلا تعديل كود.
//
// المواصفة تختلف حسب الفئة:
//   الانفيرتر → درجة الحماية IP (عنده تنوّع حقيقي: 21 · 51 · 65 · 66)
//   البطارية  → الـIP إذا مختلف، وإلا سعة الوحدة (أغلب البطاريات IP65 أو بلا IP)
//   اللوح     → الواطية (ماكو مصنّع يميّز ألواحه بالـIP)
// والسعر ما يدخل إلا **داخل الدرجة الواحدة** كفاصل أخير بين موادّ متطابقة
// المواصفة — مو لاختيار الدرجة نفسها.
// السلّم ينبني من التوليفات **الصالحة** بس: مادة تحتاج تسع وحدات بالتوازي ما
// تصلح درجة لأي مستوى مهما كانت مواصفتها عالية. السقف وحدة زيادة على أقل عدد
// ممكن — بدونه انفيرتر IP66 صغير كان يخطف الممتاز بمنظومة 150 أمبير بتسع أجهزة.
function viableCombos(combos) {
  if (!combos.length) return combos;
  const minUnits = Math.min(...combos.map((c) => c.units));
  const within = combos.filter((c) => c.units <= minUnits + ECONOMY_EXTRA_UNITS);
  return within.length ? within : combos;
}

// `capUnits` = هل نحصر السلّم بالتوليفات القليلة الوحدات؟ نعم للانفيرتر والبطارية
// (أجهزة تتوازى، وتسعة منها بالتوازي مو خياراً)، ولا للألواح — اللوح مصفوفة
// أصلاً وعدده يتغير كثيراً بالواطية، فالسقف كان يمسح كل الواطيات عدا الأعلى
// ويخلي السلّم درجة وحدة.
function specGradesOf(combos, specOf, capUnits = true) {
  const pool = capUnits ? viableCombos(combos) : combos;
  return [...new Set(pool.map((c) => specOf(c.material)))].sort((a, b) => a - b);
}

// درجة هذا المستوى من السلّم. بدرجتين بس: الاقتصادي ياخذ الأدنى، والمتوسط
// والممتاز ياخذون الأعلى — المتوسط ينحاز للأحسن لأن الممتاز يبقى متميزاً
// بهامش الحجم (1.3× للانفيرتر و1.25× للبطارية) حتى لو نفس الدرجة.
function gradeForTier(grades, tier) {
  if (grades.length === 0) return null;
  if (tier === 'economy') return grades[0];
  if (tier === 'premium') return grades[grades.length - 1];
  return grades[Math.ceil((grades.length - 1) / 2)];
}

// يحصر التوليفات بدرجة هذا المستوى. إذا الدرجة فارغة (ماكو مرشح) نرجّع الكل.
function atGrade(combos, specOf, tier, capUnits = true) {
  if (!specOf) return combos;   // ماكو سلّم مواصفة لهذه الفئة — كل المرشحين
  const grades = specGradesOf(combos, specOf, capUnits);
  const want = gradeForTier(grades, tier);
  if (want == null) return combos;
  const at = combos.filter((c) => specOf(c.material) === want);
  return at.length ? at : combos;
}

const capacityOf = (m) => Number(m.watt_or_capacity) || 0;

// ملاحظة مقصودة: ماكو «حارس» يمنع أن يطلع الاقتصادي أغلى من المتوسط.
// جرّبناه وانشال — لأنه يخلي السعر يتقدم على المواصفة، وهذا عكس القاعدة
// المعتمدة. معنى «اقتصادي» هنا **أدنى مواصفة**، مو أرخص سعر: جهاز IP21 صغير
// ممكن يحتاج وحدتين فيطلع مجموعه أعلى من جهاز IP65 واحد. هذا جواب صحيح
// بالمواصفة، ويتصحّح سعرياً لما تنضبط أسعار المخزون.

// مواصفة البطارية: درجة الحماية — بس إذا كانت **مختلفة فعلاً** بين الموديلات.
// إذا كلهن بنفس الـIP (أو بلا IP مكتوب، وهاي حالة أغلب البطاريات) ماكو سلّم
// مواصفة، فنرجّع null ويشتغل كل مستوى بقاعدته على كل المرشحين.
//
// ليش ما نستعمل السعة كسلّم: السعة مو درجة جودة — هي تحجيم. لو خلّينا الاقتصادي
// ياخذ أصغر بطارية دائماً، يطلع ببطاريات كثيرة بالتوازي وسعر أعلى من الممتاز
// (مثال حقيقي: 2×8kWh بـ2.4 مليون مقابل 1×16kWh بـ2.0 مليون). حجم البنك أصلاً
// يفرّق بين المستويات عن طريق معامل الأمان (الممتاز 1.25).
function batterySpecOf(combos) {
  const ips = new Set(viableCombos(combos).map((c) => ipRatingOf(c.material)));
  return ips.size > 1 ? (m) => ipRatingOf(m) : null;
}

function fewestUnitsGroup(combos) {
  const minUnits = Math.min(...combos.map((c) => c.units));
  return combos.filter((c) => c.units === minUnits);
}

// الاقتصادي: أرخص كلفة فعلية، مو أقل عدد وحدات. قرار الشركة صراحةً — إذا
// وحدتين أصغر أرخص من وحدة كبيرة تنتخب الوحدتين. السقف وحدة زيادة على أقل عدد
// ممكن (١ ← ٢ قطع، ٣ ← ٤) حتى ما تنبني منظومة من ست قطع صغيرة صيانتها وجع راس.
const ECONOMY_EXTRA_UNITS = 1;
function economyPool(combos) {
  const minUnits = Math.min(...combos.map((c) => c.units));
  const cap = minUnits + ECONOMY_EXTRA_UNITS;
  const within = combos.filter((c) => c.units <= cap);
  return within.length ? within : combos;
}

// الأرخص داخل سقف الاقتصادي، وعند تساوي السعر أقل عدد وحدات
function pickCheapestWithinEconomyCap(combos) {
  return [...economyPool(combos)].sort((a, b) => (a.totalPrice - b.totalPrice) || (a.units - b.units))[0];
}

function pickFewestThenCheapest(combos) {
  return fewestUnitsGroup(combos).sort((a, b) => a.totalPrice - b.totalPrice)[0];
}

function pickFewestThenMid(combos) {
  return midByPrice(fewestUnitsGroup(combos));
}

// المتوسط (داخل درجته): أقل عدد وحدات ← **أصغر جهاز يكفي** ← الأرخص.
// هويته درجة الحماية مو الحجم — التكبير شغل الممتاز. بلا هذا كان المتوسط ياخذ
// انفيرتر 50kW لبيت 18 أمبير لمجرد إنه أكبر جهاز بنفس الدرجة.
// وما عاد بيه سقف IP: كان محطوطاً لسبب سعري («ما نخلي جهازاً أغلى يسحب المتوسط»)
// وهذا بالضبط اللي القاعدة الجديدة تمنعه.
function pickFewestThenSmallest(combos) {
  return fewestUnitsGroup(combos)
    .sort((a, b) => (capacityOf(a.material) - capacityOf(b.material)) || (a.totalPrice - b.totalPrice))[0];
}

function assignTiers(combos, premiumPick, standardPick = pickFewestThenMid, economyPick = pickFewestThenCheapest) {
  if (combos.length === 0) {
    return { economy: null, standard: null, premium: null, singleOption: false, insufficient: true, all: [] };
  }
  const sorted = [...combos].sort((a, b) => a.totalPrice - b.totalPrice);
  if (sorted.length === 1) {
    return { economy: sorted[0], standard: sorted[0], premium: premiumPick ? premiumPick(sorted) : sorted[0], singleOption: true, insufficient: false, all: sorted };
  }
  return {
    economy: economyPick(sorted),
    standard: standardPick(sorted),
    premium: premiumPick(sorted),
    singleOption: false,
    insufficient: false,
    all: sorted,
  };
}

// حصر مرشحات الممتاز بهويمايلز إذا حجم المنظومة ≤120 أمبير واكو مرشح هويمايلز
function premiumPool(combos, systemAmps) {
  if (systemAmps > 0 && systemAmps <= HOYMILES_MAX_AMPS) {
    const hoymiles = combos.filter((c) => isHoymiles(c.material));
    if (hoymiles.length) return hoymiles;
  }
  return combos;
}

// premium بطاريات: تكبير الحجم لا تعديد الوحدات — ضمن أقل عدد وحدات ناخذ الأكبر سعة
// (وعند التساوي الأرقى سعراً) بلا وحدة احتياط إضافية؛ الوحدات الزائدة تجي فقط من كبر الطلب.
// سقف التكبير: السعة الكلية ما تتجاوز 3× الحاجة — حتى كابينة 215kWh ما تنخطف
// لعرض بيت صغير؛ إذا كل الخيارات فوق السقف ناخذ الأقرب للحاجة (الأصغر سعة كلية).
const PREMIUM_OVERSIZE_CAP = 3;
// سقف تكبير الانفيرتر بالممتاز: القدرة الكلية ما تتجاوز الطلب ×2
const PREMIUM_INVERTER_CAP = 2;
// هامش الممتاز على الانفيرتر: ربع إضافي فوق حِمل البيت. ينطبق على **حدّ الحمل
// وحده** لا على الطلب النهائي — لأن الطلب النهائي ممكن يجي من حدّ الألواح
// (مصفوفة ÷ 1.3)، وضربه بـ1.3 يلغي القسمة نفسها ويصير الانفيرتر = قدرة
// المصفوفة كاملة (نسبة DC/AC = 1)، فينهدم كل معنى سماحية التحميل بالهجين.
const PREMIUM_INVERTER_HEADROOM = 1.3;
function pickBatteryPremium(combos, neededKwh = 0) {
  let group = fewestUnitsGroup(combos);
  if (neededKwh > 0) {
    const bankKwh = (c) => c.units * c.material.watt_or_capacity;
    const withinCap = group.filter((c) => bankKwh(c) <= neededKwh * PREMIUM_OVERSIZE_CAP);
    group = withinCap.length ? withinCap : [...group].sort((a, b) => bankKwh(a) - bankKwh(b)).slice(0, 1);
  }
  return group.sort(
    (a, b) => (b.material.watt_or_capacity - a.material.watt_or_capacity) || (b.totalPrice - a.totalPrice)
  )[0];
}

// نتيجة «الفئة غير مطلوبة بهذا العرض» — منظومة نهارية بلا بطاريات أو بلا ألواح:
// ليست insufficient (ما ينقص شي بالمخزون)، فقط ما ننتخب منها شي
function noneResult() {
  return {
    economy: null, standard: null, premium: null,
    none: true, singleOption: false, insufficient: false,
    all: [], allByTier: { economy: [], standard: [], premium: [] },
  };
}

// توليفات البطاريات: لكل موديل عدد وحدات حسب ساعات التجهيز الليلي — مضروب بمعامل
// أمان المستوى، لذلك كل مستوى إله قائمة توليفات خاصة (allByTier) بأعداده الصحيحة.
// بلا أمبير ليلي => بلا بطاريات نهائياً (منظومات نهارية/زراعية).
function selectBatteryTiers(batteryMaterials, ampNight, nightSupplyHours, settings, { factors = null, systemAmps = 0 } = {}) {
  if (!(ampNight > 0)) return noneResult();
  const f = { ...DEFAULT_BATTERY_FACTORS, ...(factors || {}) };
  const combosFor = (factor) => {
    const combos = [];
    for (const material of batteryMaterials) {
      const units = batteriesRequired(ampNight, nightSupplyHours, settings, material.watt_or_capacity, factor);
      if (units <= 0) continue;
      combos.push({ material, units, totalPrice: units * material.price });
    }
    return combos.sort((a, b) => a.totalPrice - b.totalPrice);
  };
  const allByTier = {
    economy: combosFor(f.economy),
    standard: combosFor(f.standard),
    premium: combosFor(f.premium),
  };
  if (allByTier.standard.length === 0) {
    return { economy: null, standard: null, premium: null, singleOption: false, insufficient: true, all: [], allByTier };
  }
  // سقف التكبير لكل المستويات: التوليفات التي سعتها الكلية فوق 3× الحاجة تُستبعد من
  // الاختيار التلقائي (حتى كابينة 215kWh ما تنخطف بأي مستوى لعرض صغير لمجرد أنها
  // وحدة واحدة)، وتبقى متاحة بقوائم التبديل اليدوي allByTier كما هي
  const neededKwhFor = (factor) => (((ampNight * settings.systemVoltage * nightSupplyHours) / 1000) * factor) / settings.dod;
  const autoPool = (combos, factor) => {
    const needed = neededKwhFor(factor);
    if (!(needed > 0)) return combos;
    const within = combos.filter((c) => c.units * c.material.watt_or_capacity <= needed * PREMIUM_OVERSIZE_CAP);
    return within.length ? within : combos;
  };
  // الدرجة أولاً (مواصفة مو سعر)، وداخل الدرجة قواعد المستوى
  const ecoPool = autoPool(allByTier.economy, f.economy);
  const stdPool = autoPool(allByTier.standard, f.standard);
  const prePool = autoPool(allByTier.premium, f.premium);
  const specOf = batterySpecOf(stdPool);
  return {
    economy: pickCheapestWithinEconomyCap(atGrade(ecoPool, specOf, 'economy')),
    standard: pickFewestThenSmallest(atGrade(stdPool, specOf, 'standard')),
    premium: pickBatteryPremium(
      premiumPool(atGrade(prePool, specOf, 'premium'), systemAmps),
      neededKwhFor(f.premium),
    ),
    singleOption: allByTier.standard.length === 1,
    insufficient: false,
    all: allByTier.standard,
    allByTier,
  };
}

// توليفات الألواح: العدد يعتمد على أمبير النهار + عدد بطاريات التوليفة المرافقة.
// بلا أمبير نهاري => بلا ألواح إطلاقاً حتى ألواح الشحن (انفيرتر + بطارية فقط —
// الشحن من الشبكة/المولدة، مثل تجهيز الوحدات العسكرية).
function selectPanelTiers(panelMaterials, ampDay, batteryCount, settings, tier = null) {
  if (!(ampDay > 0)) return noneResult();
  // الممتاز يزيد ألواح الشحن — طلب صريح: منظومة ممتازة تشحن أسرع وبهامش أوسع
  const chargeFactor = tier === 'premium' ? PREMIUM_CHARGE_PANEL_FACTOR : 1;
  const combos = [];
  for (const material of panelMaterials) {
    const { feedPanels, chargePanels, total } = panelsRequired(ampDay, batteryCount, settings, material.watt_or_capacity, chargeFactor);
    if (total <= 0) continue;
    combos.push({ material, units: total, feedPanels, chargePanels, totalPrice: total * material.price });
  }
  // مواصفة اللوح: الواطية. ماكو مصنّع يميّز ألواحه بالـIP، والواطية الأعلى
  // تعني ألواحاً أقل وهيكلاً أقل وسطحاً أقل — مواصفة حقيقية للزبون.
  const wattSpec = (m) => capacityOf(m);
  const forTier = (t) => {
    const at = atGrade(combos, wattSpec, t, false);
    return [...at].sort((a, b) => a.totalPrice - b.totalPrice)[0];
  };
  if (combos.length === 0) {
    return { economy: null, standard: null, premium: null, singleOption: false, insufficient: true, all: [] };
  }
  const sorted = [...combos].sort((a, b) => a.totalPrice - b.totalPrice);
  return {
    economy: forTier('economy'),
    standard: forTier('standard'),
    premium: forTier('premium'),
    singleOption: combos.length === 1,
    insufficient: false,
    all: sorted,
  };
}

function selectInverterTiers(inverterMaterials, ampDay, ampNight, settings, panelArrayW = 0, systemAmps = 0) {
  const requiredW = inverterCapacityRequired(ampDay, ampNight, settings, panelArrayW);
  // حدّ الحمل لحاله (بلا حدّ الألواح) — عليه يتحسب هامش الممتاز
  const loadOnlyW = inverterCapacityRequired(ampDay, ampNight, settings, 0);
  const combos = [];
  for (const material of inverterMaterials) {
    const units = Math.ceil(requiredW / material.watt_or_capacity);
    if (units <= 0) continue;
    combos.push({ material, units, totalPrice: units * material.price });
  }

  // premium: هويمايلز حصراً ≤120 أمبير (وإلا كل الماركات)، والقدرة الكلية ≥ الطلب ×1.3 —
  // تتحقق بتكبير حجم الجهاز أولاً (أقل عدد وحدات)، والتعديد يصير طبيعياً بالأحجام الكبيرة فقط.
  // وضمن أقل عدد وحدات ناخذ **الأكبر قدرة** مو الأرخص — بدونها كان الممتاز يطلع
  // نفس الاقتصادي بالضبط لما تنحصر المواد بماركة وحدة (كل الأجهزة توصل بوحدة وحدة
  // فيفوز الأرخص). سقف التكبير: القدرة الكلية ما تتجاوز الطلب ×2 حتى ما ينخطف
  // انفيرتر 50kW لبيت 10 أمبير؛ إذا كل الخيارات فوق السقف ناخذ الأقرب للطلب.
  function pickInverterPremium(all) {
    const candidates = premiumPool(all, systemAmps).map((c) => {
      const premiumW = Math.max(loadOnlyW * PREMIUM_INVERTER_HEADROOM, requiredW);
      const units = Math.max(1, Math.ceil(premiumW / c.material.watt_or_capacity));
      return { material: c.material, units, totalPrice: units * c.material.price };
    });
    const minUnits = Math.min(...candidates.map((c) => c.units));
    let group = candidates.filter((c) => c.units === minUnits);
    const totalW = (c) => c.units * c.material.watt_or_capacity;
    if (requiredW > 0) {
      const withinCap = group.filter((c) => totalW(c) <= requiredW * PREMIUM_INVERTER_CAP);
      group = withinCap.length ? withinCap : [...group].sort((a, b) => totalW(a) - totalW(b)).slice(0, 1);
    }
    return group.sort((a, b) => (totalW(b) - totalW(a)) || (a.totalPrice - b.totalPrice))[0];
  }

  // ═══ الدرجة أولاً: درجة الحماية IP ═══════════════════════════════════════
  // الاقتصادي ياخذ أدنى IP موجود بالمخزون، والممتاز أعلاه، والمتوسط الوسط.
  // والسعر ما يدخل إلا داخل الدرجة الواحدة كفاصل أخير.
  const ipSpec = (m) => ipRatingOf(m);
  return assignTiers(
    combos,
    (all) => pickInverterPremium(atGrade(all, ipSpec, 'premium')),
    (all) => pickFewestThenSmallest(atGrade(all, ipSpec, 'standard')),
    (all) => pickCheapestWithinEconomyCap(atGrade(all, ipSpec, 'economy')),
  );
}

// القدرة الفعلية للتوليفة: ساعات تجهيز الليل من بنك البطاريات، وأمبير النهار اللي
// يتحمله الانفيرتر. دالة وحدة يستعملها التطبيق (المعاينة الحية) وملف العرض (صفحة
// التصميم) — حتى الأرقام تبقى متطابقة بالضبط بلا تكرار معادلة.
// ── السستم المتكامل: معادلة مستقلة ─────────────────────────────────────────
// الأمبيرية اللي يكتبها البياع = حمل النشاط التجاري، والكابينة لازم تغذيه.
// الحساب أحادي الطور على فولتية النظام (قرار المستخدم) — الكابينة نفسها ثلاثية
// الطور لكن الداتا شيت تكول إنها تشتغل بعدم اتزان 100% أوف جرد، يعني تغذي
// أحمالاً أحادية الطور بلا مشكلة.
// من الداتا شيت الرسمية: Rated Charge/Discharge Rate ≤ 0.5P — يعني الكابينة
// ما تقبل شحن أسرع من ساعتين مهما كبّرنا الألواح.
const INTEGRATED_MAX_C_RATE = 0.5;
// نافذة شحن الكابينة من الألواح: 3–4 ساعات (قرار المستخدم) — نعتمد 4 حتى
// ما ينفخ عدد الألواح، وهي داخل مدى الجهاز أصلاً (0.5P = ساعتين كحد أسرع).
const INTEGRATED_CHARGE_HOURS = 4;

function integratedLoadKw(amps, systemVoltage) {
  const a = Number(amps) || 0;
  return a > 0 ? (a * systemVoltage) / 1000 : 0;
}

// حاجة المشروع: قدرة (kW) للحمل الأكبر، وسعة (kWh) لتغطية الليل بعمق التفريغ
function integratedRequired(ampDay, ampNight, nightSupplyHours, settings) {
  const { systemVoltage, inverterSafetyFactor, dod } = settings;
  const dayLoadKw = integratedLoadKw(ampDay, systemVoltage);
  const nightLoadKw = integratedLoadKw(ampNight, systemVoltage);
  const requiredKw = Math.max(dayLoadKw, nightLoadKw) * (inverterSafetyFactor || 1);
  const hours = Number(nightSupplyHours) || 0;
  // الطاقة المسحوبة ليلاً فعلياً + السعة اللازمة بعد عمق التفريغ
  const nightEnergyKwh = nightLoadKw > 0 && hours > 0 ? nightLoadKw * hours : 0;
  const requiredKwh = nightEnergyKwh > 0 ? nightEnergyKwh / dod : 0;
  return { requiredKw, requiredKwh, nightEnergyKwh, dayLoadKw, nightLoadKw };
}

function selectIntegratedCombos(integratedMaterials, ampDay, ampNight, nightSupplyHours, settings) {
  const req = integratedRequired(ampDay, ampNight, nightSupplyHours, settings);
  const combos = [];
  for (const material of integratedMaterials) {
    const kw = Number(material.integrated_kw) || 0;
    const kwh = Number(material.watt_or_capacity) || 0;
    const byKw = kw > 0 && req.requiredKw > 0 ? Math.ceil(req.requiredKw / kw) : 1;
    const byKwh = kwh > 0 && req.requiredKwh > 0 ? Math.ceil(req.requiredKwh / kwh) : 1;
    const units = Math.max(1, byKw, byKwh);
    combos.push({
      material, units, kw, kwh,
      totalPrice: material.price * units,
      totalKw: kw * units, totalKwh: kwh * units,
      driver: byKwh > byKw ? 'kwh' : 'kw',
    });
  }
  combos.sort((a, b) => a.totalPrice - b.totalPrice || a.units - b.units);
  return { combos, ...req };
}

// ألواح السستم المتكامل: تغذية الحمل النهاري + شحن الطاقة المسحوبة ليلاً خلال
// نافذة 4 ساعات (مو دفعة وحدة بساعة) — وقدرة الشحن محدودة بـ0.5P من الداتا شيت.
function integratedChargeKw(nightEnergyKwh, bankKwh) {
  if (!(nightEnergyKwh > 0)) return 0;
  const wanted = nightEnergyKwh / INTEGRATED_CHARGE_HOURS;
  const deviceMax = bankKwh > 0 ? bankKwh * INTEGRATED_MAX_C_RATE : Infinity;
  return Math.min(wanted, deviceMax);
}

function integratedPanelsRequired({ dayLoadKw, nightEnergyKwh, bankKwh, settings, panelWatt }) {
  const eff = settings.systemEfficiency || 0.8;
  const arrayKw = (dayLoadKw + integratedChargeKw(nightEnergyKwh, bankKwh)) / eff;
  if (!(arrayKw > 0) || !(panelWatt > 0)) return 0;
  return Math.ceil((arrayKw * 1000) / panelWatt);
}

function selectIntegratedPanelTiers(panelMaterials, req, bankKwh, settings) {
  const combos = [];
  for (const material of panelMaterials) {
    const units = integratedPanelsRequired({
      dayLoadKw: req.dayLoadKw || 0, nightEnergyKwh: req.nightEnergyKwh || 0,
      bankKwh, settings, panelWatt: material.watt_or_capacity,
    });
    if (units <= 0) continue;
    combos.push({ material, units, feedPanels: units, chargePanels: 0, totalPrice: units * material.price });
  }
  if (!combos.length) return noneResult();
  return classifyTiers(combos);
}

// قدرة الكابينة الفعلية — بنفس معادلة التحجيم (أحادي الطور على فولتية النظام)
function integratedCapability({ units, kwh, kw, nightLoadKw, dod, systemVoltage }) {
  const nightHours =
    units > 0 && kwh > 0 && nightLoadKw > 0
      ? Math.round(((units * kwh * dod) / nightLoadKw) * 10) / 10
      : null;
  const dayAmps = units > 0 && kw > 0 ? Math.floor((units * kw * 1000) / systemVoltage) : null;
  // ساعات الشحن الفعلية بالمصفوفة المختارة — تظهر للبياع حتى يتأكد إنها 3-4 ساعات
  return { nightHours, dayAmps };
}

function capabilityOf({
  batteryUnits = 0, batteryKwh = 0, inverterUnits = 0, inverterW = 0,
  ampNight = 0, systemVoltage = 220, dod = 0.9, inverterSafetyFactor = 1,
}) {
  const nightHours =
    batteryUnits > 0 && batteryKwh > 0 && ampNight > 0
      ? Math.round(((batteryUnits * batteryKwh * dod * 1000) / (ampNight * systemVoltage)) * 10) / 10
      : null;
  const dayAmps =
    inverterUnits > 0 && inverterW > 0
      ? Math.floor((inverterUnits * inverterW) / (systemVoltage * (inverterSafetyFactor || 1)))
      : null;
  return { nightHours, dayAmps };
}

export {
  PANEL_AMPS_PER_WATT,
  PANEL_AMPS_REF_VOLTAGE,
  PANEL_REAL_YIELD,
  PREMIUM_INVERTER_HEADROOM,
  PANEL_SAFETY_FACTOR,
  LEGACY_PANEL_SAFETY_FACTOR,
  PREMIUM_CHARGE_PANEL_FACTOR,
  PV_OVERSIZE_RATIO,
  IRAQ_SUN_HOURS,
  HOYMILES_MAX_AMPS,
  DEFAULT_BATTERY_FACTORS,
  LEGACY_BATTERY_FACTORS,
  ipRatingOf,
  isHoymiles,
  chargingCheck,
  panelAmpsFor,
  batteriesRequired,
  panelsRequired,
  requiredRoofArea,
  inverterCapacityRequired,
  integratedRequired,
  integratedLoadKw,
  selectIntegratedCombos,
  integratedPanelsRequired,
  integratedChargeKw,
  selectIntegratedPanelTiers,
  integratedCapability,
  INTEGRATED_CHARGE_HOURS,
  INTEGRATED_MAX_C_RATE,
  systemAmpSize,
  pickLaborTier,
  capabilityOf,
  classifyTiers,
  selectBatteryTiers,
  selectPanelTiers,
  selectInverterTiers,
};
