import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildFollowupWorkbook, COLUMNS } from '../src/lib/followupWorkbook.js';
import { followupRows } from '../src/lib/followupReport.js';

const D = (h, m = 0) => new Date(2026, 7, 30, h, m).toISOString();
const DAY = new Date(2026, 7, 30, 12);
const QUOTES = [
  { id: 1, quote_number: 401, client_name: 'حجي عمار', client_phone: '07701234567', location: 'الدورة', total_price: 5000000, created_by: 'حيدر' },
  { id: 2, quote_number: 402, client_name: 'أبو يزن', client_phone: '07702', location: 'كربلاء', total_price: 6500000, created_by: 'أحمد' },
  { id: 3, quote_number: 403, client_name: 'مهدي صالح', client_phone: '07703', location: 'بغداد', total_price: 7000000, created_by: 'أحمد' },
];
const STATUSES = {
  1: { level: 'follow', note: 'اتصلت بيه، يريد مهلة أسبوع', at: D(8, 15), by: 'أحمد' },
  2: { level: 'urgent', note: 'يريد جواب اليوم', at: D(11, 40), by: 'أحمد' },
  3: { level: 'done', note: 'وقّع العقد', at: D(15, 50), by: 'أحمد' },
};
const rows = followupRows({ quotes: QUOTES, statuses: STATUSES, username: 'أحمد', day: DAY });
const build = (r = rows) => buildFollowupWorkbook(ExcelJS, r, { username: 'أحمد', day: DAY });

describe('أعمدة التقرير كما طلبها المستخدم', () => {
  it('اسم الزبون وحالته والملاحظة ومن خلاها ومنشئ العرض', () => {
    const heads = COLUMNS.map((c) => c.header);
    for (const h of ['اسم الزبون', 'حالة الزبون', 'الملاحظة', 'الي خلا الملاحظة', 'منشئ العرض'])
      expect(heads, h).toContain(h);
  });

  it('و«منشئ العرض» غير «الي خلا الملاحظة» — عرض حيدر تابعه أحمد', () => {
    const ws = build().getWorksheet('متابعة اليوم');
    const r = ws.getRow(6);
    expect(r.getCell(8).value).toBe('أحمد');    // الي خلا الملاحظة
    expect(r.getCell(9).value).toBe('حيدر');    // منشئ العرض
  });
});

describe('الملف مرتّب وملوّن فعلاً', () => {
  const ws = build().getWorksheet('متابعة اليوم');

  it('عنوان بخلفية كحلية وخط أبيض', () => {
    const c = ws.getCell(1, 1);
    expect(String(c.value)).toContain('تقرير متابعة');
    expect(c.fill.fgColor.argb).toBe('FF1A3A5C');
    expect(c.font.color.argb).toBe('FFFFFFFF');
    expect(c.font.bold).toBe(true);
  });

  it('وسطر يذكر الحساب واليوم وساعات العمل', () => {
    const v = String(ws.getCell(2, 1).value);
    expect(v).toContain('الحساب: أحمد');
    expect(v).toContain('2026-08-30');
    expect(v).toContain('من 08:15 إلى 15:50');
  });

  it('ورأس ملوّن ومحدود بكل الأعمدة', () => {
    for (let i = 1; i <= COLUMNS.length; i++) {
      const c = ws.getCell(5, i);
      expect(c.fill.fgColor.argb, COLUMNS[i - 1].header).toBe('FF1A3A5C');
      expect(c.border.bottom.style).toBe('thin');
    }
  });

  it('**وخلية الحالة تتلوّن بلون حالتها**', () => {
    expect(ws.getCell(6, 6).fill.fgColor.argb).toBe('FFFFE9C7');   // قيد المتابعة
    expect(ws.getCell(7, 6).fill.fgColor.argb).toBe('FFE63946');   // مستعجل
    expect(ws.getCell(8, 6).fill.fgColor.argb).toBe('FFD9F2E1');   // مكتمل
  });

  it('وأسطر متناوبة تسهّل التتبّع', () => {
    expect(ws.getCell(7, 3).fill.fgColor.argb).toBe('FFF7FAFC');
    expect(ws.getCell(6, 3).fill).toBeUndefined();
  });

  it('وعرض الأعمدة مضبوط — الملاحظة أعرض عمود', () => {
    const widths = COLUMNS.map((c, i) => ws.getColumn(i + 1).width);
    expect(Math.max(...widths)).toBe(ws.getColumn(7).width);
    expect(widths.every((w) => w >= 9)).toBe(true);
  });

  it('والرأس مثبّت والورقة من اليمين لليسار', () => {
    expect(ws.views[0].rightToLeft).toBe(true);
    expect(ws.views[0].state).toBe('frozen');
    expect(ws.views[0].ySplit).toBe(5);
  });

  it('وفلتر تلقائي حتى الإدارة تفلتر بضغطة', () => {
    expect(ws.autoFilter).toMatchObject({ from: { row: 5, column: 1 } });
  });
});

describe('الأرقام أرقام', () => {
  const ws = build().getWorksheet('متابعة اليوم');
  it('المجموع رقم بصيغة آلاف مو نص', () => {
    expect(typeof ws.getCell(6, 10).value).toBe('number');
    expect(ws.getCell(6, 10).numFmt).toBe('#,##0');
  });
  it('وسطر مجموع بآخر الجدول يجمعها', () => {
    const total = ws.getCell(6 + rows.length, 10);
    expect(total.value).toBe(5000000 + 6500000 + 7000000);
  });
  it('والصفوف مرتبة بالوقت', () => {
    const times = rows.map((r) => r.time);
    expect(times).toEqual([...times].sort());
  });
});

describe('تقرير فارغ ما يكسر', () => {
  it('يبني ورقة بعنوان وبلا سطر مجموع ولا فلتر', () => {
    const ws = build([]).getWorksheet('متابعة اليوم');
    expect(String(ws.getCell(3, 1).value)).toContain('ماكو متابعات');
    expect(ws.autoFilter).toBeFalsy();
  });
});

describe('الملف يُكتب ويُقرأ فعلاً', () => {
  it('يخرج بايتات xlsx صالحة تُقرأ بنفس المكتبة', async () => {
    const buf = await build().xlsx.writeBuffer();
    expect(buf.byteLength).toBeGreaterThan(3000);
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf);
    const ws2 = wb2.getWorksheet('متابعة اليوم');
    expect(ws2.getCell(5, 3).value).toBe('اسم الزبون');
    expect(ws2.getCell(6, 3).value).toBe('حجي عمار');
    expect(ws2.getCell(6, 6).fill.fgColor.argb).toBe('FFFFE9C7');
  });
});
