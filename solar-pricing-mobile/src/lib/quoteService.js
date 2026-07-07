import * as calc from './calc.js';

const CATEGORY_LABELS_AR = {
  panel: 'الألواح',
  battery: 'البطاريات',
  inverter: 'الانفيرترات',
};

function getSettings(db) {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  return {
    systemVoltage: row.system_voltage,
    peakSunHours: calc.IRAQ_PEAK_SUN_HOURS, // ثابتة بالكود — قيمة قاعدة البيانات مهملة عمداً
    systemEfficiency: row.system_efficiency,
    inverterSafetyFactor: row.inverter_safety_factor,
    dod: row.dod,
    nightCoverageHours: row.night_coverage_hours,
    panelAreaM2: row.panel_area_m2,
    currency: row.currency,
    quoteNumberStart: row.quote_number_start,
    chargePanelsPerBattery: row.charge_panels_per_battery,
    batteryChargeHours: row.battery_charge_hours,
  };
}

function computeOptions(db, { roofAreaM2, ampDay, ampNight, nightSupplyHours }) {
  const settings = getSettings(db);
  const supplyHours = nightSupplyHours != null && nightSupplyHours !== '' ? Number(nightSupplyHours) : settings.nightCoverageHours;

  const panelMaterials = db.prepare("SELECT * FROM materials WHERE category='panel' ORDER BY price").all();
  const batteries = db.prepare("SELECT * FROM materials WHERE category='battery' ORDER BY price").all();
  const inverters = db.prepare("SELECT * FROM materials WHERE category='inverter' ORDER BY price").all();
  const secondary = db.prepare("SELECT * FROM materials WHERE category='secondary' ORDER BY id").all();
  const laborTiers = db.prepare('SELECT * FROM labor_tiers').all();

  const batteryTiers = calc.selectBatteryTiers(batteries, ampNight, supplyHours, settings);
  const inverterTiers = calc.selectInverterTiers(inverters, ampDay, ampNight, settings);
  const systemAmps = calc.systemAmpSize(ampDay, ampNight);
  const labor = calc.pickLaborTier(laborTiers, systemAmps);

  return {
    settings,
    roofAreaM2,
    ampDay,
    ampNight,
    nightSupplyHours: supplyHours,
    panelMaterials,
    secondary,
    labor,
    systemAmps,
    batteryTiers,
    inverterTiers,
  };
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
    errors[category] = `لا توجد مادة كافية بالمخزون لفئة ${CATEGORY_LABELS_AR[category]} — يحتاج توريد`;
    return null;
  }
  const overrideId = overrides[category];
  if (overrideId != null) {
    const found = tiersResult.all.find((c) => c.material.id === overrideId);
    if (found) return found;
  }
  return tiersResult[tier];
}

