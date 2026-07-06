import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import * as XLSX from 'xlsx';
import { initSchema } from '../electron/db/schema.js';
import {
  parseInventoryWorkbook,
  buildTemplateWorkbook,
  importIntoDb,
  annotateMatches,
  inferCategoryFromText,
  extractCapacityFromText,
} from '../electron/lib/excelImport.js';

function workbookToBuffer(wb) {
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function makeWorkbook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return workbookToBuffer(wb);
}

describe('استنتاج الفئة من النص', () => {
  it('يميز المواد الثانوية قبل الألواح رغم ذكر "الألواح" بالوصف', () => {
    expect(inferCategoryFromText('هيكل الألواح مغلون مقاوم للرياح')).toBe('secondary');
    expect(inferCategoryFromText('كيبلات ناقلة من الألواح إلى الانفيرتر')).toBe('secondary');
    expect(inferCategoryFromText('بوردات الحماية للألواح والانفيرترات')).toBe('secondary');
  });

  it('يميز الفئات الرئيسية', () => {
    expect(inferCategoryFromText('انفيرتر هجين 6 كيلو واط')).toBe('inverter');
    expect(inferCategoryFromText('بطارية ليثيوم فوسفات الحديد')).toBe('battery');
    expect(inferCategoryFromText('لوح شمسي JINKO 650 واط')).toBe('panel');
  });
});

describe('استخراج القدرة من النص', () => {
  it('واط للألواح، كيلو واط للانفيرتر، kWh للبطارية', () => {
    expect(extractCapacityFromText('لوح 650 واط', 'panel')).toBe(650);
    expect(extractCapacityFromText('انفيرتر 6 كيلو واط', 'inverter')).toBe(6000);
    expect(extractCapacityFromText('بطارية 16kwh', 'battery')).toBe(16);
    expect(extractCapacityFromText('بطارية 16 كيلو', 'battery')).toBe(16);
  });
});

describe('قراءة ملف بقالبنا المرتب', () => {
  it('يقرأ كل صفوف القالب مع ورقة أجور العمل', () => {
    const buffer = workbookToBuffer(buildTemplateWorkbook());
    const { rows, labor, warnings } = parseInventoryWorkbook(buffer);
    expect(rows.length).toBe(5);
    expect(labor.length).toBe(3);
    expect(rows[0].category).toBe('panel');
    expect(rows[0].price).toBe(185000);
    expect(rows[4].unit).toBe('متر');
    expect(warnings.length).toBe(0);
  });
});

describe('قراءة ملف مخزن فوضوي (أعمدة بأسماء مختلفة وبدون عمود فئة)', () => {
  it('يستنتج الفئات والأسعار والسعات من النصوص', () => {
    const buffer = makeWorkbook({
      Sheet1: [
        ['البيان', 'سعر البيع', 'العدد المتوفر'],
        ['لوح شمسي جينكو 650 واط وجهين', '185,000', 120],
        ['انفيرتر كوس باور 6 كيلو واط هجين', '650,000', 40],
        ['بطارية ليثيوم 16 كيلو واط ساعة', '2,750,000', 30],
        ['كيبل نحاسي 6 ملم احمر واسود', 2000, 800],
      ],
    });
    const { rows } = parseInventoryWorkbook(buffer);
    expect(rows.length).toBe(4);
    expect(rows[0].category).toBe('panel');
    expect(rows[0].watt_or_capacity).toBe(650);
    expect(rows[0].price).toBe(185000);
    expect(rows[1].category).toBe('inverter');
    expect(rows[1].watt_or_capacity).toBe(6000);
    expect(rows[2].category).toBe('battery');
    expect(rows[2].watt_or_capacity).toBe(16);
    expect(rows[3].category).toBe('secondary');
    expect(rows[3].unit).toBe('متر');
  });
});

describe('قاعدة التحديث/الإضافة بالسعة (مهم: بطارية 16kWh ≠ بطارية 6kWh بنفس الموديل)', () => {
  let db;
  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    db.prepare(`
      INSERT INTO materials (category, brand, model, full_description, unit, watt_or_capacity, price, quantity_stock)
      VALUES ('battery', 'COSPOWER', 'COSPOWER Lithium', 'بطارية 16 كيلو', 'عدد', 16, 2750000, 10)
    `).run();
  });

  it('نفس الموديل ونفس السعة → تحديث السعر والكمية بدون تكرار', () => {
    const summary = importIntoDb(db, {
      materials: [{
        category: 'battery', brand: 'COSPOWER', model: 'COSPOWER Lithium',
        full_description: 'بطارية 16 كيلو محدثة', unit: 'عدد', watt_or_capacity: 16,
        price: 2600000, quantity_stock: 25,
      }],
    });
    expect(summary).toMatchObject({ added: 0, updated: 1 });
    const all = db.prepare("SELECT * FROM materials WHERE category='battery'").all();
    expect(all.length).toBe(1);
    expect(all[0].price).toBe(2600000);
    expect(all[0].quantity_stock).toBe(25);
  });

  it('نفس الموديل لكن سعة مختلفة (6kWh) → إضافة مادة جديدة ولا يلمس القديمة', () => {
    const summary = importIntoDb(db, {
      materials: [{
        category: 'battery', brand: 'COSPOWER', model: 'COSPOWER Lithium',
        full_description: 'بطارية 6 كيلو', unit: 'عدد', watt_or_capacity: 6,
        price: 1200000, quantity_stock: 15,
      }],
    });
    expect(summary).toMatchObject({ added: 1, updated: 0 });
    const all = db.prepare("SELECT * FROM materials WHERE category='battery' ORDER BY watt_or_capacity").all();
    expect(all.length).toBe(2);
    expect(all[0].watt_or_capacity).toBe(6);
    expect(all[1].watt_or_capacity).toBe(16);
    expect(all[1].price).toBe(2750000); // القديمة ما تغيرت
  });

  it('annotateMatches يعلّم الصفوف صح: تحديث للمطابقة الكاملة وجديد للسعة المختلفة', () => {
    const rows = annotateMatches(db, [
      { category: 'battery', model: 'COSPOWER Lithium', watt_or_capacity: 16, unit: 'عدد' },
      { category: 'battery', model: 'COSPOWER Lithium', watt_or_capacity: 6, unit: 'عدد' },
    ]);
    expect(rows[0].matchStatus).toBe('update');
    expect(rows[1].matchStatus).toBe('new');
  });

  it('أجور العمل: تحديث الحجم الموجود وإضافة الجديد', () => {
    db.prepare('INSERT INTO labor_tiers (system_amps, price) VALUES (15, 550000)').run();
    const summary = importIntoDb(db, {
      materials: [],
      labor: [
        { system_amps: 15, price: 600000, note: null },
        { system_amps: 40, price: 1200000, note: null },
      ],
    });
    expect(summary).toMatchObject({ laborAdded: 1, laborUpdated: 1 });
    expect(db.prepare('SELECT price FROM labor_tiers WHERE system_amps = 15').get().price).toBe(600000);
  });
});
