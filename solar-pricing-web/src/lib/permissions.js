// صلاحيات الحسابات — مكان واحد يحدد منو يقدر يعدّل شنو.
//
// الوضع قبل هذا الملف: أي موظف مسجّل دخول كان يقدر يضيف ويعدّل ويحذف مواد المخزون
// وأسعارها وأجور العمل وإعدادات الحساب — بلا أي منع. القيود كانت فقط على أدوات
// المساعد الذكي (ADMIN_USERS بـagent.js).
//
// الحسابات المقيّدة: تشوف كل شي (المخزون والأسعار والعروض) وتسوي عروضاً عادي،
// بس ما تقدر تعدّل المخزون ولا الأجور ولا الإعدادات ولا ملف الشركة.
// الإضافة والحذف من القائمة بسطر واحد هنا (RESTRICTED_USERS أدناه).
//
// ملاحظة: الاسم هنا لازم يطابق الاسم المخزون بـraw_user_meta_data->>'username'
// بقاعدة البيانات — هو اللي يوصل للتطبيق بالجلسة.
import { isAdminName } from './agent.js';
import { CAPABILITY_KEYS, normName } from './staffRoles.js';

// ── سجل الصلاحيات المحفوظ ───────────────────────────────────────────────────
// يجي من app_config (مفتاح staff_roles) وينحمّل مرة وحدة عند بدء الجلسة.
// **متزامن عمداً**: كل دوال الصلاحيات تنندى أثناء الرسم، فما ينفع تكون async.
// الحمل غير المتزامن يصير مرة وحدة بـApp.jsx ويحطّ النتيجة هنا.
let ROLES = {};

/** يحطّ السجل المحمّل — ينندى مرة وحدة عند بدء الجلسة */
export function applyStaffRoles(roles) {
  ROLES = roles && typeof roles === 'object' ? roles : {};
}

export function staffRoles() {
  return ROLES;
}

/** صف الحساب إن وُجد بالسجل — وإلا null فترجع الافتراضات القديمة */
function roleOf(username) {
  return ROLES[normName(username)] || null;
}

/**
 * قيمة صلاحية: السجل يسبق، وإذا ماكو صف يرجع الافتراض القديم.
 *
 * **ماكو تجاوز عام للمشرفين هنا عمداً**: مو كل صلاحية كانت للمشرفين أصلاً —
 * مبدّل الماركة مثلاً كان لبكر وأحمد بس، وحوراء مشرفة وما تشوفه. تجاوز عام
 * كان يفتحه لها ويغيّر سلوكاً قائماً بلا ما أحد يطلب. التجاوز الوحيد
 * بـcanEditSettings أدناه — باب الخروج من سجل مكتوب غلط.
 */
function cap(username, key, fallback) {
  const r = roleOf(username);
  if (r && CAPABILITY_KEYS.includes(key)) return r[key] === true;
  return fallback;
}

// **ينسجّل كل شكل ممكن للاسم**: المطابقة تفشل مفتوحة — اسم مو باللائحة يعني
// حساب بصلاحيات كاملة بلا ما ننتبه. فالموظف اللي وراه جهة ينكتب باسمه لحاله
// وباسمه مع جهته سوا، حتى أي شكل ينكتب بيه الحساب وقت إنشائه يبقى مقيّداً.
const RESTRICTED_USERS = [
  'بكر', 'علي سبتي', 'ليث كرادة',
  'براء', 'براء مكتب النواعير', 'براء النواعير',
  'ابو يزن', 'ابو يزن الطاقة الخضراء', 'ابو يزن الخضراء',
  'مصطفى', 'مصطفى شركة سيل', 'مصطفى سيل',
  'حسين', 'حسين انوار المدينة', 'حسين المدينة',
  'محمد يعقوب', 'محمد يعقوب كربلاء', 'محمد يعقوب كربلاء 42',
];

