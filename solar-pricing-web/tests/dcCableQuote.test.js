// تكامل قاعدة كيبل الألواح مع محرك العروض نفسه (مو الوحدة بس):
// كل ٩ ألواح ٥٠ متر، والمقطع يتبع واطية اللوح، والمقطع الثاني ما ينضاف.
import { describe, it, expect } from 'vitest';
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';
import { computeSecondaryDefaults } from '../src/lib/secondaryDefaults.js';
import { dcCableMeters } from '../src/lib/dcCable.js';

const SETTINGS_ROW = {
  system_voltage: 220, system_efficiency: 0.8, inverter_safety_factor: 1.25,
  dod: 0.9, night_coverage_hours: 8, panel_area_m2: 2.7,
  currency: 'دينار عراقي', quote_number_start: 7400, charge_panels_per_battery: 1,
};

const CABLE4 = { id: 40, category: 'secondary', model: 'كيبل 4 ملم', full_description: 'كيبلات ناقلة من الألواح', unit: 'متر', price: 2000, qty_per_panel: null };
const CABLE6 = { id: 41, category: 'secondary', model: 'كيبل 6 ملم', full_description: 'كيبلات ناقلة من الألواح', unit: 'متر', price: 3000, qty_per_panel: null };
const LOAD   = { id: 42, category: 'secondary', model: 'كيبل حمل 4×35 ملم', full_description: 'كيبل الحمل من الانفيرتر للوحة', unit: 'متر', price: 9000, qty_per_panel: null };

const base = (panelWatt) => ([
  { id: 1, category: 'panel', model: `لوح ${panelWatt}`, full_description: `ألواح ${panelWatt} واط`, unit: 'عدد', watt_or_capacity: panelWatt, price: 185000, qty_per_panel: null },
  { id: 2, category: 'inverter', model: 'انفيرتر 6kW', full_description: 'انفيرتر 6 كيلو', unit: 'عدد', watt_or_capacity: 6000, price: 650000, qty_per_panel: null },
  { id: 3, category: 'battery', model: 'بطارية 16', full_description: 'بطارية 16kWh', unit: 'عدد', watt_or_capacity: 16, price: 2750000, qty_per_panel: null },
  { id: 4, category: 'secondary', model: 'هيكل', full_description: 'هيكل الألواح', unit: 'عدد', price: 65000, qty_per_panel: 1 },
  CABLE4, CABLE6, LOAD,
]);

const LABOR = [{ id: 1, system_amps: 60, price: 400000 }];

function draftFor(panelWatt, { ampDay, ampNight, nightSupplyHours = 8, roofAreaM2 = 400 }) {
  const materials = base(panelWatt);
  const secondary = materials.filter((m) => m.category === 'secondary');
  const options = buildOptions({ materials, laborTiers: LABOR, settingsRow: SETTINGS_ROW, roofAreaM2, ampDay, ampNight, nightSupplyHours });
  const defaults = computeSecondaryDefaults(secondary, null);
  return buildQuoteDraft(options, { tier: 'economy', secondarySelections: defaults });
}

const cableItem = (draft) => draft.items.find((i) => i.material_id === 40 || i.material_id === 41);
const panelCount = (draft) => draft.items.find((i) => i.material_id === 1)?.quantity || 0;

