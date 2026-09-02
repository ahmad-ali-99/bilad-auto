// عزل المخزون المضاف — منو يشوف مواد منو.
//
// القاعدة: بعض الحسابات مخزونها اللي تضيفه **خاص بيها**. المادة تبقى بالقاعدة
// مثل ما هي، بس ما تظهر بشاشة المخزون ولا تدخل محرك التسعير إلا عند صاحبها
// وعند حسابات الإدارة — نفس دكتورين العروض بـquoteAccess.js: مالك واحد،
// والإدارة تشوف الكل.
//
// **بلا عمود جديد بالقاعدة**: المالك محفوظ أصلاً بـapp_config بمفتاح
// `material_owner_<id>` (تسجّله الإضافة اليدوية والاستيراد سوا)، وهذا الملف
// يقرأ نفس الخريطة ويقرر منو يشوف شنو.
//
// **ملاحظة مهمة**: هذا عزل بطبقة البيانات بالتطبيق، مو RLS بالقاعدة. المنع
// الحقيقي يحتاج سياسة بالقاعدة، وتعديل بنيتها خارج المسموح هنا. فالفلترة
// تمشي بكل مسارات القراءة (المخزون والعرض والباقات والاستيراد والبراندات)
// لأنها محطوطة بنقطتَي القراءة الوحيدتين لا بكل شاشة على حدة.
import { normName } from './staffRoles.js';

/**
 * يفلتر قائمة مواد على اللي يحق للحساب الحالي يشوفها.
 *
 * @param {string} me            الحساب الحالي
 * @param {Array}  rows          صفوف المواد
 * @param {Object} owners        { [materialId]: 'اسم الحساب اللي أضافها' }
 * @param {(name:string)=>boolean} isAdmin           هل الحساب إداري؟
 * @param {(name:string)=>boolean} isPrivateOwner    هل مخزون هذا الحساب خاص؟
 */
export function visibleMaterials(me, rows, owners, { isAdmin, isPrivateOwner }) {
  const list = rows || [];
  if (isAdmin(me)) return list;
  const mine = normName(me);
  const map = owners || {};
  return list.filter((m) => {
    const owner = map[Number(m?.id)];
    // بلا مالك = مخزون مشترك، وأي مالك مخزونه مو خاص = مشترك هم
    if (!owner || !isPrivateOwner(owner)) return true;
    // مخزون خاص: صاحبه وحده
    return !!mine && normName(owner) === mine;
  });
}
