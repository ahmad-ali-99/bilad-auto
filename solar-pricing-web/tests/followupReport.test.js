import { describe, it, expect } from 'vitest';
import {
  dayKey, timeOf, followupRows, followupSummary, followupFileName, STATUS_LABELS,
} from '../src/lib/followupReport.js';

// يوم عمل حقيقي: من الثامنة صباحاً للرابعة عصراً
const D = (h, m = 0) => new Date(2026, 7, 30, h, m).toISOString();
const DAY = new Date(2026, 7, 30, 12);

const QUOTES = [
  { id: 1, quote_number: 401, client_name: 'حجي عمار', client_phone: '07701', location: 'الدورة', total_price: 5000000, created_by: 'أحمد' },
  { id: 2, quote_number: 402, client_name: 'أبو يزن', client_phone: '07702', location: 'كربلاء', total_price: 6000000, created_by: 'أحمد' },
  { id: 3, quote_number: 403, client_name: 'مهدي صالح', client_phone: '07703', location: 'بغداد', total_price: 7000000, created_by: 'حيدر' },
  { id: 4, quote_number: 404, client_name: 'اسامة', client_phone: '07704', location: 'الموصل', total_price: 8000000, created_by: 'أحمد' },
];

const STATUSES = {
  1: { level: 'follow', note: 'اتصلت بيه، يريد مهلة', at: D(8, 15), by: 'أحمد' },
  2: { level: 'done', note: 'وقّع العقد', at: D(16, 0), by: 'أحمد' },
  3: { level: 'urgent', note: 'يريد جواب اليوم', at: D(10, 30), by: 'حيدر' },
  // بالأمس — ما يدخل بتقرير اليوم
  4: { level: 'follow', note: 'قديمة', at: new Date(2026, 7, 29, 11).toISOString(), by: 'أحمد' },
};

describe('مفتاح اليوم والوقت', () => {
  it('اليوم محلي مو UTC — شغل المساء ما ينزلق ليوم ثاني', () => {
    expect(dayKey(new Date(2026, 7, 30, 23, 30))).toBe('2026-08-30');
    expect(dayKey(new Date(2026, 7, 30, 0, 30))).toBe('2026-08-30');
  });
  it('والوقت بصيغة 24 ساعة', () => {
    expect(timeOf(D(8, 5))).toBe('08:05');
    expect(timeOf(D(16, 0))).toBe('16:00');
  });
  it('وقيمة تالفة ما تكسر', () => {
    expect(dayKey('شنو هذا')).toBe(null);
    expect(timeOf('شنو هذا')).toBe('');
  });
});

describe('صفوف تقرير المتابعة', () => {
  it('عروض اليوم لهذا الحساب فقط، مرتبة بالوقت', () => {
    const rows = followupRows({ quotes: QUOTES, statuses: STATUSES, username: 'أحمد', day: DAY });
    expect(rows.map((r) => r.quoteNumber)).toEqual([401, 402]);
    expect(rows.map((r) => r.time)).toEqual(['08:15', '16:00']);
  });

  it('**شغل الأمس ما يدخل**', () => {
    const rows = followupRows({ quotes: QUOTES, statuses: STATUSES, username: 'أحمد', day: DAY });
    expect(rows.some((r) => r.quoteNumber === 404)).toBe(false);
  });

  it('وشغل حساب ثاني ما يدخل', () => {
    const rows = followupRows({ quotes: QUOTES, statuses: STATUSES, username: 'أحمد', day: DAY });
    expect(rows.some((r) => r.quoteNumber === 403)).toBe(false);
  });

  it('والاسم يتطابق رغم الهمزة والمسافات', () => {
    const rows = followupRows({ quotes: QUOTES, statuses: STATUSES, username: ' احمد ', day: DAY });
    expect(rows).toHaveLength(2);
  });

  it('وبلا اسم حساب يطلع شغل الفريق كله', () => {
    const rows = followupRows({ quotes: QUOTES, statuses: STATUSES, username: null, day: DAY });
    expect(rows.map((r) => r.quoteNumber)).toEqual([401, 403, 402]);
  });

  it('**الحالة المحفوظة بلا وقت تنستثنى** — ما ننسبها ليوم بالتخمين', () => {
    const old = { 1: { level: 'follow', note: 'قديمة بلا وقت' } };
    expect(followupRows({ quotes: QUOTES, statuses: old, username: 'أحمد', day: DAY })).toEqual([]);
  });

  it('وعرض محذوف (مو بالقائمة) ما يكسر التقرير', () => {
    const rows = followupRows({ quotes: [QUOTES[0]], statuses: STATUSES, username: 'أحمد', day: DAY });
    expect(rows).toHaveLength(1);
  });

  it('والملاحظة والحالة والمجموع يوصلون كما هم', () => {
    const [r] = followupRows({ quotes: QUOTES, statuses: STATUSES, username: 'أحمد', day: DAY });
    expect(r.note).toBe('اتصلت بيه، يريد مهلة');
    expect(r.status).toBe(STATUS_LABELS.follow);
    expect(r.total).toBe(5000000);
  });
});

