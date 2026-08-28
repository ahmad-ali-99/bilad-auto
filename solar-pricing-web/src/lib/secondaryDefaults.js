// الافتراضيات المشتركة للمواد الثانوية — تستخدمها شاشة الموظفين وحاسبة الزبون:
// القائمة الدائمة المحفوظة بالإعدادات (secondary_defaults) إن وجدت، وإلا الأساسيات
// المرتبطة بالألواح (هيكل + صبات) + بوردة الحماية DC.
import { isDcCable } from './dcCable.js';

// بوردة الحماية DC (جهة الألواح) — تُستثنى تلقائياً من العروض بلا ألواح
export function isDcProtectionBoard(m) {
  const name = `${m.model || ''} ${m.brand || ''}`;
  if (!/بورد/.test(name)) return false;
  if (/AC|نضائد|رئيسي|Main/i.test(name)) return false;
  return /DC/i.test(name) || /حماية/.test(name);
}

// المواد المرتبطة بجهة الألواح (هيكل + صبات + بورد حماية DC) — ما إلها معنى بعرض
// أوف جرد (انفيرتر وبطاريات بلا ألواح ولا هيكل)، فتُستثنى من الافتراضيات ومن النافذة
export function isPanelSideMaterial(m) {
  return (m.qty_per_panel && m.qty_per_panel > 0) || isDcProtectionBoard(m);
}

// كيبلات الألواح تنضاف افتراضياً بأي عرض بيه ألواح — أمتارها تنحسب بالمحرك
// (كل ٩ ألواح ٥٠ متر) والمقطع غير المطابق لواطية اللوح يُسقط هناك، فتأشير
// كل المقاطع هنا آمن ويخلي القاعدة تشتغل بلا ما يتذكرها البياع.
function addDcCableDefaults(secondaryMaterials, defaults) {
  for (const m of secondaryMaterials) if (isDcCable(m)) defaults[m.id] = { qty: '' };
}

export function computeSecondaryDefaults(secondaryMaterials, savedIds, systemType = 'full') {
  const offgrid = systemType === 'offgrid';
  const defaults = {};
  // قائمة معتمدة موجودة — حتى لو فارغة. الفارغة تعني «ماكو مواد ثانوية افتراضية»،
  // وإرجاعها للمحسوب كان يخلي «اعتماد» بلا تأشير ما يسوي شي.
  if (Array.isArray(savedIds)) {
    const byId = new Map(secondaryMaterials.map((m) => [m.id, m]));
    for (const id of savedIds) {
      const m = byId.get(id);
      if (!m) continue;
      if (offgrid && isPanelSideMaterial(m)) continue; // القائمة الدائمة تُنقّى بوضع الأوف جرد
      defaults[id] = { qty: '' };
    }
    if (!offgrid) addDcCableDefaults(secondaryMaterials, defaults);
    return defaults;
  }
  if (offgrid) return defaults; // بلا ألواح = بلا افتراضيات جهة الألواح؛ البياع يختار الأسلاك وبقية التفاصيل
  for (const m of secondaryMaterials) {
    if (m.qty_per_panel && m.qty_per_panel > 0) defaults[m.id] = { qty: '' };
  }
  const dcBoard = secondaryMaterials.find(isDcProtectionBoard);
  if (dcBoard) defaults[dcBoard.id] = { qty: '' };
  addDcCableDefaults(secondaryMaterials, defaults);
  return defaults;
}
