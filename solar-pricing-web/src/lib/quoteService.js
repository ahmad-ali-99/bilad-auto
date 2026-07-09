// منطق بناء العرض — دوال نقية تعمل على مصفوفات مجلوبة مسبقاً (لا اتصال بقاعدة بيانات)
// طبقة البيانات السحابية (dataApi.js) تجلب الصفوف من Supabase ثم تنادي هذه الدوال.
import * as calc from './calc.js';

const CATEGORY_LABELS_AR = {
  panel: 'الألواح',
  battery: 'البطاريات',
  inverter: 'الانفيرترات',
};

// يحوّل صف الإعدادات (أعمدة snake_case) لكائن الإعدادات المستخدم بالمعادلات
function mapSettings(row) {
  return {
    systemVoltage: row.system_voltage,
    systemEfficiency: row.system_efficiency,
    inverterSafetyFactor: row.inverter_safety_factor,
    dod: row.dod,
    nightCoverageHours: row.night_coverage_hours,
    panelAreaM2: row.panel_area_m2,
    currency: row.currency,
    quoteNumberStart: row.quote_number_start,
    chargePanelsPerBattery: row.charge_panels_per_battery,
  };
}

// يبني كائن الخيارات من المصفوفات المجلوبة — بدل computeOptions القديمة المرتبطة بقاعدة بيانات
function buildOptions({ materials, laborTiers, settingsRow, roofAreaM2, ampDay, ampNight, nightSupplyHours }) {
  const settings = mapSettings(settingsRow);
  const supplyHours = nightSupplyHours != null && nightSupplyHours !== '' ? Number(nightSupplyHours) : settings.nightCoverageHours;

  const byPrice = (a, b) => a.price - b.price;
  const panelMaterials = materials.filter((m) => m.category === 'panel').sort(byPrice);
  const batteries = materials.filter((m) => m.category === 'battery').sort(byPrice);
  const inverters = materials.filter((m) => m.category === 'inverter').sort(byPrice);
  const secondary = materials.filter((m) => m.category === 'secondary').sort((a, b) => a.id - b.id);

  const batteryTiers = calc.selectBatteryTiers(batteries, ampNight, supplyHours, settings);
  const systemAmps = calc.systemAmpSize(ampDay, ampNight);
  const labor = calc.pickLaborTier(laborTiers, systemAmps);

  return {
    settings,
    roofAreaM2,
    ampDay,
    ampNight,
    nightSupplyHours: supplyHours,
    panelMaterials,
    inverterMaterials: inverters,
    secondary,
    labor,
    systemAmps,
    batteryTiers,
  };
}

// يفصل الملاحظات الداخلية (مصدر السعر وتاريخه وتنبيهاته) عن وصف المادة —
// الوصف النظيف يروح لبنود العرض المطبوع للزبون، والملاحظات تظهر للبياع داخل البرنامج فقط
const INTERNAL_NOTE_RE = /\(([^()]*(?:من عرض|بتاريخ|تنبيه|آخر سعر|جملة|فتأكد|الأحدث|للمشاريع|ربما|بعرض)[^()]*)\)/g;
function stripInternalNotes(description) {
  const notes = [];
  let clean = String(description || '').replace(INTERNAL_NOTE_RE, (_, inner) => {
    notes.push(inner.trim());
    return '';
  });
  clean = clean
    .split('\n')
    .filter((line) => {
      if (/^\s*[•*-]?\s*تنبيه\s*[::]/.test(line)) {
        notes.push(line.replace(/^\s*[•*-]?\s*/, '').trim());
        return false;
      }
      return line.trim() !== '';
    })
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return { clean, notes };
}

function secondaryUnitQuantity(material, panelCount) {
  if (material.unit === 'عدد') {
    if (material.qty_per_panel && material.qty_per_panel > 0) {
      return Math.ceil(panelCount * material.qty_per_panel);
    }
    return 1; // qty_per_panel = 0 أو NULL => وحدة ثابتة واحدة بالعرض
  }
  if (material.unit === 'قطعي') return 1;
  return 0; // 'متر' يُدخل يدوياً فقط
}

function pickCombo(tiersResult, tier, overrides, category, errors) {
  if (tiersResult.insufficient) {
    errors[category] = `لا توجد مادة بفئة ${CATEGORY_LABELS_AR[category]} — أضف مادة من المخزون`;
    return null;
  }
  const overrideId = overrides[category];
  if (overrideId != null) {
    const found = tiersResult.all.find((c) => c.material.id === overrideId);
    if (found) return found;
  }
  return tiersResult[tier];
}

