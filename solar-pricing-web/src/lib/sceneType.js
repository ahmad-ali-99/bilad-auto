// كاشف نوع مساحة العرض 3D: البرنامج يفهم نوع المنظومة من بنود العرض نفسها
// ويختار المشهد المطابق — مضخة زراعية / تجاري كبير / بيت سكني (الافتراضي).
export function detectSceneType(draft) {
  if (!draft) return 'house';
  const txt = (draft.items || []).map((i) => String(i.description || '')).join(' ');
  // انفيرتر مضخة (VFD/Pump) = منظومة سحب ماء زراعية — مثل عروض المضخات
  if (/VFD|pump|مضخ/i.test(txt)) return 'pump';
  // عدد ألواح كبير بلا سياق سكني = منظومة تجارية (مخزن/معمل) — مرحلة لاحقة
  const panels = draft.counts?.panel ?? 0;
  if (panels >= 40) return 'commercial';
  return 'house';
}
