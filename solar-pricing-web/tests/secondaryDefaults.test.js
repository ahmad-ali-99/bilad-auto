import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSecondaryDefaults } from '../src/lib/secondaryDefaults.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, '..', p), 'utf8');
const modal = read('src/components/SecondaryPickerModal.jsx');
const builder = read('src/pages/QuoteBuilder.jsx');

const SEC = [
  { id: 20, category: 'secondary', model: 'هيكل الألواح', unit: 'عدد', price: 65000, qty_per_panel: 1 },
  { id: 21, category: 'secondary', model: 'صبات كونكريت', unit: 'عدد', price: 25000, qty_per_panel: 2 },
  { id: 22, category: 'secondary', model: 'بوردة حماية DC', unit: 'عدد', price: 150000, qty_per_panel: null },
  { id: 23, category: 'secondary', model: 'مانعة صواعق', unit: 'عدد', price: 120000, qty_per_panel: null },
  { id: 24, category: 'secondary', model: 'صندوق توزيع AC', unit: 'عدد', price: 180000, qty_per_panel: null },
];
const ids = (sel) => Object.keys(sel).map(Number).sort((a, b) => a - b);

describe('القائمة الافتراضية المعتمدة للمواد الثانوية', () => {
  it('بلا قائمة معتمدة: المحسوب — مواد الألواح + بوردة الحماية', () => {
    expect(ids(computeSecondaryDefaults(SEC, null, 'full'))).toEqual([20, 21, 22]);
  });

  it('القائمة المعتمدة تتقدّم على المحسوب حرفياً', () => {
    expect(ids(computeSecondaryDefaults(SEC, [20, 23, 24], 'full'))).toEqual([20, 23, 24]);
  });

  // «اعتماد» بلا تأشير كان يرجّع المحسوب فما يسوي شي
  it('قائمة معتمدة فارغة تعني ماكو ثانوية افتراضية — مو رجوع للمحسوب', () => {
    expect(ids(computeSecondaryDefaults(SEC, [], 'full'))).toEqual([]);
  });

  it('مادة انحذفت من المخزون تنشال من المعتمدة بلا ما تكسرها', () => {
    expect(ids(computeSecondaryDefaults(SEC, [20, 99], 'full'))).toEqual([20]);
  });

  it('بالأوف جرد تنقّى مواد جهة الألواح من المعتمدة', () => {
    expect(ids(computeSecondaryDefaults(SEC, [20, 21, 22, 23], 'offgrid'))).toEqual([23]);
  });
});

// الشكوى: «اعتماد كافتراضي دائم للكل» ثم «عرض جديد» يرجع للقائمة القديمة.
// السبب: شاشة العرض تحسب الافتراضيات مرة وحدة عند فتحها وتخزنها بمرجع، والاعتماد
// كان يكتب بقاعدة البيانات بلا ما يخبر الشاشة — فيبقى المرجع قديماً لحد ما تنعاد
// تحميل الصفحة.
describe('الاعتماد ينطبق فوراً بلا إعادة تحميل', () => {
  it('النافذة تبلّغ الشاشة بالقائمة الجديدة بعد الحفظ', () => {
    expect(modal, 'البروب لازم ينفكّ بالتوقيع وإلا بقى undefined بصمت')
      .toMatch(/function SecondaryPickerModal\(\{[^}]*onDefaultsSaved[^}]*\}\)/);
    expect(modal).toContain('if (onDefaultsSaved) onDefaultsSaved(ids)');
    // البلاغ بعد نجاح الكتابة مو قبلها
    const fn = modal.slice(modal.indexOf('async function saveAsDefaults'));
    const body = fn.slice(0, fn.indexOf('\n  }'));
    expect(body.indexOf("config.set('secondary_defaults'")).toBeLessThan(body.indexOf('onDefaultsSaved(ids)'));
  });

  it('شاشة العرض تحدّث المرجعين حتى «عرض جديد» ياخذ الجديد', () => {
    expect(builder).toContain('onDefaultsSaved={(ids) => {');
    expect(builder).toContain('savedSecondaryIdsRef.current = ids');
    expect(builder).toContain('secondaryDefaultsRef.current = computeSecondaryDefaults(secondaryMaterials, ids, systemTypeRef.current)');
  });

  it('«عرض جديد» ياخذ الافتراضيات من المرجع مو من قائمة مكتوبة بالإيد', () => {
    expect(builder).toContain('setSecondarySel(s.secondarySel ?? secondaryDefaultsRef.current)');
  });
});
