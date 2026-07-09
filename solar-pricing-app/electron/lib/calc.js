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

// قدرة الانفيرتر المطلوبة (واط)
function inverterCapacityRequired(ampDay, ampNight, { systemVoltage, inverterSafetyFactor }) {
  return Math.max(ampDay, ampNight) * systemVoltage * inverterSafetyFactor;
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
function selectBatteryTiers(batteryMaterials, ampNight, nightSupplyHours, settings) {
  const combos = [];
  for (const material of batteryMaterials) {
    const units = batteriesRequired(ampNight, nightSupplyHours, settings, material.watt_or_capacity);
    if (units <= 0) continue;
    if (material.quantity_stock < units) continue;
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
    if (material.quantity_stock < total) continue;
    combos.push({ material, units: total, feedPanels, chargePanels, totalPrice: total * material.price });
  }
  return classifyTiers(combos);
}

function selectInverterTiers(inverterMaterials, ampDay, ampNight, settings) {
  const requiredW = inverterCapacityRequired(ampDay, ampNight, settings);
  const combos = [];
  for (const material of inverterMaterials) {
    const units = Math.ceil(requiredW / material.watt_or_capacity);
    if (units <= 0) continue;
    if (material.quantity_stock < units) continue;
    combos.push({ material, units, totalPrice: units * material.price });
  }
  return classifyTiers(combos);
}

module.exports = {
  PANEL_AMPS_PER_WATT,
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
