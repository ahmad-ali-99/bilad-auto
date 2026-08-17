// منطق بناء العرض — دوال نقية تعمل على مصفوفات مجلوبة مسبقاً (لا اتصال بقاعدة بيانات)
// طبقة البيانات السحابية (dataApi.js) تجلب الصفوف من Supabase ثم تنادي هذه الدوال.
import * as calc from './calc.js';
import { isDcProtectionBoard } from './secondaryDefaults.js';
import { installmentPlanLabel } from './installment.js';

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
function buildOptions({ materials, laborTiers, settingsRow, roofAreaM2, ampDay, ampNight, nightSupplyHours, batteryFactors = null }) {
  const settings = mapSettings(settingsRow);
  const supplyHours = nightSupplyHours != null && nightSupplyHours !== '' ? Number(nightSupplyHours) : settings.nightCoverageHours;

  const byPrice = (a, b) => a.price - b.price;
  const panelMaterials = materials.filter((m) => m.category === 'panel').sort(byPrice);
  const batteries = materials.filter((m) => m.category === 'battery').sort(byPrice);
  const inverters = materials.filter((m) => m.category === 'inverter').sort(byPrice);
  const secondary = materials.filter((m) => m.category === 'secondary').sort((a, b) => a.id - b.id);
  // السستم المتكامل: كابينة تجمع البطاريات والانفيرتر بجهاز واحد — تحل محلهما سوية
  const integratedMaterials = materials.filter((m) => m.category === 'integrated').sort(byPrice);

  const systemAmps = calc.systemAmpSize(ampDay, ampNight);
  const batteryTiers = calc.selectBatteryTiers(batteries, ampNight, supplyHours, settings, { factors: batteryFactors, systemAmps });
  // الكابينات المتكاملة: التحجيم تلقائي بالقدرة والسعة سوية، والأرخص إجمالاً هو الافتراضي
  const integratedResult = calc.selectIntegratedCombos(integratedMaterials, ampDay, ampNight, supplyHours, settings);
  const labor = calc.pickLaborTier(laborTiers, systemAmps);

  return {
    settings,
    roofAreaM2,
    ampDay,
    ampNight,
    nightSupplyHours: supplyHours,
    panelMaterials,
    inverterMaterials: inverters,
    integratedMaterials,
    integratedCombos: integratedResult.combos,
    integratedRequired: {
      kw: integratedResult.requiredKw, kwh: integratedResult.requiredKwh,
      dayLoadKw: integratedResult.dayLoadKw, nightLoadKw: integratedResult.nightLoadKw,
      nightEnergyKwh: integratedResult.nightEnergyKwh,
    },
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
  // الفئة غير مطلوبة بهذا العرض (نهاري بلا بطاريات، أو بلا ألواح) — بلا خطأ
  if (tiersResult.none) return null;
  if (tiersResult.insufficient) {
    errors[category] = `لا توجد مادة بفئة ${CATEGORY_LABELS_AR[category]} — أضف مادة من المخزون`;
    return null;
  }
  const overrideId = overrides[category];
  if (overrideId != null) {
    // البطاريات عندها قائمة لكل مستوى (معامل الأمان يغير الأعداد) — نبحث بقائمة المستوى الحالي
    const list = (tiersResult.allByTier && tiersResult.allByTier[tier]) || tiersResult.all;
    const found = list.find((c) => c.material.id === overrideId);
    if (found) return found;
  }
  return tiersResult[tier];
}

// تقريب سعر معدَّل حتى يبقى شكله طبيعياً بالعرض (الزيادة الموزعة ما تطلع أرقام شاذة)
function roundAdjustedPrice(p) {
  const abs = Math.abs(p);
  if (abs >= 100000) return Math.round(p / 1000) * 1000;
  if (abs >= 10000) return Math.round(p / 250) * 250;
  return Math.round(p / 50) * 50;
}

function formatPercent(p) {
  return String(Math.round(p * 100) / 100);
}

// نسبة الزيادة/الخصم على المسودة — adjustments: { markupPercent, markupMode, discountPercent }
// markupMode: 'visible' = سطر علني بالعرض، 'distributed' = تتوزع على أسعار البنود نفسها.
// الخصم دائماً سطر علني يُطرح من المجموع النهائي.
function applyAdjustments(items, total, adjustments) {
  const markupPercent = Number(adjustments?.markupPercent) || 0;
  const discountPercent = Number(adjustments?.discountPercent) || 0;
  const markupMode = adjustments?.markupMode === 'distributed' ? 'distributed' : 'visible';
  const summary = { markupPercent, markupMode, discountPercent, markupAmount: 0, discountAmount: 0, subtotal: total };

  if (markupPercent > 0) {
    if (markupMode === 'distributed') {
      for (const item of items) {
        item.unit_price = roundAdjustedPrice(item.unit_price * (1 + markupPercent / 100));
        item.subtotal = Math.round(item.quantity * item.unit_price);
      }
      const newTotal = items.reduce((s, i) => s + i.subtotal, 0);
      summary.markupAmount = newTotal - total;
      total = newTotal;
    } else {
      const amount = Math.round((total * markupPercent) / 100);
      items.push({ material_id: null, description: `نسبة زيادة ${formatPercent(markupPercent)}%`, unit: 'قطعي', quantity: 1, unit_price: amount, subtotal: amount });
      summary.markupAmount = amount;
      total += amount;
    }
  }

  if (discountPercent > 0) {
    const amount = Math.round((total * discountPercent) / 100);
    items.push({ material_id: null, description: `خصم ${formatPercent(discountPercent)}%`, unit: 'قطعي', quantity: 1, unit_price: -amount, subtotal: -amount });
    summary.discountAmount = amount;
    total -= amount;
  }

  // التقسيط المصرفي: نسبة المصرف (معامل ضرب مثل 1.35 بدون جمع 1) **تتوزع على
  // أسعار البنود نفسها**، فمجموع العرض يصير هو مجموع التقسيط — وسعر الكاش
  // ينشال من ملف الزبون (قرار المستخدم: يبقى بالشاشة للبياع فقط).
  //
  // التوزيع على البنود مو ضرب المجموع: الضرب على المجموع يخلي فرقاً بينه وبين
  // جمع السطور، فالزبون يجمع الأعمدة ويطلعله رقم غير المكتوب.
  const inst = adjustments?.installment;
  if (inst?.enabled) {
    const rate = Number(inst.rate) || 0;
    const months = Math.max(1, Math.round(Number(inst.months) || 60));
    if (rate > 0) {
      const cashTotal = total;
      if (rate > 1) {
        for (const item of items) {
          item.unit_price = roundAdjustedPrice(item.unit_price * rate);
          item.subtotal = Math.round(item.quantity * item.unit_price);
        }
        total = items.reduce((s, i) => s + i.subtotal, 0);
      }
      const plan = inst.plan === 'cbi' ? 'cbi' : 'company';
      summary.installment = {
        rate, months, plan, label: installmentPlanLabel(plan),
        totalWithInterest: total,
        monthly: Math.round(total / months),
        cashTotal,
        interestAmount: total - cashTotal,
        // قرار العرض: يخفي المبلغ الكلي من ملف الزبون ويخلي القسط الشهري بس
        hideTotal: inst.hideTotal === true,
      };
    }
  }

  return { total, summary };
}

// تعديل يدوي لعدد وحدات التوليفة (زيادة/نقصان من أزرار الواجهة) وإعادة حساب السعر.
// النزول لصفر يرجع null — يعني الفئة تنشال من العرض كلياً (البنود محروسة بوجود التوليفة).
function adjustCombo(combo, delta, minUnits = 0) {
  if (!combo || !delta) return combo;
  const units = Math.max(minUnits, combo.units + delta);
  if (units <= 0) return null;
  return { ...combo, units, totalPrice: units * combo.material.price };
}

// العدد اللي كتبه البياع بيده — **رقم نهائي مطلق** مو فرقاً عن الحساب التلقائي.
// هذا الفرق جوهري: الفرق يتزحزح كل ما يتغير الأساس (أمبيرية، ساعات، عدد كابينات)
// فيطلع رقم غير اللي كتبه؛ الرقم المطلق يبقى ثابت لحد ما يغيّره هو.
// صفر = شيل الفئة من العرض. undefined/null = اترك الحساب التلقائي.
function applyUnitCount(combo, wanted, delta) {
  if (wanted == null || wanted === '') return adjustCombo(combo, delta, 0);
  const units = Math.max(0, Math.round(Number(wanted)));
  if (!combo || !Number.isFinite(units)) return combo;
  if (units <= 0) return null;
  return { ...combo, units, totalPrice: units * combo.material.price };
}

// يبني مسودة العرض الكاملة لمستوى معين — بدون أي فحص لكمية المخزون (المواد مجرد خيارات)
// secondarySelections (اختياري): { [materialId]: { qty } } — إذا مرّر، تنضاف فقط المواد الثانوية
// المذكورة فيه؛ qty رقم = كمية يدوية، وqty فارغ/null = كمية تلقائية (حسب الألواح أو وحدة واحدة).
// إذا لم يمرّر يبقى السلوك القديم: كل الثانوية "عدد/قطعي" تنضاف تلقائياً + أمتار من cableMeters.
// adjustments (اختياري): نسبة الزيادة (علنية/موزعة) ونسبة الخصم — تنطبق بعد اكتمال البنود.
// extraUnits (اختياري): { panel, battery, inverter } — زيادة/نقصان يدوي بالوحدات لوح بلوح
// (العدد الفردي مسموح)، والفحوصات (المساحة/الشحن/التوازي) تحسب بالعدد النهائي.
function buildQuoteDraft(options, { tier, overrides = {}, cableMeters = {}, secondarySelections = null, adjustments = null, extraUnits = null, unitCounts = null, systemType = null, integrated = null }) {
  const { settings, roofAreaM2, ampDay, ampNight, nightSupplyHours, batteryTiers, panelMaterials, inverterMaterials, integratedCombos = [], integratedRequired = null, secondary, labor, systemAmps } = options;

  const errors = {};
  const warnings = {};

  const extra = {
    panel: Math.round(Number(extraUnits?.panel) || 0),
    battery: Math.round(Number(extraUnits?.battery) || 0),
    inverter: Math.round(Number(extraUnits?.inverter) || 0),
    integrated: Math.round(Number(extraUnits?.integrated) || 0),
  };

  // ── السستم المتكامل ────────────────────────────────────────────────────────
  // الكابينة تحل محل البطاريات والانفيرتر سوية، والاختيار تلقائي: البرنامج يلكي
  // أرخص كابينة (أو عدد كابينات) تغطي القدرة والسعة المطلوبتين، والبياع يكدر يبدّل
  // من المبدّل أو يزيد/ينقص بالأزرار — نفس سلوك باقي الفئات بالضبط.
  const isIntegrated = systemType === 'integrated';
  let integratedBase = null;
  if (isIntegrated) {
    if (!integratedCombos.length) {
      errors.integrated = 'ماكو أي «سستم متكامل» بالمخزون — أضف الكابينة من صفحة المخزون أولاً';
    } else {
      const wantedId = Number(overrides?.integrated) || 0;
      integratedBase = integratedCombos.find((c) => c.material.id === wantedId) || integratedCombos[0];
    }
  }
  const integratedPick = applyUnitCount(integratedBase, unitCounts?.integrated, extra.integrated);
  // حارس: عدد كابينات غير معقول معناه مدخلات غلط (ساعات أو أمبيرية) — نوقف البياع
  // بدل ما نطلعله عرضاً بمليارات وهو ما ينتبه. الحد 20 كابينة ≈ 5200 kWh — أكبر من
  // أي مشروع واقعي عندنا، فتجاوزه يعني المدخلات تحتاج مراجعة.
  if (integratedPick && integratedPick.units > 20) {
    errors.integratedCount =
      `العدد المحسوب ${integratedPick.units} كابينة — هذا رقم غير منطقي. ` +
      `الطاقة المطلوبة طلعت ≈${Math.round(integratedRequired?.kwh || 0).toLocaleString('en-US')} كيلوواط·ساعة ` +
      `(${ampNight} أمبير ليلاً × ${nightSupplyHours} ساعة). ` +
      'راجع «ساعات التجهيز الليلي» و«الأمبير المطلوب ليلاً» — غالباً وحدة منهن مكتوبة غلط.';
  }

  const batteryComboBase = isIntegrated ? null : pickCombo(batteryTiers, tier, overrides, 'battery', errors);
  const batteryCombo = applyUnitCount(batteryComboBase, unitCounts?.battery, extra.battery);
  const batteryCount = batteryCombo ? batteryCombo.units : 0;

  // بالسستم المتكامل الألواح تنحجّم بالطاقة (شحن الكابينة + الحمل النهاري) —
  // معادلة مستقلة ما تمر بمسار «لوح لكل بطارية» اللي ما إله معنى مع كابينة وحدة
  const panelTiers = isIntegrated
    ? calc.selectIntegratedPanelTiers(
        panelMaterials, integratedRequired || {},
        integratedPick ? integratedPick.kwh * integratedPick.units : 0,
        settings,
      )
    : calc.selectPanelTiers(panelMaterials, ampDay, batteryCount, settings);
  const panelComboBase = pickCombo(panelTiers, tier, overrides, 'panel', errors);
  const panelCombo = applyUnitCount(panelComboBase, unitCounts?.panel, extra.panel);

  // الانفيرتر يُختار بعد الألواح: قدرته لازم تستوعب الحمل ومصفوفة الألواح كاملة (÷1.3)
  const panelArrayW = panelCombo ? panelCombo.units * panelCombo.material.watt_or_capacity : 0;
  const inverterTiers = calc.selectInverterTiers(inverterMaterials, ampDay, ampNight, settings, panelArrayW, systemAmps);
  const inverterComboBase = isIntegrated ? null : pickCombo(inverterTiers, tier, overrides, 'inverter', errors);
  const inverterCombo = applyUnitCount(inverterComboBase, unitCounts?.inverter, extra.inverter);

  if (!labor) {
    errors.labor = 'لا يوجد سعر عمل معرّف لهذا الحجم — أضف حجماً جديداً من المخزون';
  }

  // حارس الضبط الهندسي: التوازي المفرط يزيد نقاط العطل ويقترب من حدود التوازي العملية
  // (بطاريات LiFePO4 عادة حتى ~16 وحدة، والهجينة أحادية الطور حتى ~6-10) — تحذير غير حاجب
  if (batteryCombo && batteryCombo.units > 12) {
    warnings.batteryParallel =
      `ملاحظة هندسية: التوليفة تحتاج ${batteryCombo.units} بطارية بالتوازي — قريب من حدود التوازي العملية للـBMS. ` +
      'الأفضل بطارية أكبر سعة (جرّب المستوى الممتاز أو بدّل يدوياً).';
  }
  if (inverterCombo && inverterCombo.units > 4) {
    warnings.inverterParallel =
      `ملاحظة هندسية: التوليفة تحتاج ${inverterCombo.units} انفيرترات بالتوازي — تعقيد تركيب وتزامن عالي. ` +
      'الأفضل انفيرتر أكبر قدرة (جرّب المستوى المتوسط أو الممتاز أو بدّل يدوياً).';
  }

  // فحص شحن البطاريات من الألواح — تحذير فقط، العرض يُحفظ ويُطبع بالحالتين
  if (batteryCombo && inverterCombo && panelCombo) {
    const check = calc.chargingCheck({
      panelArrayW,
      inverterW: inverterCombo.units * inverterCombo.material.watt_or_capacity,
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
  // بند واحد للكابينة المتكاملة بدل بندَي البطارية والانفيرتر
  if (integratedPick) {
    items.push({ material_id: integratedPick.material.id, description: cleanDescriptionOf(integratedPick.material), unit: integratedPick.material.unit, quantity: integratedPick.units, unit_price: integratedPick.material.price, subtotal: integratedPick.totalPrice });
    total += integratedPick.totalPrice;
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
        // عرض بلا ألواح: بوردة الحماية DC (جهة الألواح) ما تنضاف تلقائياً — الكمية اليدوية تبقى محترمة
        if (!panelCombo && isDcProtectionBoard(material)) continue;
        quantity = secondaryUnitQuantity(material, panelCount);
      }
      if (quantity <= 0) continue;
    } else if (material.unit === 'متر') {
      quantity = Number(cableMeters[material.id]) || 0;
      if (quantity <= 0) continue;
    } else {
      if (!panelCombo && isDcProtectionBoard(material)) continue;
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

  // نسبة الزيادة (علنية أو موزعة على الأسعار) ونسبة الخصم — على مجموع البنود النهائي
  const adjusted = applyAdjustments(items, total, adjustments);
  total = adjusted.total;

  const warrantyNotes = [panelCombo, inverterCombo, batteryCombo]
    .filter((c) => c && c.material.warranty_note)
    .map((c) => c.material.warranty_note);

  return {
    items,
    total,
    systemAmps,
    panelBreakdown: panelCombo
      ? {
          feedPanels: panelCombo.feedPanels,
          chargePanels: panelCombo.chargePanels,
          extraPanels: panelCombo.units - (panelCombo.feedPanels + panelCombo.chargePanels),
        }
      : null,
    // الأعداد النهائية والأساسية (قبل الزيادة اليدوية) — لأزرار +/− بالواجهة
    counts: {
      panel: panelCombo ? panelCombo.units : 0,
      battery: batteryCombo ? batteryCombo.units : 0,
      inverter: inverterCombo ? inverterCombo.units : 0,
      integrated: integratedPick ? integratedPick.units : 0,
    },
    baseCounts: {
      panel: panelComboBase ? panelComboBase.units : 0,
      battery: batteryComboBase ? batteryComboBase.units : 0,
      inverter: inverterComboBase ? inverterComboBase.units : 0,
      integrated: integratedBase ? integratedBase.units : 0,
    },
    // القدرة الفعلية للتوليفة الحالية — تتحدث فوراً مع كل زيادة/نقصان يدوي:
    // ساعات الليل = سعة البنك × عمق التفريغ ÷ (أمبير الليل × الفولتية)، وأمبير النهار = قدرة الانفيرترات ÷ الفولتية
    // بالسستم المتكامل: السعة والقدرة من الكابينة نفسها (kWh من عمود السعة، وقدرة الانفيرتر
    // بالكيلوواط من مواصفات المادة) — مع تنبيه إن أمبير النهار تقديري لأن الجهاز ثلاثي الطور
    // بالسستم المتكامل: القدرة بنفس معادلة الطور المستعملة بالتحجيم — مو معادلة الـ220
    capability: integratedPick
      ? {
          ...calc.integratedCapability({
            units: integratedPick.units,
            kwh: integratedPick.kwh,
            kw: integratedPick.kw,
            nightLoadKw: integratedRequired?.nightLoadKw || 0,
            dod: settings.dod,
            systemVoltage: settings.systemVoltage,
          }),
          chargeHours: calc.INTEGRATED_CHARGE_HOURS,
        }
      : calc.capabilityOf({
          batteryUnits: batteryCombo ? batteryCombo.units : 0,
          batteryKwh: batteryCombo ? batteryCombo.material.watt_or_capacity : 0,
          inverterUnits: inverterCombo ? inverterCombo.units : 0,
          inverterW: inverterCombo ? inverterCombo.material.watt_or_capacity : 0,
          ampNight,
          systemVoltage: settings.systemVoltage,
          dod: settings.dod,
          inverterSafetyFactor: settings.inverterSafetyFactor,
        }),
    panelTiers,
    inverterTiers,
    // الكابينات المتاحة (بقدرتها وسعتها وعددها المحسوب) — تغذي مبدّل «السستم المتكامل»،
    // مع القدرة والسعة المطلوبتين حتى يبين للبياع على أي أساس انختارت
    integrated: isIntegrated
      ? {
          chosenId: integratedPick ? integratedPick.material.id : null,
          units: integratedPick ? integratedPick.units : 0,
          required: integratedRequired,
          options: integratedCombos.map((c) => ({
            id: c.material.id, brand: c.material.brand, model: c.material.model,
            kw: c.kw, kwh: c.kwh, units: c.units, totalPrice: c.totalPrice, driver: c.driver,
          })),
        }
      : null,
    internalNotes,
    adjustments: adjusted.summary,
    installment: adjusted.summary.installment || null,
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
