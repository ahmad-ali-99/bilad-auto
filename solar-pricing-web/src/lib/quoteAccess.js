// ملكية العروض — مكان واحد يحدد منو يشوف ومنو يفتح ويعدّل أي عرض.
//
// القاعدة اللي اتفقنا عليها:
//   • كل عرض له **مالك واحد** = `created_by`.
//   • الحساب الاعتيادي يشوف عروضه هو، ويفتحها ويعدّلها ويحذفها.
//   • الحسابات الإدارية تشوف وتفتح وتعدّل **كل** العروض — عروضها وعروض غيرها.
//   • الحساب الإداري يقدر ينشئ عرضاً **باسم حساب ثاني** («العرض من طرف»)،
//     فيروح لصاحبه: يطلع بقائمته ويفتحه ويعدّله — ويبقى مفتوحاً للإدارة معه.
//
// ليش ملف مستقل: الفلترة بالقائمة كانت موجودة، بس **فتح عرض بالمعرّف** كان
// مفتوحاً على وسعه — أي حساب يقدر يوصل لأي عرض إذا عرف رقمه (رابط، أو أداة
// المساعد). الفلترة بالواجهة ما هي حماية؛ المنع لازم يكون بنقطة الوصول نفسها.
import { isAdminName } from './agent.js';

// توحيد شكل الاسم قبل المقارنة — نفس قاعدة permissions.js:
// مسافات الأطراف، والمسافات المتعددة، والهمزة، والألف المقصورة.
export const normName = (s) => String(s || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  // التاء المربوطة مع الهاء — نفس توحيد الصلاحيات، حتى صاحب العرض يفتح عرضه
  // مهما انكتب اسمه بالشكلين
  .replace(/ة/g, 'ه');

/** مالك العرض كما هو مخزون بالصف (اسم حساب، أو إيميل بالعروض القديمة) */
export function ownerOf(quote) {
  return quote?.created_by || null;
}

/**
 * هل هذا الحساب مالك هذا العرض؟
 * المطابقة بالاسم، ومعها الإيميل للعروض القديمة اللي انحفظت بإيميل الدخول.
 */
export function ownsQuote(identity, quote) {
  const owner = ownerOf(quote);
  if (!owner) return false;
  const { username, email } = identity || {};
  if (normName(username) && normName(owner) === normName(username)) return true;
  return !!email && owner === email;
}

/**
 * هل يقدر يشوف/يفتح/يعدّل هذا العرض؟
 * @param {{username?: string, email?: string}} identity الحساب الحالي
 * @param {object} quote صف العرض (نحتاج منه created_by)
 */
export function canAccessQuote(identity, quote) {
  if (!quote) return false;
  if (isAdminName(identity?.username)) return true;
  return ownsQuote(identity, quote);
}

/** فلترة قائمة عروض على اللي يحق له يشوفها */
export function visibleQuotes(identity, rows) {
  if (isAdminName(identity?.username)) return rows || [];
  return (rows || []).filter((q) => ownsQuote(identity, q));
}

/**
 * هل يقدر ينسب العرض لحساب ثاني («العرض من طرف»)؟
 * الحسابات الإدارية كلها — مو حساب واحد.
 */
export function canAttributeQuote(username) {
  return isAdminName(username);
}

/** رسالة المنع — نفس الصيغة بكل نقاط الوصول */
export function accessDeniedMessage(what = 'هذا العرض') {
  return `${what} يخص حساباً ثانياً — فتحه وتعديله محصور بصاحبه وبحسابات الإدارة`;
}
