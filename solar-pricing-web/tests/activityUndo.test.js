import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATEGORIES, categoryOf, undoInfo, hasDraft, undoneIds, isReservedKey,
  UNDO, DRAFT, UNDONE, CAT,
} from '../src/lib/activityUndo.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dataApiSrc = fs.readFileSync(path.join(HERE, '../src/lib/dataApi.js'), 'utf8');
const historySrc = fs.readFileSync(path.join(HERE, '../src/pages/History.jsx'), 'utf8');

// كل الحركات المعروفة بالتطبيق — مأخوذة من خريطة الأيقونات بصفحة السجل
const ALL_ACTIONS = [...historySrc.matchAll(/^ {2}'([^']+)': '/gm)].map((m) => m[1]);

describe('فئات السجل', () => {
  it('كل حركة بالتطبيق تنتمي لفئة معروفة، وماكو حركة تطيح على «أخرى»', () => {
    expect(ALL_ACTIONS.length).toBeGreaterThan(20); // الخريطة انقرأت فعلاً
    const keys = new Set(CATEGORIES.map((c) => c.key));
    // «استرجاع حركة» فئتها تجي من الحركة الأصلية (__cat) — تُفحص باختبار مستقل
    for (const action of ALL_ACTIONS.filter((a) => a !== 'استرجاع حركة')) {
      const cat = categoryOf(action, {});
      expect(keys.has(cat), `${action} → فئة غير معروفة: ${cat}`).toBe(true);
      expect(cat, `${action} ما إلها فئة`).not.toBe('other');
    }
  });

  it('تغيير السعر يتقدم على «تعديل مخزون»', () => {
    expect(categoryOf('تعديل مادة', { 'السعر': 100 })).toBe('inventory');
    expect(categoryOf('تعديل مادة', { 'السعر القديم': 100, 'السعر الجديد': 120 })).toBe('price');
    expect(categoryOf('تعديل أجور عمل', { 'السعر القديم': 5, 'السعر الجديد': 6 })).toBe('price');
  });

  it('حركة الاسترجاع تاخذ فئة الحركة الأصلية', () => {
    expect(categoryOf('استرجاع حركة', { [CAT]: 'price' })).toBe('price');
    expect(categoryOf('استرجاع حركة', { [CAT]: 'delete' })).toBe('delete');
  });

  it('أي حذف غير مصنّف يطيح على فئة الحذف مو على «أخرى»', () => {
    expect(categoryOf('حذف شي جديد ما موجود بالخريطة', {})).toBe('delete');
    expect(categoryOf('حركة مستقبلية', {})).toBe('other');
  });
});

describe('وصف الاسترجاع', () => {
  it('الحركة القديمة (بلا لقطة) غير قابلة للاسترداد بسبب واضح', () => {
    const info = undoInfo({ details: { 'المادة': 'لوح' } });
    expect(info.can).toBe(false);
    expect(info.why).toContain('قديمة');
  });

  it('kind=none يعطي السبب المكتوب بمكان التسجيل', () => {
    const info = undoInfo({ details: { [UNDO]: { kind: 'none', why: 'حذف نهائي' } } });
    expect(info.can).toBe(false);
    expect(info.why).toBe('حذف نهائي');
  });

  it('اللقطة الصالحة تعطي زراً بنص التأكيد', () => {
    const info = undoInfo({ details: { [UNDO]: { kind: 'rowUpdate', label: 'إرجاع', confirm: 'ترجع القيم' } } });
    expect(info.can).toBe(true);
    expect(info.label).toBe('إرجاع');
    expect(info.confirm).toBe('ترجع القيم');
  });
});

describe('منع الاسترجاع المزدوج', () => {
  it('معرّفات الحركات المسترجعة تنستخرج من سجلات الاسترجاع نفسها', () => {
    const rows = [
      { id: 9, details: { [UNDONE]: 4 } },
      { id: 8, details: { 'المادة': 'لوح' } },
      { id: 4, details: { [UNDO]: { kind: 'rowUpdate' } } },
    ];
    const s = undoneIds(rows);
    expect(s.has(4)).toBe(true);
    expect(s.has(8)).toBe(false);
  });
});

