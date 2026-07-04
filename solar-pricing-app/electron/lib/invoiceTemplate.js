const fs = require('fs');
const path = require('path');
const { getFontFaceCss } = require('./fonts');

function formatNumber(n) {
  return Math.round(n).toLocaleString('en-US');
}

function formatDate(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function multilineToHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br/>');
}

function logoDataUri(logoPath) {
  if (!logoPath) return null;
  try {
    if (!fs.existsSync(logoPath)) return null;
    const ext = path.extname(logoPath).slice(1).toLowerCase();
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const base64 = fs.readFileSync(logoPath).toString('base64');
    return `data:image/${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

function densityScale(itemCount) {
  if (itemCount <= 9) return { fontSize: 10.5, cellPad: 4.5 };
  if (itemCount <= 13) return { fontSize: 9.5, cellPad: 3.5 };
  if (itemCount <= 18) return { fontSize: 8.5, cellPad: 2.5 };
  return { fontSize: 7.5, cellPad: 2 };
}

function buildInvoiceHtml({ quote, items, notes, company, assetsDir }) {
  const fontFaceCss = getFontFaceCss(assetsDir);
  const systemAmps = Math.max(quote.required_amp_day || 0, quote.required_amp_night || 0);
  const logo = logoDataUri(company.logo_path);
  const { fontSize, cellPad } = densityScale(items.length);

  const rowsHtml = items
    .map(
      (item, idx) => `
    <tr>
      <td class="col-idx">${idx + 1}</td>
      <td class="col-desc">${multilineToHtml(item.description)}</td>
      <td class="col-unit">${escapeHtml(item.unit)}</td>
      <td class="col-qty">${item.unit === 'متر' ? item.quantity : formatNumber(item.quantity)}</td>
      <td class="col-price">${formatNumber(item.unit_price)}</td>
      <td class="col-total">${formatNumber(item.subtotal)}</td>
    </tr>`
    )
    .join('');

  const notesHtml = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');

  const roofWarningHtml = quote.roof_limited_warning
    ? `<div class="roof-warning">تنبيه: مساحة السطح لا تكفي لتغطية الحمل المطلوب كاملاً — تم اعتماد أقصى عدد ألواح يسمح به السطح المتوفر</div>`
    : '';

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
${fontFaceCss}
@page { size: A4; margin: 7mm; }
* { box-sizing: border-box; }
body {
  font-family: 'Cairo', sans-serif;
  direction: rtl;
  color: #1a1a1a;
  font-size: ${fontSize}px;
  margin: 0;
  padding: 0;
}
.sheet { width: 100%; }
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #1a3a5c;
  padding-bottom: 5px;
  margin-bottom: 6px;
}
.header-right { display: flex; gap: 8px; align-items: center; }
.logo { width: 44px; height: 44px; object-fit: contain; }
.company-name { font-size: 1.25em; font-weight: 700; color: #1a3a5c; margin: 0 0 1px; }
.company-sub { font-size: 0.8em; color: #444; margin: 0; }
.company-en { font-size: 0.75em; color: #777; margin: 1px 0 0; }
.header-left { text-align: left; font-size: 0.9em; }
.header-left div { margin-bottom: 1px; }
.header-left b { color: #1a3a5c; }

.client-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
.client-table td { border: 1px solid #c7d2db; padding: ${Math.min(cellPad, 4)}px 8px; font-size: 0.9em; }
.client-table .label { background: #eef3f8; font-weight: 700; color: #1a3a5c; width: 14%; }
.client-table .value { width: 36%; }

.title-bar {
  background: #1a3a5c;
  color: #fff;
  text-align: center;
  font-weight: 700;
  font-size: 1.05em;
  padding: 5px;
  margin-bottom: 6px;
  border-radius: 3px;
}

.roof-warning {
  background: #fdecea;
  color: #a33;
  border: 1px solid #e5a3a3;
  padding: 4px 10px;
  margin-bottom: 6px;
  font-size: 0.85em;
  border-radius: 3px;
  font-weight: 700;
  text-align: center;
}

.items-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
.items-table th {
  background: #1a3a5c;
  color: #fff;
  padding: ${cellPad}px 6px;
  font-size: 0.9em;
  border: 1px solid #1a3a5c;
}
.items-table td {
  border: 1px solid #d5dde5;
  padding: ${cellPad}px 6px;
  vertical-align: top;
  line-height: 1.28;
}
.items-table tr:nth-child(even) td { background: #f7f9fb; }
.col-idx { width: 3%; text-align: center; }
.col-desc { width: 45%; }
.col-unit { width: 8%; text-align: center; }
.col-qty { width: 8%; text-align: center; }
.col-price { width: 16%; text-align: center; white-space: nowrap; }
.col-total { width: 20%; text-align: center; white-space: nowrap; font-weight: 700; }

.total-row td {
  background: #1a3a5c !important;
  color: #fff;
  font-weight: 700;
  font-size: 1.05em;
  padding: ${cellPad + 2}px 6px;
}

.notes-section { margin-top: 4px; }
.notes-section h3 { color: #1a3a5c; font-size: 0.95em; margin: 0 0 2px; }
.notes-section ol { margin: 0; padding-right: 18px; }
.notes-section li { margin-bottom: 0px; font-size: 0.85em; line-height: 1.25; }

.footer {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  font-size: 0.88em;
}
.footer .block { text-align: center; }
.footer .block .role { font-weight: 700; color: #1a3a5c; margin-bottom: 14px; }
</style>
</head>
<body>
<div class="sheet">
  <div class="header">
    <div class="header-right">
      ${logo ? `<img class="logo" src="${logo}" />` : ''}
      <div>
        <p class="company-name">${escapeHtml(company.company_name)}</p>
        <p class="company-sub">${escapeHtml(company.email || '')} | ${escapeHtml(company.phone1 || '')} | ${escapeHtml(company.phone2 || '')}</p>
        <p class="company-en">${escapeHtml(company.company_name_en || '')}</p>
      </div>
    </div>
    <div class="header-left">
      <div><b>العدد:</b> ${quote.quote_number}</div>
      <div><b>التاريخ:</b> ${formatDate(quote.created_at || new Date())}</div>
    </div>
  </div>

  <table class="client-table">
    <tr>
      <td class="label">اسم العميل</td>
      <td class="value">${escapeHtml(quote.client_name || '-')}</td>
      <td class="label">رقم الموبايل</td>
      <td class="value">${escapeHtml(quote.client_phone || '-')}</td>
    </tr>
    <tr>
      <td class="label">نوع العرض</td>
      <td class="value">طاقة شمسية</td>
      <td class="label">الموقع</td>
      <td class="value">${escapeHtml(quote.location || '-')}</td>
    </tr>
  </table>

  <div class="title-bar">عرض سعر منظومة شمسية بسعة ${formatNumber(systemAmps)} أمبير</div>
  ${roofWarningHtml}

  <table class="items-table">
    <thead>
      <tr>
        <th class="col-idx">ت</th>
        <th class="col-desc">المواد</th>
        <th class="col-unit">الوحدة</th>
        <th class="col-qty">الكمية</th>
        <th class="col-price">سعر الوحدة</th>
        <th class="col-total">المجموع</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row">
        <td colspan="5">المجموع الكلي</td>
        <td>${formatNumber(quote.total_price)}</td>
      </tr>
    </tbody>
  </table>

  <div class="notes-section">
    <h3>ملاحظات:</h3>
    <ol>${notesHtml}</ol>
  </div>

  <div class="footer">
    <div class="block">
      <div class="role">المدير المفوض</div>
      <div>${escapeHtml(company.manager_name || '')}</div>
    </div>
    <div class="block">
      <div class="role">توقيع وختم الشركة</div>
      <div>&nbsp;</div>
    </div>
  </div>
</div>
</body>
</html>`;
}

module.exports = { buildInvoiceHtml, formatNumber, formatDate };