// يبني مسودة العرض الكاملة لمستوى معين — بدون أي فحص لكمية المخزون (المواد مجرد خيارات)
// secondarySelections (اختياري): { [materialId]: { qty } } — إذا مرّر، تنضاف فقط المواد الثانوية
// المذكورة فيه؛ qty رقم = كمية يدوية، وqty فارغ/null = كمية تلقائية (حسب الألواح أو وحدة واحدة).
// إذا لم يمرّر يبقى السلوك القديم: كل الثانوية "عدد/قطعي" تنضاف تلقائياً + أمتار من cableMeters.
function buildQuoteDraft(options, { tier, overrides = {}, cableMeters = {}, secondarySelections = null }) {
  const { settings, roofAreaM2, ampDay, ampNight, batteryTiers, panelMaterials, inverterMaterials, secondary, labor, systemAmps } = options;

  const errors = {};
  const warnings = {};

  const batteryCombo = pickCombo(batteryTiers, tier, overrides, 'battery', errors);
  const batteryCount = batteryCombo ? batteryCombo.units : 0;

  const panelTiers = calc.selectPanelTiers(panelMaterials, ampDay, batteryCount, settings);
  const panelCombo = pickCombo(panelTiers, tier, overrides, 'panel', errors);

  // الانفيرتر يُختار بعد الألواح: قدرته لازم تستوعب الحمل ومصفوفة الألواح كاملة (÷1.3)
  const panelArrayW = panelCombo ? panelCombo.units * panelCombo.material.watt_or_capacity : 0;
  const inverterTiers = calc.selectInverterTiers(inverterMaterials, ampDay, ampNight, settings, panelArrayW);
  const inverterCombo = pickCombo(inverterTiers, tier, overrides, 'inverter', errors);

  if (!labor) {
    errors.labor = 'لا يوجد سعر عمل معرّف لهذا الحجم — أضف حجماً جديداً من المخزون';
  }

  // فحص شحن البطاريات من الألواح — تحذير فقط، العرض يُحفظ ويُطبع بالحالتين
  if (batteryCombo && inverterCombo && panelCombo) {
    const check = calc.chargingCheck({
      panelArrayW,
      inverterW: inverterCombo.units * inverterCombo.material.watt_or_capacity,
      ampDay,
      systemVoltage: settings.systemVoltage,
      bankKwh: batteryCombo.units * batteryCombo.material.watt_or_capacity,
      dod: settings.dod,
    });
    if (!check.ok) warnings.charging = check.message;
  }

  // فحص المساحة الحاجب: المساحة المطلوبة لعدد الألواح النهائي مقابل المتوفرة
  if (panelCombo) {
    const requiredArea = calc.requiredRoofArea(panelCombo.units, settings);
    if (roofAreaM2 < requiredArea) {
      errors.roofArea =
        `المساحة لا تكفي للعمل — المساحة المطلوبة: ${Math.ceil(requiredArea * 10) / 10} م²، ` +
        `المتوفرة: ${roofAreaM2} م². يرجى توفير المساحة المناسبة`;
    }
  }

  const items = [];
  const internalNotes = [];
  let total = 0;

  // الوصف النظيف للزبون — والملاحظات الداخلية (مصدر السعر/تاريخه) تتجمع للبياع فقط
  function cleanDescriptionOf(material) {
    const { clean, notes } = stripInternalNotes(material.full_description);
    for (const note of notes) internalNotes.push({ label: material.model || material.brand || '', note });
    return clean || material.model;
  }

  if (panelCombo) {
    items.push({ material_id: panelCombo.material.id, description: cleanDescriptionOf(panelCombo.material), unit: panelCombo.material.unit, quantity: panelCombo.units, unit_price: panelCombo.material.price, subtotal: panelCombo.totalPrice });
    total += panelCombo.totalPrice;
  }
  if (inverterCombo) {
    items.push({ material_id: inverterCombo.material.id, description: cleanDescriptionOf(inverterCombo.material), unit: inverterCombo.material.unit, quantity: inverterCombo.units, unit_price: inverterCombo.material.price, subtotal: inverterCombo.totalPrice });
    total += inverterCombo.totalPrice;
  }
  if (batteryCombo) {
    items.push({ material_id: batteryCombo.material.id, description: cleanDescriptionOf(batteryCombo.material), unit: batteryCombo.material.unit, quantity: batteryCombo.units, unit_price: batteryCombo.material.price, subtotal: batteryCombo.totalPrice });
    total += batteryCombo.totalPrice;
  }

  const panelCount = panelCombo ? panelCombo.units : 0;
  for (const material of secondary) {
    let quantity;
    if (secondarySelections != null) {
      const sel = secondarySelections[material.id];
      if (!sel) continue; // غير محددة => ما تنضاف للعرض
      const manualQty = sel.qty === '' || sel.qty == null ? null : Number(sel.qty);
      if (manualQty != null && manualQty > 0) {
        quantity = manualQty;
      } else if (material.unit === 'متر') {
        continue; // مادة متر بدون أمتار محددة => ما تنضاف
      } else {
        quantity = secondaryUnitQuantity(material, panelCount);
      }
      if (quantity <= 0) continue;
    } else if (material.unit === 'متر') {
      quantity = Number(cableMeters[material.id]) || 0;
      if (quantity <= 0) continue;
    } else {
      quantity = secondaryUnitQuantity(material, panelCount);
      if (quantity <= 0) continue;
    }
    const subtotal = quantity * material.price;
    items.push({ material_id: material.id, description: cleanDescriptionOf(material), unit: material.unit, quantity, unit_price: material.price, subtotal });
    total += subtotal;
  }

  if (labor) {
    items.push({ material_id: null, description: 'أجور العمل والتحميل والنقل والتصعيد', unit: 'قطعي', quantity: 1, unit_price: labor.price, subtotal: labor.price });
    total += labor.price;
  }

  const warrantyNotes = [panelCombo, inverterCombo, batteryCombo]
    .filter((c) => c && c.material.warranty_note)
    .map((c) => c.material.warranty_note);

  return {
    items,
    total,
    systemAmps,
    panelBreakdown: panelCombo ? { feedPanels: panelCombo.feedPanels, chargePanels: panelCombo.chargePanels } : null,
    panelTiers,
    inverterTiers,
    internalNotes,
    singleOptionCategories: {
      panel: panelTiers.singleOption,
      battery: batteryTiers.singleOption,
      inverter: inverterTiers.singleOption,
    },
    errors,
    warnings,
    warrantyNotes,
  };
}

export { mapSettings, buildOptions, buildQuoteDraft, stripInternalNotes };
