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

// ═══ قاعدة الشركة لتحويل الألواح لأمبير ════════════════════════════════════
//   الأمبيرية = (واطية اللوح × عدد الألواح − 25%) ÷ فولتية النظام
// وعكسها اللي يستعمله المحرك: عدد الألواح = الأمبير × الفولتية ÷ (الواط × 0.75)
// تحقّق على عرض حقيقي: 50 لوح × 650 واط × 0.75 ÷ 230 = 106 أمبير — وهو نفس
// عنوان العرض 426 «بسعة 105 أمبير» بالضبط.
const PANEL_REAL_YIELD = 0.75; // ننقص 25%: غيم وغبار وزاوية وحرارة وفقد
const PANEL_AMPS_REF_VOLTAGE = 230;
// أمبير اللوح الواحد عند فولتية المرجع — يبقى مُصدَّراً للتوافق (650 واط ← 2.12)
const PANEL_AMPS_PER_WATT = PANEL_REAL_YIELD / PANEL_AMPS_REF_VOLTAGE;

// أمبير اللوح الواحد بحسب واطيته وفولتية النظام (لوح 650 على 230 = 2.12).
// **لازم تدخل الفولتية**: البطاريات والانفيرتر يحسبون الحمل بـ(أمبير × فولت)،
// فلو الألواح انحسبت بالأمبير وحده تبقى المعادلات متفقة على فولتية وحدة بس،
// وبأي فولتية ثانية ينفصلون: على 48 فولت مثلاً الحمل ينزل ×4.8 بينما عدد
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
// ألواح الشحن لكل بطارية إذا الإعداد فارغ أو صفر — لوح واحد (قرار المستخدم،
// نزّلها من 1.5). القيمة المحفوظة بالإعدادات تسبق هذا الافتراض دائماً.
const DEFAULT_CHARGE_PANELS_PER_BATTERY = 1;

