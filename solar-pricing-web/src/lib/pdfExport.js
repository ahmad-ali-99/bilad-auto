// تصدير الفاتورة PDF على الويب: نرسم HTML بعنصر مخفي → html2canvas → jsPDF
// ثم مشاركة عبر Web Share API (يشتغل بالموبايل — واتساب مباشرة) أو تنزيل بالمتصفح.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { buildInvoiceInnerHtml } from './invoiceHtml.js';
import { buildStructurePageHtml, panelCountFromItems, integratedFromItems } from './structureDiagram.js';
import { CABINET_IMAGE } from '../assets/cabinetImage.js';

// اسم ملف العرض المُصدَّر — يُبنى بمكان واحد حتى ما تنضاف نقطة تصدير بلا اسم الزبون.
// كان الاسم منصوصاً بالإيد («عرض_سعر_معاينة.pdf» لكل المعاينات!)، فالبياع يعيد تسميته
// بيده قبل ما يرسله بالواتساب. الشكل المطلوب: «حسين نعمة - 204.pdf».
//
// التنظيف واجب لأن الاسم يجي من كتابة البياع ويروح لنظام الملفات ولمشاركة أندرويد.
const MAX_NAME = 80;

export function quoteFileName(clientName, quoteNumber) {
  const clean = String(clientName || '')
    // محارف ممنوعة بويندوز/أندرويد + محارف التحكم
    .replace(/[\\/:*?"<>|]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)
    // ويندوز يرفض النقطة والمسافة بالنهاية
    .replace(/[.\s]+$/, '');

  // رقم العرض: الزبون (Google) ياخذ '—' بدل رقم تسلسلي — ما ينضاف للاسم
  const num = quoteNumber != null && /^\d+$/.test(String(quoteNumber).trim())
    ? String(quoteNumber).trim()
    : '';

  if (clean) return `${clean}${num ? ` - ${num}` : ''}.pdf`;
  return num ? `عرض سعر ${num}.pdf` : 'عرض سعر معاينة.pdf';
}

// الأوزان المستعملة بصفحات العرض (الفاتورة تستعمل 700، والغلاف 600 و800)
const SHEET_WEIGHTS = [400, 600, 700, 800];

// يضمن إن خط Cairo العربي **فعّال فعلاً** قبل ما يلتقط html2canvas.
//
// `document.fonts.ready` لوحدها ما تكفي: حزمة fontsource مقسّمة بـunicode-range مع
// font-display:swap، فوجه الخط العربي ما ينطلب أصلاً إلا لمّا يصير layout لنص عربي
// بذاك الوزن. كنا ننتظرها قبل أي reflow مضمون فتنحل فوراً (ماكو شي معلّق)، وبعدين
// html2canvas يقيس النص بمقاسات خط ويرسمه بخط ثاني — فتنزل الحروف فوق بعضها.
// الأيفون يكون محمّل الخط أصلاً من الواجهة فما يظهر عنده، وأندرويد يوقع بالسباق.
//
// الحل: نجبر layout، ثم نطلب كل وزن **بنص عربي صريح** (الطلب بنص لاتيني ما يجيب
// الشريحة العربية أبداً بسبب unicode-range)، وبعدها ننتظر fonts.ready.
async function ensureArabicFont(el) {
  if (el) el.getBoundingClientRect();
  try {
    await Promise.all(
      SHEET_WEIGHTS.map((w) => document.fonts.load(`${w} 16px Cairo`, 'أبجد هوز حطي').catch(() => {}))
    );
  } catch {
    /* متصفح قديم بلا Font Loading API — ننتظر fonts.ready لوحدها */
  }
  await document.fonts.ready;
}

// يرسم HTML لعنصر مخفي → canvas ويضيفه صفحة كاملة بالـPDF (لصفحة التصميم/الغلاف).
// ensurePage: يبدأ صفحة جديدة (أو يستخدم الأولى إن كانت فارغة) — حتى نتحكم بالترتيب.
async function addHtmlPage(pdf, html, ensurePage, pageWmm = 210, pageHmm = 297) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-2000px;top:0;width:794px;background:#fff;z-index:-1;';
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    // نختار عنصر المحتوى الفعلي: الـHTML يبدأ بوسم <style> فلا نلتقط أول عنصر
    // (يطلع 0×0 ويكسر الحساب)، بل عنصر الصفحة نفسه.
    const el = host.querySelector('.mkt-sheet') || Array.from(host.children).find((c) => c.tagName !== 'STYLE') || host.firstElementChild;
    if (!el) return;
    await ensureArabicFont(el);
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

// سفاري الآيفون: هل المتصفح سفاري على iOS؟ (كروم وفايرفوكس بالآيفون يشتغلون
// على محرك سفاري نفسه بس سلوك التنزيل عندهم مختلف، فنستثنيهم بالفحص)
function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOS = /iP(hone|ad|od)/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // آيباد بوضع سطح المكتب
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
  return iOS && safari;
}

// تنزيل الملف للجهاز.
//
// مشكلتان حقيقيتان كانتا هنا:
// 1) **سفاري الآيفون يتجاهل خاصية `download`** بروابط blob: — الضغط ما يسوي شي،
//    فالمستخدم يشوف نافذة الخيارات ويضغط «تنزيل» وما ينزل ولا شي. البديل: نفتح
//    الملف بتبويب جديد، فيطلع بعارض PDF مال سفاري ومنه يحفظ أو يشارك بأزرار
//    النظام نفسها.
// 2) `revokeObjectURL` كان ينندى **فوراً** بعد الضغط — والتنزيل ما يكون بدأ بعد،
//    فالرابط ينموت قبل ما ينقرأ. التحرير صار مؤجلاً.
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const release = () => setTimeout(() => URL.revokeObjectURL(url), 60000);

  if (isIosSafari()) {
    const win = window.open(url, '_blank');
    if (!win) window.location.href = url; // منع النوافذ المنبثقة — نفتحه بنفس التبويب
    release();
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  release();
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
    // من هنا وطالع إحنا ننتظر **المستخدم** مو الجهاز
    stopBusyIndicator();
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
        // نفس قاعدة المشاركة بالأعلى: الرجوع من واتساب يعني إنها خلصت، وبدونه
        // تبقى النافذة مفتوحة للأبد لأن الوعد ما يرد
        const outcome = await shareFile(pdfFile, fileName);
        if (outcome === 'shared' || outcome === SHARE_RETURNED) {
          done({ canceled: false, shared: true });
          return;
        }
        if (outcome && outcome.name === 'AbortError') return; // ألغى من القائمة — النافذة تبقى
        downloadBlob(blob, fileName);
        done({ canceled: false, shared: false });
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

// `navigator.share` بمتصفح التلفون ممكن **ما يرجّع أبداً**: لا ينجح ولا يرمي خطأ.
// السبب إن المشاركة تحتاج «لمسة مستخدم حيّة»، وتوليد ملف الـPDF ياخذ ثوانٍ
// (رسم الجدول وصفحة التصميم وانتظار الخطوط)، فتنتهي صلاحية اللمسة قبل ما نناديها.
// بعض إصدارات سفاري وكروم بهذي الحالة تخلي الوعد معلّقاً للأبد — والنتيجة اللي
// يشوفها البياع: شريط تحميل يلف بلا نهاية وبلا ملف وبلا رسالة.
// العلاج: نسابق المشاركة بمهلة، وإذا ما ردّت نفتح نافذة الخيارات — زر المشاركة
// بيها يشتغل بلمسة جديدة (إذن جديد) فينجح.
const SHARE_TIMEOUT_MS = 12000;
const SHARE_TIMED_OUT = Symbol('share-timeout');
// رجعت الصفحة للمقدمة بعد لوحة المشاركة — الرحلة خلصت وما نعرف نتيجتها بالضبط
const SHARE_RETURNED = Symbol('share-returned');

// شريط التحميل العام يتغذى من عدّاد نداءات الـapi (main.jsx). لما ننتظر **المستخدم**
// — لوحة مشاركة مفتوحة أو نافذة خيارات — نطفيه صراحةً: البرنامج مو مشغول، هو ينتظر.
function stopBusyIndicator() {
  try {
    window.dispatchEvent(new CustomEvent('api-busy', { detail: { busy: false } }));
  } catch {
    /* بيئة بلا نافذة (اختبارات) — ما يهم */
  }
}

// المهلة تنطبق **فقط** إذا ما انفتحت لوحة المشاركة أصلاً. إذا انفتحت فعلاً
// الصفحة تفقد التركيز (blur / visibilitychange) — وهنا ننتظر المستخدم بلا مهلة،
// حتى ما نطلعله نافذتنا فوق لوحة المشاركة وهو يختار واتساب.
// المشاركة بمتصفح التلفون: `navigator.share` **ما يرجّع أبداً** بأغلب الأجهزة
// لما ينتقل المستخدم لواتساب ويرجع — حتى لو المشاركة نجحت تماماً. فالانتظار
// عليه لحاله معناه إن البرنامج يضل يحسب العملية شغّالة، وبعد المهلة يطلع
// «التصدير طوّل» رغم إن الملف انبعث فعلاً (هذا بالضبط اللي صار بعد واتساب).
//
// الإشارة الوحيدة المضمونة إن الرحلة خلصت: **رجوع الصفحة للمقدمة**. فننتظر
// أول واحدة من ثلاث: رد المشاركة نفسها، أو رجوع الصفحة بعد ما راحت، أو مهلة
// تنطبق فقط إذا اللوحة ما انفتحت أصلاً.
function shareFile(pdfFile, fileName) {
  return new Promise((resolve) => {
    let settled = false;
    let wentAway = false;
    let timer;
    let returnTimer;

    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(returnTimer);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    function onLeave() {
      if (wentAway) return;
      wentAway = true;
      clearTimeout(timer);
      // الدور صار على المستخدم (لوحة المشاركة مفتوحة) — نطفي شريط التحميل
      stopBusyIndicator();
    }
    function onReturn() {
      if (!wentAway || settled) return;
      // مهلة قصيرة بعد الرجوع: نعطي فرصة لوعد المشاركة يرد بنتيجته الحقيقية
      // (نجاح أو إلغاء) قبل ما نعتبرها خلصت بالرجوع
      clearTimeout(returnTimer);
      returnTimer = setTimeout(() => finish(SHARE_RETURNED), 600);
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') onLeave();
      else onReturn();
    }

    window.addEventListener('blur', onLeave);
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onVisibility);

    navigator.share({ files: [pdfFile], title: fileName })
      .then(() => finish('shared'), (err) => finish(err || new Error('share failed')));

    timer = setTimeout(() => { if (!wentAway) finish(SHARE_TIMED_OUT); }, SHARE_TIMEOUT_MS);
  });
}

// إيصال الملف للمستخدم بالترتيب: مشاركة أصلية (تطبيق أندرويد) ← مشاركة ويب ←
// نافذة الخيارات عند فشل الإذن أو تعليقه ← تنزيل مباشر.
// مصدَّرة حتى تنفحص بالاختبارات.
export async function deliverPdf(blob, fileName) {
  const pdfFile = new File([blob], fileName, { type: 'application/pdf' });

  const nativeResult = await shareViaCapacitor(blob, fileName);
  if (nativeResult) return nativeResult;

  if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    const outcome = await shareFile(pdfFile, fileName);
    if (outcome === 'shared') return { canceled: false, shared: true };
    // رجع من لوحة المشاركة: الملف بيد المستخدم (أو ألغى بنفسه) — ما نطلعله خطأ
    if (outcome === SHARE_RETURNED) return { canceled: false, shared: true };
    if (outcome && outcome.name === 'AbortError') return { canceled: true };
    // انتهت المهلة (وعد معلّق) أو انرفض الإذن (NotAllowedError) — الخيارات بضغطة جديدة
    return showDeliverDialog({ pdfFile, blob, fileName, allowShare: true });
  }

  downloadBlob(blob, fileName);
  return { canceled: false, shared: false };
}

