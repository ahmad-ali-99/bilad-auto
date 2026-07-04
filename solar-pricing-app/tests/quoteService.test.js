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

describe('quoteService - يطابق الفاتورة المرجعية (منظومة 15 أمبير، سطح ~28م²)', () => {
  it('يبني عرضاً بمجموع مطابق للفاتورة المرجعية 9,686,000 دينار', () => {
    const options = computeOptions(db, { roofAreaM2: 28, ampDay: 15, ampNight: 15 });
    const cableMaterial = db.prepare("SELECT * FROM materials WHERE model = 'كيبل ألواح-انفيرتر 6مم'").get();

    const draft = buildQuoteDraft(options, {
      tier: 'economy',
      cableMeters: { [cableMaterial.id]: 143 },
    });

    expect(draft.errors).toEqual({});
    expect(draft.roofLimitedWarning).toBe(true);

    const panelItem = draft.items.find((i) => i.description.includes('JINKO') || i.description.includes('ألواح شمسية'));
    expect(panelItem.quantity).toBe(10);

    const batteryItem = draft.items.find((i) => i.description.includes('بطاريات ليثيوم'));
    expect(batteryItem.quantity).toBe(2);

    const inverterItem = draft.items.find((i) => i.description.includes('انفيرتر'));
    expect(inverterItem.quantity).toBe(1);

    const laborItem = draft.items.find((i) => i.description.includes('أجور العمل'));
    expect(laborItem.subtotal).toBe(550000);

    expect(draft.total).toBe(9686000);
  });

  it('يستبعد كيبل المتر إذا لم يُدخل المستخدم أمتاره', () => {
    const options = computeOptions(db, { roofAreaM2: 28, ampDay: 15, ampNight: 15 });
    const draft = buildQuoteDraft(options, { tier: 'economy', cableMeters: {} });
    const cableItem = draft.items.find((i) => i.unit === 'متر');
    expect(cableItem).toBeUndefined();
    expect(draft.total).toBe(9686000 - 286000);
  });

  it('حفظ العرض يعطي رقم عرض يبدأ من quote_number_start (7400) ويزيد تسلسلياً', () => {
    const options = computeOptions(db, { roofAreaM2: 28, ampDay: 15, ampNight: 15 });
    const draft = buildQuoteDraft(options, { tier: 'economy', cableMeters: {} });
    const saved1 = saveQuote(db, {
      clientName: 'عميل تجريبي',
      clientPhone: '0770',
      location: 'بغداد',
      roofAreaM2: 28,
      ampDay: 15,
      ampNight: 15,
      tier: 'economy',
      draft,
      notes: ['ملاحظة تجريبية'],
    });
    expect(saved1.quote_number).toBe(7400);

    const saved2 = saveQuote(db, {
      clientName: 'عميل ثاني',
      clientPhone: '0771',
      location: 'بغداد',
      roofAreaM2: 28,
      ampDay: 15,
      ampNight: 15,
      tier: 'economy',
      draft,
      notes: [],
    });
    expect(saved2.quote_number).toBe(7401);

    const items = db.prepare('SELECT * FROM quote_items WHERE quote_id = ?').all(saved1.id);
    expect(items.length).toBe(draft.items.length);
  });

  it('نظام أكبر من كل تعريفات أجور العمل يعطي خطأ واضح', () => {
    const options = computeOptions(db, { roofAreaM2: 100, ampDay: 100, ampNight: 100 });
    const draft = buildQuoteDraft(options, { tier: 'economy', cableMeters: {} });
    expect(draft.errors.labor).toBeTruthy();
  });
});
