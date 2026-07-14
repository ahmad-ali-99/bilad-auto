// الافتراضيات المشتركة للمواد الثانوية — تستخدمها شاشة الموظفين وحاسبة الزبون:
// القائمة الدائمة المحفوظة بالإعدادات (secondary_defaults) إن وجدت، وإلا الأساسيات
// المرتبطة بالألواح (هيكل + صبات) + بوردة الحماية DC.
export function computeSecondaryDefaults(secondaryMaterials, savedIds) {
  const defaults = {};
  if (Array.isArray(savedIds) && savedIds.length > 0) {
    const existing = new Set(secondaryMaterials.map((m) => m.id));
    for (const id of savedIds) if (existing.has(id)) defaults[id] = { qty: '' };
    return defaults;
  }
  for (const m of secondaryMaterials) {
    if (m.qty_per_panel && m.qty_per_panel > 0) defaults[m.id] = { qty: '' };
  }
  const dcBoard = secondaryMaterials.find((m) => {
    const name = `${m.model || ''} ${m.brand || ''}`;
    if (!/بورد/.test(name)) return false;
    if (/AC|نضائد|رئيسي|Main/i.test(name)) return false;
    return /DC/i.test(name) || /حماية/.test(name);
  });
  if (dcBoard) defaults[dcBoard.id] = { qty: '' };
  return defaults;
}
