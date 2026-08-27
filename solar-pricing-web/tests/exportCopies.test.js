import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildInvoiceInnerHtml } from '../src/lib/invoiceHtml.js';
import { INSTALLMENT_PLANS, addressBankLabel } from '../src/lib/installment.js';

const QUOTE = { quote_number: 431, created_at: '2026-08-26', client_name: 'علي حسن',
  client_phone: '07701234567', location: 'بغداد', required_amp_day: 105, required_amp_night: 20,
  total_price: 50000000 };
const ITEMS = [{ description: 'ألواح', unit: 'عدد', quantity: 50, unit_price: 200000, subtotal: 10000000 }];
const COMPANY = { company_name: 'بلاد اوتو', manager_name: 'حيدر' };
const INST = { plan: 'company', label: 'مصرف النهرين', months: 60, rate: 1.35,
  cashTotal: 50000000, totalWithInterest: 67500000, monthly: 1125000 };
// الجهة المُعنون لها تجي من **خطة التقسيط نفسها** — ماكو اختيار ثانٍ
const html = (copy, inst = INST) => buildInvoiceInnerHtml({
  quote: QUOTE, items: ITEMS, notes: [], company: COMPANY, installment: inst, copy });

describe('النسخة الرسمية للمصرف', () => {
  it('معنونة للجهة المختارة بالتقسيط وباسم الزبون وتفاصيله', () => {
    const h = html('bank', { ...INST, plan: 'ahli', label: 'المصرف الأهلي العراقي' });
    expect(h).toContain('إلى / المصرف الأهلي العراقي المحترم');
    expect(h).toContain('علي حسن');
    expect(h).toContain('07701234567');
    expect(h).toContain('لغرض استحصال الموافقة على التمويل');
  });

  it('النهرين هو الافتراض', () => {
    expect(html('bank')).toContain('إلى / مصرف النهرين المحترم');
    expect(addressBankLabel(undefined)).toBe(INSTALLMENT_PLANS.company);
    expect(addressBankLabel('ahli')).toBe('المصرف الأهلي العراقي');
  });

  it('الخطط الثلاث كلها تنعنون بأسمائها — ماكو خطة بلا عنوان', () => {
    for (const [plan, label] of Object.entries(INSTALLMENT_PLANS))
      expect(html('bank', { ...INST, plan, label }), plan).toContain(`إلى / ${label} المحترم`);
  });

  it('بمبلغ النقد وحده — ماكو قسط ولا مجموع تقسيط', () => {
    const h = html('bank');
    expect(h).toContain('المجموع الكلي نقداً');
    expect(h).toContain('50,000,000');
    expect(h).not.toContain('67,500,000');
    expect(h).not.toContain('القسط الشهري');
  });

  it('المجموع النقدي يطلع دائماً — ورقة بلا سعر ما تنفع للمصرف', () => {
    expect(html('bank')).toContain('50,000,000');
  });
});

describe('النسخة الفنية للزبون', () => {
  it('بيها النقد والقسط سوية وبلا عنونة', () => {
    const h = html('client');
    expect(h).toContain('50,000,000');
    expect(h).toContain('67,500,000');
    expect(h).toContain('القسط الشهري');
    expect(h).not.toContain('المحترم');
  });
});

describe('النسخة التجارية النقدية', () => {
  it('باسم الزبون، نقد وحده، بلا عنونة', () => {
    const h = html('cash');
    expect(h).toContain('علي حسن');
    expect(h).toContain('المجموع الكلي نقداً');
    expect(h).not.toContain('المحترم');
    expect(h).not.toContain('67,500,000');
    expect(h).not.toContain('القسط الشهري');
  });
});

describe('بلا تقسيط ما يتغير شي', () => {
  it('ورقة وحدة بالسلوك القديم', () => {
    const h = buildInvoiceInnerHtml({ quote: QUOTE, items: ITEMS, notes: [], company: COMPANY });
    expect(h).toContain('المجموع الكلي');
    expect(h).not.toContain('نقداً');
    expect(h).not.toContain('المحترم');
  });

  it('والتصدير يبني ورقة وحدة بس', () => {
    const src = fs.readFileSync(new URL('../src/lib/pdfExport.js', import.meta.url), 'utf8');
    expect(src).toMatch(/const sheets = installment[\s\S]{0,600}: \[buildInvoiceInnerHtml\(\{ quote, items, notes, company, installment \}\)\];/);
  });
});

describe('الثلاث نسخ توصل للمسارين', () => {
  const src = fs.readFileSync(new URL('../src/lib/pdfExport.js', import.meta.url), 'utf8');
  it('مسار الطباعة ومسار الكانفاس يقرون نفس المصفوفة', () => {
    expect(src).toContain('blocks.push(...sheets)');
    expect(src).toMatch(/for \(const html of sheets\)/);
  });

  it('كل ورقة تنتحرر كانفاسها قبل اللي بعدها', () => {
    const loop = src.slice(src.indexOf('for (const html of sheets)'));
    expect((loop.match(/releaseCanvas\(canvas\)/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('ماكو وسيط مصرف منفصل — الجهة تجي من خطة التقسيط', () => {
    expect(src).toContain("copy: 'bank' }");
    expect(src).not.toContain('addressBank');
  });
});
