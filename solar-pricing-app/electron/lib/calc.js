// محرك حساب منظومة الطاقة الشمسية - وحدة منطقية بحتة بدون أي اعتماد على Electron أو قاعدة البيانات
// كل الدوال هنا قابلة للاختبار بشكل مستقل (انظر tests/calc.test.js)

function computeRequirements({ ampDay, ampNight, systemVoltage, peakSunHours, systemEfficiency, inverterSafetyFactor, dod, nightCoverageHours }) {
  const dayLoadW = ampDay * systemVoltage;
  const nightLoadW = ampNight * systemVoltage;
  const nightEnergyWh = nightLoadW * nightCoverageHours;
  const dayEnergyWh = dayLoadW * peakSunHours + nightEnergyWh / systemEfficiency;
  const batteryCapacityKwhNeeded = nightEnergyWh / dod / 1000;
  const inverterCapacityW = Math.max(dayLoadW, nightLoadW) * inverterSafetyFactor;
  return { dayLoadW, nightLoadW, nightEnergyWh, dayEnergyWh, batteryCapacityKwhNeeded, inverterCapacityW };
}

function panelsByLoadFor(dayEnergyWh, panelWattage, { peakSunHours, systemEfficiency }) {
  return Math.ceil(dayEnergyWh / (peakSunHours * systemEfficiency * panelWattage));
}

function panelsByRoofFor(roofAreaM2, panelAreaM2) {
  return Math.floor(roofAreaM2 / panelAreaM2);
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

// يبني كل التوليفات الممكنة (مادة واحدة + الكمية اللازمة) لفئة معينة
// requiredUnitsFn(material) => عدد الوحدات اللازمة من هذه المادة لتحقيق المطلوب (integer)
function buildFeasibleCombos(materials, requiredUnitsFn) {
  const combos = [];
  for (const material of materials) {
    const units = requiredUnitsFn(material);
    if (units == null || units <= 0) continue;
    if (material.quantity_stock < units) continue; // لا يكفي المخزون بأي حال
    combos.push({
      material,
      units,
      totalPrice: units * material.price,
    });
  }
  return combos;
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

function selectPanelTiers(panelMaterials, requirements, roofAreaM2, settings) {
  const combos = [];
  for (const material of panelMaterials) {
    const panelsByLoad = panelsByLoadFor(requirements.dayEnergyWh, material.watt_or_capacity, settings);
    const panelsByRoof = panelsByRoofFor(roofAreaM2, settings.panelAreaM2);
    const count = Math.min(panelsByLoad, panelsByRoof);
    if (count <= 0) continue;
    if (material.quantity_stock < count) continue;
    combos.push({
      material,
      units: count,
      totalPrice: count * material.price,
      panelsByLoad,
      panelsByRoof,
      roofLimited: panelsByRoof < panelsByLoad,
    });
  }
  return classifyTiers(combos);
}

function selectBatteryTiers(batteryMaterials, requirements) {
  const combos = buildFeasibleCombos(batteryMaterials, (m) =>
    Math.ceil(requirements.batteryCapacityKwhNeeded / m.watt_or_capacity)
  );
  return classifyTiers(combos);
}

function selectInverterTiers(inverterMaterials, requirements) {
  const combos = buildFeasibleCombos(inverterMaterials, (m) =>
    Math.ceil(requirements.inverterCapacityW / m.watt_or_capacity)
  );
  return classifyTiers(combos);
}

module.exports = {
  computeRequirements,
  panelsByLoadFor,
  panelsByRoofFor,
  systemAmpSize,
  pickLaborTier,
  buildFeasibleCombos,
  classifyTiers,
  selectPanelTiers,
  selectBatteryTiers,
  selectInverterTiers,
};
