// حساب النسبة اللازمة للوصول لمبلغ معيّن، وتقريب مبلغ المصرف.
// دوال نقية بلا حالة — تُختبر لحالها وتُستعمل بالشاشة وبطبقة البيانات سوية.

/** المصرف ما يقبل إلا مبالغ بملايين كاملة */
export const BANK_STEP = 1_000_000;

/** هل المبلغ مليون كامل؟ (0 ولا سالب ما يحتاجون تقريباً) */
export function isWholeMillions(amount) {
  const n = Number(amount);
  return !(n > 0) || n % BANK_STEP === 0;
}

/**
 * خيارا التقريب لأقرب مليون: الأعلى والأوطأ.
 * الأوطأ يرجع null إذا التقريب ينزل بالمبلغ لصفر — ماكو عرض بصفر.
 */
export function bankRoundOptions(amount) {
  const n = Number(amount) || 0;
  if (isWholeMillions(n)) return null;
  const down = Math.floor(n / BANK_STEP) * BANK_STEP;
  const up = Math.ceil(n / BANK_STEP) * BANK_STEP;
  return {
    current: n,
    up, upDiff: up - n,
    down: down > 0 ? down : null,
    downDiff: down > 0 ? n - down : null,
  };
}

/**
 * النسبة اللازمة للوصول من مبلغ لمبلغ.
 * ترجع { kind: 'markup' | 'discount' | 'none', percent } — والنسبة مقرّبة
 * لأربع منازل حتى ما تضيع دنانير بمبالغ الملايين.
 */
export function percentToReach(base, target) {
  const b = Number(base) || 0;
  const t = Number(target) || 0;
  if (b <= 0 || t <= 0 || t === b) return { kind: 'none', percent: 0 };
  const raw = t > b ? (t / b - 1) * 100 : (1 - t / b) * 100;
  // ثماني منازل مو أربع: على مبالغ الملايين، التقريب لأربع منازل يضيّع دنانير
  // (26,200,800 ← 30,000,000 كان يطلع 29,999,995). والتقريب لازم يبقى موجوداً
  // حتى ضجيج العشرية العائمة ما يخلّي 20% تطلع 19.999999999999996.
  const percent = Math.round(raw * 1e8) / 1e8;
  if (percent <= 0) return { kind: 'none', percent: 0 };
  return { kind: t > b ? 'markup' : 'discount', percent };
}

/**
 * يحوّل مبلغ الوصول لكائن النِسَب اللي يفهمه محرك العرض.
 * الافتراض **موزّع** (غير علني): الفرق ينزل بأسعار البنود نفسها بلا سطر ظاهر.
 */
export function adjustmentsForTarget(base, target, { visible = false } = {}) {
  const { kind, percent } = percentToReach(base, target);
  const mode = visible ? 'visible' : 'distributed';
  if (kind === 'markup') return { markupPercent: percent, markupMode: mode, discountPercent: 0 };
  if (kind === 'discount') return { markupPercent: 0, discountPercent: percent, discountMode: mode };
  return { markupPercent: 0, discountPercent: 0 };
}