// حسابات «تضيف بس ما تعدّل على القديم»: تكدر تضيف مواد جديدة للمخزون وتعدّل
// وتحذف اللي أضافته هي فقط. المخزون القديم (اللي ما أضافته) يبقى للقراءة عندها،
// وباقي صلاحيات الحساب ما تتغير (بلا إعدادات، وتشوف عروضها هي بس).
// المشرفون يعدّلون كل شي بضمنه اللي يضيفه هؤلاء.
const INVENTORY_CONTRIBUTORS = [
  'بكر',
  'براء', 'براء مكتب النواعير', 'براء النواعير',
  'ابو يزن', 'ابو يزن الطاقة الخضراء', 'ابو يزن الخضراء',
  'مصطفى', 'مصطفى شركة سيل', 'مصطفى سيل',
  'حسين', 'حسين انوار المدينة', 'حسين المدينة',
  'محمد يعقوب', 'محمد يعقوب كربلاء', 'محمد يعقوب كربلاء 42',
];

// توحيد شكل الاسم قبل المقارنة: مسافات الأطراف، والمسافات المتعددة داخل الاسم
// (الأسماء الثنائية مثل «علي سبتي» تنكتب أحياناً بمسافتين — بدونها تفشل المطابقة
// وينفتح الحساب بصلاحيات كاملة بلا ما ننتبه)، وتوحيد الهمزة والألف المقصورة،
// **والتاء المربوطة مع الهاء**: «أنوار المدينة» و«أنوار المدينه» و«كرادة»
// و«كراده» أسماء وحدة يكتبها الناس بالشكلين، وبلا التوحيد الشكل الثاني ما
// يلگى باللائحة فينفتح الحساب كاملاً — نفس الفخ اللي بالمسافات.
const norm = (s) => String(s || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه');

// ═══ زيادة تلقائية مخفية على مجموع العرض ═══════════════════════════════════
// قرار تسعير قنوات: العروض اللي تطلعها هذي الحسابات مجموعها يزيد بالنسبة أدناه،
// والزيادة **تتوزع على أسعار البنود ما عدا الألواح** فما يظهر بالعرض أي سطر
// زيادة ولا نسبة — سعر اللوح يبقى مثل المخزون بالضبط.
//
// اللائحة **صريحة ومنفصلة** عن لوائح الصلاحيات عمداً: لو اشتقّت من
// RESTRICTED_USERS، كان أي حساب مقيّد ينضاف لاحقاً ياخذ زيادة سعرية بلا ما
// أحد يقصد. الزيادة قرار تجاري لكل حساب بعينه، مو أثراً جانبياً لصلاحيته.
const HIDDEN_MARKUP_PERCENT = 10;
const HIDDEN_MARKUP_ACCOUNTS = [
  'براء', 'براء مكتب النواعير', 'براء النواعير',
  'ابو يزن', 'ابو يزن الطاقة الخضراء', 'ابو يزن الخضراء',
  'مصطفى', 'مصطفى شركة سيل', 'مصطفى سيل',
  'حسين', 'حسين انوار المدينة', 'حسين المدينة',
  'محمد يعقوب', 'محمد يعقوب كربلاء', 'محمد يعقوب كربلاء 42',
];

/** نسبة الزيادة المخفية لهذا الحساب (0 = بلا زيادة) */
export function hiddenMarkupPercentFor(username) {
  const r = roleOf(username);
  if (r) return Number(r.hiddenMarkupPercent) > 0 ? Number(r.hiddenMarkupPercent) : 0;
  const u = norm(username);
  return HIDDEN_MARKUP_ACCOUNTS.some((n) => norm(n) === u) ? HIDDEN_MARKUP_PERCENT : 0;
}

export { HIDDEN_MARKUP_PERCENT };

// ═══ عزل المخزون المضاف ════════════════════════════════════════════════════
// حسابات مخزونها اللي تضيفه **خاص بيها**: يظهر لها هي وللإدارة فقط، وما يدخل
// عروض بقية الحسابات. المخزون المشترك يبقى مفتوحاً لها مثل ما هو.
//
// **اللائحة تسبق السجل هنا** — عكس بقية الصلاحيات. سبب واضح: العزل قرار
// حماية، ولو اشتغل مثل الباقي كان مجرد حفظ صف صلاحيات لهذا الحساب من الشاشة
// (والصف ينحفظ بلا الخانة إذا انفتحت الشاشة بنسخة قديمة) يفكّ العزل بصمت
// ويطلع مخزونه لكل الفريق. الشاشة تقدر **تزيد** حسابات، ما تقدر تشيل هذي.
// **المطابقة باحتواء اللقب مو بالاسم الكامل**: باقي اللوائح تطابق الاسم حرفياً
// لأنها تفتح صلاحيات — والمطابقة الفاشلة هناك تفتح الحساب فينتبه صاحبه. هنا
// العكس: المطابقة الفاشلة تسرّب مخزوناً كان لازم ينعزل، وما ينتبه لها أحد.
// فالحساب ينلگه بلقبه مهما انكتب اسمه («حسنين الصائغ» · «حسنين الصايغ» ·
// «حسين الصائغ»)، والهمزة تنكتب بالشكلين فالاثنان مسجّلان.
const PRIVATE_INVENTORY_MARKS = ['الصائغ', 'الصايغ'];

/** حساب عزله مثبّت باللائحة — الشاشة تعرضه مقفلاً بدل ما توهم إنه ينطفي */
export function isForcedPrivateInventory(username) {
  const u = norm(username);
  return !!u && PRIVATE_INVENTORY_MARKS.some((n) => u.includes(norm(n)));
}

/** هل مخزون هذا الحساب المضاف خاص بيه؟ */
export function hasPrivateInventory(username) {
  if (isForcedPrivateInventory(username)) return true;
  return roleOf(username)?.privateInventory === true;
}

export function isRestrictedUser(username) {
  const u = norm(username);
  // حساب الصائغ: مخزونه خاص بيه — يضيف مواده ويعدّلها، والمخزون المشترك
  // والأجور والإعدادات ما تنمس. بلا هذا السطر كان الحساب يفشل مفتوحاً
  // (اسم مو بأي لائحة = صلاحيات كاملة) فيعدّل مخزون الفريق كله.
  if (isForcedPrivateInventory(username)) return true;
  return RESTRICTED_USERS.some((r) => norm(r) === u);
}

// تعديل المخزون كاملاً (كل المواد والأجور والاستيراد) — الحسابات غير المقيّدة
export function canEditInventory(username) {
  return cap(username, 'editInventory', !isRestrictedUser(username));
}

// حساب يضيف مواد جديدة ويملك اللي يضيفه
export function isInventoryContributor(username) {
  const u = norm(username);
  // حساب الصائغ يضيف ويملك اللي يضيفه — نفس حسابات المكاتب
  const before = isForcedPrivateInventory(username)
    || INVENTORY_CONTRIBUTORS.some((r) => norm(r) === u);
  return cap(username, 'addMaterial', before);
}

// هل يقدر يضيف مادة جديدة للمخزون؟
export function canAddMaterial(username) {
  return canEditInventory(username) || isInventoryContributor(username);
}

/**
 * هل يقدر يعدّل/يحذف *هذه* المادة بالذات؟
 * @param {string} username الحساب الحالي
 * @param {string|null} owner الحساب اللي أضاف المادة (من app_config)
 *
 * المشرفون والحسابات غير المقيّدة: كل شي.
 * حساب «الإضافة»: اللي أضافه هو فقط — والمواد القديمة بلا مالك تبقى ممنوعة عليه.
 */
export function canEditMaterial(username, owner) {
  if (canEditInventory(username)) return true;
  if (!isInventoryContributor(username)) return false;
  return !!owner && norm(owner) === norm(username);
}

// مبدّل «البراند» بشاشة العرض — محصور بهذين الحسابين حالياً.
// التوسعة لاحقاً: زيد الاسم بالقائمة وخلص.
const BRAND_PICKERS = ['بكر', 'أحمد'];

export function canPickBrand(username) {
  const u = norm(username);
  return cap(username, 'pickBrand', BRAND_PICKERS.some((r) => norm(r) === u));
}

// الاستيراد من إكسل: مفتوح لحساب الإضافة هم — بس بحدود.
// الاستيراد *يحدّث* مواد موجودة بالمطابقة (فئة+موديل+سعة)، فلو انفتح على
// وسعه صار طريقاً جانبياً يعدّل بيه المخزون القديم. لذلك:
//   الحساب الكامل  → يضيف ويحدّث
//   حساب الإضافة   → يضيف الجديد فقط، وصفوف «تحديث» تنرفض
export function canImportInventory(username) {
  return canEditInventory(username) || isInventoryContributor(username);
}

/** هل يقدر الاستيراد يحدّث مواد موجودة؟ (لا لحساب الإضافة) */
export function canImportUpdates(username) {
  return cap(username, 'importUpdates', canEditInventory(username));
}

// أجور العمل تبقى للحسابات الكاملة — أسعار مشتركة تمس عروض الفريق كله
export function canEditLabor(username) {
  return cap(username, 'editLabor', canEditInventory(username));
}

// تعديل إعدادات الحساب وملف الشركة والملاحظات الافتراضية — للمشرفين حصراً
// (ثوابت المعادلات وأسعار التقسيط وملف الشركة تمس كل عروض الفريق)
// الزيادة والخصم: صلاحية المشرفين + حسابات مسمّاة. كانت محصورة بالمشرفين
// وانفتحت لبكر بطلب صريح (الخصم أولاً ثم الزيادة). التقسيط مفتوح للكل أصلاً.
const PRICE_ADJUST_USERS = ['بكر'];

export function canPriceAdjust(username) {
  // الافتراض القديم: المشرفون + الأسماء المسمّاة. لازم يبقى كما هو حرفياً —
  // إسقاط شق المشرفين منه كان يقفل الزيادة والخصم على حوراء وحيدر
  const before = isAdminName(username) || PRICE_ADJUST_USERS.some((u) => norm(u) === norm(username));
  return cap(username, 'priceAdjust', before);
}

export function canEditSettings(username) {
  // المشرف يوصل الإعدادات دائماً — بدونها سجل صلاحيات مكتوب غلط يقفل
  // الشاشة اللي تصلّحه، وما يبقى مخرج إلا SQL بقاعدة البيانات
  if (isAdminName(username)) return true;
  return cap(username, 'editSettings', false);
}

// حساب المالك (أحمد) — صلاحيات فردية مو إدارية عامة: سجل الحركات، وتفريغ سلة
// المحذوفات، وخيار محرك التصدير. كانت المقارنة مكررة بثلاثة ملفات بنفس النص —
// وأي تعديل بوحدة منهن يخلي الباقيات ورا.
export function isOwnerAccount(username) {
  return norm(username) === norm('أحمد');
}

// الاطلاع على عروض *الفريق كلها* — للمشرفين حصراً.
// البياع الاعتيادي يفتح صفحة العروض عادي لكن يشوف عروضه هو فقط (فلترة بـdataApi).
export function canViewQuotes(username) {
  return cap(username, 'viewAllQuotes', isAdminName(username));
}

/**
 * الصلاحيات **الفعّالة** لحساب — السجل إن وُجد، وإلا الافتراضات القديمة.
 *
 * تبنيها شاشة الإدارة حتى تعرض الوضع القائم فعلاً. بدونها كانت الشاشة تبدي
 * كل حساب بلا صف بالسجل **بصفر صلاحيات**، فمجرد فتح الشاشة وضغط «حفظ» يقلب
 * «امشِ بالافتراضات» إلى «كل شي مقفل» — وهذا اللي صار: حوراء انقفلت كلياً.
 */
export function effectiveRole(username) {
  return {
    editInventory: canEditInventory(username),
    addMaterial: isInventoryContributor(username),
    importUpdates: canImportUpdates(username),
    editLabor: canEditLabor(username),
    editSettings: canEditSettings(username),
    priceAdjust: canPriceAdjust(username),
    pickBrand: canPickBrand(username),
    viewAllQuotes: canViewQuotes(username),
    attributeQuotes: isAdminName(username),
    viewHistory: isOwnerAccount(username),
    hiddenMarkupPercent: hiddenMarkupPercentFor(username),
    privateInventory: hasPrivateInventory(username),
  };
}

// صلاحيات المشرفين كما هي (تبويب الطلبات، أدوات المساعد الإدارية)
export { isAdminName };
