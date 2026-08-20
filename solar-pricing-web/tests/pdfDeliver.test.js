import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(HERE, '../src/lib/pdfExport.js'), 'utf8');
const builder = fs.readFileSync(path.join(HERE, '../src/pages/QuoteBuilder.jsx'), 'utf8');
const customer = fs.readFileSync(path.join(HERE, '../src/pages/CustomerView.jsx'), 'utf8');

// العطل المُبلَّغ: بمتصفح التلفون `navigator.share` ما رجّع أبداً (لا نجاح ولا خطأ)
// لأن «لمسة المستخدم» تنتهي أثناء توليد الملف — فبقى شريط التحميل يلف بلا نهاية.
describe('التصدير بالتلفون ما يعلّق بلا نهاية', () => {
  it('المشاركة منسابقة بمهلة — ماكو await عارية على navigator.share', () => {
    expect(src).toContain('function shareWithTimeout');
    expect(src).toContain('SHARE_TIMED_OUT');
    // ماكو نداء مباشر بلا حارس داخل deliverPdf
    const deliver = src.slice(src.indexOf('export async function deliverPdf'));
    const body = deliver.slice(0, deliver.indexOf('\n}'));
    expect(body).toContain('shareWithTimeout(pdfFile, fileName)');
    expect(body).not.toMatch(/await navigator\.share\(/);
  });

  it('انتهاء المهلة يفتح نافذة الخيارات مو يرمي خطأ', () => {
    const deliver = src.slice(src.indexOf('export async function deliverPdf'));
    const body = deliver.slice(0, deliver.indexOf('\n}'));
    expect(body).toContain('showDeliverDialog({ pdfFile, blob, fileName, allowShare: true })');
  });

  it('الإلغاء من المستخدم يبقى إلغاءً مو خطأ', () => {
    expect(src).toContain("outcome.name === 'AbortError'");
  });

  it('لوحة المشاركة إذا انفتحت فعلاً ما تنقطع بالمهلة', () => {
    // فقدان تركيز الصفحة = اللوحة مفتوحة والدور على المستخدم
    expect(src).toContain("window.addEventListener('blur', onLeave");
    expect(src).toContain("document.addEventListener('visibilitychange', onLeave");
    expect(src).toContain('if (!sheetOpened) resolve(SHARE_TIMED_OUT)');
  });

  it('شريط التحميل يطفى وقت انتظار المستخدم — مو وقت انتظار الجهاز', () => {
    expect(src).toContain('function stopBusyIndicator');
    // يُنادى بمكانين: عند فتح لوحة المشاركة، وعند فتح نافذة الخيارات
    expect([...src.matchAll(/stopBusyIndicator\(\)/g)].length).toBeGreaterThanOrEqual(3);
  });

  it('المهلة معقولة — لا قصيرة تقطع اللوحة ولا طويلة تخلي البياع ينتظر', () => {
    const m = src.match(/const SHARE_TIMEOUT_MS = (\d+);/);
    expect(m).toBeTruthy();
    const ms = Number(m[1]);
    expect(ms).toBeGreaterThanOrEqual(8000);
    expect(ms).toBeLessThanOrEqual(20000);
  });
});

describe('حارس عام: التصدير والحفظ ما يعلقون', () => {
  it('شاشة الموظف تحرس التصدير والحفظ', () => {
    expect(builder).toContain('const EXPORT_TIMEOUT_MS = 60000');
    expect(builder).toContain('function withTimeout');
    expect([...builder.matchAll(/withTimeout\(/g)].length).toBeGreaterThanOrEqual(3);
  });
  it('الرسالة تدل البياع على زر تحديث النسخة', () => {
    expect(builder).toContain('🔄');
  });
  it('شاشة الزبون محروسة هي هم', () => {
    expect(customer).toContain('التصدير طوّل أكثر من 60 ثانية');
  });
});

// العطل الثاني المُبلَّغ: التصدير من صفحة «العروض» يشتغل ومن الشاشة الرئيسية لا.
// السبب: exportDraftPdf كان ينادي `supabase.auth.getUser()` — وهو **نداء شبكة**
// لخادم المصادقة — بينما exportPdf (العروض) ما ينادي المصادقة إطلاقاً.
// بتلفون على شبكة ضعيفة النداء يبقى معلّقاً بلا مهلة، فيعلّق التصدير كله.
describe('التصدير ما يعتمد على نداء مصادقة شبكي', () => {
  const dataApi = fs.readFileSync(path.join(HERE, '../src/lib/dataApi.js'), 'utf8');
  const log = fs.readFileSync(path.join(HERE, '../src/lib/activityLog.js'), 'utf8');

  it('ماكو نداء getUser مباشر بطبقة البيانات — كله يمر بـcurrentUser', () => {
    const direct = [...dataApi.matchAll(/supabase\.auth\.getUser\(\)/g)];
    // نداء واحد بس: الفولباك المحروس داخل currentUser نفسها
    expect(direct.length).toBe(1);
    const helper = dataApi.slice(dataApi.indexOf('async function currentUser()'));
    expect(helper.slice(0, helper.indexOf('\n}\n'))).toContain('supabase.auth.getUser()');
  });

  it('الجلسة المحلية أولاً — بلا شبكة', () => {
    const helper = dataApi.slice(dataApi.indexOf('async function currentUser()'));
    const body = helper.slice(0, helper.indexOf('\n}\n'));
    expect(body.indexOf('getSession()')).toBeLessThan(body.indexOf('getUser()'));
  });

  it('الفولباك الشبكي محروس بمهلة وما يرمي', () => {
    expect(dataApi).toContain('AUTH_NETWORK_TIMEOUT_MS');
    const helper = dataApi.slice(dataApi.indexOf('async function currentUser()'));
    const body = helper.slice(0, helper.indexOf('\n}\n'));
    expect(body).toContain('Promise.race');
    expect(body).toContain('return null');
  });

  it('مسار التصدير يستعمل currentUser مو النداء الخام', () => {
    const fn = dataApi.slice(dataApi.indexOf('async exportDraftPdf(input)'));
    const body = fn.slice(0, fn.indexOf('\n    },'));
    expect(body).toContain('const pdfUser = await currentUser();');
    expect(body).not.toContain('supabase.auth.getUser()');
  });

  it('سجل الحركات ما يوقف العملية بنداء شبكة', () => {
    expect(log).not.toContain('supabase.auth.getUser()');
    expect(log).toContain('supabase.auth.getSession()');
  });
});
