import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';
import { brandSlug, brandInitials, brandColor, brandLogoCandidates } from '../src/lib/brandLogos.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, '..', p), 'utf8');
const dataApi = read('src/lib/dataApi.js');
const builder = read('src/pages/QuoteBuilder.jsx');
const prefill = read('src/lib/editPrefill.js');

const SETTINGS = {
  system_voltage: 220, system_efficiency: 0.8, inverter_safety_factor: 1.25, dod: 0.9,
  night_coverage_hours: 8, panel_area_m2: 2.7, currency: 'د', quote_number_start: 7400,
  charge_panels_per_battery: 1.5,
};
// ماركتان بنفس الفئات + مواد ثانوية بلا ماركة
const ALL = [
  { id: 1, category: 'panel',   brand: 'JINKO',  model: 'J 620', full_description: 'لوح', unit: 'عدد', watt_or_capacity: 620, price: 250000 },
  { id: 2, category: 'panel',   brand: 'Deye',   model: 'D 550', full_description: 'لوح', unit: 'عدد', watt_or_capacity: 550, price: 240000 },
  { id: 3, category: 'inverter', brand: 'JINKO', model: 'J 6K',  full_description: 'انفيرتر', unit: 'عدد', watt_or_capacity: 6000, price: 1800000 },
  { id: 4, category: 'inverter', brand: 'Deye',  model: 'D 6K',  full_description: 'انفيرتر', unit: 'عدد', watt_or_capacity: 6000, price: 1700000 },
  { id: 5, category: 'battery',  brand: 'JINKO', model: 'J 16',  full_description: 'بطارية', unit: 'عدد', watt_or_capacity: 16, price: 3400000 },
  { id: 6, category: 'battery',  brand: 'Deye',  model: 'D 16',  full_description: 'بطارية', unit: 'عدد', watt_or_capacity: 16, price: 3300000 },
  { id: 20, category: 'secondary', model: 'هيكل', full_description: 'هيكل', unit: 'عدد', price: 65000, qty_per_panel: 1 },
];
const LABOR = [{ id: 1, system_amps: 10, price: 400000 }, { id: 2, system_amps: 20, price: 700000 }];

// نفس فلتر البراند اللي بـdataApi._options
const MAIN = ['panel', 'battery', 'inverter', 'integrated'];
const filterBrand = (mats, brand) => (brand
  ? mats.filter((m) => !MAIN.includes(m.category) || String(m.brand || '').toLowerCase() === brand.toLowerCase())
  : mats);

function draftFor(brand) {
  const options = buildOptions({
    materials: filterBrand(ALL, brand), laborTiers: LABOR, settingsRow: SETTINGS,
    roofAreaM2: 100, ampDay: 15, ampNight: 15, nightSupplyHours: 8,
  });
  return buildQuoteDraft(options, { tier: 'economy', overrides: {}, cableMeters: {}, secondarySelections: { 20: { qty: '' } }, adjustments: {} });
}
const brandsOf = (d, byId) => [...new Set(d.items.map((i) => byId.get(i.material_id)?.brand).filter(Boolean))];
const BY = new Map(ALL.map((m) => [m.id, m]));

describe('اختيار البراند', () => {
  it('بماركة واحدة: كل المواد الأساسية منها فقط', () => {
    expect(brandsOf(draftFor('JINKO'), BY)).toEqual(['JINKO']);
    expect(brandsOf(draftFor('Deye'), BY)).toEqual(['Deye']);
  });

  it('المواد الثانوية والأجور ما تنحذف مع الفلتر', () => {
    const d = draftFor('JINKO');
    expect(d.items.some((i) => i.material_id === 20), 'الهيكل لازم يبقى').toBe(true);
    expect(d.items.some((i) => /أجور/.test(i.description)), 'أجور العمل تبقى').toBe(true);
  });

  it('بلا اختيار: البرنامج حر يخلط الماركات ويختار الأنسب', () => {
    const d = draftFor('');
    expect(d.items.length).toBeGreaterThan(0);
    expect(d.errors).toEqual({});
  });

  it('المطابقة ما تتأثر بحالة الأحرف', () => {
    expect(brandsOf(draftFor('jinko'), BY)).toEqual(['JINKO']);
  });

  it('البراند يغيّر المجموع فعلاً — مو مجرد شكل', () => {
    expect(draftFor('JINKO').total).not.toBe(draftFor('Deye').total);
  });
});

describe('البراند موصول بكل المسارات', () => {
  it('الفلتر بطبقة البيانات ويحمي الثانوية', () => {
    expect(dataApi).toContain("const MAIN = ['panel', 'battery', 'inverter', 'integrated']");
    expect(dataApi).toContain('input.brand');
    expect(dataApi).toContain('async brands()');
  });
  it('ينحفظ مع العرض ويرجع عند فتحه', () => {
    expect(dataApi).toContain('brand: input.brand || null');
    expect(dataApi).toContain('|| !!input.brand');   // العرض ينحفظ حتى لو ماكو زيادة/خصم
    expect(prefill).toContain("brand: adjustments?.brand || ''");
  });
  it('بذاكرة المسودة وبـBLANK وبنداء المعاينة', () => {
    expect(builder).toContain("brand: ''");
    expect(builder).toContain('brand: debouncedInputs.brand');
    expect(builder).toContain('setBrand(s.brand)');
  });
});

describe('شعارات الماركات', () => {
  it('اسم الماركة يتحول لاسم ملف مفهوم', () => {
    expect(brandSlug('JA Solar')).toBe('ja-solar');
    expect(brandSlug('JINKO')).toBe('jinko');
    expect(brandSlug('Canadian  Solar')).toBe('canadian-solar');
    expect(brandSlug('هوي مايلز')).toBe('هوي-مايلز');
  });
  it('يجرّب أربعة امتدادات بالترتيب', () => {
    const c = brandLogoCandidates('Deye', '/app/');
    expect(c[0]).toBe('/app/brands/deye.svg');
    expect(c.length).toBe(4);
    expect(c.every((x) => x.startsWith('/app/brands/deye.'))).toBe(true);
  });
  it('ماركة بلا ملف تاخذ علامة مولّدة ثابتة', () => {
    // القاعدة: أول حرف من أول كلمتين، وللاسم المفرد أول حرفين
    expect(brandInitials('JA Solar')).toBe('JS');
    expect(brandInitials('Canadian Solar')).toBe('CS');
    expect(brandInitials('JINKO')).toBe('JI');
    // نفس الاسم = نفس اللون دائماً
    expect(brandColor('Deye')).toEqual(brandColor('Deye'));
    expect(brandColor('Deye')).not.toEqual(brandColor('JINKO'));
  });
  it('اسم فارغ ما يكسر شي', () => {
    expect(brandLogoCandidates('', '/')).toEqual([]);
    expect(brandInitials('')).toBe('؟');
  });
});
