// تصدير الفاتورة PDF على الموبايل: نرسم HTML بعنصر مخفي → html2canvas → jsPDF → مشاركة/حفظ
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { buildInvoiceInnerHtml } from './invoiceHtml.js';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function exportInvoicePdf({ quote, items, notes, company, fileName }) {
  // عنصر مخفي خارج الشاشة بعرض A4
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
      // تقسيم لصفحات متعددة عند الطول الزائد
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

    const pdfBuffer = pdf.output('arraybuffer');
    const base64 = arrayBufferToBase64(pdfBuffer);

    if (Capacitor.isNativePlatform()) {
      const write = await Filesystem.writeFile({
        path: fileName,
        directory: Directory.Cache,
        data: base64,
      });
      await Share.share({
        title: fileName,
        files: [write.uri],
      });
      return { canceled: false, shared: true };
    }

    // على المتصفح (للتطوير): تنزيل مباشر
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
    return { canceled: false, shared: false };
  } finally {
    document.body.removeChild(host);
  }
}
