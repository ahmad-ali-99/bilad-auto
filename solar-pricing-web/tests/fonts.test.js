import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// الخلل اللي جاب هذا الملف: صفحة الغلاف تستعمل font-weight: 800 بينما main.jsx
// يحمّل 400/600/700 فقط. المتصفح «يزيّف» الوزن الناقص بالضغط على الحرف، وبالخط
// العربي المتصل هذا يلزق الحروف ويطلعها مدهونة بملف الـPDF — وأندرويد يزيّف
// بعنف أكثر من iOS، ولهذا كان الفرق بين الجهازين.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, p), 'utf8');

const mainSrc = read('../src/main.jsx');
const SHEETS = {
  'invoiceHtml.js': read('../src/lib/invoiceHtml.js'),
  'structureDiagram.js': read('../src/lib/structureDiagram.js'),
};

const loadedWeights = new Set(
  [...mainSrc.matchAll(/@fontsource\/cairo\/(\d+)\.css/g)].map((m) => Number(m[1]))
);

const weightsUsedIn = (src) =>
  new Set([
    ...[...src.matchAll(/font-weight:\s*(\d+)/g)].map((m) => Number(m[1])),
    ...[...src.matchAll(/fontWeight:\s*(\d+)/g)].map((m) => Number(m[1])),
  ]);

describe('أوزان خط Cairo بصفحات الـPDF', () => {
  it('main.jsx يحمّل أوزاناً فعلاً', () => {
    expect(loadedWeights.size).toBeGreaterThan(2);
    expect(loadedWeights.has(800), 'الوزن 800 مستعمل بصفحة الغلاف ولازم يتحمّل').toBe(true);
  });

  for (const [name, src] of Object.entries(SHEETS)) {
    it(`${name}: كل وزن مستعمل محمّل — ماكو وزن يتركه المتصفح للتزييف`, () => {
      const missing = [...weightsUsedIn(src)].filter((w) => !loadedWeights.has(w));
      expect(
        missing,
        `أوزان مستعملة بـ${name} وغير محمّلة بـmain.jsx: ${missing.join('، ')} — ` +
          'أضف import "@fontsource/cairo/<الوزن>.css" وإلا الحروف العربية تنلزق بالـPDF'
      ).toEqual([]);
    });

    it(`${name}: يمنع التزييف بـfont-synthesis: none`, () => {
      expect(src).toMatch(/font-synthesis:\s*none/);
    });
  }
});

describe('انتظار الخط قبل الالتقاط', () => {
  const pdfSrc = read('../src/lib/pdfExport.js');

  it('كل نداء html2canvas يسبقه ضمان تحميل الخط العربي', () => {
    const calls = [...pdfSrc.matchAll(/html2canvas\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const guards = [...pdfSrc.matchAll(/ensureArabicFont\(/g)];
    // تعريف الدالة + نداء لكل موضع التقاط
    expect(guards.length).toBeGreaterThanOrEqual(calls.length + 1);
  });

  it('طلب الخط يستعمل نصاً عربياً — الطلب بنص لاتيني ما يجيب الشريحة العربية', () => {
    const m = pdfSrc.match(/document\.fonts\.load\([^)]*\)/);
    expect(m, 'ماكو document.fonts.load بـpdfExport.js').toBeTruthy();
    expect(m[0]).toMatch(/[؀-ۿ]/);
  });

  it('ما بقت انتظارة fonts.ready وحدها قبل الالتقاط', () => {
    // fonts.ready تنحل فوراً إذا ماكو طلب معلّق — لازم تجي داخل ensureArabicFont فقط
    const bare = [...pdfSrc.matchAll(/await document\.fonts\.ready/g)];
    expect(bare.length, 'انتظارة fonts.ready لازم تكون بمكان واحد داخل ensureArabicFont').toBe(1);
  });
});
