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

const RESTRICTED_USERS = ['بكر', 'علي سبتي', 'ليث كرادة'];

// حسابات «تضيف بس ما تعدّل على القديم»: تكدر تضيف مواد جديدة للمخزون وتعدّل
// وتحذف اللي أضافته هي فقط. المخزون القديم (اللي ما أضافته) يبقى للقراءة عندها،
// وباقي صلاحيات الحساب ما تتغير (بلا إعدادات، وتشوف عروضها هي بس).
// المشرفون يعدّلون كل شي بضمنه اللي يضيفه هؤلاء.
const INVENTORY_CONTRIBUTORS = ['بكر'];

// توحيد شكل الاسم قبل المقارنة: مسافات الأطراف، والمسافات المتعددة داخل الاسم
// (الأسماء الثنائية مثل «علي سبتي» تنكتب أحياناً بمسافتين — بدونها تفشل المطابقة
// وينفتح الحساب بصلاحيات كاملة بلا ما ننتبه)، وتوحيد الهمزة والألف المقصورة.
const norm = (s) => String(s || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي');

export function isRestrictedUser(username) {
  const u = norm(username);
  return RESTRICTED_USERS.some((r) => norm(r) === u);
}

// تعديل المخزون كاملاً (كل المواد والأجور والاستيراد) — الحسابات غير المقيّدة
export function canEditInventory(username) {
  return !isRestrictedUser(username);
}

// حساب يضيف مواد جديدة ويملك اللي يضيفه
export function isInventoryContributor(username) {
  const u = norm(username);
  return INVENTORY_CONTRIBUTORS.some((r) => norm(r) === u);
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
  return BRAND_PICKERS.some((r) => norm(r) === u);
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
  return canEditInventory(username);
}

// أجور العمل تبقى للحسابات الكاملة — أسعار مشتركة تمس عروض الفريق كله
export function canEditLabor(username) {
  return canEditInventory(username);
}

// تعديل إعدادات الحساب وملف الشركة والملاحظات الافتراضية — للمشرفين حصراً
// (ثوابت المعادلات وأسعار التقسيط وملف الشركة تمس كل عروض الفريق)
export function canEditSettings(username) {
  return isAdminName(username);
}

// الاطلاع على عروض *الفريق كلها* — للمشرفين حصراً.
// البياع الاعتيادي يفتح صفحة العروض عادي لكن يشوف عروضه هو فقط (فلترة بـdataApi).
export function canViewQuotes(username) {
  return isAdminName(username);
}

// صلاحيات المشرفين كما هي (تبويب الطلبات، أدوات المساعد الإدارية)
export { isAdminName };