// عدد الألواح النهائي = تغذية النهار (بمعامل الأمان) + شحن البطاريات — العدد حر
function panelsRequired(ampDay, batteryCount, settings, panelWatt, chargeFactor = 1) {
  const safety = settings.panelSafetyFactor > 0 ? settings.panelSafetyFactor : PANEL_SAFETY_FACTOR;
  const feedPanels = ampDay > 0
    ? Math.ceil((ampDay * safety) / panelAmpsFor(panelWatt, settings.systemVoltage))
    : 0;
  const perBattery = Number(settings.chargePanelsPerBattery) > 0
    ? Number(settings.chargePanelsPerBattery)
    : DEFAULT_CHARGE_PANELS_PER_BATTERY;
  const chargePanels = Math.ceil(batteryCount * perBattery * chargeFactor);
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

// ===== دستور التسعير (السعر وحده — معتمد من الشركة) ==========================
// **درجة الحماية IP انشالت من التقييم كلياً** (قرار المستخدم). كانت المستويات
// تنبني على سلّم IP: الاقتصادي أدنى درجة والممتاز أعلاها والسعر فاصل أخير
// داخل الدرجة. النتيجة كانت مستويات ما تتبع السعر أبداً — جهاز IP21 صغير
// يحتاج وحدتين يطلع «اقتصادياً» وهو أغلى من جهاز IP65 واحد. والـIP يبقى
// **مواصفة تُكتب بالعرض وتُدار بالمخزون**، بس ما يقرر مستوى.
//
// التحجيم **واحد بكل المستويات**: أقل عدد وحدات يغطي حاجة الزبون بالضبط —
// ماكو تكبير خاص بالممتاز ولا هامش زيادة. «بالكيلوواطية اللي يحتاجها الزبون بس».
//
// والمستويات تتفرق بالسعر وحده:
//   economy  → الأرخص
//   standard → الوسط سعراً
//   premium  → **هويمايلز تلقائياً** بأي أمبيرية (كان محصوراً بـ120 أمبير)؛
//              وإذا ماكو هويمايلز بالمجموعة ياخذ الأعلى سعراً.

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

const capacityOf = (m) => Number(m.watt_or_capacity) || 0;

// ملاحظة مقصودة: ماكو «حارس» يمنع أن يطلع الاقتصادي أغلى من المتوسط.
// جرّبناه وانشال — لأنه يخلي السعر يتقدم على المواصفة، وهذا عكس القاعدة
// المعتمدة. معنى «اقتصادي» هنا **أدنى مواصفة**، مو أرخص سعر: جهاز IP21 صغير
// ممكن يحتاج وحدتين فيطلع مجموعه أعلى من جهاز IP65 واحد. هذا جواب صحيح
// بالمواصفة، ويتصحّح سعرياً لما تنضبط أسعار المخزون.

function fewestUnitsGroup(combos) {
  const minUnits = Math.min(...combos.map((c) => c.units));
  return combos.filter((c) => c.units === minUnits);
}

// ═══ التحجيم الصحيح: القدرة تلزم قريبة من حاجة الزبون ═══════════════════
// قرار المستخدم: «الأمبيرية اللي أريدها بالاقتصادي ما يتجاوزها، تكون قريبة
// جداً أو متساوية… وحتى بالمتوسط تبقى الكيلوواطية نفسها أو أكبر بشوي، بس
// سعر أعلى… ما يطفر يختار جهازين أو كيلوواطية عالية جداً».
//
// يعني **القدرة ما تفرّق المستويات، السعر يفرّقها**. كل المستويات تشتغل على
// نفس مجموعة المرشحين: اللي قدرتها الكلية قريبة من المطلوب، وبأقل عدد أجهزة.
//
// السقف: القدرة الكلية ما تتجاوز المطلوب بأكثر من النصف. بلا هذا كان
// الاقتصادي بـ105 أمبير ياخذ انفيرتر 55kW لحاجة 29kW لمجرد أنه الأرخص،
// والبطاريات تاخذ كابينة 261kWh لحاجة 98kWh لمجرد أنها وحدة واحدة.
const MAX_OVERSIZE = 1.5;

// يحصر المرشحين باللي قدرتهم الكلية ضمن السقف. وإذا ماكو ولا واحد يمر
// (كل الأجهزة أكبر من الحاجة بكثير) ناخذ **الأقرب للمطلوب** بدل ما نكسر.
function rightSized(combos, required, totalCapOf) {
  if (!(required > 0) || !combos.length) return combos;
  const within = combos.filter((c) => totalCapOf(c) <= required * MAX_OVERSIZE);
  if (within.length) return within;
  const closest = Math.min(...combos.map(totalCapOf));
  return combos.filter((c) => totalCapOf(c) === closest);
}

// مجموعة الاختيار النهائية: محجّمة صح، وبأقل عدد أجهزة.
// **أقل عدد أجهزة مطلق** — ماكو سماح بوحدة زيادة بعد: كان الاقتصادي ياخذ
// جهازين أصغر لمجرد أنهما أرخص، والمستخدم رفضها صراحةً.
function tierPool(combos, required, totalCapOf) {
  return fewestUnitsGroup(rightSized(combos, required, totalCapOf));
}

const byPrice = (list) => [...list].sort((a, b) => (a.totalPrice - b.totalPrice) || (a.units - b.units));

// الاقتصادي الأرخص، والمتوسط الوسط سعراً، والممتاز هويمايلز (وإلا الأغلى) —
// كلهم من نفس المجموعة المحجّمة، فالكيلوواطية تبقى وحدة والسعر هو الفارق.
function pickCheapest(pool) { return byPrice(pool)[0]; }
function pickMidPrice(pool) { return midByPrice(pool); }

// الممتاز هويمايلز: ندوّر عليها بالمجموعة المحجّمة أولاً، وإذا ما طلعت بيها
// نوسّع **بنفس عدد الأجهزة بالضبط** — لأن سقف التحجيم الضيّق ممكن يستبعد
// هويمايلز لفرق سعة بسيط فيضيع المستوى كله. التوسيع محصور بنفس العدد عمداً:
// بلا هذا الحصر كانت كابينة 215kWh (وحدة واحدة، وهويمايلز) تنخطف للممتاز
// بعرض حاجته 29kWh.
function pickPremium(pool, sameUnits = pool) {
  const inPool = pool.filter((c) => isHoymiles(c.material));
  if (inPool.length) return byPrice(inPool)[0];
  const wider = sameUnits.filter((c) => isHoymiles(c.material));
  if (wider.length) return byPrice(wider)[0];
  return byPrice(pool)[pool.length - 1];
}

// يوزّع المستويات على مجموعة مرشحين **واحدة** — القدرة نفسها للثلاثة،
// والفرق بالسعر وحده.
function assignTiers(combos, required, totalCapOf) {
  if (combos.length === 0) {
    return { economy: null, standard: null, premium: null, singleOption: false, insufficient: true, all: [] };
  }
  const sorted = [...combos].sort((a, b) => a.totalPrice - b.totalPrice);
  const pool = tierPool(combos, required, totalCapOf);
  const poolUnits = pool[0]?.units;
  const sameUnits = combos.filter((c) => c.units === poolUnits);
  if (pool.length === 1) {
    return {
      economy: pool[0], standard: pool[0], premium: pickPremium(pool, sameUnits),
      singleOption: sorted.length === 1, insufficient: false, all: sorted,
    };
  }
  return {
    economy: pickCheapest(pool),
    standard: pickMidPrice(pool),
    premium: pickPremium(pool, sameUnits),
    singleOption: false,
    insufficient: false,
    all: sorted,
  };
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
  // نفس دستور الانفيرتر: مجموعة واحدة محجّمة على حاجة الزبون، والسعر يفرّق
  const bankKwh = (c) => c.units * c.material.watt_or_capacity;
  const tiers = {
    economy: assignTiers(allByTier.economy, neededKwhFor(f.economy), bankKwh).economy,
    standard: assignTiers(allByTier.standard, neededKwhFor(f.standard), bankKwh).standard,
    premium: assignTiers(allByTier.premium, neededKwhFor(f.premium), bankKwh).premium,
  };
  return {
    ...tiers,
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
  // **بلا زيادة ألواح للممتاز**: التحجيم واحد بكل المستويات — بالكيلوواطية
  // اللي يحتاجها الزبون بس. كان الممتاز يضرب ألواح الشحن بـ1.25.
  const chargeFactor = 1;
  const combos = [];
  for (const material of panelMaterials) {
    const { feedPanels, chargePanels, total } = panelsRequired(ampDay, batteryCount, settings, material.watt_or_capacity, chargeFactor);
    if (total <= 0) continue;
    combos.push({ material, units: total, feedPanels, chargePanels, totalPrice: total * material.price });
  }
  // **السعر وحده**: كان سلّم الواطية يقرر المستوى، وانشال مع سلّم الـIP.
  // هويمايلز ما تصنع ألواحاً، فالممتاز هنا هو الأعلى سعراً.
  if (combos.length === 0) {
    return { economy: null, standard: null, premium: null, singleOption: false, insufficient: true, all: [] };
  }
  const sorted = [...combos].sort((a, b) => a.totalPrice - b.totalPrice);
  return {
    economy: sorted[0],
    standard: midByPrice(sorted),
    premium: sorted[sorted.length - 1],
    singleOption: combos.length === 1,
    insufficient: false,
    all: sorted,
  };
}

function selectInverterTiers(inverterMaterials, ampDay, ampNight, settings, panelArrayW = 0, systemAmps = 0) {
  const requiredW = inverterCapacityRequired(ampDay, ampNight, settings, panelArrayW);
  const combos = [];
  for (const material of inverterMaterials) {
    const units = Math.ceil(requiredW / material.watt_or_capacity);
    if (units <= 0) continue;
    combos.push({ material, units, totalPrice: units * material.price });
  }

  // القدرة الكلية للتوليفة (واط) — عليها يتحدد التحجيم الصحيح
  const totalW = (c) => c.units * c.material.watt_or_capacity;
  return assignTiers(combos, requiredW, totalW);
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
  DEFAULT_CHARGE_PANELS_PER_BATTERY,
  PANEL_SAFETY_FACTOR,
  LEGACY_PANEL_SAFETY_FACTOR,
  PV_OVERSIZE_RATIO,
  IRAQ_SUN_HOURS,
  DEFAULT_BATTERY_FACTORS,
  LEGACY_BATTERY_FACTORS,
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
