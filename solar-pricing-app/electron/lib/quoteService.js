const calc = require('./calc');

const CATEGORY_LABELS_AR = {
  panel: 'الألواح',
  battery: 'البطاريات',
  inverter: 'الانفيرترات',
};

function getSettings(db) {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  return {
    systemVoltage: row.system_voltage,
    peakSunHours: row.peak_sun_hours,
    systemEfficiency: row.system_efficiency,
    inverterSafetyFactor: row.inverter_safety_factor,
    dod: row.dod,
    nightCoverageHours: row.night_coverage_hours,
    panelAreaM2: row.panel_area_m2,
    currency: row.currency,
    quoteNumberStart: row.quote_number_start,
  };
}

function computeOptions(db, { roofAreaM2, ampDay, ampNight }) {
  const settings = getSettings(db);
  const requirements = calc.computeRequirements({ ampDay, ampNight, ...settings });
  const panels = db.prepare("SELECT * FROM materials WHERE category='panel' ORDER BY price").all();
  const batteries = db.prepare("SELECT * FROM materials WHERE category='battery' ORDER BY price").all();
  const inverters = db.prepare("SELECT * FROM materials WHERE category='inverter' ORDER BY price").all();
  const secondary = db.prepare("SELECT * FROM materials WHERE category='secondary' ORDER BY id").all();
  const laborTiers = db.prepare('SELECT * FROM labor_tiers').all();

  const panelTiers = calc.selectPanelTiers(panels, requirements, roofAreaM2, settings);
  const batteryTiers = calc.selectBatteryTiers(batteries, requirements);
  const inverterTiers = calc.selectInverterTiers(inverters, requirements);
  const systemAmps = calc.systemAmpSize(ampDay, ampNight);
  const labor = calc.pickLaborTier(laborTiers, systemAmps);

  return { settings, requirements, panelTiers, batteryTiers, inverterTiers, secondary, labor, systemAmps };
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

// يبني مسودة العرض الكاملة لتوليفة مستوى معين (tier) مع دعم استبدال يدوي لمادة بفئة معينة
// overrides: { panel: materialId, battery: materialId, inverter: materialId }
// cableMeters: { [materialId]: meters }
function buildQuoteDraft(options, { tier, overrides = {}, cableMeters = {} }) {
  const { panelTiers, batteryTiers, inverterTiers, secondary, labor, systemAmps, requirements } = options;

  const errors = {};
  function pickCombo(tiersResult, category) {
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

  const panelCombo = pickCombo(panelTiers, 'panel');
  const batteryCombo = pickCombo(batteryTiers, 'battery');
  const inverterCombo = pickCombo(inverterTiers, 'inverter');

  if (!labor) {
    errors.labor = 'لا يوجد سعر عمل معرّف لهذا الحجم — أضف حجماً جديداً من المخزون';
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
    roofLimitedWarning: !!(panelCombo && panelCombo.roofLimited),
    singleOptionCategories: {
      panel: panelTiers.singleOption,
      battery: batteryTiers.singleOption,
      inverter: inverterTiers.singleOption,
    },
    errors,
    warrantyNotes,
    requirements,
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
    VALUES (@quote_number, @client_name, @client_phone, @location, @roof_area_m2, @required_amp_day, @required_amp_night, @selected_tier, @total_price, @roof_limited_warning)
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
      roof_limited_warning: draft.roofLimitedWarning ? 1 : 0,
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

module.exports = { getSettings, computeOptions, buildQuoteDraft, saveQuote, nextQuoteNumber };
