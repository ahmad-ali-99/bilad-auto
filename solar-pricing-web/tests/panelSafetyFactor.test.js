import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';
import { PANEL_SAFETY_FACTOR, LEGACY_PANEL_SAFETY_FACTOR } from '../src/lib/calc.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, '..', p), 'utf8');
const dataApi = read('src/lib/dataApi.js');
const prefill = read('src/lib/editPrefill.js');
const builder = read('src/pages/QuoteBuilder.jsx');

const SETTINGS_ROW = {
  system_voltage: 220, system_efficiency: 0.8, inverter_safety_factor: 1.25, dod: 0.9,
  night_coverage_hours: 8, panel_area_m2: 2.7, currency: 'د', quote_number_start: 7400,
  charge_panels_per_battery: 1.5,
};
const MATERIALS = [
  { id: 1, category: 'panel', model: 'JINKO 650', full_description: 'ألواح شمسية 650 واط', unit: 'عدد', watt_or_capacity: 650, price: 185000 },
  { id: 2, category: 'inverter', model: 'COSPOWER 6kW', full_description: 'انفيرتر 6 كيلو واط', unit: 'عدد', watt_or_capacity: 6000, price: 650000 },
  { id: 3, category: 'battery', model: 'COSPOWER 16kWh', full_description: 'بطاريات ليثيوم 16kWh', unit: 'عدد', watt_or_capacity: 16, price: 2750000 },
  { id: 4, category: 'secondary', model: 'هيكل', full_description: 'هيكل', unit: 'عدد', price: 65000, qty_per_panel: 1 },
  { id: 5, category: 'secondary', model: 'صبات', full_description: 'صبات', unit: 'عدد', price: 5000, qty_per_panel: 1 },
  { id: 6, category: 'secondary', model: 'كيبل 6مم', full_description: 'كيبلات ناقلة', unit: 'متر', price: 2000 },
  { id: 7, category: 'secondary', model: 'بورد حماية', full_description: 'بوردات الحماية DC', unit: 'عدد', price: 150000, qty_per_panel: 0 },
];
const LABOR = [{ id: 1, system_amps: 10, price: 400000 }, { id: 2, system_amps: 15, price: 550000 }, { id: 3, system_amps: 20, price: 700000 }];

// نفس المثال المرجعي: 15 أمبير، 8 ساعات
const draftWith = (panelSafetyFactor) => {
  const options = buildOptions({
    materials: MATERIALS, laborTiers: LABOR, settingsRow: SETTINGS_ROW,
    roofAreaM2: 40, ampDay: 15, ampNight: 15, nightSupplyHours: 8,
    panelSafetyFactor,
  });
  return buildQuoteDraft(options, { tier: 'economy', cableMeters: { 6: 143 } });
};

describe('العروض القديمة تبقى مثل ما هي', () => {
  it('العرض المحفوظ قبل القاعدة (معامل 1) يرجع بنفس ألواحه ومجموعه بالضبط', () => {
    const old = draftWith(LEGACY_PANEL_SAFETY_FACTOR);
    expect(old.panelBreakdown).toEqual({ feedPanels: 7, chargePanels: 3, extraPanels: 0 });
    expect(old.counts.panel).toBe(10);
    expect(old.total).toBe(9686000);   // مجموع الفاتورة الأصلية حرفياً
  });

  it('والعرض الجديد ينبني بالمعامل 1.25', () => {
    const fresh = draftWith(PANEL_SAFETY_FACTOR);
    expect(fresh.panelBreakdown).toEqual({ feedPanels: 9, chargePanels: 3, extraPanels: 0 });
    expect(fresh.counts.panel).toBe(12);
    expect(fresh.total).toBe(9686000 + 2 * (185000 + 65000 + 5000));
  });

  it('بلا تمرير معامل: الافتراضي هو الجديد 1.25 — ما ننزل للقديم بالغلط', () => {
    expect(draftWith(null).counts.panel).toBe(draftWith(PANEL_SAFETY_FACTOR).counts.panel);
    expect(draftWith(undefined).counts.panel).toBe(12);
  });

  it('القيم الفاسدة (صفر/نص/سالب) ما تكسر الحساب — ترجع للجديد', () => {
    for (const bad of [0, -1, 'x', NaN, '']) {
      expect(draftWith(bad).counts.panel, String(bad)).toBe(12);
    }
  });

  it('المعامل يغيّر التغذية بس — ألواح الشحن ما تتأثر', () => {
    expect(draftWith(1).panelBreakdown.chargePanels).toBe(draftWith(1.25).panelBreakdown.chargePanels);
  });

  it('الفرق بالضبط لوحان بكلفتهما الكاملة — ماكو أثر جانبي بالبنود', () => {
    const diff = draftWith(PANEL_SAFETY_FACTOR).total - draftWith(LEGACY_PANEL_SAFETY_FACTOR).total;
    expect(diff).toBe(2 * (185000 + 65000 + 5000));
  });
});

describe('المعامل موصول بكل المسارات', () => {
  it('ينحفظ بلقطة العرض مع كل عرض بلا شرط', () => {
    expect(dataApi).toContain('panelSafetyFactor: panelSafetyFactorOf(input)');
    // اللقطة ما عاد إلها شرط `active` — بدونه العرض البسيط يرجع «قديماً»
    expect(dataApi).toContain('await api.config.set(`quote_adj_${quoteId}`, {');
    expect(dataApi).not.toMatch(/quote_adj_\$\{quoteId\}`, active \?/);
  });

  it('يوصل محرك الحساب من طبقة البيانات', () => {
    expect(dataApi).toContain('panelSafetyFactor: panelSafetyFactorOf(input),');
    expect(dataApi).toMatch(/function panelSafetyFactorOf\(input\)/);
  });

  it('العرض المفتوح للتعديل يجيب معامله المحفوظ، والقديم يرجع بـ1', () => {
    expect(prefill).toContain('LEGACY_PANEL_SAFETY_FACTOR');
    expect(prefill).toMatch(/adjustments\?\.panelSafetyFactor/);
  });

  it('بذاكرة المسودة وبـBLANK وبنداء المعاينة وبالحفظ', () => {
    expect(builder).toContain('panelSafetyFactor: PANEL_SAFETY_FACTOR,');       // BLANK
    expect(builder).toContain('panelSafetyFactor: debouncedInputs.panelSafetyFactor'); // المعاينة
    expect(builder).toContain('setPanelSafetyFactor(s.panelSafetyFactor ?? PANEL_SAFETY_FACTOR);'); // المسودة
  });

  it('الثابتان معرّفان ومختلفان', () => {
    expect(PANEL_SAFETY_FACTOR).toBe(1.25);
    expect(LEGACY_PANEL_SAFETY_FACTOR).toBe(1);
  });
});