export async function exportInvoicePdf({ quote, items, notes, company, fileName, attachment = null, installment = null, structure = true, capability = null, integrated = null, panelCount: panelCountIn = null }) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-2000px;top:0;width:794px;background:#fff;z-index:-1;';
  host.innerHTML = buildInvoiceInnerHtml({ quote, items, notes, company, installment });
  document.body.appendChild(host);

  try {
    const sheet = host.querySelector('.inv-sheet');
    await ensureArabicFont(sheet);

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
        // عدد الألواح يجي جاهزاً من طبقة البيانات (تعرُّف بفئة المادة). قراءة الوصف
        // احتياط أخير فقط: كانت تفشل إذا الوصف ما بيه كلمة «شمسية» أو بيه كلمة مثل
        // «الهيكل» أو «لشحن البطاريات» — فتختفي صفحة الغلاف بلا سبب ظاهر.
        const panelCount = panelCountIn != null ? panelCountIn : panelCountFromItems(items);
        // الكابينة تجي جاهزة من طبقة البيانات (تعرُّف بفئة المادة)، وقراءة الوصف
        // احتياط أخير فقط — حتى ما تختفي الصفحة لو الوسيط ما وصل لأي سبب
        const cabinet = integrated || (quote?.system_type === 'integrated' ? integratedFromItems(items) : null);
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

// تصدير منشور الباقات صورة PNG — نفس مسار الفاتورة الآمن للحروف العربية
// (`ensureArabicFont` قبل html2canvas)، بس المخرج صورة مو PDF.
export async function exportPosterPng(innerHtml, fileName, { width = 1300, height = 1080, scale = 2 } = {}) {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-4000px;top:0;width:${width}px;background:#fff;z-index:-1;`;
  host.innerHTML = innerHtml;
  document.body.appendChild(host);
  try {
    await ensureArabicFont(host);
    // ننتظر تحميل صور المنتجات — html2canvas يرسم إطاراً فارغاً إذا صوّر قبلها
    await Promise.all(
      [...host.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((res) => {
        img.onload = res; img.onerror = res;
      })))
    );
    const canvas = await html2canvas(host.firstElementChild || host, {
      scale, useCORS: true, backgroundColor: '#ffffff', width, height,
    });
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('ما انبنت الصورة');
    downloadBlob(blob, fileName);
    return { canceled: false, width: canvas.width, height: canvas.height };
  } finally {
    document.body.removeChild(host);
  }
}
