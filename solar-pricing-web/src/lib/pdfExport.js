// تصدير الفاتورة PDF على الويب: نرسم HTML بعنصر مخفي → html2canvas → jsPDF
// ثم مشاركة عبر Web Share API (يشتغل بالموبايل — واتساب مباشرة) أو تنزيل بالمتصفح.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { buildInvoiceInnerHtml } from './invoiceHtml.js';

export async function exportInvoicePdf({ quote, items, notes, company, fileName }) {
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

    const blob = pdf.output('blob');
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
