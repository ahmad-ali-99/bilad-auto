// تصدير الفاتورة PDF على الويب: نرسم HTML بعنصر مخفي → html2canvas → jsPDF
// ثم مشاركة عبر Web Share API (يشتغل بالموبايل — واتساب مباشرة) أو تنزيل بالمتصفح.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { buildInvoiceInnerHtml } from './invoiceHtml.js';
import { buildStructurePageHtml, panelCountFromItems, integratedFromItems } from './structureDiagram.js';
import { CABINET_IMAGE } from '../assets/cabinetImage.js';

// يرسم HTML لعنصر مخفي → canvas ويضيفه صفحة كاملة بالـPDF (لصفحة التصميم/الغلاف).
// ensurePage: يبدأ صفحة جديدة (أو يستخدم الأولى إن كانت فارغة) — حتى نتحكم بالترتيب.
async function addHtmlPage(pdf, html, ensurePage, pageWmm = 210, pageHmm = 297) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-2000px;top:0;width:794px;background:#fff;z-index:-1;';
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    await document.fonts.ready;
    // نختار عنصر المحتوى الفعلي: الـHTML يبدأ بوسم <style> فلا نلتقط أول عنصر
    // (يطلع 0×0 ويكسر الحساب)، بل عنصر الصفحة نفسه.
    const el = host.querySelector('.mkt-sheet') || Array.from(host.children).find((c) => c.tagName !== 'STYLE') || host.firstElementChild;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    if (!canvas.width || !canvas.height) return; // لا نضيف صفحة فارغة/تالفة
    let w = pageWmm;
    let h = (canvas.height * pageWmm) / canvas.width;
    if (h > pageHmm) { const s = pageHmm / h; w = pageWmm * s; h = pageHmm; } // نلائم داخل الصفحة
    ensurePage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageWmm - w) / 2, 0, w, h);
  } finally {
    document.body.removeChild(host);
  }
}

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

// تحويل Blob إلى base64 خام (بدون ترويسة data:) — لكتابة الملف عبر جسر Capacitor
const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// داخل تطبيق الأندرويد (غلاف Capacitor): الـWebView ما يدعم مشاركة الويب أصلاً،
// فنكتب الملف مؤقتاً بذاكرة التطبيق ونفتح نافذة المشاركة الأصلية (واتساب وغيرها).
// يرجع null إذا ما احنا داخل التطبيق أو الجسر غير متوفر — عندها نكمل بمسارات الويب.
async function shareViaCapacitor(blob, fileName) {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null;
  const FS = cap?.Plugins?.Filesystem;
  const NativeShare = cap?.Plugins?.Share;
  if (!cap?.isNativePlatform?.() || !FS || !NativeShare) return null;
  const isCancel = (err) => /cancel|abort|dismiss/i.test(String(err?.message || err?.code || ''));
  let uri;
  try {
    const data = await blobToBase64(blob);
    const written = await FS.writeFile({ path: fileName, data, directory: 'CACHE' });
    uri = written.uri;
  } catch {
    return null; // فشلت الكتابة → نجرب مسارات الويب
  }
  try {
    await NativeShare.share({ title: fileName, files: [uri] });
    return { canceled: false, shared: true };
  } catch (err) {
    if (isCancel(err)) return { canceled: true };
  }
  try {
    // نسخ أقدم من الإضافة ما تدعم files[] — نجرب الصيغة المفردة
    await NativeShare.share({ title: fileName, url: uri });
    return { canceled: false, shared: true };
  } catch (err) {
    return isCancel(err) ? { canceled: true } : null;
  }
}

