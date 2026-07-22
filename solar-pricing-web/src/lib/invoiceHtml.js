// قالب فاتورة الموبايل — نفس تصميم نسخة سطح المكتب لكن بدون تضمين الخط
// (الخط Cairo محمّل أصلاً بالتطبيق، وhtml2canvas يلتقطه من الـDOM مباشرة)
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

function densityScale(itemCount) {
  if (itemCount <= 9) return { fontSize: 13, cellPad: 5 };
  if (itemCount <= 13) return { fontSize: 12, cellPad: 4 };
  if (itemCount <= 18) return { fontSize: 10.5, cellPad: 3 };
  return { fontSize: 9.5, cellPad: 2.5 };
}

// يرجع HTML داخلي لعنصر بعرض 794px (A4 على 96dpi) جاهز للالتقاط بـhtml2canvas
export function buildInvoiceInnerHtml({ quote, items, notes, company, installment = null }) {
  const systemAmps = Math.max(quote.required_amp_day || 0, quote.required_amp_night || 0);
  const logo = company.logo_path && company.logo_path.startsWith('data:') ? company.logo_path : null;
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

  // ترقيم يدوي بنفس السطر — قوائم ol بـhtml2canvas ترسم الأرقام على اليسار بالعربي
  const notesHtml = notes.map((n, i) => `<div class="note-line">${i + 1}. ${escapeHtml(n)}</div>`).join('');

  return `
<style>
.inv-sheet * { box-sizing: border-box; }
.inv-sheet {
  font-family: 'Cairo', sans-serif;
  direction: rtl;
  color: #1a1a1a;
  font-size: ${fontSize}px;
  width: 794px;
  padding: 26px;
  background: #fff;
}
.inv-sheet .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a3a5c; padding-bottom: 6px; margin-bottom: 8px; }
.inv-sheet .header-right { display: flex; gap: 8px; align-items: center; }
.inv-sheet .logo { width: 52px; height: 52px; object-fit: contain; }
.inv-sheet .company-name { font-size: 1.25em; font-weight: 700; color: #1a3a5c; margin: 0 0 1px; }
.inv-sheet .company-sub { font-size: 0.8em; color: #444; margin: 0; }
.inv-sheet .company-en { font-size: 0.75em; color: #777; margin: 1px 0 0; }
.inv-sheet .header-left { text-align: left; font-size: 0.9em; }
.inv-sheet .client-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.inv-sheet .client-table td { border: 1px solid #c7d2db; padding: ${cellPad}px 8px; font-size: 0.9em; }
.inv-sheet .client-table .label { background: #eef3f8; font-weight: 700; color: #1a3a5c; width: 14%; }
.inv-sheet .title-bar { background: #1a3a5c; color: #fff; text-align: center; font-weight: 700; font-size: 1.05em; padding: 6px; margin-bottom: 8px; border-radius: 3px; }
.inv-sheet .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.inv-sheet .items-table th { background: #1a3a5c; color: #fff; padding: ${cellPad}px 6px; font-size: 0.9em; border: 1px solid #1a3a5c; }
.inv-sheet .items-table td { border: 1px solid #d5dde5; padding: ${cellPad}px 6px; vertical-align: top; line-height: 1.35; }
.inv-sheet .items-table tr:nth-child(even) td { background: #f7f9fb; }
.inv-sheet .col-idx { width: 3%; text-align: center; }
.inv-sheet .col-desc { width: 45%; }
.inv-sheet .col-unit { width: 8%; text-align: center; }
.inv-sheet .col-qty { width: 8%; text-align: center; }
.inv-sheet .col-price { width: 16%; text-align: center; white-space: nowrap; }
.inv-sheet .col-total { width: 20%; text-align: center; white-space: nowrap; font-weight: 700; }
.inv-sheet .total-row td { background: #1a3a5c !important; color: #fff; font-weight: 700; font-size: 1.05em; padding: ${cellPad + 2}px 6px; }
.inv-sheet .inst-row td { background: #f5a623 !important; color: #1a2a4a; font-weight: 700; font-size: 1em; padding: ${cellPad + 1}px 6px; }
.inv-sheet .inst-monthly td { background: #ffd88a !important; }
.inv-sheet .notes-section h3 { color: #1a3a5c; font-size: 0.9em; margin: 5px 0 2px; }
.inv-sheet .notes-section .note-line { font-size: 0.78em; line-height: 1.32; text-align: right; }
.inv-sheet .footer { display: flex; justify-content: space-between; margin-top: 10px; font-size: 0.88em; }
.inv-sheet .footer .block { text-align: center; }
.inv-sheet .footer .role { font-weight: 700; color: #1a3a5c; margin-bottom: 8px; }
</style>
<div class="inv-sheet">
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
      <td class="label">اسم العميل</td><td>${escapeHtml(quote.client_name || '-')}</td>
      <td class="label">رقم الموبايل</td><td>${escapeHtml(quote.client_phone || '-')}</td>
    </tr>
    <tr>
      <td class="label">نوع العرض</td><td>طاقة شمسية</td>
      <td class="label">الموقع</td><td>${escapeHtml(quote.location || '-')}</td>
    </tr>
  </table>
  <div class="title-bar">عرض سعر منظومة شمسية بسعة ${formatNumber(systemAmps)} أمبير</div>
  <table class="items-table">
    <thead>
      <tr>
        <th class="col-idx">ت</th><th class="col-desc">المواد</th><th class="col-unit">الوحدة</th>
        <th class="col-qty">الكمية</th><th class="col-price">سعر الوحدة</th><th class="col-total">المجموع</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row"><td colspan="5">المجموع الكلي</td><td>${formatNumber(quote.total_price)}</td></tr>
      ${installment ? `
      <tr class="inst-row"><td colspan="5">المجموع الكلي مع فائدة المصرف (بالتقسيط)</td><td>${formatNumber(installment.totalWithInterest)}</td></tr>
      <tr class="inst-row inst-monthly"><td colspan="5">القسط الشهري لمدة ${formatNumber(installment.months)} شهر</td><td>${formatNumber(installment.monthly)}</td></tr>` : ''}
    </tbody>
  </table>
  <div class="notes-section"><h3>ملاحظات:</h3>${notesHtml}</div>
  <div class="footer">
    <div class="block"><div class="role">المدير المفوض</div><div>${escapeHtml(company.manager_name || '')}</div></div>
    <div class="block"><div class="role">توقيع وختم الشركة</div><div>&nbsp;</div></div>
  </div>
</div>`;
}

export { formatNumber, formatDate };
