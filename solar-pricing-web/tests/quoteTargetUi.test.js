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
    const passes = (src.match(/targetTotal: mayPriceAdjust \?/g) || []).length;
    expect(passes, 'المعاينة + الحفظ').toBe(2);
    expect((src.match(/targetVisible: /g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('صلاحية التسعير تحكمه مثل الزيادة والخصم', () => {
    expect(src).toMatch(/targetTotal: mayPriceAdjust \? Number\([^)]+\) \|\| 0 : 0/);
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

  it('يوقف التصدير أول مرة ثم يسمح فيه بعد القرار', () => {
    expect(src).toMatch(/const ask = bankCheck\(\);\s*\n\s*if \(ask && !bankAsk\) \{ setBankAsk\(ask\); return; \}/);
  });

  it('القرار ينكتب بمبلغ الوصول فينزل بأسعار البنود', () => {
    expect(src).toContain('function resolveBank(amount)');
    expect(src).toContain('setTargetTotal(String(amount))');
  });

  it('وأكو مخرج «صدّر مثل ما هو»', () => {
    expect(src).toContain('صدّر مثل ما هو');
  });
});
