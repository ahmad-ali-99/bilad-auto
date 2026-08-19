import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';
import { brandSlug, brandInitials, brandColor, brandLogoCandidates } from '../src/lib/brandLogos.js';
import { canPickBrand } from '../src/lib/permissions.js';
import {
  BRAND_CATEGORIES, brandSectionsFor, emptyBrandPick, normalizeBrandPick,
  hasBrandPick, filterMaterialsByBrands, pruneBrandPick,
} from '../src/lib/brandPick.js';

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
const BY = new Map(ALL.map((m) => [m.id, m]));

function draftFor(pick) {
  const picked = { ...emptyBrandPick(), ...(pick || {}) };
  const options = buildOptions({
    materials: filterMaterialsByBrands(ALL, picked), laborTiers: LABOR, settingsRow: SETTINGS,
    roofAreaM2: 100, ampDay: 15, ampNight: 15, nightSupplyHours: 8,
  });
  return buildQuoteDraft(options, { tier: 'economy', overrides: {}, cableMeters: {}, secondarySelections: { 20: { qty: '' } }, adjustments: {} });
}
const catOf = (d, cat) => d.items
  .map((i) => BY.get(i.material_id))
  .filter((m) => m && m.category === cat)
  .map((m) => m.brand);

describe('اختيار البراند لكل قسم على حدة', () => {
  it('كل قسم ينحصر بماركته هو بس', () => {
    const d = draftFor({ panel: 'Deye', battery: 'JINKO', inverter: 'Deye' });
    expect(catOf(d, 'panel')).toEqual(['Deye']);
    expect(catOf(d, 'battery')).toEqual(['JINKO']);
    expect(catOf(d, 'inverter')).toEqual(['Deye']);
  });

  it('قسم بلا اختيار يبقى مفتوح — البرنامج يختار الأنسب', () => {
    // بس البطارية محصورة: اللوح يبقى JINKO (أرخص بسعر الواط: 403 د/واط مقابل 436)
    const d = draftFor({ battery: 'Deye' });
    expect(catOf(d, 'battery')).toEqual(['Deye']);
    expect(catOf(d, 'panel')).toEqual(['JINKO']);
  });

  it('ماركات مختلطة فعلاً — منظومة من ثلاث ماركات مو ماركة وحدة', () => {
    const mixed = draftFor({ panel: 'JINKO', battery: 'Deye', inverter: 'JINKO' });
    const one = draftFor({ panel: 'Deye', battery: 'Deye', inverter: 'Deye' });
    expect(mixed.total).not.toBe(one.total);
  });

  it('المواد الثانوية والأجور ما تنحذف مع الفلتر', () => {
    const d = draftFor({ panel: 'JINKO', battery: 'JINKO', inverter: 'JINKO' });
    expect(d.items.some((i) => i.material_id === 20), 'الهيكل لازم يبقى').toBe(true);
    expect(d.items.some((i) => /أجور/.test(i.description)), 'أجور العمل تبقى').toBe(true);
  });

  it('بلا أي اختيار: البرنامج حر يخلط الماركات', () => {
    const d = draftFor({});
    expect(d.items.length).toBeGreaterThan(0);
    expect(d.errors).toEqual({});
  });

  it('المطابقة ما تتأثر بحالة الأحرف ولا بالفراغات', () => {
    expect(catOf(draftFor({ battery: ' deye ' }), 'battery')).toEqual(['Deye']);
  });

  it('البراند يغيّر المجموع فعلاً — مو مجرد شكل', () => {
    expect(draftFor({ inverter: 'JINKO' }).total).not.toBe(draftFor({ inverter: 'Deye' }).total);
  });
});

describe('أقسام البراند تتبع نوع المنظومة', () => {
  it('الكاملة: لوح وبطارية وانفيرتر', () => {
    expect(brandSectionsFor('full')).toEqual(['panel', 'battery', 'inverter']);
  });
  it('النهارية بلا بطاريات: لوح وانفيرتر بس', () => {
    expect(brandSectionsFor('day')).toEqual(['panel', 'inverter']);
  });
  it('الأوف جرد بلا ألواح: بطارية وانفيرتر بس', () => {
    expect(brandSectionsFor('offgrid')).toEqual(['battery', 'inverter']);
  });
  it('المتكامل: لوح وكابينة', () => {
    expect(brandSectionsFor('integrated')).toEqual(['panel', 'integrated']);
  });
  it('نوع غير معروف يرجع للكاملة', () => {
    expect(brandSectionsFor(null)).toEqual(['panel', 'battery', 'inverter']);
  });

  it('ماركة قسم طالع من العرض تنشال — ما يبقى فلتر مخفي', () => {
    const pick = { panel: 'JINKO', battery: 'Deye', inverter: 'Deye', integrated: '' };
    expect(pruneBrandPick(pick, 'offgrid')).toEqual({ panel: '', battery: 'Deye', inverter: 'Deye', integrated: '' });
    expect(pruneBrandPick(pick, 'day')).toEqual({ panel: 'JINKO', battery: '', inverter: 'Deye', integrated: '' });
  });

  it('القص ما يمس تحجيم المنظومة — بس يشيل الفلتر', () => {
    // أوف جرد: ماركة اللوح المختارة ما لازم تأثر على شي (ماكو ألواح أصلاً)
    const picked = pruneBrandPick({ panel: 'Deye', battery: 'JINKO', inverter: 'JINKO' }, 'offgrid');
    const withPanelBrand = filterMaterialsByBrands(ALL, { ...emptyBrandPick(), panel: 'Deye', battery: 'JINKO', inverter: 'JINKO' });
    const pruned = filterMaterialsByBrands(ALL, picked);
    expect(pruned.filter((m) => m.category === 'panel').length).toBe(2);
    expect(withPanelBrand.filter((m) => m.category === 'panel').length).toBe(1);
  });
});