// نافذة خيارات احتياطية: بعض الأجهزة تلغي إذن المشاركة لأن توليد الملف ياخذ ثواني،
// فنعرض زر مشاركة بضغطة جديدة (إذن جديد) + زر تنزيل — حتى ما يضيع الملف بصمت أبداً.
function showDeliverDialog({ pdfFile, blob, fileName, allowShare }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(12,22,38,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    const box = document.createElement('div');
    box.style.cssText =
      "background:#fff;border-radius:16px;padding:22px 20px;max-width:340px;width:100%;text-align:center;direction:rtl;font-family:'Cairo',sans-serif;box-shadow:0 14px 44px rgba(0,0,0,.35);";
    box.innerHTML =
      '<div style="font-size:2.2rem">📄</div>' +
      '<h3 style="margin:6px 0 2px;color:#1a3a5c;font-size:1.05rem">ملف العرض جاهز</h3>' +
      '<p style="margin:2px 0 14px;color:#5a6b7d;font-size:.88rem">اختر طريقة استلام الملف:</p>';
    const btn = (label, primary) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText =
        'display:block;width:100%;margin:8px 0;padding:12px;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;border:1px solid ' +
        (primary ? '#f5a623;background:linear-gradient(135deg,#ffc251,#f5a623);color:#1a2a4a;' : '#c8d3de;background:#f4f7fa;color:#1a3a5c;');
      return b;
    };
    const done = (result) => {
      document.body.removeChild(overlay);
      resolve(result);
    };
    if (allowShare) {
      const shareBtn = btn('📤 مشاركة (واتساب وغيره)', true);
      shareBtn.onclick = async () => {
        try {
          await navigator.share({ files: [pdfFile], title: fileName });
          done({ canceled: false, shared: true });
        } catch (err) {
          if (err && err.name === 'AbortError') return; // رجع من قائمة المشاركة — النافذة تبقى
          downloadBlob(blob, fileName);
          done({ canceled: false, shared: false });
        }
      };
      box.appendChild(shareBtn);
    }
    const dlBtn = btn('⬇ تنزيل الملف إلى الجهاز', !allowShare);
    dlBtn.onclick = () => {
      downloadBlob(blob, fileName);
      done({ canceled: false, shared: false });
    };
    box.appendChild(dlBtn);
    const cancelBtn = btn('إغلاق', false);
    cancelBtn.style.opacity = '0.8';
    cancelBtn.onclick = () => done({ canceled: true });
    box.appendChild(cancelBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}

// إيصال الملف للمستخدم بالترتيب: مشاركة أصلية (تطبيق أندرويد) ← مشاركة ويب ←
// نافذة الخيارات عند فشل الإذن ← تنزيل مباشر. مصدَّرة حتى تنفحص بالاختبارات.
export async function deliverPdf(blob, fileName) {
  const pdfFile = new File([blob], fileName, { type: 'application/pdf' });

  const nativeResult = await shareViaCapacitor(blob, fileName);
  if (nativeResult) return nativeResult;

  if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({ files: [pdfFile], title: fileName });
      return { canceled: false, shared: true };
    } catch (err) {
      if (err && err.name === 'AbortError') return { canceled: true };
      // غالباً انتهى إذن المشاركة (NotAllowedError) — نعرض الخيارات بضغطة جديدة
      return showDeliverDialog({ pdfFile, blob, fileName, allowShare: true });
    }
  }

  downloadBlob(blob, fileName);
  return { canceled: false, shared: false };
}

