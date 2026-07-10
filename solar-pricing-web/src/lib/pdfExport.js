// تصدير الفاتورة PDF على الويب: نرسم HTML بعنصر مخفي → html2canvas → jsPDF
// ثم مشاركة عبر Web Share API (يشتغل بالموبايل — واتساب مباشرة) أو تنزيل بالمتصفح.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { buildInvoiceInnerHtml } from './invoiceHtml.js';

// يضيف مرفق التصميم لنهاية ملف العرض: صورة → صفحة جديدة بمقاسها، وPDF → دمج صفحاته كاملة
async function appendAttachment(pdf, attachment) {
  const data = attachment.data; // data URI: data:<mime>;base64,...
  if (data.startsWith('data:application/pdf')) {
    const merged = await PDFDocument.create();
    const main = await PDFDocument.load(pdf.output('arraybuffer'));
    const attach = await PDFDocument.load(Uint8Array.from(atob(data.split(',')[1]), (c) => c.charCodeAt(0)));
    for (const p of await merged.copyPages(main, main.getPageIndices())) merged.addPage(p);
    for (const p of await merged.copyPages(attach, attach.getPageIndices())) merged.addPage(p);
    return new Blob([await merged.save()], { type: 'application/pdf' });
  }
  // صورة: نحملها لمعرفة أبعادها ونركبها على صفحة A4 بتناسب
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = data;
  });
  pdf.addPage();
  const pageW = 210;
  const pageH = 297;
  const margin = 10;
  const ratio = Math.min((pageW - margin * 2) / img.width, (pageH - margin * 2) / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  const fmt = data.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  pdf.addImage(data, fmt, (pageW - w) / 2, (pageH - h) / 2, w, h);
  return pdf.output('blob');
}

export async function exportInvoicePdf({ quote, items, notes, company, fileName, attachment = null }) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-2000px;top:0;width:794px;background:#fff;z-index:-1;';
  host.innerHTML = buildInvoiceInnerHtml({ quote, items, notes, company });
  document.body.appendChild(host);

  try {
    await document.fonts.ready;
    const sheet = host.querySelector('.inv-sheet');
    const canvas = await html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWmm = 210;
    const pageHmm = 297;
    const imgHmm = (canvas.height * pageWmm) / canvas.width;

    if (imgHmm <= pageHmm) {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWmm, imgHmm);
    } else {
      const pageHpx = Math.floor((pageHmm / pageWmm) * canvas.width);
      let y = 0;
      let first = true;
      while (y < canvas.height) {
        const sliceH = Math.min(pageHpx, canvas.height - y);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceH;
        slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        if (!first) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWmm, (sliceH * pageWmm) / canvas.width);
        first = false;
        y += sliceH;
      }
    }

    // إذا اكو مرفق تصميم (صورة/PDF) نلحقه بنهاية الملف
    let blob;
    if (attachment && attachment.data) {
      blob = await appendAttachment(pdf, attachment);
    } else {
      blob = pdf.output('blob');
    }
    const pdfFile = new File([blob], fileName, { type: 'application/pdf' });

    // مشاركة (واتساب/إيميل...) إن كان الجهاز يدعمها — مثالي بالموبايل
    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({ files: [pdfFile], title: fileName });
        return { canceled: false, shared: true };
      } catch (err) {
        if (err && err.name === 'AbortError') return { canceled: true };
        // لو فشلت المشاركة نكمل للتنزيل
      }
    }

    // تنزيل مباشر (سطح المكتب أو متصفح ما يدعم المشاركة)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return { canceled: false, shared: false };
  } finally {
    document.body.removeChild(host);
  }
}
