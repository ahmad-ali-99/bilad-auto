import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/pages/QuoteBuilder.jsx', import.meta.url), 'utf8');

describe('مبلغ الوصول موصول بكل مسارات الشاشة', () => {
  it('الحالة موجودة ومحفوظة بالمسودة ومستعادة من العرض المحفوظ', () => {
    expect(src).toContain('const [targetTotal, setTargetTotal]');
    expect(src).toContain('const [targetVisible, setTargetVisible]');
    expect(src).toContain('savedDraft?.targetTotal');
    expect(src).toMatch(/setTargetTotal\(s\.targetTotal/);
    expect(src).toMatch(/setTargetTotal\(Number\(a\.targetTotal\)/);
  });

  it('ينمرّر بموقعَي تجميع النِسَب سوية — المعاينة والحفظ/التصدير', () => {
    // الموقعان الفعليان: حمولة المعاينة (بمدخلات مؤجّلة) وحمولة الحفظ/التصدير
    expect(src, 'المعاينة').toMatch(/targetTotal: Number\(debouncedInputs\.bankRound\) > 0/);
    expect(src, 'الحفظ/التصدير').toMatch(/targetTotal: Number\(bankRoundOverride \?\? bankRound\) > 0/);
    expect((src.match(/targetVisible: /g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('صلاحية التسعير تحكمه — بس تقريب المصرف يسبقها', () => {
    // التقريب مطلب مصرف لا خصماً تقديرياً، فيمر لكل حساب. وبلا هذا السبق
    // كان البياع يضغط «زيادة لأقرب مليون» والقيمة تنرمى بصمت
    expect(src).toMatch(/Number\(bankRoundOverride \?\? bankRound\) > 0/);
    expect(src).toMatch(/mayPriceAdjust \? Number\(targetTotal\) \|\| 0 : 0/);
  });

  it('غير علني افتراضاً — السويج يبدأ مطفياً', () => {
    expect(src).toContain('targetVisible: false');
  });
});

describe('تنبيه المصرف', () => {
  it('يشتغل بالتقسيط فقط وعلى مبلغ النقد', () => {
    expect(src).toContain('if (!installment) return null;');
    expect(src).toContain('draft?.installment?.cashTotal');
    expect(src).toContain('bankRoundOptions(cash)');
  });

  it('يوقف التصدير أول مرة، وبعد القرار يصدّر بلا فحص ثانٍ', () => {
    expect(src).toMatch(/if \(!roundTo\) \{\s*\n\s*const ask = bankCheck\(\);\s*\n\s*if \(ask\) \{ setBankAsk\(ask\); return; \}/);
  });

  it('القرار يصدّر فوراً بنفس المبلغ — بلا ضغطة ثانية وبلا انتظار المعاينة', () => {
    expect(src).toContain('function resolveBank(amount)');
    expect(src).toContain('setBankRound(String(amount))');
    expect(src).toContain('handleExportPdf(amount)');
    expect(src).toContain('exportDraftPdf(buildBaseInput(roundTo))');
  });

  it('والتقريب ينمسح لما ينطفي التقسيط', () => {
    expect(src).toMatch(/if \(!e\.target\.checked\) setBankRound\(''\)/);
  });

  it('وأكو مخرج «صدّر مثل ما هو»', () => {
    expect(src).toContain('صدّر مثل ما هو');
  });
});