describe('الملخّص واسم الملف', () => {
  it('يبيّن العدد ومن أي ساعة لأي ساعة', () => {
    const rows = followupRows({ quotes: QUOTES, statuses: STATUSES, username: 'أحمد', day: DAY });
    const s = followupSummary(rows);
    expect(s).toMatchObject({ count: 2, from: '08:15', to: '16:00' });
    expect(s.byStatus['قيد المتابعة']).toBe(1);
  });

  it('وتقرير فارغ ما يكسر الملخّص', () => {
    expect(followupSummary([])).toMatchObject({ count: 0, from: '', to: '' });
  });

  it('واسم الملف يحمل الحساب واليوم', () => {
    expect(followupFileName('أحمد', DAY)).toBe('متابعة أحمد 2026-08-30.xlsx');
  });

  it('والمحارف الممنوعة باسم الملف تنشال', () => {
    expect(followupFileName('حساب/غريب:؟', DAY)).not.toMatch(/[\\/:*?"<>|]/);
  });
});

// ═══ الوصل بالشاشة وبطبقة البيانات ═══════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(HERE, '../src/pages/Quotes.jsx'), 'utf8');
const api = fs.readFileSync(path.join(HERE, '../src/lib/dataApi.js'), 'utf8');

describe('وقت التعديل ينحفظ مع الحالة', () => {
  it('**بدونه ماكو تقرير**: setStatus يكتب at وby', () => {
    const fn = api.slice(api.indexOf('async setStatus('), api.indexOf('async creators()'));
    expect(fn).toContain('at: new Date().toISOString()');
    expect(fn).toContain('by,');
  });

  it('والقراءة ترجّعهما — الحالات القديمة بلا وقت ترجع null بلا كسر', () => {
    const fn = api.slice(api.indexOf('async statuses()'), api.indexOf('async setStatus('));
    expect(fn).toContain("at: v.at || null");
    expect(fn).toContain("by: v.by || null");
  });
});

describe('زر تصدير متابعة اليوم', () => {
  it('موجود بالشاشة وينادي التصدير', () => {
    expect(page).toContain('📊 متابعة اليوم');
    expect(page).toContain('onClick={exportFollowup}');
  });

  it('والبياع يصدّر شغله هو، والإدارة تصدّر الحساب المختار أو الفريق', () => {
    const fn = page.slice(page.indexOf('async function exportFollowup()'), page.indexOf('function toggleCreator('));
    expect(fn).toContain('selectedCreators.length === 1 ? selectedCreators[0] : null');
    expect(fn).toContain(': me;');
  });

  it('وتقرير فارغ ينطي رسالة بدل ملف فاضي', () => {
    const fn = page.slice(page.indexOf('async function exportFollowup()'), page.indexOf('function toggleCreator('));
    expect(fn).toContain('rows.length === 0');
    expect(fn).toContain('ماكو أي تعديل حالة أو ملاحظة اليوم');
  });

  it('ويبني الملف بـExcelJS (تنسيق وألوان) وينزّله بلوب', () => {
    const fn = page.slice(page.indexOf('async function exportFollowup()'), page.indexOf('function toggleCreator('));
    expect(fn).toContain("await import('exceljs')");
    expect(fn).toContain('buildFollowupWorkbook(ExcelJS, rows');
    expect(fn).toContain('wb.xlsx.writeBuffer()');
    expect(fn).toContain('followupFileName(');
    // SheetJS انشال من هذا المسار: نسخته المجانية ما تكتب ألواناً أصلاً
    expect(fn).not.toContain("import('xlsx')");
  });
});
