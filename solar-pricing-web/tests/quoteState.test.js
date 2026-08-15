import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const builder = fs.readFileSync(path.join(HERE, '../src/pages/QuoteBuilder.jsx'), 'utf8');
const dataApi = fs.readFileSync(path.join(HERE, '../src/lib/dataApi.js'), 'utf8');
const prefill = fs.readFileSync(path.join(HERE, '../src/lib/editPrefill.js'), 'utf8');

// حقول BLANK — مصدر واحد لتصفير الشاشة
const blankBody = builder.slice(builder.indexOf('const BLANK = {'));
const blankFields = new Set(
  blankBody
    .slice(0, blankBody.indexOf('\n};'))
    .replace(/\{[^{}]*\}/g, '{}')       // نشيل الكائنات المتداخلة حتى ما تدخل مفاتيحها
    .match(/(\w+):/g)
    .map((m) => m.slice(0, -1))
);
// الحقول اللي تنحفظ بمسودة localStorage
const draftBlock = builder.slice(builder.indexOf('JSON.stringify({'), builder.indexOf('JSON.stringify({') + 900);
const draftFields = new Set(
  [...draftBlock.matchAll(/[\s{](\w+),/g)].map((m) => m[1]).filter((f) => f !== 'JSON')
);

describe('حالة العرض معزولة بين العروض', () => {
  it('BLANK يغطي كل حقل ينحفظ بالمسودة — ماكو حقل ينُسى عند التصفير', () => {
    expect(blankFields.size).toBeGreaterThan(15);
    const missing = [...draftFields].filter((f) => !blankFields.has(f));
    expect(
      missing,
      'حقول تنحفظ بالمسودة وما موجودة بـBLANK — راح تتسرّب من عرض لعرض: ' + missing.join('، ')
    ).toEqual([]);
  });

  it('وضع التعديل والأعداد اليدوية ما ينحفظان بالمسودة (ينقطعان عند الإغلاق)', () => {
    expect(draftFields.has('editingQuote'), 'editingQuote لازم ما ينحفظ').toBe(false);
    expect(draftFields.has('unitCounts'), 'unitCounts لازم ما ينحفظ').toBe(false);
    // ولا يُقرآن من المسودة عند التشغيل
    expect(builder).not.toMatch(/savedDraft\?\.editingQuote/);
    expect(builder).not.toMatch(/savedDraft\?\.unitCounts/);
  });

  it('«عرض جديد» يمرّ من applyQuoteState(BLANK) مو من قائمة تصفير بالإيد', () => {
    const fn = builder.slice(builder.indexOf('function startNewQuote()'));
    const body = fn.slice(0, fn.indexOf('\n  }'));
    expect(body).toContain('applyQuoteState(BLANK)');
    // ماكو setX مباشر داخلها (غير مسح المسودة) — القائمة اليدوية هي اللي نست unitCounts
    const setters = [...body.matchAll(/set[A-Z]\w+\(/g)].map((m) => m[0]);
    expect(setters, 'تصفير يدوي داخل startNewQuote: ' + setters.join(' ')).toEqual([]);
  });

  it('فتح عرض للتعديل = استبدال كامل من BLANK', () => {
    expect(builder).toMatch(/if \(p\.editing\) \{[\s\S]{0,400}applyQuoteState\(\{\s*\.\.\.BLANK/);
  });

  it('اسم الزبون يمشي مع ارتباط التعديل حتى ينكشف تغيّره', () => {
    expect(prefill).toMatch(/editing:\s*\{[\s\S]{0,200}clientName/);
    // حارس القطع موجود ويصفّر الأعداد اليدوية
    expect(builder).toMatch(/if \(!editingQuote\) return undefined;[\s\S]{0,600}setUnitCounts\(\{\}\)/);
  });
});

describe('ملاحظات الضمان ما تتكرر بكل تعديل', () => {
  it('كل نقاط بناء الملاحظات تمرّ بـSet', () => {
    const lines = [...dataApi.matchAll(/const notes = .*warrantyNotes.*/g)].map((m) => m[0]);
    expect(lines.length).toBe(3);
    for (const l of lines) expect(l, l).toContain('new Set(');
  });

  it('السلوك: ملاحظة الضمان المحفوظة ما تنضاف مرة ثانية', () => {
    // نفس تعبير dataApi: [...new Set([...input, ...warranty])]
    const saved = ['الدفعات حسب الاتفاق', 'ضمان الألواح 15 سنة'];
    const warranty = ['ضمان الألواح 15 سنة'];
    expect([...new Set([...saved, ...warranty])]).toEqual(['الدفعات حسب الاتفاق', 'ضمان الألواح 15 سنة']);
  });
});
