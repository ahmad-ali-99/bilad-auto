// بناء ملف إكسل متابعة اليوم — مرتّب وملوّن وجاهز يُرسل للإدارة.
//
// **ليش ExcelJS مو SheetJS**: النسخة المجانية من SheetJS ما تكتب تنسيقاً
// أبداً (الألوان والحدود والتجميد ميزات مدفوعة)، فالملف كان يطلع نصاً خاماً
// بلا رأس ملوّن ولا عرض أعمدة — «تعيس وصعب القراءة». ExcelJS يكتب التنسيق كله.
//
// الوحدة تستلم ExcelJS كوسيط بدل ما تستورده: يخلي البناء قابلاً للفحص بالنود
// بنفس الشيفرة اللي تشتغل بالمتصفح، وينزّل المكتبة عند التصدير فقط.

import { followupSummary, dayKey, STATUS_LABELS } from './followupReport.js';

const NAVY = 'FF1A3A5C';
const NAVY_SOFT = 'FFE9F0F9';
const WHITE = 'FFFFFFFF';
const ZEBRA = 'FFF7FAFC';
const BORDER = 'FFCBD8E4';

// لون كل حالة — نفس ألوان الشاشة حتى الإدارة تربط الملف بالبرنامج
const STATUS_FILL = {
  normal: { bg: 'FFD7ECFB', fg: 'FF23628F' },
  follow: { bg: 'FFFFE9C7', fg: 'FF8A5B00' },
  urgent: { bg: 'FFE63946', fg: 'FFFFFFFF' },
  done:   { bg: 'FFD9F2E1', fg: 'FF1C7C46' },
};

export const COLUMNS = [
  { header: 'الوقت', key: 'time', width: 9 },
  { header: 'رقم العرض', key: 'quoteNumber', width: 11 },
  { header: 'اسم الزبون', key: 'client', width: 24 },
  { header: 'الهاتف', key: 'phone', width: 15 },
  { header: 'الموقع', key: 'location', width: 20 },
  { header: 'حالة الزبون', key: 'status', width: 14 },
  { header: 'الملاحظة', key: 'note', width: 48 },
  { header: 'الي خلا الملاحظة', key: 'by', width: 18 },
  { header: 'منشئ العرض', key: 'createdBy', width: 18 },
  { header: 'المجموع (د.ع)', key: 'total', width: 16 },
];

const thin = { style: 'thin', color: { argb: BORDER } };
const boxed = { top: thin, left: thin, bottom: thin, right: thin };

function fill(cell, argb) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

export function buildFollowupWorkbook(ExcelJS, rows, { username, day = new Date() } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'بلاد اوتو';
  wb.created = new Date();

  const ws = wb.addWorksheet('متابعة اليوم', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 5 }],   // الرأس يثبت وقت التمرير
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const last = COLUMNS.length;
  const s = followupSummary(rows);
  const account = username || 'الفريق';

  // ── العنوان ──
  ws.mergeCells(1, 1, 1, last);
  const title = ws.getCell(1, 1);
  title.value = 'تقرير متابعة الزبائن — شركة بلاد اوتو';
  title.font = { name: 'Cairo', size: 15, bold: true, color: { argb: WHITE } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  fill(title, NAVY);
  ws.getRow(1).height = 30;

  // ── سطر البيانات: الحساب واليوم والعدد والمدى ──
  ws.mergeCells(2, 1, 2, last);
  const sub = ws.getCell(2, 1);
  sub.value = `الحساب: ${account}     التاريخ: ${dayKey(day)}     عدد العروض: ${s.count}`
    + (s.count ? `     ساعات العمل: من ${s.from} إلى ${s.to}` : '');
  sub.font = { name: 'Cairo', size: 11, bold: true, color: { argb: NAVY } };
  sub.alignment = { horizontal: 'center', vertical: 'middle' };
  fill(sub, NAVY_SOFT);
  ws.getRow(2).height = 22;

  // ── سطر توزيع الحالات (ملوّن) ──
  ws.mergeCells(3, 1, 3, last);
  const dist = ws.getCell(3, 1);
  const parts = Object.entries(s.byStatus).map(([k, v]) => `${k}: ${v}`);
  dist.value = parts.length ? `التوزيع — ${parts.join('   •   ')}` : 'ماكو متابعات بهذا اليوم';
  dist.font = { name: 'Cairo', size: 10, color: { argb: 'FF4A6A88' } };
  dist.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 18;

  ws.getRow(4).height = 6;   // فاصل

  // ── الرأس ──
  const headRow = ws.getRow(5);
  COLUMNS.forEach((c, i) => {
    const cell = headRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: 'Cairo', size: 11, bold: true, color: { argb: WHITE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = boxed;
    fill(cell, NAVY);
  });
  headRow.height = 26;
  COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  // ── الصفوف ──
  rows.forEach((r, idx) => {
    const row = ws.getRow(6 + idx);
    COLUMNS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = c.key === 'total' ? Number(r.total) || 0 : (r[c.key] ?? '');
      cell.font = { name: 'Cairo', size: 10 };
      cell.border = boxed;
      cell.alignment = c.key === 'note'
        ? { horizontal: 'right', vertical: 'middle', wrapText: true }
        : { horizontal: 'center', vertical: 'middle' };
      if (idx % 2) fill(cell, ZEBRA);            // أسطر متناوبة تسهّل تتبّع السطر
      if (c.key === 'total') cell.numFmt = '#,##0';
      if (c.key === 'client') cell.font = { name: 'Cairo', size: 10, bold: true };
      if (c.key === 'phone') cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'ltr' };
      if (c.key === 'status') {
        const st = STATUS_FILL[r.level] || STATUS_FILL.normal;
        fill(cell, st.bg);
        cell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: st.fg } };
      }
    });
    row.height = 20;
  });

  // ── سطر المجموع ──
  if (rows.length) {
    const totalRow = ws.getRow(6 + rows.length);
    const sum = rows.reduce((a, r) => a + (Number(r.total) || 0), 0);
    ws.mergeCells(6 + rows.length, 1, 6 + rows.length, last - 1);
    const lbl = totalRow.getCell(1);
    lbl.value = `مجموع ${rows.length} عرضاً`;
    lbl.font = { name: 'Cairo', size: 11, bold: true, color: { argb: NAVY } };
    lbl.alignment = { horizontal: 'left', vertical: 'middle' };
    const val = totalRow.getCell(last);
    val.value = sum;
    val.numFmt = '#,##0';
    val.font = { name: 'Cairo', size: 11, bold: true, color: { argb: NAVY } };
    val.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let i = 1; i <= last; i++) { fill(totalRow.getCell(i), NAVY_SOFT); totalRow.getCell(i).border = boxed; }
    totalRow.height = 24;

    // فلتر تلقائي على الرأس — الإدارة تفلتر بالحالة أو بالحساب بضغطة
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + rows.length, column: last } };
  }

  return wb;
}

export { STATUS_LABELS };
