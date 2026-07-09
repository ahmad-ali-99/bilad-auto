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

// عدد وحدات البطارية المطلوبة لتغطية الليل بساعات التجهيز المدخلة بالعرض
function batteriesRequired(ampNight, nightSupplyHours, { systemVoltage, dod }, batteryKwh) {
  if (ampNight <= 0) return 0;
  const nightEnergyKwh = (ampNight * systemVoltage * nightSupplyHours) / 1000;
  return Math.ceil(nightEnergyKwh / dod / batteryKwh);
}

// عدد الألواح النهائي = تغذية النهار + شحن البطاريات
function panelsRequired(ampDay, batteryCount, settings, panelWatt) {
  const feedPanels = ampDay > 0 ? Math.ceil(ampDay / panelAmpsFor(panelWatt)) : 0;
  const chargePanels = Math.ceil(batteryCount * settings.chargePanelsPerBattery);
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
        `ملاحظة الشحن: إذا انقطعت الوطنية، شحن البطاريات من الألواح وحدها ياخذ ~${Math.ceil(hoursNeeded)} ساعة ` +
        `(أكثر من ${IRAQ_SUN_HOURS} ساعات الشمس) — زيد ألواح أو كبّر الانفيرتر إذا الزبون يعتمد على الشمس بالشحن. ` +
        'الشحن من الوطنية طبيعي وسريع ولا يتأثر.',
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

// توليفات البطاريات: لكل موديل بطارية عدد وحدات مطلوب حسب ساعات التجهيز الليلي
// الاقتصادي = أرخص توليفة تغطي الطاقة حتى لو بعدد وحدات أكثر (قرار الشركة بعد اختبار
// 10/20/30/40A على البيانات الحية — التكديس صحيح تشغيلياً والتبديل اليدوي متاح)
function selectBatteryTiers(batteryMaterials, ampNight, nightSupplyHours, settings) {
  const combos = [];
  for (const material of batteryMaterials) {
    const units = batteriesRequired(ampNight, nightSupplyHours, settings, material.watt_or_capacity);
    if (units <= 0) continue;
    combos.push({ material, units, totalPrice: units * material.price });
  }
  return classifyTiers(combos);
}

// توليفات الألواح: العدد يعتمد على أمبير النهار + عدد بطاريات التوليفة المرافقة
function selectPanelTiers(panelMaterials, ampDay, batteryCount, settings) {
  const combos = [];
  for (const material of panelMaterials) {
    const { feedPanels, chargePanels, total } = panelsRequired(ampDay, batteryCount, settings, material.watt_or_capacity);
    if (total <= 0) continue;
    combos.push({ material, units: total, feedPanels, chargePanels, totalPrice: total * material.price });
  }
  return classifyTiers(combos);
}

function selectInverterTiers(inverterMaterials, ampDay, ampNight, settings, panelArrayW = 0) {
  const requiredW = inverterCapacityRequired(ampDay, ampNight, settings, panelArrayW);
  const combos = [];
  for (const material of inverterMaterials) {
    const units = Math.ceil(requiredW / material.watt_or_capacity);
    if (units <= 0) continue;
    combos.push({ material, units, totalPrice: units * material.price });
  }
  return classifyTiers(combos);
}

export {
  PANEL_AMPS_PER_WATT,
  PV_OVERSIZE_RATIO,
  IRAQ_SUN_HOURS,
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
