// ═══ سجل الحسابات وصلاحياتها ═══════════════════════════════════════════════
//
// الصلاحيات كانت لوائح أسماء ثابتة بالكود: أي حساب جديد أو أي تعديل صلاحية
// يحتاج تعديل كود ونشراً. هنا صارت **بيانات** تنحفظ بـapp_config (بلا أي
// تغيير ببنية القاعدة) وتنعدّل من شاشة الإعدادات.
//
// اللوائح القديمة بقت كـ**افتراضات**: أي حساب ماكو له صف بالسجل ياخذ صلاحياته
// منها بالضبط، فيوم النشر ولا حساب يتغيّر سلوكه.
//
// **المطابقة تفشل مفتوحة**: اسم ماكو له لا صف ولا افتراض = حساب بصلاحيات
// كاملة. لذلك كل شكل ممكن للاسم ينسجّل، والمقارنة توحّد الهمزة والألف
// المقصورة والتاء المربوطة والمسافات.

export const CAPABILITIES = {
  editInventory: 'تعديل المخزون كاملاً',
  addMaterial: 'إضافة مواد جديدة (يملك اللي يضيفه)',
  importUpdates: 'الاستيراد يحدّث مواد موجودة',
  editLabor: 'تعديل أجور العمل',
  editSettings: 'تعديل الإعدادات وملف الشركة',
  priceAdjust: 'الزيادة والخصم بالعرض',
  pickBrand: 'مبدّل الماركة بشاشة العرض',
  viewAllQuotes: 'الاطلاع على عروض الفريق كله',
  attributeQuotes: 'إسناد العرض لحساب ثاني',
  viewHistory: 'سجل الحركات وسلة المحذوفات',
};

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES);

// توحيد شكل الاسم قبل المقارنة — نسخة واحدة يستعملها السجل والصلاحيات سوية
export const normName = (s) => String(s || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه');

/** صف صلاحيات فارغ — كل شي مطفي */
export function emptyRole() {
  return Object.fromEntries(CAPABILITY_KEYS.map((k) => [k, false]));
}

/** صف المشرف — كل شي مفتوح */
export function adminRole() {
  return Object.fromEntries(CAPABILITY_KEYS.map((k) => [k, true]));
}

/**
 * يقرأ سجلاً محفوظاً ويرجّع خريطة اسم مُوحّد ← صف صلاحيات.
 * أي مفتاح غريب ينشال، وأي قيمة مو منطقية تصير false — السجل يجي من
 * قاعدة البيانات، وثقة عمياء بيه تعني صلاحية تنفتح بمفتاح مكتوب غلط.
 */
export function parseRoles(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [name, caps] of Object.entries(raw)) {
    if (!name || typeof caps !== 'object' || caps === null) continue;
    const role = emptyRole();
    for (const k of CAPABILITY_KEYS) role[k] = caps[k] === true;
    role.hiddenMarkupPercent = Number(caps.hiddenMarkupPercent) > 0 ? Number(caps.hiddenMarkupPercent) : 0;
    role.label = typeof caps.label === 'string' ? caps.label : String(name);
    out[normName(name)] = role;
  }
  return out;
}

/** يبني سجلاً جاهزاً للحفظ من قائمة صفوف الشاشة */
export function serializeRoles(rows) {
  const out = {};
  for (const r of rows) {
    if (!r?.username) continue;
    const caps = {};
    for (const k of CAPABILITY_KEYS) caps[k] = r[k] === true;
    caps.hiddenMarkupPercent = Number(r.hiddenMarkupPercent) > 0 ? Number(r.hiddenMarkupPercent) : 0;
    caps.label = r.username;
    out[r.username] = caps;
  }
  return out;
}
