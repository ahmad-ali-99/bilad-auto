import { describe, it, expect } from 'vitest';
import { creatorsOf, filterByCreators, normName } from '../src/lib/quotesFilter.js';

const Q = [
  { id: 1, quote_number: 7401, created_by: 'أحمد' },
  { id: 2, quote_number: 7402, created_by: 'حيدر' },
  { id: 3, quote_number: 7403, created_by: 'احمد' },      // نفس أحمد بلا همزة
  { id: 4, quote_number: 7404, created_by: 'علي سبتي' },
  { id: 5, quote_number: 7405, created_by: 'علي  سبتي' }, // مسافة مزدوجة
  { id: 6, quote_number: 7406, created_by: null },        // عرض قديم بلا اسم
];

describe('قائمة الحسابات المنشئة', () => {
  it('تجمع الاسم الواحد رغم فروقات الهمزة والمسافات', () => {
    const list = creatorsOf(Q);
    const names = list.map((c) => c.key);
    expect(names).toContain('احمد');
    expect(names).toContain('علي سبتي');
    expect(list.find((c) => c.key === 'احمد').count).toBe(2);
    expect(list.find((c) => c.key === 'علي سبتي').count).toBe(2);
  });

  it('تتجاهل العروض بلا اسم منشئ', () => {
    expect(creatorsOf(Q).reduce((s, c) => s + c.count, 0)).toBe(5);
  });

  it('ترتب الأكثر عروضاً أولاً', () => {
    expect(creatorsOf(Q)[0].count).toBe(2);
  });

  it('تتحمل قائمة فاضية أو غير معرّفة', () => {
    expect(creatorsOf([])).toEqual([]);
    expect(creatorsOf(null)).toEqual([]);
  });
});

describe('فلترة العروض حسب الحساب', () => {
  it('حساب واحد يرجّع عروضه فقط', () => {
    expect(filterByCreators(Q, ['حيدر']).map((q) => q.id)).toEqual([2]);
  });

  it('يجمع صيغ الاسم المختلفة تحت اختيار واحد', () => {
    expect(filterByCreators(Q, ['أحمد']).map((q) => q.id)).toEqual([1, 3]);
    expect(filterByCreators(Q, ['علي سبتي']).map((q) => q.id)).toEqual([4, 5]);
  });

  it('اختيار متعدد يجمع عروض الحسابات المختارة', () => {
    expect(filterByCreators(Q, ['حيدر', 'علي سبتي']).map((q) => q.id)).toEqual([2, 4, 5]);
  });

  it('بلا اختيار = الكل (ما نخفي شي بالغلط)', () => {
    expect(filterByCreators(Q, [])).toHaveLength(6);
    expect(filterByCreators(Q, null)).toHaveLength(6);
  });

  it('اسم غير موجود يرجّع قائمة فاضية بلا انهيار', () => {
    expect(filterByCreators(Q, ['فلان'])).toEqual([]);
  });

  it('لا يخلط اسماً يبدأ بنفس الحروف', () => {
    expect(filterByCreators(Q, ['علي']).map((q) => q.id)).toEqual([]);
  });
});

describe('تطبيع الاسم', () => {
  it('يوحّد الهمزة والمسافات والألف المقصورة', () => {
    expect(normName('  أحمد ')).toBe('احمد');
    expect(normName('علي\tسبتي')).toBe('علي سبتي');
    expect(normName('ليلى')).toBe('ليلي');
    expect(normName(null)).toBe('');
  });
});

// ═══ تنظيم شاشة العروض ═══════════════════════════════════════════════════
// شكوى المستخدم: «الواجهة ضيقة وأغلب المحتوى خلف عدة طبقات وما يبين إلا عرضين».
// السبب كان بطاقة الحسابات المفتوحة دائماً (عنوان + شرائح لكل حساب + سطر ملاحظة)
// توكل ~130 بكسل فوق الجدول. صارت شريطاً مطوياً، وانضاف فلتر حالة بصف واحد.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(HERE, '../src/pages/Quotes.jsx'), 'utf8');
const css = fs.readFileSync(path.join(HERE, '../src/styles.css'), 'utf8');

describe('فلتر حالة العروض', () => {
  it('أكو حالة فلتر تبدي فارغة = كل الحالات', () => {
    expect(page).toMatch(/const \[statusFilter, setStatusFilter\] = useState\(null\)/);
  });

  it('والضغط على الحالة يفلتر عليها، وإعادة الضغط تلغي الفلتر', () => {
    expect(page).toContain("setStatusFilter(statusFilter === l.key ? null : l.key)");
  });

  it('والعدّادات تنحسب **قبل** فلتر الحالة — وإلا صار كل عدّاد صفراً عدا المختار', () => {
    const i = page.indexOf('const statusCounts');
    const j = page.indexOf('.filter((x) => !statusFilter');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);   // العدّ قبل الفلترة
    expect(page).toContain('byCreator.filter((x) => levelOf(x) === l.key).length');
  });

  it('وكل الحالات الأربع تطلع بالشريط', () => {
    expect(page).toContain('STATUS_LEVELS.map((l) => (');
    for (const k of ['normal', 'follow', 'urgent', 'done']) expect(page).toContain(`'${k}'`);
  });
});

describe('شريط الحسابات مطوي', () => {
  it('يبدي مطوياً — هذا اللي رجّع ارتفاع الجدول', () => {
    expect(page).toMatch(/const \[creatorsOpen, setCreatorsOpen\] = useState\(false\)/);
  });

  it('وما بقت بطاقة حسابات مفتوحة دائماً فوق الجدول', () => {
    expect(page).not.toContain('👥 الحسابات:');
    expect(page).toContain('qf-accounts-bar');
  });

  it('والشريط ينفتح وينطوي بزر واحد', () => {
    expect(page).toContain('setCreatorsOpen((v) => !v)');
  });
});

describe('ستايل شريط الفلاتر موجود فعلاً', () => {
  it('الأصناف مكتوبة بـstyles.css — الملف اللي ينشحن فعلاً', () => {
    for (const cls of ['.quotes-filters', '.qf-chip', '.qf-row', '.qf-accounts-bar', '.qf-clear']) {
      expect(css, cls).toContain(cls);
    }
  });

  it('والمؤشَّر له إطار واضح', () => {
    expect(css).toMatch(/\.qf-chip\.on\s*\{[^}]*border:\s*2px solid var\(--navy\)/);
  });
});
