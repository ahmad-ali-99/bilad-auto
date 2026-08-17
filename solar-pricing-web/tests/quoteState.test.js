import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const builder = fs.readFileSync(path.join(HERE, '../src/pages/QuoteBuilder.jsx'), 'utf8');
const app = fs.readFileSync(path.join(HERE, '../src/App.jsx'), 'utf8');
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
const draftBlock = builder.slice(builder.indexOf('const draftState = {'));
const draftFields = new Set(
  [...draftBlock.slice(0, draftBlock.indexOf('\n  };')).matchAll(/[\s{](\w+),/g)].map((m) => m[1])
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

  it('الأعداد اليدوية تنحفظ بالمسودة — التنقل بين القوائم ما يرجّعها للحساب التلقائي', () => {
    expect(draftFields.has('unitCounts'), 'unitCounts لازم ينحفظ بالمسودة').toBe(true);
    expect(builder).toMatch(/useState\(savedDraft\?\.unitCounts/);
  });

  it('وضع التعديل بذاكرة الجلسة: ينجو من التنقل وينقطع بإغلاق البرنامج', () => {
    // مو بالمسودة الدائمة — وإلا يبقى بعد الإغلاق ويدعس على عرض قديم بلا علم البياع
    expect(draftFields.has('editingQuote'), 'editingQuote ما ينحفظ بالتخزين الدائم').toBe(false);
    expect(builder).not.toMatch(/savedDraft\?\.editingQuote/);
    // ومو بحالة عابرة — وإلا ينقطع بكل تنقّل ويصير الحفظ عرضاً مكرراً
    expect(builder).toMatch(/sessionStorage\.getItem\(EDIT_KEY\)/);
    expect(builder).toMatch(/sessionStorage\.setItem\(EDIT_KEY/);
    expect(builder).toMatch(/sessionStorage\.removeItem\(EDIT_KEY\)/);
    expect(builder).toMatch(/useState\(readEditingQuote\)/);
    // وينكتب مع كل تغيير — مو بمكان واحد ينُسى
    expect(builder).toMatch(/writeEditingQuote\(editingQuote\);?\s*\n\s*\}, \[editingQuote\]\)/);
  });

  it('المسودة تنكتب فوراً عند مغادرة الصفحة — آخر نص ثانية من الكتابة ما تضيع', () => {
    expect(builder).toMatch(/pagehide/);
    // مؤقت التأجيل ينلغي مع فكّ الصفحة، فلازم كتابة صريحة بالتنظيف
    const flush = builder.slice(builder.indexOf('const flush = () =>'));
    expect(flush.slice(0, flush.indexOf('}, []);'))).toMatch(/return \(\) => \{[\s\S]*flush\(\);/);
  });

  it('التعبئة تنطبق مرة وحدة — الرجوع للصفحة ما يعيد دعس عرض مفتوح على شغل البياع', () => {
    // الحارس لازم يكون **بمستوى الوحدة**: أي مرجع داخل المكوّن ينمسح مع فكّ الصفحة
    expect(builder).toMatch(/^let lastAppliedPrefill = null;/m);
    const eff = builder.slice(builder.indexOf('if (!prefill) return;'));
    const body = eff.slice(0, eff.indexOf('}, [prefill'));
    expect(body).toMatch(/if \(lastAppliedPrefill === stamp\) return;/);
    expect(body).toMatch(/lastAppliedPrefill = stamp;[\s\S]*applyPrefill\(prefill\)/);
    // وApp يمسحها من حالته بعد الاستهلاك
    expect(app).toMatch(/onPrefillUsed=\{\(\) => setQuotePrefill\(null\)\}/);
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

// ==== تذكير حفظ العرض ====
// المسودة المحلية تحمي المكتوب من الضياع، بس العرض ما ينحفظ بقاعدة البيانات إلا
// بالزر — وبدون حفظ يرجع البياع فيلگى الأعداد انحسبت من جديد بدل ما ترجع مثل
// ما تركها. فصار البرنامج يذكّره بالحفظ ويسأله قبل ما يغادر الصفحة.
describe('البرنامج يطلب حفظ العرض', () => {
  it('التذكير يطلع بس إذا أكو عرض محسوب وما انحفظ', () => {
    expect(builder).toContain('const unsaved = !!draft && draft.items.length > 0 && !savedSnapshot');
    expect(builder).toContain('save-nudge');
    expect(builder).toContain('ما محفوظ');
  });

  it('التذكير يختفي بالحفظ ويرجع بأي تعديل بعده', () => {
    // الحفظ والتحديث يثبّتان لقطة المدخلات
    expect((builder.match(/setSavedSnapshot\(inputsKey\)/g) || []).length).toBe(2);
    // وأي تغيير بالمدخلات يفكّ اللقطة
    expect(builder).toContain('setSavedSnapshot((prev) => (prev != null && prev !== inputsKey ? null : prev))');
  });

  it('زر الحفظ بالتذكير يحدّث العرض المفتوح مو ينشئ نسخة ثانية', () => {
    expect(builder).toContain('onClick={editingQuote ? handleUpdate : handleSave}');
  });

  it('التطبيق يسأل قبل مغادرة صفحة العرض وهو ما محفوظ', () => {
    expect(builder).toContain('onUnsavedChange');
    expect(app).toContain('onUnsavedChange={setQuoteUnsaved}');
    expect(app).toContain('function goToPage(next)');
    expect(app).toContain("page === 'quote' && quoteUnsaved");
    // كل أزرار التنقل تمرّ بالبوابة — وإلا انفلت التنقل من زر
    expect(app).not.toMatch(/className=\{page === p\.key \? 'active' : ''\} onClick=\{\(\) => setPage\(p\.key\)\}/);
  });
});

// ==== ثبات مجموع التقسيط ====
describe('التقسيط يرجع بنفس المجموع', () => {
  it('النسبة والأشهر تنثبتان بالمسودة بعد أول حساب', () => {
    expect(builder).toContain('if (inst && !debouncedInputs.installmentRate) setInstallmentRate(String(inst.rate))');
    expect(builder).toContain('if (inst && !debouncedInputs.installmentMonths) setInstallmentMonths(String(inst.months))');
  });

  it('تبديل المصرف يفكّ التثبيت — وإلا بقيت نسبة المصرف القديم', () => {
    expect(builder).toContain('function changeInstallmentPlan(next)');
    expect(builder).toContain('changeInstallmentPlan(pl.key)');
    const fn = builder.slice(builder.indexOf('function changeInstallmentPlan(next)'));
    const body = fn.slice(0, fn.indexOf('\n  }'));
    expect(body).toContain("setInstallmentRate('')");
    expect(body).toContain("setInstallmentMonths('')");
  });

  it('النسبة والأشهر والمواد المختارة كلها بذاكرة المسودة', () => {
    for (const f of ['installment', 'installmentPlan', 'installmentRate', 'installmentMonths',
                     'overrides', 'secondarySel', 'unitCounts', 'extraUnits', 'notes', 'tier']) {
      expect(draftFields.has(f), `${f} مو بذاكرة المسودة`).toBe(true);
    }
  });
});