export async function exportInvoicePdf({ quote, items, notes, company, fileName, attachment = null, installment = null, structure = true, capability = null }) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-2000px;top:0;width:794px;background:#fff;z-index:-1;';
  host.innerHTML = buildInvoiceInnerHtml({ quote, items, notes, company, installment });
  document.body.appendChild(host);

  try {
    await document.fonts.ready;
    const sheet = host.querySelector('.inv-sheet');

    // نجمع حدود العناصر (صفوف الجدول، الملاحظات، الترويسة...) قبل الرسم — حتى القص
    // بين الصفحات يصير عند حدود الصفوف فقط ولا ينقص أي صف أو رقم من نصه
    const sheetRect = sheet.getBoundingClientRect();
    const domCuts = [];
    sheet.querySelectorAll('tr, li, .title-bar, .header, .client-table, .notes-section h3, .footer').forEach((el) => {
      const r = el.getBoundingClientRect();
      domCuts.push(r.top - sheetRect.top, r.bottom - sheetRect.top);
    });

    const canvas = await html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const domToCanvas = canvas.width / sheetRect.width;
    const cuts = [...new Set(domCuts.map((v) => Math.round(v * domToCanvas)))]
      .filter((v) => v > 0 && v < canvas.height)
      .sort((a, b) => a - b);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWmm = 210;
    const pageHmm = 297;

    // نتحكم بترتيب الصفحات: أول صفحة تُستخدم مباشرة، وما بعدها addPage.
    let pageStarted = false;
    const ensurePage = () => { if (pageStarted) pdf.addPage(); pageStarted = true; };

    // 1) صفحة التصميم أولاً (غلاف يبهر الزبون).
    // بالسستم المتكامل: صورة الكابينة بدل رندر الستركجر — مصفوفة بمئات الألواح
    // تطلع مشوّهة وما تخدم العرض، وهذا يتخطى three.js كلياً (تصدير أسرع وبلا WebGL).
    if (structure) {
      try {
        const panelCount = panelCountFromItems(items);
        const cabinet = quote?.system_type === 'integrated' ? integratedFromItems(items) : null;
        if (cabinet) {
          const html = buildStructurePageHtml(panelCount, company, CABINET_IMAGE, capability, cabinet);
          if (html) await addHtmlPage(pdf, html, ensurePage, pageWmm, pageHmm);
        } else if (panelCount > 0) {
          // three.js يُحمّل ديناميكياً هنا فقط (وقت التصدير) حتى ما يثقل فتح التطبيق
          const { renderStructurePng } = await import('./structure3d.js');
          const img = await renderStructurePng(panelCount, { width: 1000, height: 620 });
          const structHtml = buildStructurePageHtml(panelCount, company, img || '', capability);
          if (structHtml) await addHtmlPage(pdf, structHtml, ensurePage, pageWmm, pageHmm);
        }
      } catch {
        /* فشل الرندر 3D (WebGL غير متاح) — نتخطى صفحة الهيكل بلا كسر العرض */
      }
    }

    // 2) الفاتورة بعد الغلاف
    const imgHmm = (canvas.height * pageWmm) / canvas.width;
    // فائض بسيط (≤25%) نضغطه على صفحة واحدة حتى الملاحظات/التوقيع ما يطفحون لصفحة شبه فارغة
    const FIT_TOL = 1.25;
    if (imgHmm <= pageHmm) {
      ensurePage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWmm, imgHmm);
    } else if (imgHmm <= pageHmm * FIT_TOL) {
      ensurePage();
      const s = pageHmm / imgHmm;
      const w = pageWmm * s;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageWmm - w) / 2, 0, w, pageHmm);
    } else {
      const pageHpx = Math.floor((pageHmm / pageWmm) * canvas.width);
      let y = 0;
      while (y < canvas.height - 2) {
        const limit = y + pageHpx;
        let next = Math.min(limit, canvas.height);
        if (limit < canvas.height) {
          // آخر حد آمن (نهاية صف) قبل حافة الصفحة — وإذا ماكو حد مناسب نقص عند الحافة
          const safe = cuts.filter((c) => c > y + pageHpx * 0.35 && c <= limit);
          if (safe.length) next = safe[safe.length - 1];
        }
        const sliceH = next - y;
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        ensurePage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWmm, (sliceH * pageWmm) / canvas.width);
        y = next;
      }
    }

    // إذا اكو مرفق تصميم (صورة/PDF) نلحقه بنهاية الملف
    let blob;
    if (attachment && attachment.data) {
      blob = await appendAttachment(pdf, attachment);
    } else {
      blob = pdf.output('blob');
    }
    return await deliverPdf(blob, fileName);
  } finally {
    document.body.removeChild(host);
  }
}