describe('الكيبل يتعبّى لحاله بالعرض', () => {
  it('لوح ٦٥٠ ياخذ ٤ ملم، والأمتار تتبع عدد الألواح', () => {
    const d = draftFor(650, { ampDay: 15, ampNight: 15 });
    const c = cableItem(d);
    expect(c).toBeTruthy();
    expect(c.material_id).toBe(40);                 // ٤ ملم
    expect(c.unit).toBe('متر');
    expect(c.quantity).toBe(dcCableMeters(panelCount(d)));
    expect(c.quantity % 50).toBe(0);
  });

  it('لوح أكبر من ٦٥٠ ياخذ ٦ ملم', () => {
    const d = draftFor(720, { ampDay: 15, ampNight: 15 });
    expect(cableItem(d).material_id).toBe(41);      // ٦ ملم
  });

  it('**مقطع واحد بس**: المقطع الثاني ما ينضاف للعرض', () => {
    for (const w of [650, 720]) {
      const d = draftFor(w, { ampDay: 15, ampNight: 15 });
      expect(d.items.filter((i) => [40, 41].includes(i.material_id)).length).toBe(1);
    }
  });

  it('وكيبل الحمل ٤×٣٥ ما ينخطف كأنه كيبل ألواح', () => {
    const d = draftFor(650, { ampDay: 15, ampNight: 15 });
    expect(d.items.some((i) => i.material_id === 42)).toBe(false);
  });

  it('الأمتار مضروبة بسعر المتر بالمجموع', () => {
    const d = draftFor(650, { ampDay: 15, ampNight: 15 });
    const c = cableItem(d);
    expect(c.subtotal).toBe(c.quantity * 2000);
  });
});

describe('حالات المستخدم نفسها ٩ و١٠ و١٩ لوحاً', () => {
  // نمرّ بالمحرك بألواح مفروضة (overrides) حتى نضبط العدد بالضبط
  const forPanels = (n) => {
    const materials = base(650);
    const options = buildOptions({ materials, laborTiers: LABOR, settingsRow: SETTINGS_ROW, roofAreaM2: 400, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });
    const defaults = computeSecondaryDefaults(materials.filter((m) => m.category === 'secondary'), null);
    return buildQuoteDraft(options, { tier: 'economy', secondarySelections: defaults, unitCounts: { panel: n } });
  };

  it('٩ ← ٥٠ · ١٠ ← ١٠٠ · ١٩ ← ١٥٠ — بعدد ألواح مثبّت فعلاً', () => {
    const got = [9, 10, 19].map((n) => {
      const d = forPanels(n);
      expect(panelCount(d), `عدد الألواح ${n}`).toBe(n);   // نتأكد إن التثبيت انطبق
      return cableItem(d).quantity;
    });
    expect(got).toEqual([50, 100, 150]);
    expect(got).toEqual([9, 10, 19].map(dcCableMeters));
  });

  it('و١٨ تبقى ١٠٠ — اللوح التاسع عشر هو اللي يفتح الخمسين الثالثة', () => {
    expect(cableItem(forPanels(18)).quantity).toBe(100);
  });
});

describe('الأمان', () => {
  it('عرض بلا ألواح (أوف جرد) بلا كيبل ألواح', () => {
    const materials = base(650);
    const secondary = materials.filter((m) => m.category === 'secondary');
    const options = buildOptions({ materials, laborTiers: LABOR, settingsRow: SETTINGS_ROW, roofAreaM2: 0, ampDay: 0, ampNight: 15, nightSupplyHours: 8 });
    const defaults = computeSecondaryDefaults(secondary, null, 'offgrid');
    const d = buildQuoteDraft(options, { tier: 'economy', secondarySelections: defaults });
    expect(d.items.some((i) => [40, 41].includes(i.material_id))).toBe(false);
  });

  it('الإدخال اليدوي يتقدّم على الحساب التلقائي', () => {
    const materials = base(650);
    const secondary = materials.filter((m) => m.category === 'secondary');
    const options = buildOptions({ materials, laborTiers: LABOR, settingsRow: SETTINGS_ROW, roofAreaM2: 400, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });
    // البياع أشّر ٦ ملم بيده بعرض لوح ٦٥٠ وكتب ٣٠٠ متر — يُحترم
    const d = buildQuoteDraft(options, { tier: 'economy', secondarySelections: { ...computeSecondaryDefaults(secondary, null), 41: { qty: 300 } } });
    const six = d.items.find((i) => i.material_id === 41);
    expect(six.quantity).toBe(300);
  });
});