// يبني مسودة العرض الكاملة لمستوى معين مع دعم استبدال يدوي لمادة بفئة معينة
// ترتيب الحساب: بطاريات أولاً (ساعات التجهيز تحدد عددها) ← ألواح (تغذية + شحن البطاريات) ← انفيرتر
function buildQuoteDraft(options, { tier, overrides = {}, cableMeters = {} }) {
  const { settings, roofAreaM2, ampDay, ampNight, batteryTiers, inverterTiers, panelMaterials, secondary, labor, systemAmps } = options;

  const errors = {};
  const warnings = {};

  const batteryCombo = pickCombo(batteryTiers, tier, overrides, 'battery', errors);
  const batteryCount = batteryCombo ? batteryCombo.units : 0;

  // توليفات الألواح تعتمد على عدد بطاريات التوليفة المختارة فعلياً (بما فيها التبديل اليدوي)
  const panelTiers = calc.selectPanelTiers(panelMaterials, ampDay, batteryCount, settings);
  const panelCombo = pickCombo(panelTiers, tier, overrides, 'panel', errors);
  const inverterCombo = pickCombo(inverterTiers, tier, overrides, 'inverter', errors);

  if (!labor) {
    errors.labor = 'لا يوجد سعر عمل معرّف لهذا الحجم — أضف حجماً جديداً من المخزون';
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

  // تحذير غير حاجب: وقت شحن البطاريات مقابل ساعات الشمس
  const chargeIssue = calc.chargeTimeWarning(batteryCount, settings);
  if (chargeIssue) {
    warnings.chargeTime =
      `وقت شحن البطاريات (${chargeIssue.totalChargeHours} ساعات) أكثر من ساعات الشمس المتاحة ` +
      `(${chargeIssue.peakSunHours}) — الشحن قد لا يكتمل خلال النهار`;
  }

  const items = [];
  let total = 0;

  if (panelCombo) {
    items.push({
      material_id: panelCombo.material.id,
      description: panelCombo.material.full_description,
      unit: panelCombo.material.unit,
      quantity: panelCombo.units,
      unit_price: panelCombo.material.price,
      subtotal: panelCombo.totalPrice,
    });
    total += panelCombo.totalPrice;
  }

  if (inverterCombo) {
    items.push({
      material_id: inverterCombo.material.id,
      description: inverterCombo.material.full_description,
      unit: inverterCombo.material.unit,
      quantity: inverterCombo.units,
      unit_price: inverterCombo.material.price,
      subtotal: inverterCombo.totalPrice,
    });
    total += inverterCombo.totalPrice;
  }

  if (batteryCombo) {
    items.push({
      material_id: batteryCombo.material.id,
      description: batteryCombo.material.full_description,
      unit: batteryCombo.material.unit,
      quantity: batteryCombo.units,
      unit_price: batteryCombo.material.price,
      subtotal: batteryCombo.totalPrice,
    });
    total += batteryCombo.totalPrice;
  }

  const panelCount = panelCombo ? panelCombo.units : 0;
  for (const material of secondary) {
    let quantity;
    if (material.unit === 'متر') {
      quantity = Number(cableMeters[material.id]) || 0;
      if (quantity <= 0) continue;
    } else {
      quantity = secondaryUnitQuantity(material, panelCount);
      if (material.quantity_stock < quantity) {
        errors[`secondary_${material.id}`] = `لا يوجد مخزون كافٍ من "${material.model}" (متوفر ${material.quantity_stock}, مطلوب ${quantity})`;
        continue;
      }
    }
    const subtotal = quantity * material.price;
    items.push({
      material_id: material.id,
      description: material.full_description,
      unit: material.unit,
      quantity,
      unit_price: material.price,
      subtotal,
    });
    total += subtotal;
  }

  if (labor) {
    items.push({
      material_id: null,
      description: 'أجور العمل والتحميل والنقل والتصعيد',
      unit: 'قطعي',
      quantity: 1,
      unit_price: labor.price,
      subtotal: labor.price,
    });
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

function nextQuoteNumber(db) {
  const settings = getSettings(db);
  const row = db.prepare('SELECT MAX(quote_number) AS maxNum FROM quotes').get();
  if (!row.maxNum) return settings.quoteNumberStart;
  return Math.max(row.maxNum + 1, settings.quoteNumberStart);
}

function saveQuote(db, { clientName, clientPhone, location, roofAreaM2, ampDay, ampNight, tier, draft, notes }) {
  const insertQuote = db.prepare(`
    INSERT INTO quotes (quote_number, client_name, client_phone, location, roof_area_m2, required_amp_day, required_amp_night, selected_tier, total_price, roof_limited_warning)
    VALUES (@quote_number, @client_name, @client_phone, @location, @roof_area_m2, @required_amp_day, @required_amp_night, @selected_tier, @total_price, 0)
  `);
  const insertItem = db.prepare(`
    INSERT INTO quote_items (quote_id, material_id, description_snapshot, quantity, unit, unit_price, subtotal, sort_order)
    VALUES (@quote_id, @material_id, @description_snapshot, @quantity, @unit, @unit_price, @subtotal, @sort_order)
  `);
  const insertNote = db.prepare('INSERT INTO quote_notes (quote_id, note_text, sort_order) VALUES (?, ?, ?)');

  const run = db.transaction(() => {
    const quote_number = nextQuoteNumber(db);
    const result = insertQuote.run({
      quote_number,
      client_name: clientName || null,
      client_phone: clientPhone || null,
      location: location || null,
      roof_area_m2: roofAreaM2,
      required_amp_day: ampDay,
      required_amp_night: ampNight,
      selected_tier: tier,
      total_price: draft.total,
    });
    const quoteId = result.lastInsertRowid;
    draft.items.forEach((item, idx) => {
      insertItem.run({
        quote_id: quoteId,
        material_id: item.material_id,
        description_snapshot: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        sort_order: idx,
      });
    });
    notes.forEach((noteText, idx) => insertNote.run(quoteId, noteText, idx));
    return quoteId;
  });

  const quoteId = run();
  return db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
}

export { getSettings, computeOptions, buildQuoteDraft, saveQuote, nextQuoteNumber };
