import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../electron/db/schema.js';
import { seedIfEmpty } from '../electron/db/seed.js';
import { computeOptions, buildQuoteDraft, saveQuote } from '../electron/lib/quoteService.js';

let db;

beforeEach(() => {
  db = new Database(':memory:');
  initSchema(db);
  seedIfEmpty(db);
});

function previewFor(input, draftInput = {}) {
  const options = computeOptions(db, input);
  const draft = buildQuoteDraft(options, { tier: 'economy', cableMeters: {}, ...draftInput });
  return { options, draft };
}

describe('quoteService - المثال المرجعي (15 أمبير نهار/ليل، 8 ساعات، سطح 28م²)', () => {
  it('يطابق الفاتورة المرجعية: 10 ألواح (7 تغذية + 3 شحن)، 2 بطارية، انفيرتر واحد، مجموع 9,686,000', () => {
    const options = computeOptions(db, { roofAreaM2: 28, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });
    const cableMaterial = db.prepare("SELECT * FROM materials WHERE model = 'كيبل ألواح-انفيرتر 6مم'").get();
    const draft = buildQuoteDraft(options, {
      tier: 'economy',
      cableMeters: { [cableMaterial.id]: 143 },
    });

    expect(draft.errors).toEqual({});
    expect(draft.warnings).toEqual({});

    expect(draft.panelBreakdown).toEqual({ feedPanels: 7, chargePanels: 3 });

    const panelItem = draft.items.find((i) => i.description.includes('ألواح شمسية'));
    expect(panelItem.quantity).toBe(10);

    const batteryItem = draft.items.find((i) => i.description.includes('بطاريات ليثيوم'));
    expect(batteryItem.quantity).toBe(2);

    const inverterItem = draft.items.find((i) => i.description.includes('انفيرتر'));
    expect(inverterItem.quantity).toBe(1);

    const laborItem = draft.items.find((i) => i.description.includes('أجور العمل'));
    expect(laborItem.subtotal).toBe(550000);

    expect(draft.total).toBe(9686000);
  });

  it('ساعات التجهيز الافتراضية (8 من الإعدادات) تُستخدم عند عدم الإدخال', () => {
    const { draft } = previewFor({ roofAreaM2: 28, ampDay: 15, ampNight: 15, nightSupplyHours: null });
    const batteryItem = draft.items.find((i) => i.description.includes('بطاريات ليثيوم'));
    expect(batteryItem.quantity).toBe(2);
  });

  it('4 ساعات تجهيز → بطارية واحدة وألواح أقل (7+2=9)', () => {
    const { draft } = previewFor({ roofAreaM2: 28, ampDay: 15, ampNight: 15, nightSupplyHours: 4 });
    const batteryItem = draft.items.find((i) => i.description.includes('بطاريات ليثيوم'));
    expect(batteryItem.quantity).toBe(1);
    expect(draft.panelBreakdown).toEqual({ feedPanels: 7, chargePanels: 2 });
  });
});

describe('فحص المساحة الحاجب', () => {
  it('سطح 20م² مع 10 ألواح مطلوبة (27م²) → خطأ يذكر المساحة المطلوبة', () => {
    const { draft } = previewFor({ roofAreaM2: 20, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });
    expect(draft.errors.roofArea).toBeTruthy();
    expect(draft.errors.roofArea).toContain('27');
    expect(draft.errors.roofArea).toContain('20');
  });

  it('سطح كافٍ (28م²) → لا خطأ مساحة', () => {
    const { draft } = previewFor({ roofAreaM2: 28, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });
    expect(draft.errors.roofArea).toBeUndefined();
  });

  it('المساحة لا تغيّر عدد الألواح — العدد ثابت من التغذية والشحن', () => {
    const small = previewFor({ roofAreaM2: 20, ampDay: 15, ampNight: 15, nightSupplyHours: 8 }).draft;
    const big = previewFor({ roofAreaM2: 100, ampDay: 15, ampNight: 15, nightSupplyHours: 8 }).draft;
    const panelQty = (d) => d.items.find((i) => i.description.includes('ألواح شمسية')).quantity;
    expect(panelQty(small)).toBe(10);
    expect(panelQty(big)).toBe(10);
  });
});

describe('الشحن من الوطنية — لا يوجد أي تحذير لوقت الشحن مهما كان عدد البطاريات', () => {
  it('16 ساعة تجهيز → 4 بطاريات → بدون أي تحذير', () => {
    const { draft } = previewFor({ roofAreaM2: 100, ampDay: 15, ampNight: 15, nightSupplyHours: 16 });
    expect(draft.warnings).toEqual({});
    expect(draft.errors).toEqual({});
  });
});

describe('حفظ العرض', () => {
  it('يعطي رقم عرض يبدأ من 7400 ويزيد تسلسلياً ويحفظ البنود', () => {
    const { draft } = previewFor({ roofAreaM2: 28, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });
    const base = {
      clientName: 'عميل تجريبي',
      clientPhone: '0770',
      location: 'بغداد',
      roofAreaM2: 28,
      ampDay: 15,
      ampNight: 15,
      tier: 'economy',
      draft,
      notes: ['ملاحظة تجريبية'],
    };
    const saved1 = saveQuote(db, base);
    expect(saved1.quote_number).toBe(7400);
    const saved2 = saveQuote(db, { ...base, clientName: 'عميل ثاني' });
    expect(saved2.quote_number).toBe(7401);

    const items = db.prepare('SELECT * FROM quote_items WHERE quote_id = ?').all(saved1.id);
    expect(items.length).toBe(draft.items.length);
  });

  it('نظام أكبر من كل تعريفات أجور العمل يعطي خطأ واضح', () => {
    const { draft } = previewFor({ roofAreaM2: 200, ampDay: 100, ampNight: 100, nightSupplyHours: 8 });
    expect(draft.errors.labor).toBeTruthy();
  });
});

describe('التبديل اليدوي للبطارية يعيد حساب الألواح', () => {
  it('بطارية أصغر سعة → عدد بطاريات أكثر → ألواح شحن أكثر', () => {
    // أضف بطارية 8kWh أرخص
    db.prepare(`
      INSERT INTO materials (category, brand, model, full_description, unit, watt_or_capacity, price, quantity_stock)
      VALUES ('battery', 'TEST', 'بطارية 8kWh', 'بطارية ليثيوم 8kWh تجريبية', 'عدد', 8, 1200000, 50)
    `).run();
    const smallBattery = db.prepare("SELECT * FROM materials WHERE model = 'بطارية 8kWh'").get();

    const options = computeOptions(db, { roofAreaM2: 100, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });
    const draft = buildQuoteDraft(options, {
      tier: 'economy',
      overrides: { battery: smallBattery.id },
      cableMeters: {},
    });

    const batteryItem = draft.items.find((i) => i.description.includes('8kWh'));
    expect(batteryItem.quantity).toBe(4); // 26.4 ÷ 0.9 ÷ 8 = 3.67 → 4
    expect(draft.panelBreakdown.chargePanels).toBe(6); // 4 × 1.5
    expect(draft.panelBreakdown.feedPanels).toBe(7);
  });
});
