import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getExportMethod, setExportMethod, prefersPrintExport, prefersSvgRender, EXPORT_METHODS } from '../src/lib/exportMethod.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(HERE, '../src/lib/pdfExport.js'), 'utf8');
const src2 = fs.readFileSync(path.join(HERE, '../src/lib/exportMethod.js'), 'utf8');
const settings = fs.readFileSync(path.join(HERE, '../src/pages/Settings.jsx'), 'utf8');
const structure = fs.readFileSync(path.join(HERE, '../src/lib/structure3d.js'), 'utf8');

function fakeStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  return map;
}

describe('طريقة التصدير — تفضيل هذا الجهاز', () => {
  beforeEach(() => fakeStorage());

  // الافتراضي للكل صار **الخفيف** بعد ما تأكد المستخدم إنه يشتغل عنده مثل
  // القديم بالضبط، وهو أخف ذاكرةً وما يمر على انتظارات html2canvas المفتوحة.
  it('الافتراضي المحرك الخفيف — بلا أي إعداد مخزون', () => {
    expect(getExportMethod()).toBe('svg');
    expect(prefersSvgRender()).toBe(true);
    expect(prefersPrintExport()).toBe(false);
    expect(localStorage.getItem('export_method')).toBeNull();
  });

  it('التبديل ينحفظ، والرجوع للافتراضي يمسح المفتاح', () => {
    setExportMethod('canvas');
    expect(getExportMethod()).toBe('canvas');
    expect(prefersSvgRender()).toBe(false);
    setExportMethod('print');
    expect(prefersPrintExport()).toBe(true);
    setExportMethod('svg');
    expect(getExportMethod()).toBe('svg');
    expect(localStorage.getItem('export_method')).toBeNull();
  });

  it('قيمة غريبة بالتخزين تنقرأ كالافتراضي مو كخطأ', () => {
    localStorage.setItem('export_method', 'شي غريب');
    expect(getExportMethod()).toBe('svg');
  });

  it('التخزين المحجوب (تصفح خاص) ما يكسر التطبيق', () => {
    globalThis.localStorage = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
    };
    expect(getExportMethod()).toBe('svg');
    expect(() => setExportMethod('print')).not.toThrow();
  });

  it('الافتراضي أول القائمة، وبكل خيار شرح للمستخدم', () => {
    expect(EXPORT_METHODS.map((m) => m.key)).toEqual(['svg', 'canvas', 'print']);
    expect(EXPORT_METHODS[0].label).toContain('الافتراضي');
    for (const m of EXPORT_METHODS) expect(m.hint.length).toBeGreaterThan(20);
  });

  it('الخيار مفتوح لكل الحسابات — ماكو حارس حساب عليه', () => {
    // الجهاز اللي يتعثّر عنده الرسم لازم صاحبه يبدّل طريقته بنفسه. كان
    // محصوراً بحساب واحد، يعني أي بياع يتعطّل عنده التصدير ما عنده مخرج.
    expect(settings).toContain('محرك تصدير ملف العرض');
    expect(settings).not.toContain('isOwner');
    expect(settings).not.toContain('isOwnerAccount');
  });

  it('وتفضيل محلي لهذا الجهاز — ما ينحفظ بقاعدة البيانات ولا يمس حساباً ثانياً', () => {
    // التخزين بذاكرة المتصفح: كل جهاز يدير طريقته وما يتغيّر للكل
    expect(src2).toContain('localStorage.getItem(KEY)');
    expect(src2).toContain('localStorage.setItem(KEY, value)');
    expect(src2).not.toMatch(/supabase|app_config|api\.config/);
    // والبطاقة برّا الـfieldset المعطّل — تشتغل حتى للحسابات اللي ما تعدّل إعدادات
    const card = settings.indexOf('محرك تصدير ملف العرض');
    const fieldset = settings.indexOf('<fieldset disabled={!canEdit}');
    expect(card).toBeLessThan(fieldset);
  });

  it('لو ما وصلت حزمة المحرك الخفيف نرجع للاعتيادي مو نفشل', () => {
    const fn = src.slice(src.indexOf('async function renderSheet'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('const withCanvas = ()');
    expect(body).toMatch(/catch \{\s*return withCanvas\(\);/);
  });

  it('التصدير يحترم التفضيل قبل ما يجرّب الكانفاس', () => {
    const fn = src.slice(src.indexOf('export async function exportInvoicePdf'));
    const head = fn.slice(0, fn.indexOf("renderSheet('رسم صفحة الفاتورة'"));
    expect(head).toContain('if (prefersPrintExport())');
    expect(head).toContain('return printPages(await printBlocks(),');
    // وماكو توجيه تلقائي حسب المتصفح — انشال بطلب المستخدم
    expect(head).not.toMatch(/if \(isIosSafari\(\)\)/);
  });

  it('الخيار برّا fieldset المعطّل — تفضيل جهاز مو إعداد مشترك', () => {
    const card = settings.indexOf('محرك تصدير ملف العرض');
    const fieldset = settings.indexOf('<fieldset disabled={!canEdit}');
    expect(card).toBeGreaterThan(-1);
    expect(card).toBeLessThan(fieldset);
  });
});

// قياس فعلي بمحرك سفاري: ذروة 8.96 مليون بكسل (≈34 ميغا) وتسعة كانفاسات
// باقية حيّة بالنهاية — ولا بايت ينتحرر. أندرويد يتحملها، وiOS ميزانيته أضيق.
describe('تحرير ذاكرة الكانفاس', () => {
  it('كل كانفاس ينتحرر بعد ما ناخذ منه الصورة', () => {
    expect(src).toContain('function releaseCanvas');
    // الفاتورة (صفحة وحدة، وملائمة، وتقطيع) وصفحة التصميم والشرائح
    expect((src.match(/releaseCanvas\(/g) || []).length).toBeGreaterThanOrEqual(6);
    // ماكو toDataURL يمر بلا تحرير بعده
    const calls = [...src.matchAll(/toDataURL\('image\/jpeg', 0\.92\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const m of calls) {
      const after = src.slice(m.index, m.index + 300);
      expect(after).toContain('releaseCanvas');
    }
  });

  it('سياق الـWebGL ينتحرر — dispose() لوحدها ما تحرر المخزن ولا السياق', () => {
    expect(structure).toContain("getExtension('WEBGL_lose_context')");
    expect(structure).toContain('lose?.loseContext()');
    const at = structure.indexOf('lose?.loseContext()');
    const after = structure.slice(at, at + 300);
    expect(after).toContain('canvas.width = 0;');
    expect(after).toContain('canvas.height = 0;');
  });

  it('دقة رندر الهيكل 1.5 مو 2 — نص الذاكنة بلا فرق مرئي', () => {
    expect(structure).toContain('renderer.setPixelRatio(1.5)');
  });
});
