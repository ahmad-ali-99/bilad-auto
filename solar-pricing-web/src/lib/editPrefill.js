// بناء كائن التعبئة الكاملة لفتح عرض محفوظ بوضع التعديل — مشترك بين صفحة العروض
// وتنبيه التكرار بصفحة إنشاء العرض. المواد المبدلة يدوياً والثانوية تُستنتج من البنود.
import { normalizeBrandPick, pruneBrandPick } from './brandPick.js';
import { LEGACY_BATTERY_FACTORS, LEGACY_PANEL_SAFETY_FACTOR } from './calc.js';
export async function buildEditPrefill(quoteId) {
  const [full, materials, adjustments] = await Promise.all([
    window.api.quotes.get(quoteId),
    window.api.materials.list(),
    // نسبة الزيادة/الخصم المحفوظة للعرض — ترجع حتى الزيادة الموزعة (المخفية)
    window.api.config.get(`quote_adj_${quoteId}`).catch(() => null),
  ]);
  if (!full) return null;
  const byId = new Map(materials.map((m) => [m.id, m]));
  const overrides = {};
  const secondarySelections = {};
  for (const item of full.items) {
    const mat = item.material_id != null ? byId.get(item.material_id) : null;
    if (!mat) continue; // أجور العمل أو مادة انحذفت من المخزون
    if (mat.category === 'secondary') {
      // فولباك للعروض القديمة: المرتبطة بالألواح تلقائية، والباقي بكميتها المحفوظة
      secondarySelections[mat.id] = { qty: mat.qty_per_panel > 0 ? '' : item.quantity };
    } else {
      overrides[mat.category] = mat.id;
    }
  }
  // نوع المنظومة يُستنتج من أرقام العرض نفسه (بلا حقل إضافي بالقاعدة) — يشتغل حتى
  // للعروض القديمة: نهار صفر = أوف جرد بلا ألواح، ليل صفر = نهارية بلا بطاريات
  // النوع المحفوظ يتقدم على الاستنتاج (السستم المتكامل ما ينستنتج من الأمبير)
  const systemType =
    adjustments?.systemType
      || (Number(full.quote.required_amp_day) === 0 ? 'offgrid'
        : Number(full.quote.required_amp_night) === 0 ? 'day'
          : 'full');

  return {
    // اسم الزبون يمشي مع الارتباط: إذا انبدل بالشاشة معناها صار عرضاً لزبون آخر،
    // فينقطع وضع التعديل بدل ما يدعس على عرض هذا الزبون
    editing: {
      id: full.quote.id,
      quote_number: full.quote.quote_number,
      clientName: full.quote.client_name || '',
    },
    systemType,
    // معامل أمان الألواح المحفوظ مع العرض. العروض المحفوظة قبل القاعدة ماكو
    // عندها هذا المفتاح — تنقرأ بـ1 (بلا معامل) حتى ترجع بنفس عدد ألواحها
    // بالضبط، والعروض الجديدة ترجع بالمعامل اللي انحفظت بيه.
    panelSafetyFactor: Number(adjustments?.panelSafetyFactor) > 0
      ? Number(adjustments.panelSafetyFactor)
      : LEGACY_PANEL_SAFETY_FACTOR,
    // معاملات البطاريات المحفوظة مع العرض. أُلغيت المعاملات للحسابات الجديدة،
    // فالعرض المحفوظ قبل الإلغاء (ماكو عنده المفتاح) يرجع بمعاملاته القديمة
    // حتى ما يتبدّل عدد بطارياته عند إعادة الفتح.
    batteryFactors: adjustments?.batteryFactors || LEGACY_BATTERY_FACTORS,
    // ماركات الأقسام المحفوظة — بدونها يرجع العرض بكل الماركات ويتبدل اختيار
    // المواد. العروض القديمة محفوظة بحقل `brand` واحد كان يعني الانفيرتر
    // والبطارية، وnormalizeBrandPick يقرأها بنفس معناها بالضبط.
    brands: pruneBrandPick(normalizeBrandPick(adjustments || {}), systemType),
    // الأعداد المثبتة يدوياً ترجع كما حُفظت
    unitCounts: adjustments?.unitCounts || null,
    createdBy: full.quote.created_by || '',
    clientName: full.quote.client_name || '',
    clientPhone: full.quote.client_phone || '',
    location: full.quote.location || '',
    roofAreaM2: full.quote.roof_area_m2,
    ampDay: full.quote.required_amp_day,
    ampNight: full.quote.required_amp_night,
    nightSupplyHours: full.quote.night_supply_hours,
    tier: full.quote.selected_tier,
    overrides,
    // ذاكرة العرض الحرفية: الاختيارات الخام بكمياتها اليدوية إذا محفوظة (العروض الجديدة)،
    // وإلا الاستنتاج من البنود (العروض القديمة)
    secondarySelections: adjustments?.secondarySelections && Object.keys(adjustments.secondarySelections).length > 0
      ? adjustments.secondarySelections
      : secondarySelections,
    adjustments: adjustments || null,
    extraUnits: adjustments?.extraUnits || null,
    notes: full.notes.map((n) => n.note_text),
  };
}