describe('قراءة الاختيار المحفوظ', () => {
  it('العروض الجديدة تنقرأ من `brands`', () => {
    expect(normalizeBrandPick({ brands: { panel: 'JINKO', battery: 'Deye' } }))
      .toEqual({ panel: 'JINKO', battery: 'Deye', inverter: '', integrated: '' });
  });

  it('العروض القديمة (`brand` واحد) تنقرأ بنفس معناها: انفيرتر وبطارية بس', () => {
    // القديم كان يحصر الانفيرتر والبطارية ويترك اللوح حر — لازم يبقى بالضبط هيج
    expect(normalizeBrandPick({ brand: 'Deye' }))
      .toEqual({ panel: '', battery: 'Deye', inverter: 'Deye', integrated: '' });
    const d = draftFor(normalizeBrandPick({ brand: 'Deye' }));
    expect(catOf(d, 'battery')).toEqual(['Deye']);
    expect(catOf(d, 'inverter')).toEqual(['Deye']);
    expect(catOf(d, 'panel'), 'اللوح يبقى حر بالعروض القديمة').toEqual(['JINKO']);
  });

  it('`brands` يتقدم على `brand` القديم إذا الاثنان موجودان', () => {
    expect(normalizeBrandPick({ brand: 'Deye', brands: { panel: 'JINKO' } }).battery).toBe('');
  });

  it('بلا أي اختيار يرجع فارغاً وما ينفلتر شي', () => {
    expect(hasBrandPick(normalizeBrandPick({}))).toBe(false);
    expect(filterMaterialsByBrands(ALL, emptyBrandPick())).toBe(ALL);
  });

  it('الفئات الأربع كلها مغطّاة', () => {
    expect(BRAND_CATEGORIES).toEqual(['panel', 'battery', 'inverter', 'integrated']);
    expect(Object.keys(emptyBrandPick()).sort()).toEqual([...BRAND_CATEGORIES].sort());
  });
});

describe('البراند موصول بكل المسارات', () => {
  it('الفلتر بطبقة البيانات ويحمي الثانوية', () => {
    expect(dataApi).toContain('filterMaterialsByBrands(active, picked)');
    expect(dataApi).toContain('async brands()');
  });
  it('ينحفظ مع العرض ويرجع عند فتحه', () => {
    expect(dataApi).toContain('brands: picked,');
    // اللقطة تنكتب بكل عرض بلا شرط — معامل أمان الألواح لازم ينحفظ حتى بالعرض البسيط
    expect(dataApi).toContain('await api.config.set(`quote_adj_${quoteId}`, {');
    expect(prefill).toContain('brands: pruneBrandPick(normalizeBrandPick(adjustments || {}), systemType)');
  });
  it('بذاكرة المسودة وبـBLANK وبنداء المعاينة', () => {
    expect(builder).toContain('brands: emptyBrandPick()');
    expect(builder).toContain('brands: debouncedInputs.brands');
    expect(builder).toContain('setBrands({ ...emptyBrandPick(), ...(s.brands || {}) });');
  });
  it('تبديل نوع المنظومة يقصّ الماركات', () => {
    expect(builder).toContain('setBrands((prev) => pruneBrandPick(prev, next));');
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
    expect(brandInitials('JA Solar')).toBe('JS');
    expect(brandInitials('Canadian Solar')).toBe('CS');
    expect(brandInitials('JINKO')).toBe('JI');
    expect(brandColor('Deye')).toEqual(brandColor('Deye'));
    expect(brandColor('Deye')).not.toEqual(brandColor('JINKO'));
  });
  it('اسم فارغ ما يكسر شي', () => {
    expect(brandLogoCandidates('', '/')).toEqual([]);
    expect(brandInitials('')).toBe('؟');
  });
});

// المبدّل محصور بحسابين حالياً
describe('منو يشوف مبدّل البراند', () => {
  it('بكر وأحمد فقط', () => {
    expect(canPickBrand('بكر')).toBe(true);
    expect(canPickBrand('أحمد')).toBe(true);
    expect(canPickBrand('احمد'), 'بلا همزة').toBe(true);
    expect(canPickBrand(' بكر ')).toBe(true);
  });

  it('بقية الحسابات ما تشوفه', () => {
    for (const u of ['حوراء', 'حيدر', 'علي سبتي', 'ليث كرادة', '']) {
      expect(canPickBrand(u), u || '(فارغ)').toBe(false);
    }
  });

  it('الشاشة تفحص الصلاحية قبل ما تجيب الماركات أصلاً', () => {
    expect(builder).toContain('if (!canPickBrand(n)) return;');
    expect(builder).toContain('{mayPickBrand && brandOptions && brandSections.length > 0 && (');
  });

  it('الماركات ترجع مقسّمة على الفئات الأربع', () => {
    const b = dataApi.slice(dataApi.indexOf('async brands()'));
    const body = b.slice(0, b.indexOf('\n    },'));
    expect(body).toContain('for (const c of BRAND_CATEGORIES)');
    expect(body).toContain('m.active === false');
  });
});
