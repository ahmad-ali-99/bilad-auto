// صلاحيات الحسابات — مكان واحد يحدد منو يقدر يعدّل شنو.
//
// الوضع قبل هذا الملف: أي موظف مسجّل دخول كان يقدر يضيف ويعدّل ويحذف مواد المخزون
// وأسعارها وأجور العمل وإعدادات الحساب — بلا أي منع. القيود كانت فقط على أدوات
// المساعد الذكي (ADMIN_USERS بـagent.js).
//
// الحسابات المقيّدة: تشوف كل شي (المخزون والأسعار والعروض) وتسوي عروضاً عادي،
// بس ما تقدر تعدّل المخزون ولا الأجور ولا الإعدادات ولا ملف الشركة.
// الإضافة والحذف من القائمة بسطر واحد هنا.
import { isAdminName } from './agent.js';

const RESTRICTED_USERS = ['بكر'];

const norm = (s) => String(s || '').trim().replace(/[أإآ]/g, 'ا');

export function isRestrictedUser(username) {
  const u = norm(username);
  return RESTRICTED_USERS.some((r) => norm(r) === u);
}

// تعديل المخزون (مواد، أسعار، أجور عمل، استيراد إكسل)
export function canEditInventory(username) {
  return !isRestrictedUser(username);
}

// تعديل إعدادات الحساب وملف الشركة والملاحظات الافتراضية — للمشرفين حصراً
// (ثوابت المعادلات وأسعار التقسيط وملف الشركة تمس كل عروض الفريق)
export function canEditSettings(username) {
  return isAdminName(username);
}

// الاطلاع على سجل العروض المحفوظة (صفحة «العروض») — للمشرفين حصراً.
// البياع الاعتيادي يسوي عروضه ويصدّرها، بس ما يتصفح عروض الفريق وأسعارهم وزبائنهم.
export function canViewQuotes(username) {
  return isAdminName(username);
}

// صلاحيات المشرفين كما هي (تبويب الطلبات، أدوات المساعد الإدارية)
export { isAdminName };
