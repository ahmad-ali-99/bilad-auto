// الافتراضيات المشتركة للمواد الثانوية — تستخدمها شاشة الموظفين وحاسبة الزبون:
// القائمة الدائمة المحفوظة بالإعدادات (secondary_defaults) إن وجدت، وإلا الأساسيات
// المرتبطة بالألواح (هيكل + صبات) + بوردة الحماية DC.
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

export function computeSecondaryDefaults(secondaryMaterials, savedIds, systemType = 'full') {
  const offgrid = systemType === 'offgrid';
  const defaults = {};
  if (Array.isArray(savedIds) && savedIds.length > 0) {
    const byId = new Map(secondaryMaterials.map((m) => [m.id, m]));
    for (const id of savedIds) {
      const m = byId.get(id);
      if (!m) continue;
      if (offgrid && isPanelSideMaterial(m)) continue; // القائمة الدائمة تُنقّى بوضع الأوف جرد
      defaults[id] = { qty: '' };
    }
    return defaults;
  }
  if (offgrid) return defaults; // بلا ألواح = بلا افتراضيات جهة الألواح؛ البياع يختار الأسلاك وبقية التفاصيل
  for (const m of secondaryMaterials) {
    if (m.qty_per_panel && m.qty_per_panel > 0) defaults[m.id] = { qty: '' };
  }
  const dcBoard = secondaryMaterials.find(isDcProtectionBoard);
  if (dcBoard) defaults[dcBoard.id] = { qty: '' };
  return defaults;
}