describe('العرض المُصدَّر بلا حفظ', () => {
  it('يتعرّف عليه من وجود لقطة المدخلات', () => {
    expect(hasDraft({ details: { [DRAFT]: { clientName: 'أحمد' } } })).toBe(true);
    expect(hasDraft({ details: { 'العميل': 'أحمد' } })).toBe(false);
  });
});

describe('المفاتيح المحجوزة', () => {
  it('تبدي بـ__ وما تنعرض بعمود التفاصيل', () => {
    for (const k of [UNDO, DRAFT, UNDONE, CAT]) expect(isReservedKey(k)).toBe(true);
    expect(isReservedKey('السعر')).toBe(false);
  });

  it('صفحة السجل تفلتر المفاتيح المحجوزة قبل العرض', () => {
    expect(historySrc).toContain('.filter(([k]) => !isReservedKey(k))');
  });
});

// المواد المخفية (بلا جيك بوكس) لازم تنشال بكل مسار استخدام — نفس درس «التصدير
// نسى نوع المنظومة»: مسار واحد ينسى الفلترة وتظهر مادة مخفية بعرض.
describe('المواد المخفية ما تدخل أي مسار استخدام', () => {
  const read = (p) => fs.readFileSync(path.join(HERE, p), 'utf8');

  it('محرك التسعير يستلم المفعّلة فقط', () => {
    // المفعّلة تنفرز أول، وبعدها ينطبق فلتر البراند على الناتج — فالمخفية
    // ما توصل المحرك بأي حالة
    expect(dataApiSrc).toMatch(/const active = materials\.filter\(\(m\) => m\.active !== false\)/);
    expect(dataApiSrc).toMatch(/\? active\.filter\(/);
    expect(dataApiSrc).toMatch(/: active;/);
    expect(dataApiSrc).toMatch(/materials: filtered,/);
  });

  it('نافذة المواد الثانوية بشاشتي الموظف والزبون تفلتر المخفية', () => {
    for (const p of ['../src/pages/QuoteBuilder.jsx', '../src/pages/CustomerView.jsx']) {
      expect(read(p), p).toMatch(/category === 'secondary' && m\.active !== false/);
    }
  });

  it('قوائم المخزون والاستيراد ترجع كل المواد مع وسم active', () => {
    // الاستيراد يطابق على الكل وإلا يكرّر المواد المخفية، والعروض المحفوظة تحتاجها
    expect(dataApiSrc).toContain('return withActive(await withIntegratedKw(data || []))');
    expect(dataApiSrc).toContain('withActive(await withIntegratedKw(data || []))');
  });

  it('مفتاح المواد المخفية داخلي — ما ينسجل كتعديل إعداد مشترك', () => {
    expect(dataApiSrc).toMatch(/isInternalConfigKey = \(key\) =>[\s\S]{0,200}MATERIALS_DISABLED_KEY/);
    expect(dataApiSrc).toContain('if (!isInternalConfigKey(key))');
  });
});

// حارس بنيوي: نفس درس «التصدير نسى نوع المنظومة» — أي نقطة تسجيل تنضاف بلا لقطة
// تنكشف هنا بدل ما تظهر بالواجهة كحركة «غير قابلة للاسترداد» بلا ما ننتبه.
describe('كل نقاط التسجيل بـdataApi تحمل لقطة صريحة', () => {
  it('ماكو logActivity بلا [UNDO] أو [DRAFT]', () => {
    const calls = [...dataApiSrc.matchAll(/logActivity\(/g)];
    expect(calls.length).toBeGreaterThan(15);
    const missing = [];
    for (const m of calls) {
      // نقرأ نص الاستدعاء بموازنة الأقواس من موضع البداية
      let depth = 0;
      let end = m.index;
      for (let i = m.index; i < dataApiSrc.length; i++) {
        if (dataApiSrc[i] === '(') depth++;
        else if (dataApiSrc[i] === ')') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      const call = dataApiSrc.slice(m.index, end + 1);
      if (!call.includes('[UNDO]') && !call.includes('[DRAFT]')) {
        missing.push(call.slice(0, 80).replace(/\s+/g, ' '));
      }
    }
    expect(missing, 'نقاط تسجيل بلا لقطة استرجاع:\n' + missing.join('\n')).toEqual([]);
  });
});
