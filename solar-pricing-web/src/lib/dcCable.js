// كيبل الألواح — قاعدة الشركة: **كل ٩ ألواح تحتاج ٥٠ متر**، وأي لوح زيادة
// يفتح خمسين متراً جديدة. يعني ٩ ← ٥٠، و١٠ ← ١٠٠، و١٨ ← ١٠٠، و١٩ ← ١٥٠.
//
// والمقطع يتبع واطية اللوح: **٤ ملم للوح ٦٥٠ واط**، وأكثر من هيك ٦ ملم.

export const PANELS_PER_RUN = 9;
export const METERS_PER_RUN = 50;
/** أعلى واطية تكتفي بـ٤ ملم — فوقها ينتقل لـ٦ ملم */
export const MM4_MAX_WATT = 650;

/** الأمتار المطلوبة لعدد ألواح */
export function dcCableMeters(panelCount) {
  const n = Math.floor(Number(panelCount) || 0);
  if (n <= 0) return 0;
  return Math.ceil(n / PANELS_PER_RUN) * METERS_PER_RUN;
}

/** المقطع المناسب لواطية اللوح (ملم) */
export function dcCableSizeFor(panelWatt) {
  return Number(panelWatt) > MM4_MAX_WATT ? 6 : 4;
}

const text = (m) => `${m?.full_description || ''} ${m?.model || ''} ${m?.brand || ''}`;

/**
 * مقطع الكيبل من وصفه (ملم).
 *
 * **يرفض صيغة العدد×المقطع** مثل «4×35 ملم»: هذا كيبل حمل متعدد النواة
 * (أربع نواة بمقطع ٣٥)، والرقم الأول عدد نواة لا مقطعاً — قراءته كـ«٤ ملم»
 * تخلي كيبل الحمل ينخطف كأنه كيبل ألواح.
 */
export function cableSizeOf(material) {
  const t = text(material);
  if (/\d\s*[×xX*]\s*\d/.test(t)) return null;
  const m = /(\d+(?:[.,]\d+)?)\s*(?:ملم|مم|ملي|mm)/i.exec(t);
  return m ? Number(String(m[1]).replace(',', '.')) : null;
}

/** كيبل ألواح؟ مادة بالمتر، بمقطع معروف، ومو كيبل حمل أو شحن */
export function isDcCable(material) {
  if (!material || material.unit !== 'متر') return false;
  const t = text(material);
  if (/حمل|شحن|أرضي|ارضي|إيرث|ايرث|earth/i.test(t)) return false;
  return cableSizeOf(material) != null;
}

/**
 * يختار كيبل الألواح المناسب من المواد الثانوية.
 * يفضّل المقطع المطلوب بالضبط؛ وإذا مو موجود بالمخزون ياخذ **أقرب مقطع
 * أكبر** (الأصغر يسخن ويهبط بيه الفولت — النزول عنه غلط هندسي، والصعود آمن).
 */
export function pickDcCable(materials, panelWatt) {
  const cables = (materials || []).filter(isDcCable);
  if (!cables.length) return null;
  const want = dcCableSizeFor(panelWatt);
  const exact = cables.find((c) => cableSizeOf(c) === want);
  if (exact) return exact;
  const bigger = cables.filter((c) => cableSizeOf(c) > want).sort((a, b) => cableSizeOf(a) - cableSizeOf(b));
  return bigger[0] || null;
}
