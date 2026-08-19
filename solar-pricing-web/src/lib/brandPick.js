// اختيار البراند صار **لكل قسم على حدة**: لوح · بطارية · انفيرتر (وكابينة السستم
// المتكامل). المنظومة تنبني من الماركات اللي ينتخبها البياع، وكل قسم مستقل عن
// الثاني — يقدر يجيب بطارية ماركة وانفيرتر ماركة ثانية ولوح ثالث.
//
// قاعدة ثابتة: اختيار الماركة **ما يغيّر متطلبات المنظومة** — التحجيم (عدد
// الألواح والبطاريات وقدرة الانفيرتر) ينحسب مثل ما هو، والماركة بس تحصر المواد
// اللي ينتخب منها المحرك.

export const BRAND_CATEGORIES = ['panel', 'battery', 'inverter', 'integrated'];

export const BRAND_SECTION_LABELS = {
  panel: 'ماركة الألواح',
  battery: 'ماركة البطاريات',
  inverter: 'ماركة الانفيرتر',
  integrated: 'ماركة الكابينة',
};

// الأقسام اللي تظهر بكل نوع منظومة — ما ننطي البياع منتخي ماركة لقسم أصلاً مو
// داخل بالعرض: النهارية بلا بطاريات، والأوف جرد بلا ألواح، والمتكامل بكابينة
// محل البطارية والانفيرتر.
export function brandSectionsFor(systemType) {
  if (systemType === 'day') return ['panel', 'inverter'];
  if (systemType === 'offgrid') return ['battery', 'inverter'];
  if (systemType === 'integrated') return ['panel', 'integrated'];
  return ['panel', 'battery', 'inverter'];
}

export const emptyBrandPick = () => ({ panel: '', battery: '', inverter: '', integrated: '' });

// يقرأ اختيار الماركات من مدخل العرض.
// العروض القديمة محفوظة بحقل `brand` واحد كان يحصر **الانفيرتر والبطارية** بس —
// فتنقرأ بنفس معناها بالضبط، حتى فتح عرض قديم للتعديل ما يبدّل مواده.
export function normalizeBrandPick(input) {
  const out = emptyBrandPick();
  const picked = input && typeof input === 'object' ? input.brands : null;
  if (picked && typeof picked === 'object') {
    for (const c of BRAND_CATEGORIES) out[c] = String(picked[c] || '').trim();
    return out;
  }
  const legacy = String((input && input.brand) || '').trim();
  if (legacy) {
    out.battery = legacy;
    out.inverter = legacy;
  }
  return out;
}

export function hasBrandPick(pick) {
  return BRAND_CATEGORIES.some((c) => !!(pick && String(pick[c] || '').trim()));
}

// يصفّي المواد: كل قسم بماركته المختارة. الأقسام بلا اختيار — والمواد الثانوية
// والأجور اللي أصلاً بلا ماركة — تعدي مثل ما هي، لأن حذفها يكسر العرض.
export function filterMaterialsByBrands(materials, pick) {
  if (!hasBrandPick(pick)) return materials;
  const norm = (s) => String(s || '').trim().toLowerCase();
  return materials.filter((m) => {
    const want = norm(pick[m.category]);
    if (!want) return true;
    return norm(m.brand) === want;
  });
}

// يشيل ماركات الأقسام غير الداخلة بنوع المنظومة — حتى ما يبقى فلتر مخفي يحصر
// مواد ما يشوفها البياع أصلاً (مثلاً ماركة لوح مختارة وبعدين انبدل لأوف جرد).
export function pruneBrandPick(pick, systemType) {
  const keep = new Set(brandSectionsFor(systemType));
  const out = emptyBrandPick();
  for (const c of BRAND_CATEGORIES) if (keep.has(c)) out[c] = String((pick && pick[c]) || '').trim();
  return out;
}
