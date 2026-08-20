import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(HERE, '../src/lib/pdfExport.js'), 'utf8');
const builder = fs.readFileSync(path.join(HERE, '../src/pages/QuoteBuilder.jsx'), 'utf8');
const customer = fs.readFileSync(path.join(HERE, '../src/pages/CustomerView.jsx'), 'utf8');

// العطل المُبلَّغ من المستخدم بالحرف: «حدث خطأ أثناء التصدير — علقت خطوة رسم صفحة
// الفاتورة». يعني `html2canvas` نفسه علّق بسفاري ماله. الحل ما يكون بتسريع الرسم:
// نستغني عنه ونستعمل طباعة المتصفح نفسها.
describe('مسار الطباعة بديلاً عن رسم الكانفاس', () => {
  it('printPages موجودة وتحقن ورقة الطباعة بالصفحة', () => {
    expect(src).toContain('function printPages');
    expect(src).toContain("host.id = 'print-root'");
    expect(src).toContain('window.print()');
  });

  it('ورقة الطباعة تخفي باقي الشاشة — الفاتورة وحدها تنطبع', () => {
    const fn = src.slice(src.indexOf('function printPages'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('body > *:not(#print-root) { display: none !important; }');
    // هامش صفر: عرض التصميم 794px = A4 على 96dpi بالضبط. بهامش @page يتقلّص
    // العرض المتاح فينضغط الرسم وتنولد صفحة زايدة.
    expect(body).toContain('@page { size: A4; margin: 0; }');
  });

  // انشال بطلب صريح من المستخدم: «رجّع آلية التصدير مثل يوم أمس» — يعني رسم
  // بالكانفاس بكل الأجهزة، والطباعة شبكة أمان أخيرة بس.
  it('ماكو توجيه تلقائي حسب المتصفح — الافتراضي الكانفاس للكل', () => {
    const fn = src.slice(src.indexOf('export async function exportInvoicePdf'));
    const head = fn.slice(0, fn.indexOf("renderSheet('رسم صفحة الفاتورة'"));
    expect(head).not.toMatch(/if \(isIosSafari\(\)\)/);
    // الاستثناء الوحيد تفضيل الجهاز نفسه — اختيار المستخدم مو تخمين المتصفح
    expect(head).toContain('if (prefersPrintExport())');
    // وisIosSafari تبقى مستعملة بتسليم الملف (سفاري يتجاهل download بروابط blob)
    const deliver = src.slice(src.indexOf('function downloadBlob'));
    expect(deliver.slice(0, 500)).toContain('if (isIosSafari())');
  });

  it('بلا تفضيل، الطباعة ما تنداز إلا بعد ما يعلّق الرسم فعلاً', () => {
    const fn = src.slice(src.indexOf('export async function exportInvoicePdf'));
    const drawAt = fn.indexOf("renderSheet('رسم صفحة الفاتورة'");
    // نداء الطباعة اللي بالـcatch لازم يكون بعد الرسم
    const printAt = fn.lastIndexOf('printPages(await printBlocks()');
    expect(drawAt).toBeGreaterThan(-1);
    expect(printAt).toBeGreaterThan(drawAt);
  });

  it('أي متصفح يوقع بخطوة معلّقة يرجع للطباعة بدل ما يرمي الخطأ بوجه المستخدم', () => {
    expect(src).toMatch(/\/علقت خطوة\/\.test\(err\?\.message \|\| ''\)/);
    const fn = src.slice(src.indexOf('export async function exportInvoicePdf'));
    const tail = fn.slice(fn.indexOf('catch (err)'));
    expect(tail).toContain('return printPages(await printBlocks(),');
  });

  it('الخطأ الحقيقي (مو تعليق) يبقى يُرمى — ما ننبلع الأعطال', () => {
    const fn = src.slice(src.indexOf('export async function exportInvoicePdf'));
    const tail = fn.slice(fn.indexOf('catch (err)'));
    expect(tail).toContain('throw err;');
  });

  it('شريط التحميل يطفى قبل ما تنفتح شاشة الطباعة — الدور صار عالمستخدم', () => {
    const fn = src.slice(src.indexOf('function printPages'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    const stop = body.indexOf('stopBusyIndicator()');
    const print = body.indexOf('window.print()');
    expect(stop).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(print);
  });

  it('ورقة الطباعة تتنظف حتى لو المستخدم ألغى ولا انطلق afterprint', () => {
    const fn = src.slice(src.indexOf('function printPages'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain("window.addEventListener('afterprint', cleanup)");
    expect(body).toMatch(/setTimeout\(cleanup, \d+\)/);
    expect(body).toContain('host.remove()');
    expect(body).toContain('style.remove()');
  });

  it('الطباعة ترجع printed حتى تنطلع رسالة مختلفة عن رسالة التنزيل', () => {
    expect(src).toContain('resolve({ canceled: false, printed: true, attachmentSeparate: !!pdfAttachment })');
    for (const page of [builder, customer]) {
      expect(page).toContain('result.printed');
      expect(page).toMatch(/انفتحت شاشة الطباعة/);
    }
  });

  it('صفحات متعددة تنفصل بفاصل صفحة', () => {
    const fn = src.slice(src.indexOf('function printPages'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('page-break-before:always');
  });
});

// المستخدم بلّغ إن الطباعة اشتغلت **بس «الطريقة القديمة أفضل بكثير»**. السبب
// مقيس مو مفترض: مسار الطباعة كان يطبع **الفاتورة وحدها** — بلا صفحة الغلاف
// اللي يبني عليها العرض، وبلا خلفيات (المتصفح يشيل الخلفيات بالطباعة افتراضياً)
// فالترويسة الكحلية وشريط العنوان وصفوف الجدول تطلع بيضاء.
describe('مسار الطباعة يطلّع نفس صفحات المسار القديم', () => {
  it('نفس الصفحات بنفس الترتيب: غلاف ثم فاتورة ثم المرفق', () => {
    const fn = src.slice(src.indexOf('const printBlocks = async'));
    const body = fn.slice(0, fn.indexOf('\n  };'));
    const cover = body.indexOf('buildCoverHtml');
    const invoice = body.indexOf('blocks.push(invoiceHtml)');
    const attach = body.indexOf('attachmentPageHtml(attachment)');
    expect(cover).toBeGreaterThan(-1);
    expect(cover).toBeLessThan(invoice);
    expect(invoice).toBeLessThan(attach);
  });

  it('صفحة الغلاف تنبني بنفس المنطق للمسارين — ماكو نسختين تتفرقان', () => {
    expect(src).toContain('async function buildCoverHtml');
    // مسار الكانفاس صار ينادي نفس الدالة بدل ما يبني الغلاف بنفسه
    const canvasPath = src.slice(src.indexOf('if (structure) {'), src.indexOf('// 2) الفاتورة بعد الغلاف'));
    expect(canvasPath).toContain('await buildCoverHtml(');
    expect((src.match(/await import\('\.\/structure3d\.js'\)/g) || []).length).toBe(1);
  });

  it('الخلفيات تنطبع — بلاها الترويسة والجداول تطلع بيضاء', () => {
    const fn = src.slice(src.indexOf('function printPages'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('-webkit-print-color-adjust: exact !important;');
    expect(body).toContain('print-color-adjust: exact !important;');
  });

  it('خلفية التطبيق الرمادية ما تنطبع بنص الورقة', () => {
    const fn = src.slice(src.indexOf('function printPages'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('html, body { background: #fff !important; }');
  });

  it('عرض الورقة 794px بالضبط بالطباعة — بلا تقلّص ولا صفحة زايدة', () => {
    const fn = src.slice(src.indexOf('function printPages'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('#print-root .print-page { width: 794px;');
    expect(body).toContain('#print-root .inv-sheet { box-shadow: none !important; margin: 0 !important; width: 794px !important; }');
  });

  it('المرفق صورة يصير صفحة، والمرفق PDF ينزل ملفاً منفصلاً مو يضيع', () => {
    expect(src).toContain('function attachmentPageHtml');
    expect(src).toContain('function pdfAttachmentOf');
    const fn = src.slice(src.indexOf('function attachmentPageHtml'));
    expect(fn.slice(0, 400)).toContain("data.startsWith('data:image/')");
    const p = src.slice(src.indexOf('function pdfAttachmentOf'));
    expect(p.slice(0, 300)).toContain("data.startsWith('data:application/pdf')");
    // وينزل فعلاً بعد ما تخلص الطباعة
    const pp = src.slice(src.indexOf('function printPages'));
    expect(pp.slice(0, pp.indexOf('\n}\n'))).toContain('downloadBlob(new Blob([buf], { type: \'application/pdf\' }), pdfAttachment.name)');
  });

  it('الرسالة تخبر المستخدم إن المرفق نزل لحاله', () => {
    for (const page of [builder, customer]) {
      expect(page).toContain('result.attachmentSeparate');
      expect(page).toMatch(/المرفق نزل/);
    }
  });
});
