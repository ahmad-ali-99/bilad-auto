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

describe('توقيع الطرفين — نسخة المصرف وحدها', () => {
  it('نسخة المصرف بيها خانتا توقيع: الشركة والزبون', () => {
    const h = html('bank', { ...INST, plan: 'ahli', label: 'المصرف الأهلي العراقي' });
    expect(h).toContain('الطرف الأول — بلاد اوتو');
    expect(h).toContain('الطرف الثاني — طالب التمويل');
    expect(h).toContain('التوقيع والختم:');
    expect(h).toContain('التوقيع:');
    // اسم المدير واسم الزبون كل واحد بخانته
    expect(h).toContain('حيدر');
    expect(h).toContain('علي حسن');
    // خطّان فارغان للتوقيع — واحد لكل طرف
    expect((h.match(/class="blank"/g) || []).length).toBe(2);
  });

  it('والنسختان الثانيتان تبقيان بتذييل الشركة مثل ما هو', () => {
    for (const copy of ['client', 'cash']) {
      const h = html(copy);
      expect(h, copy).toContain('توقيع وختم الشركة');
      expect(h, copy).not.toContain('الطرف الثاني — طالب التمويل');
    }
  });

  it('ماكو تذييل مكرر — نسخة المصرف بلا بلوك الشركة القديم', () => {
    const h = html('bank');
    expect(h).not.toContain('توقيع وختم الشركة');
  });
});

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

  // **العنونة تروح للمصرف الحقيقي لا لاسم الخطة**: «مبادرة البنك المركزي»
  // خطة تمويل تُدار عبر المصرف الأهلي العراقي — مو مصرفاً يُعنون له كتاب.
  it('كل خطة تنعنون للمصرف اللي يستلم فعلاً', () => {
    const expected = {
      company: 'مصرف النهرين',
      ahli: 'المصرف الأهلي العراقي',
      cbi: 'المصرف الأهلي العراقي',
    };
    for (const plan of Object.keys(INSTALLMENT_PLANS)) {
      const h = html('bank', { ...INST, plan, label: INSTALLMENT_PLANS[plan], addressee: addressBankLabel(plan) });
      expect(h, plan).toContain(`إلى / ${expected[plan]} المحترم`);
    }
  });

  it('**ولا ورقة تنعنون «إلى / مبادرة البنك المركزي»** — جهة ما تستلم كتاباً', () => {
    const h = html('bank', { ...INST, plan: 'cbi', label: INSTALLMENT_PLANS.cbi, addressee: addressBankLabel('cbi') });
    expect(h).not.toContain('إلى / مبادرة البنك المركزي');
  });

  it('وبلا addressee محفوظ (عرض قديم) العنونة تنشتق من الخطة نفسها', () => {
    expect(html('bank', { ...INST, plan: 'cbi', label: INSTALLMENT_PLANS.cbi })).toContain('إلى / المصرف الأهلي العراقي المحترم');
    expect(html('bank', { ...INST, plan: 'ahli' })).toContain('إلى / المصرف الأهلي العراقي المحترم');
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
