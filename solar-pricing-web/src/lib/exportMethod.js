// طريقة توليد ملف العرض — **تفضيل يخص الحساب**، يمشي معه على أي جهاز.
//
// ليش موجود: مسار الرسم بالكانفاس يشتغل طبيعي بأندرويد وبالديسكتوب وبأغلب
// الأجهزة، بس بجهاز واحد بالضبط (آيفون، وبكل المتصفحات لأنهن كلهن على محرك
// سفاري) يعلّق الرسم أو يطيح التبويب قبل ما يخلص. السبب بجهاز المستخدم نفسه
// وما ينقاس من هنا — فبدل ما نغيّر الآلية على الكل (وهم راضين بيها)، نخلي
// المتعثّر يبدّلها لنفسه.
//
// **مخزون بالحساب لا بالمتصفح**: ينحفظ بقاعدة البيانات (app_config بمفتاح
// يحمل اسم الحساب) فيمشي معه لأي جهاز يدخل منه، وما يمس أي حساب ثاني.
// وذاكرة المتصفح تبقى **مرآة** لا مصدراً: تخلي الاختيار شغّالاً أوفلاين
// (والتطبيق PWA) وتمنع ومضة الخيار الغلط قبل ما توصل القراءة.
//
// الطريقتان تطلّعن **نفس الملف بنفس الصفحات ونفس الشكل** (تأكدنا بمقارنة
// صفحةً بصفحة: الفرق حواف الحروف فقط). الفرق بالآلية لا بالنتيجة:
//   • الاعتيادي — html2canvas ← jsPDF ← مشاركة أو تنزيل.
//   • الخفيف    — رسم بـSVG foreignObject ← jsPDF ← **نفس** المشاركة والتنزيل.
//                 ماكو iframe ولا نسخة مستند ولا انتظارات بلا سقف — وهي
//                 بالضبط اللي تعلّق بمحرك سفاري. الملف والخيارات نفسها تماماً.
//   • الطباعة   — طباعة المتصفح نفسها. آخر حل: بلا ملف وبلا خيارات مشاركة،
//                 الحفظ يصير من شاشة الطباعة مال النظام.
const KEY = 'export_method';

// القيمة الفعّالة بالجلسة الحالية. **متزامنة عمداً**: تنقرا أثناء الرسم
// وبمسار التصدير، فما ينفع تكون async — القراءة من القاعدة تصير مرة وحدة
// عند بدء الجلسة وتحطّ هنا.
let CURRENT = null;

// المحرك الافتراضي للكل. صار **الخفيف** بعد ما تأكد المستخدم إنه يشتغل عنده
// مثل القديم بالضبط (نفس نافذة المشاركة والتنزيل)، وهو أصلاً أخف ذاكرةً بـ97%
// وما يمر على انتظارات html2canvas المفتوحة اللي تعلّق بمحرك سفاري.
const DEFAULT_METHOD = 'svg';

export const EXPORT_METHODS = [
  {
    key: 'svg',
    label: 'المحرك الخفيف (الافتراضي)',
    hint: 'رسم مباشر بلا نسخ للصفحة — أخف ذاكرةً وأسرع، ونفس الملف ونفس خيارات المشاركة والتنزيل',
  },
  {
    key: 'canvas',
    label: 'المحرك الاعتيادي',
    hint: 'الطريقة القديمة (html2canvas) — تعلّق ببعض أجهزة سفاري، تنستعمل للمقارنة فقط',
  },
  {
    key: 'print',
    label: 'طباعة المتصفح',
    hint: 'آخر حل: يفتح شاشة الطباعة مال الجهاز بدل ما ينزّل ملفاً',
  },
];

const isValid = (v) => EXPORT_METHODS.some((m) => m.key === v);

/** يحطّ القيمة اللي انقرأت من حساب المستخدم — تنندى مرة وحدة عند بدء الجلسة */
export function applyExportMethod(value) {
  CURRENT = isValid(value) ? value : DEFAULT_METHOD;
  mirror(CURRENT);
}

/** تصفير عند الخروج — حتى الحساب الجاي ما يرث اختيار اللي قبله */
export function clearExportMethod() {
  CURRENT = null;
  try { localStorage.removeItem(KEY); } catch { /* محجوب */ }
}

function mirror(value) {
  try {
    if (value && value !== DEFAULT_METHOD && isValid(value)) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch { /* التخزين المحلي محجوب (تصفح خاص) — نكتفي بالقيمة بالذاكرة */ }
}

export function getExportMethod() {
  if (CURRENT) return CURRENT;
  // المرآة المحلية: تشتغل أوفلاين وقبل ما توصل قراءة الحساب
  try {
    const v = localStorage.getItem(KEY);
    return isValid(v) ? v : DEFAULT_METHOD;
  } catch {
    return DEFAULT_METHOD;
  }
}

/** تبديل محلي فوري — الحفظ بالحساب يصير بطبقة البيانات */
export function setExportMethod(value) {
  CURRENT = isValid(value) ? value : DEFAULT_METHOD;
  mirror(CURRENT);
}

export function prefersPrintExport() {
  return getExportMethod() === 'print';
}

/** المحرك الخفيف: نفس مسار الملف والمشاركة، بس الرسم بـSVG بدل html2canvas */
export function prefersSvgRender() {
  return getExportMethod() === 'svg';
}

export { DEFAULT_METHOD };
