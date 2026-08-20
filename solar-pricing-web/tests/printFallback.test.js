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
    expect(body).toContain('@page { size: A4; margin: 6mm; }');
  });

  it('سفاري الآيفون يروح للطباعة مباشرة بلا كانفاس', () => {
    const fn = src.slice(src.indexOf('export async function exportInvoicePdf'));
    const head = fn.slice(0, fn.indexOf('html2canvas('));
    expect(head).toMatch(/if \(isIosSafari\(\)\)/);
    expect(head).toContain('return printPages([invoiceHtml]);');
  });

  it('أي متصفح يوقع بخطوة معلّقة يرجع للطباعة بدل ما يرمي الخطأ بوجه المستخدم', () => {
    expect(src).toMatch(/\/علقت خطوة\/\.test\(err\?\.message \|\| ''\)/);
    const fn = src.slice(src.indexOf('export async function exportInvoicePdf'));
    const tail = fn.slice(fn.indexOf('catch (err)'));
    expect(tail).toContain('return printPages([invoiceHtml]);');
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
    expect(src).toContain('resolve({ canceled: false, printed: true })');
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
