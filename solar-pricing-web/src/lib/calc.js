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
const PANEL_AMPS_PER_WATT = 2.18 / 650;

// أمبير اللوح الواحد بحسب واطيته (لوح 650 = 2.18، لوح 720 = 2.41...)
function panelAmpsFor(panelWatt) {
  return panelWatt * PANEL_AMPS_PER_WATT;
}

// عدد وحدات البطارية المطلوبة لتغطية الليل بساعات التجهيز المدخلة بالعرض.
// factor = معامل أمان المستوى (من الإعدادات): الحاجة تنضرب به قبل القسمة على سعة
// البطارية — 0.9 مثلاً يسمح لبطارية 16kWh وحدة تغطي حاجة 17.6kWh بدل ما نجبر ثنتين.
function batteriesRequired(ampNight, nightSupplyHours, { systemVoltage, dod }, batteryKwh, factor = 1) {
  if (ampNight <= 0) return 0;
  const nightEnergyKwh = (ampNight * systemVoltage * nightSupplyHours) / 1000;
  return Math.max(1, Math.ceil((nightEnergyKwh * factor) / dod / batteryKwh));
}

// عدد الألواح النهائي = تغذية النهار + شحن البطاريات — ودائماً زوجي (التركيب أزواج على 2 MPPT)
function panelsRequired(ampDay, batteryCount, settings, panelWatt) {
  let feedPanels = ampDay > 0 ? Math.ceil(ampDay / panelAmpsFor(panelWatt)) : 0;
  const chargePanels = Math.ceil(batteryCount * settings.chargePanelsPerBattery);
  let total = feedPanels + chargePanels;
  if (total % 2 === 1) {
    total += 1;
    feedPanels += 1; // اللوح المكمل يظهر ضمن ألواح التغذية بالتفصيل
  }
  return { feedPanels, chargePanels, total };
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

// معاملات أمان البطاريات الافتراضية لكل مستوى (تتغير من الإعدادات — app_config)
const DEFAULT_BATTERY_FACTORS = { economy: 0.9, standard: 0.85, premium: 0.8 };

function materialText(material) {
  return `${material.brand || ''} ${material.model || ''} ${material.full_description || ''}`;
}

// درجة الحماية IP من نصوص المادة (أعلى رقم مذكور) — 0 إذا غير مذكورة
function ipRatingOf(material) {
  const re = /IP\s*-?\s*(\d{2})/gi;
  const text = materialText(material);
  let best = 0;
  let match;
  while ((match = re.exec(text))) best = Math.max(best, Number(match[1]));
  return best;
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

function fewestUnitsGroup(combos) {
  const minUnits = Math.min(...combos.map((c) => c.units));
  return combos.filter((c) => c.units === minUnits);
}

function pickFewestThenCheapest(combos) {
  return fewestUnitsGroup(combos).sort((a, b) => a.totalPrice - b.totalPrice)[0];
}

// الاقتصادي (انفيرترات): أقل عدد ← أدنى فئة IP متوفرة ← الأرخص داخل الفئة.
// غير المذكور IP بوصفه يُعد IP21 (الفئة الأساسية الداخلية)، وما فوق 65 يُسقّف بـ65
// حتى ما يسحب جهاز IP66 أرخص قليلاً العرضَ الاقتصادي (مثل هويمايلز مقابل المحلي).
function pickFewestThenLowestIp(combos) {
  const group = fewestUnitsGroup(combos);
  const effIp = (c) => Math.min(ipRatingOf(c.material) || 21, STANDARD_IP_CAP);
  const minIp = Math.min(...group.map(effIp));
  return group.filter((c) => effIp(c) === minIp).sort((a, b) => a.totalPrice - b.totalPrice)[0];
}

function pickFewestThenMid(combos) {
  return midByPrice(fewestUnitsGroup(combos));
}

// المتوسط للانفيرترات: أقل عدد ← أعلى حماية IP ← الأرخص عند تساوي الـIP.
// الـIP يُسقّف بـ65 للمقارنة: IP65 وIP66 كلاهما تصنيف خارجي كامل، فما نخلي جهازاً
// أغلى بكثير (مثل هويمايلز IP66 المحجوزة للممتاز) يسحب المتوسط — السعر يفصل بعدها.
const STANDARD_IP_CAP = 65;
function pickFewestThenIp(combos) {
  const group = fewestUnitsGroup(combos);
  const effIp = (c) => Math.min(ipRatingOf(c.material), STANDARD_IP_CAP);
  const maxIp = Math.max(...group.map(effIp));
  return group.filter((c) => effIp(c) === maxIp).sort((a, b) => a.totalPrice - b.totalPrice)[0];
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
  // حاجة الممتاز الفعلية بالكيلو واط ساعة (بعد معامل الأمان وعمق التفريغ) — لسقف التكبير
  const premiumNeededKwh = ((ampNight * settings.systemVoltage * nightSupplyHours) / 1000) * f.premium / settings.dod;
  return {
    economy: pickFewestThenCheapest(allByTier.economy),
    standard: pickFewestThenMid(allByTier.standard),
    premium: pickBatteryPremium(premiumPool(allByTier.premium, systemAmps), premiumNeededKwh),
    singleOption: allByTier.standard.length === 1,
    insufficient: false,
    all: allByTier.standard,
    allByTier,
  };
}

// توليفات الألواح: العدد يعتمد على أمبير النهار + عدد بطاريات التوليفة المرافقة.
// بلا أمبير نهاري => بلا ألواح إطلاقاً حتى ألواح الشحن (انفيرتر + بطارية فقط —
// الشحن من الشبكة/المولدة، مثل تجهيز الوحدات العسكرية).
function selectPanelTiers(panelMaterials, ampDay, batteryCount, settings) {
  if (!(ampDay > 0)) return noneResult();
  const combos = [];
  for (const material of panelMaterials) {
    const { feedPanels, chargePanels, total } = panelsRequired(ampDay, batteryCount, settings, material.watt_or_capacity);
    if (total <= 0) continue;
    combos.push({ material, units: total, feedPanels, chargePanels, totalPrice: total * material.price });
  }
  return classifyTiers(combos);
}

function selectInverterTiers(inverterMaterials, ampDay, ampNight, settings, panelArrayW = 0, systemAmps = 0) {
  const requiredW = inverterCapacityRequired(ampDay, ampNight, settings, panelArrayW);
  const combos = [];
  for (const material of inverterMaterials) {
    const units = Math.ceil(requiredW / material.watt_or_capacity);
    if (units <= 0) continue;
    combos.push({ material, units, totalPrice: units * material.price });
  }

  // premium: هويمايلز حصراً ≤120 أمبير (وإلا كل الماركات)، والقدرة الكلية ≥ الطلب ×1.3 —
  // تتحقق بتكبير حجم الجهاز أولاً (أقل عدد وحدات)، والتعديد يصير طبيعياً بالأحجام الكبيرة فقط
  function pickInverterPremium(all) {
    const candidates = premiumPool(all, systemAmps).map((c) => {
      const units = Math.max(1, Math.ceil((requiredW * 1.3) / c.material.watt_or_capacity));
      return { material: c.material, units, totalPrice: units * c.material.price };
    });
    const minUnits = Math.min(...candidates.map((c) => c.units));
    return candidates.filter((c) => c.units === minUnits).sort((a, b) => a.totalPrice - b.totalPrice)[0];
  }

  // المتوسط بالـIP الأعلى قبل السعر، والاقتصادي بأدنى فئة IP (يبدأ من IP21) ثم الأرخص
  return assignTiers(combos, pickInverterPremium, pickFewestThenIp, pickFewestThenLowestIp);
}

export {
  PANEL_AMPS_PER_WATT,
  PV_OVERSIZE_RATIO,
  IRAQ_SUN_HOURS,
  HOYMILES_MAX_AMPS,
  DEFAULT_BATTERY_FACTORS,
  ipRatingOf,
  isHoymiles,
  chargingCheck,
  panelAmpsFor,
  batteriesRequired,
  panelsRequired,
  requiredRoofArea,
  inverterCapacityRequired,
  systemAmpSize,
  pickLaborTier,
  classifyTiers,
  selectBatteryTiers,
  selectPanelTiers,
  selectInverterTiers,
};
