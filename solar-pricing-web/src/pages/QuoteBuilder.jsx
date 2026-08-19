import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';
import SecondaryPickerModal from '../components/SecondaryPickerModal.jsx';
// العرض التفاعلي 3D يُحمّل عند الطلب فقط (يجرّ three.js) حتى ما يثقل فتح الصفحة
const SystemShowcase = lazy(() => import('../components/SystemShowcase.jsx'));
// مساحة المضخة الزراعية: تنفتح تلقائياً إذا العرض بيه انفيرتر مضخة (VFD)
const PumpShowcase = lazy(() => import('../components/PumpShowcase.jsx'));
import { buildEditPrefill } from '../lib/editPrefill.js';
import { detectSceneType } from '../lib/sceneType.js';
import { getIsAdmin, getCurrentUsername, ADMIN_USERS } from '../lib/agent.js';
import { canPickBrand } from '../lib/permissions.js';
import {
  brandSectionsFor, emptyBrandPick, pruneBrandPick, BRAND_SECTION_LABELS,
} from '../lib/brandPick.js';
import { PANEL_SAFETY_FACTOR } from '../lib/calc.js';
import { computeSecondaryDefaults, isPanelSideMaterial } from '../lib/secondaryDefaults.js';
import { normName } from '../lib/quotesFilter.js';
import BrandLogo from '../components/BrandLogo.jsx';

// مسودة العرض الجارية تنحفظ محلياً — الرفرش أو التنقل بين الصفحات ما يمسح الشغل،
// والأسعار تتحدث تلقائياً لأن المعاينة تعيد الجلب والحساب من القاعدة بكل مرة
const DRAFT_KEY = 'quote_draft_v1';
// الارتباط بعرض محفوظ (وضع التعديل) بذاكرة الجلسة مو الدائمة: التنقل بين القوائم
// ما يقطعه (الصفحة تنفكّ وترجع تتركب بكل تنقّل)، وإغلاق البرنامج يقطعه — حتى ما
// تفتح البرنامج وإنت مو داري إنك لسه تعدّل عرضاً قديماً فتدعس عليه.
const EDIT_KEY = 'quote_editing_v1';

function readSavedDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null;
  } catch {
    return null;
  }
}
function writeSavedDraft(state) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    /* التخزين المحلي ممتلئ أو معطل — نكمل بدون حفظ */
  }
}
function readEditingQuote() {
  try {
    return JSON.parse(sessionStorage.getItem(EDIT_KEY)) || null;
  } catch {
    return null;
  }
}
function writeEditingQuote(q) {
  try {
    if (q) sessionStorage.setItem(EDIT_KEY, JSON.stringify(q));
    else sessionStorage.removeItem(EDIT_KEY);
  } catch {
    /* تجاهل */
  }
}

// آخر تعبئة انطبقت (رقمها المتسلسل) — **بمستوى الوحدة مو داخل المكوّن** حتى تنجو من
// فكّ الصفحة وتركيبها. بدونها: كل رجوع لصفحة العرض يعيد تطبيق نفس التعبئة القديمة
// المخزونة بحالة App، فيندعس كل اللي كتبه البياع بعد فتح العرض.
let lastAppliedPrefill = null;

// حالة العرض الفارغ — **مصدر واحد** لكل حقل بالشاشة.
//
// كانت قائمة التصفير مكتوبة بالإيد داخل startNewQuote ونُسي منها `unitCounts`، فـ«عرض
// جديد» يرث الأعداد اليدوية من العرض السابق ويطلع الحساب يدوياً بلا ما ينتبه البياع.
// أي حقل جديد لازم يمرّ من هنا — واختبار بنيوي يفشّل البناء إذا انضاف حقل للمسودة
// وما دخل هالقائمة.
const BLANK = {
  clientName: '', clientPhone: '', location: '',
  roofAreaM2: '', ampDay: '', ampNight: '', nightSupplyHours: '',
  systemType: 'full', tier: 'economy', brands: emptyBrandPick(),
  // العرض الجديد ينبني بالمعامل الحالي — والعرض المفتوح للتعديل يجيب معامله المحفوظ
  panelSafetyFactor: PANEL_SAFETY_FACTOR,
  overrides: {},
  markupPercent: '', markupMode: 'visible', discountPercent: '',
  installment: false, installmentPlan: 'company',
  installmentRate: '', installmentMonths: '',
  hideTotalInPdf: false,
  extraUnits: { panel: 0, battery: 0, inverter: 0, integrated: 0 },
  unitCounts: {},
  createdBy: '',
  pricingOpen: false,
  // المواد الثانوية والملاحظات إلهما مصدرهما الخاص (الافتراضيات المشتركة وملف الشركة)
  // فتنضبطان بـapplyQuoteState بقيمة صريحة أو بالافتراضي عند التصفير
  secondarySel: null,
  notes: null,
  editingQuote: null,
};

const TIERS = [
  { key: 'economy', label: 'اقتصادي' },
  { key: 'standard', label: 'متوسط' },
  { key: 'premium', label: 'ممتاز' },
];

const CATEGORY_LABELS = { panel: 'اللوح', battery: 'البطارية', inverter: 'الانفيرتر' };

// أنواع المنظومات: المحرك يستنتج النوع من الأمبير، والزر يضبط الحقول ويخفي غير اللازم
const SYSTEM_TYPES = [
  { key: 'full', label: 'منظومة كاملة', hint: 'ألواح + انفيرتر + بطاريات' },
  { key: 'day', label: 'نهارية بلا بطاريات', hint: 'ألواح + انفيرتر فقط (زراعية ونهارية)' },
  { key: 'offgrid', label: 'أوف جرد (بلا ألواح)', hint: 'انفيرتر + بطاريات وأسلاك — بلا ألواح ولا هيكل' },
  { key: 'integrated', label: 'سستم متكامل', hint: 'كابينة تجمع البطاريات والانفيرتر بجهاز واحد + ألواح' },
];

function fmt(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

// عدّاد وحدة: أزرار + / − ورقم قابل للكتابة مباشرة (ضغطة على الرقم وتكتبه).
// الحالة النصية محلية أثناء الكتابة حتى الحقل الفارغ ما ينقلب صفراً بكل ضغطة زر.
function UnitCounter({ label, count, base, onChange }) {
  const [text, setText] = useState(null); // null = يعرض الرقم المحسوب
  const shown = text != null ? text : String(count);
  const commit = (raw) => {
    setText(null);
    const n = Math.max(0, Math.round(Number(raw)));
    if (Number.isFinite(n)) onChange(n);
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #d5dde6', borderRadius: 20, padding: '4px 8px' }}>
      <button
        type="button" className="btn btn-secondary btn-sm"
        style={{ borderRadius: '50%', width: 30, height: 30, padding: 0, fontWeight: 800 }}
        disabled={count <= 0}
        onClick={() => onChange(Math.max(0, count - 1))}
        title={`نقصان ${label}`}
      >
        −
      </button>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--navy)', fontWeight: 700 }}>
        <span>{label}</span>
        <span>×</span>
        <input
          type="number" min="0" inputMode="numeric" value={shown}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          onFocus={(e) => e.currentTarget.select()}
          title="اضغط واكتب العدد اللي تريده"
          style={{
            width: 58, textAlign: 'center', fontWeight: 800, color: 'var(--navy)',
            border: '1px solid #cfdae6', borderRadius: 8, padding: '2px 4px', background: '#f7fafd',
          }}
        />
        {count !== base && <small style={{ color: '#b8860b' }}>({count > base ? '+' : ''}{count - base})</small>}
      </span>
      <button
        type="button" className="btn btn-secondary btn-sm"
        style={{ borderRadius: '50%', width: 30, height: 30, padding: 0, fontWeight: 800 }}
        onClick={() => onChange(count + 1)}
        title={`زيادة ${label}`}
      >
        +
      </button>
    </span>
  );
}

export default function QuoteBuilder({ prefill, onDraftChange, onPrefillUsed, onUnsavedChange }) {
  // المسودة المحفوظة (إن وجدت) تسترد بأول تركيب — تتقدم على القيم الفارغة وتخضع للـprefill
  const [savedDraft] = useState(readSavedDraft);
  const [clientName, setClientName] = useState(savedDraft?.clientName ?? '');
  const [clientPhone, setClientPhone] = useState(savedDraft?.clientPhone ?? '');
  const [location, setLocation] = useState(savedDraft?.location ?? '');
  const [roofAreaM2, setRoofAreaM2] = useState(savedDraft?.roofAreaM2 ?? '');
  const [ampDay, setAmpDay] = useState(savedDraft?.ampDay ?? '');
  const [ampNight, setAmpNight] = useState(savedDraft?.ampNight ?? '');
  const [nightSupplyHours, setNightSupplyHours] = useState(savedDraft?.nightSupplyHours ?? '');
  // نوع المنظومة: كاملة (ألواح + بطاريات) | نهارية بلا بطاريات | أوف جرد (انفيرتر وبطاريات
  // بلا ألواح ولا هيكل). المحرك يستنتج النوع من الأمبير (نهار 0 = بلا ألواح، ليل 0 = بلا
  // بطاريات) — الزر هنا يضبط الحقول ويخفي غير اللازم بدل ما يحفظ البياع الحيلة بباله.
  const [systemType, setSystemType] = useState(savedDraft?.systemType ?? 'full');
  const [tier, setTier] = useState(savedDraft?.tier ?? 'economy');
  // البراند: كل قسم بماركته لحاله (لوح · بطارية · انفيرتر · كابينة). فارغ = كل
  // الماركات لهذا القسم — والاختيار ما يغيّر تحجيم المنظومة، بس يحصر المواد.
  const [brands, setBrands] = useState(() => ({ ...emptyBrandPick(), ...(savedDraft?.brands || {}) }));
  // معامل أمان الألواح: 1.25 للعروض الجديدة، والعرض المحفوظ يرجع بمعامله هو
  // (والمحفوظ قبل القاعدة يرجع بـ1) حتى ما يتبدّل عدد ألواحه عند فتحه
  const [panelSafetyFactor, setPanelSafetyFactor] = useState(savedDraft?.panelSafetyFactor ?? PANEL_SAFETY_FACTOR);
  // الماركات المتوفرة بالمخزون مقسّمة على الفئات
  const [brandOptions, setBrandOptions] = useState(null);
  // المبدّل معروض لحسابات محددة حالياً (بكر وأحمد)
  const [mayPickBrand, setMayPickBrand] = useState(false);
  // نسبة الزيادة: علنية (سطر بالعرض) أو موزعة (تنضرب على أسعار البنود نفسها) + نسبة الخصم
  const [markupPercent, setMarkupPercent] = useState(savedDraft?.markupPercent ?? '');
  const [markupMode, setMarkupMode] = useState(savedDraft?.markupMode ?? 'visible');
  const [discountPercent, setDiscountPercent] = useState(savedDraft?.discountPercent ?? '');
  // التقسيط المصرفي: جيك بوينت — النسبة والأشهر من الإعدادات، والمعادلة: المجموع × النسبة ÷ الأشهر
  const [installment, setInstallment] = useState(savedDraft?.installment ?? false);
  // خطة التقسيط: 'company' = التقسيط عبر مصرف النهرين، 'cbi' = مبادرة البنك المركزي (26% لسبع سنوات)
  const [installmentPlan, setInstallmentPlan] = useState(savedDraft?.installmentPlan ?? 'company');
  // نسبة وأشهر خاصة بهذا العرض — فارغة تعني «خذها من الإعدادات العامة»
  const [installmentRate, setInstallmentRate] = useState(savedDraft?.installmentRate ?? '');
  const [installmentMonths, setInstallmentMonths] = useState(savedDraft?.installmentMonths ?? '');
  // إخفاء المجموع الكلي من ملف الزبون — الأسعار والقسط الشهري يبقون
  const [hideTotalInPdf, setHideTotalInPdf] = useState(savedDraft?.hideTotalInPdf ?? false);
  // زيادة/نقصان يدوي بالوحدات (لوح ±2، بطارية وانفيرتر ±1) — للمستخدمين الرئيسيين فقط
  const [extraUnits, setExtraUnits] = useState(savedDraft?.extraUnits ?? { panel: 0, battery: 0, inverter: 0, integrated: 0 });
  // العدد اللي يثبّته البياع بيده — **رقم نهائي** مو فرقاً عن الحساب التلقائي.
  // الفرق كان يتزحزح مع كل تغيير بالأمبيرية أو الساعات فيطلع رقم غير اللي كتبه.
  // ينحفظ بالمسودة مثل باقي المدخلات: كان يضيع بكل تنقّل لقائمة ثانية فيرجع الحساب
  // تلقائياً والبياع مو داري، ويطلع مجموع غير اللي ثبّته.
  const [unitCounts, setUnitCounts] = useState(savedDraft?.unitCounts ?? {});
  // قسم الزيادة/الخصم/التقسيط مطوي افتراضياً حتى الشاشة تبقى مرتبة
  const [pricingOpen, setPricingOpen] = useState(savedDraft?.pricingOpen ?? false);
  // العرض التفاعلي 3D (يفتح ملء الشاشة للزبون)
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // «العرض من طرف»: المشرف يسند العرض لموظف آخر — '' تعني حساب المشرف نفسه (أو إبقاء المنشئ عند التعديل)
  const [createdBy, setCreatedBy] = useState(savedDraft?.createdBy ?? '');
  const [myName, setMyName] = useState('');
  const [pastCreators, setPastCreators] = useState([]);
  useEffect(() => {
    getIsAdmin()
      .then((admin) => {
        setIsAdmin(admin);
        if (!admin) return;
        getCurrentUsername().then(setMyName).catch(() => {});
        window.api.quotes.creators().then(setPastCreators).catch(() => {});
      })
      .catch(() => setIsAdmin(false));
  }, []);
  // قائمة الأسماء: المشرفون الثلاثة + كل من سبق وأنشأ عرضاً (بدون تكرار)
  const creatorOptions = useMemo(() => [...new Set([...ADMIN_USERS, ...pastCreators])], [pastCreators]);
  // إسناد العرض لموظف آخر: صلاحية حصرية لحساب أحمد فقط (مو كل المشرفين)
  const canAttribute = isAdmin && (myName || '').replace(/[أإآ]/g, 'ا').trim() === 'احمد';
  // العرض التفاعلي موقوف مؤقتاً عن الجميع عدا حساب أحمد الشخصي — إلى أن يكتمل ترتيبه
  // ⏸ العرض التفاعلي 3D موقوف بقرار المستخدم: المشهد المبني بالكود ما يوصل لواقعية مقنعة،
  // والانتظار لموديلات حقيقية (فيلا فوتوريالستك) قبل إرجاعه. الكود كله باقٍ كما هو —
  // الإرجاع بتبديل هذا السطر لـ: isAdmin && (myName...) === 'احمد'
  const SHOWCASE_PAUSED = true;
  const showcaseAllowed = !SHOWCASE_PAUSED && isAdmin && (myName || '').replace(/[أإآ]/g, 'ا').trim() === 'احمد';
  // الحسابات المرقمة تظهر بالرقم فقط — نفس تنسيق عمود «أنشأه» بصفحة العروض
  const displayCreator = (n) => (n || '').replace(/^مستخدم(?=[0-9])/, '');
  const [overrides, setOverrides] = useState(savedDraft?.overrides ?? {});
  // المواد الثانوية المختارة للعرض: { [materialId]: { qty } } — تبدأ بالأساسيات (هيكل + صبات)
  const [secondarySel, setSecondarySel] = useState(savedDraft?.secondarySel ?? {});
  const [secondaryMaterials, setSecondaryMaterials] = useState([]);
  const secondaryDefaultsRef = useRef({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showPriceNotes, setShowPriceNotes] = useState(false);
  const [notes, setNotes] = useState(savedDraft?.notes ?? null);
  const [preview, setPreview] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  // مرجع حي للنوع + القائمة الدائمة المحفوظة — يستخدمهما تحميل الافتراضيات وتبديل النوع
  const systemTypeRef = useRef(systemType);
  systemTypeRef.current = systemType;
  const savedSecondaryIdsRef = useRef(null);
  const isOffgrid = systemType === 'offgrid';
  const isDayOnly = systemType === 'day';
  // السستم المتكامل: كابينة وحدة محل البطاريات والانفيرتر — التحجيم تلقائي
  // والتبديل والعدد يمشون بنفس مسار باقي الفئات (overrides + extraUnits)
  const isIntegrated = systemType === 'integrated';
  // أقسام البراند المعروضة تتبع نوع المنظومة: النهارية بلا بطاريات، والأوف جرد
  // بلا ألواح، والمتكامل بكابينة محل الاثنين
  const brandSections = brandSectionsFor(systemType);
  // تثبيت ماركة قسم — والباقي ما ينمس
  function pickBrand(cat, value) {
    setBrands((prev) => ({ ...prev, [cat]: value }));
  }

  useEffect(() => {
    // الملاحظات الافتراضية فقط إذا ماكو ملاحظات قائمة (مسودة محفوظة أو عرض مفتوح للتعديل) —
    // حتى ما تنداس ملاحظات البياع كل ما يرجع للصفحة أو يوصل الرد متأخر وهو يكتب
    window.api.company.get().then((c) => setNotes((prev) => (prev == null ? c.notes_default || [] : prev)));
    getCurrentUsername().then((n) => {
      if (!canPickBrand(n)) return;
      setMayPickBrand(true);
      window.api.materials.brands().then(setBrandOptions).catch(() => {});
    }).catch(() => {});
    // ساعات التجهيز الليلي بدون قيمة افتراضية — البياع يحددها بكل عرض
    // الافتراضي: القائمة الدائمة المشتركة من قاعدة البيانات (يحفظها الفريق من نافذة الثانوية)،
    // وإذا ما محفوظة بعد: الأساسيات حسب الألواح (هيكل + صبات) + بوردة الحماية DC
    Promise.all([window.api.materials.list(), window.api.config.get('secondary_defaults')]).then(([all, savedIds]) => {
      // المخفية (بلا جيك بوكس بالمخزون) ما تظهر بنافذة الثانوية ولا بالافتراضيات
      const secondary = (all || []).filter((m) => m.category === 'secondary' && m.active !== false);
      setSecondaryMaterials(secondary);
      savedSecondaryIdsRef.current = savedIds;
      const defaults = computeSecondaryDefaults(secondary, savedIds, systemTypeRef.current);
      secondaryDefaultsRef.current = defaults;
      // الافتراضيات تنطبق فقط إذا ماكو مسودة محفوظة ولا اختيار قائم — حتى ما ندعس على شغل البياع
      setSecondarySel((prev) => (Object.keys(prev).length > 0 || savedDraft?.secondarySel ? prev : defaults));
    });
  }, []);

  // تبديل نوع المنظومة: يصفّر الحقل غير اللازم (حتى المحرك يستنتج النوع نفسه)
  // ويعيد ضبط الافتراضيات الثانوية — بالأوف جرد تنشال مواد جهة الألواح (هيكل/صبات/بورد DC)
  function changeSystemType(next) {
    if (next === systemType) return;
    setSystemType(next);
    systemTypeRef.current = next;
    // ماركات الأقسام اللي طلعت من العرض تنشال — حتى ما يبقى فلتر مخفي شغّال
    setBrands((prev) => pruneBrandPick(prev, next));
    if (next === 'offgrid') {
      setAmpDay('0');
      setRoofAreaM2('');
    } else if (next === 'day') {
      setAmpNight('0');
      setNightSupplyHours('');
    } else {
      // رجوع للمنظومة الكاملة: نفتح الحقول المصفّرة حتى يعبّيها البياع من جديد
      setAmpDay((v) => (Number(v) === 0 ? '' : v));
      setAmpNight((v) => (Number(v) === 0 ? '' : v));
    }
    const defaults = computeSecondaryDefaults(secondaryMaterials, savedSecondaryIdsRef.current, next);
    secondaryDefaultsRef.current = defaults;
    if (next === 'offgrid') {
      // نشيل المؤشَّر من مواد جهة الألواح فقط — اختيارات البياع الباقية تبقى مثل ما هي
      setSecondarySel((prev) => {
        const byId = new Map(secondaryMaterials.map((m) => [m.id, m]));
        const out = {};
        for (const [id, sel] of Object.entries(prev)) {
          const m = byId.get(Number(id));
          if (m && isPanelSideMaterial(m)) continue;
          out[id] = sel;
        }
        return out;
      });
    } else {
      // رجوع لنوع فيه ألواح: نضيف افتراضيات جهة الألواح الناقصة بلا مساس بالباقي
      setSecondarySel((prev) => ({ ...defaults, ...prev }));
    }
  }

  // وضع تعديل عرض محفوظ: {id, quote_number} — الحفظ يحدث نفس العرض.
  // يُقرأ من ذاكرة الجلسة: ينجو من التنقل بين القوائم، وينقطع بإغلاق البرنامج.
  const [editingQuote, setEditingQuote] = useState(readEditingQuote);
  useEffect(() => {
    writeEditingQuote(editingQuote);
  }, [editingQuote]);

  // كل اللي ينحفظ بالمسودة — كائن واحد يقابل BLANK حقلاً بحقل (عدا `editingQuote`
  // اللي محله ذاكرة الجلسة). أي حقل جديد يُضاف هنا وبـBLANK سوية.
  const draftState = {
    clientName, clientPhone, location, roofAreaM2, ampDay, ampNight, nightSupplyHours,
    systemType, tier, brands, panelSafetyFactor, overrides, secondarySel, markupPercent, markupMode, discountPercent,
    installment, installmentPlan, installmentRate, installmentMonths, hideTotalInPdf,
    extraUnits, unitCounts, notes, pricingOpen, createdBy,
  };
  // مرجع حي للمسودة — يستعمله الحفظ الفوري عند مغادرة الصفحة
  const draftStateRef = useRef(draftState);
  draftStateRef.current = draftState;

  // حفظ المسودة محلياً بكل تغيير (مؤجل نص ثانية) — الرفرش والتنقل ما يمسحون الشغل
  useEffect(() => {
    const t = setTimeout(() => writeSavedDraft(draftStateRef.current), 500);
    return () => clearTimeout(t);
  }, [clientName, clientPhone, location, roofAreaM2, ampDay, ampNight, nightSupplyHours, systemType, tier, brands, panelSafetyFactor, overrides, secondarySel, markupPercent, markupMode, discountPercent, installment, installmentPlan, installmentRate, installmentMonths, hideTotalInPdf, extraUnits, unitCounts, notes, pricingOpen, createdBy]);

  // حفظ فوري عند مغادرة الصفحة أو إغلاق النافذة — بدونه آخر نص ثانية من الكتابة
  // تروح: المؤقت ينلغي مع فكّ الصفحة قبل ما يوصل للتخزين.
  useEffect(() => {
    const flush = () => writeSavedDraft(draftStateRef.current);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  // كتابة حالة العرض كاملة من كائن واحد — الطريق الوحيد لتصفير الشاشة أو تعبئتها،
  // حتى ما ينُسى حقل مرة ثانية ويتسرّب من عرض لعرض.
  function applyQuoteState(s) {
    setClientName(s.clientName);
    setClientPhone(s.clientPhone);
    setLocation(s.location);
    setRoofAreaM2(s.roofAreaM2);
    setAmpDay(s.ampDay);
    setAmpNight(s.ampNight);
    setNightSupplyHours(s.nightSupplyHours);
    setSystemType(s.systemType);
    systemTypeRef.current = s.systemType;
    setTier(s.tier);
    setBrands({ ...emptyBrandPick(), ...(s.brands || {}) });
    setPanelSafetyFactor(s.panelSafetyFactor ?? PANEL_SAFETY_FACTOR);
    setOverrides(s.overrides);
    setMarkupPercent(s.markupPercent);
    setMarkupMode(s.markupMode);
    setDiscountPercent(s.discountPercent);
    setInstallment(s.installment);
    setInstallmentPlan(s.installmentPlan);
    setInstallmentRate(s.installmentRate);
    setInstallmentMonths(s.installmentMonths);
    setHideTotalInPdf(s.hideTotalInPdf);
    setExtraUnits(s.extraUnits);
    setUnitCounts(s.unitCounts);
    setCreatedBy(s.createdBy);
    setPricingOpen(s.pricingOpen);
    setEditingQuote(s.editingQuote);
    // الثانوية: قيمة صريحة، وإلا الافتراضيات المشتركة
    setSecondarySel(s.secondarySel ?? secondaryDefaultsRef.current);
    // الملاحظات: قيمة صريحة، وإلا ملاحظات الشركة الافتراضية
    if (s.notes) setNotes(s.notes);
    else window.api.company.get().then((c) => setNotes(c.notes_default || [])).catch(() => setNotes([]));
    setSaveMessage('');
  }

  // 🆕 عرض جديد: تصفير كامل من BLANK + مسح المسودة المحفوظة
  function startNewQuote() {
    applyQuoteState(BLANK);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* تجاهل */
    }
  }
  // الحقول المعبأة تلقائياً (من المساعد أو فتح عرض) تومض حتى ينتبهلها البياع
  const [flashFields, setFlashFields] = useState(new Set());
  const flashTimerRef = useRef(null);
  // تنبيه التكرار الحي: عرض سابق لنفس الاسم/الرقم
  const [dupMatch, setDupMatch] = useState(null);
  const dupDismissedRef = useRef(new Set());
  // العروض التي ظهر تنبيهها الحي أصلاً — ما نعيد إزعاج البياع بنافذة تأكيد عند الحفظ
  const dupSeenRef = useRef(new Set());

  // تطبيق تعبئة (من المساعد أو تعديل عرض أو تنبيه التكرار) مع وميض الحقول المتغيرة
  function applyPrefill(p) {
    if (!p) return;
    const flashed = new Set();

    // فتح عرض محفوظ للتعديل = **استبدال كامل** للحالة، مو دمج جزئي.
    // الدمج الجزئي كان يترك بقايا العرض السابق (موقع، أعداد يدوية، ثانوية) بالعرض
    // اللي بعده — وهذا اللي كان «يتداخل مع العروض المتبقية».
    if (p.editing) {
      const a = p.adjustments || {};
      const x = p.extraUnits || a.extraUnits || {};
      applyQuoteState({
        ...BLANK,
        clientName: p.clientName ?? '',
        clientPhone: p.clientPhone ?? '',
        location: p.location ?? '',
        roofAreaM2: p.roofAreaM2 == null ? '' : String(p.roofAreaM2),
        ampDay: p.ampDay == null ? '' : String(p.ampDay),
        ampNight: p.ampNight == null ? '' : String(p.ampNight),
        nightSupplyHours: p.nightSupplyHours == null ? '' : String(p.nightSupplyHours),
        systemType: p.systemType || BLANK.systemType,
        tier: p.tier ?? BLANK.tier,
        overrides: p.overrides || {},
        markupPercent: Number(a.markupPercent) > 0 ? String(a.markupPercent) : '',
        markupMode: a.markupMode === 'distributed' ? 'distributed' : 'visible',
        discountPercent: Number(a.discountPercent) > 0 ? String(a.discountPercent) : '',
        installment: !!a.installment?.enabled,
        installmentPlan: a.installment?.plan === 'cbi' ? 'cbi' : 'company',
        brands: { ...emptyBrandPick(), ...(p.brands || {}) },
        panelSafetyFactor: Number(p.panelSafetyFactor) > 0 ? Number(p.panelSafetyFactor) : PANEL_SAFETY_FACTOR,
        installmentRate: a.installment?.rate ? String(a.installment.rate) : '',
        installmentMonths: a.installment?.months ? String(a.installment.months) : '',
        hideTotalInPdf: a.installment?.hideTotal === true,
        extraUnits: {
          panel: Number(x.panel) || 0, battery: Number(x.battery) || 0,
          inverter: Number(x.inverter) || 0, integrated: Number(x.integrated) || 0,
        },
        unitCounts: p.unitCounts || a.unitCounts || {},
        createdBy: p.createdBy ?? '',
        secondarySel: p.secondarySelections || {},
        notes: p.notes || null,
        editingQuote: p.editing,
      });
      for (const k of ['clientName', 'clientPhone', 'location', 'roofAreaM2', 'ampDay', 'ampNight', 'nightSupplyHours']) {
        if (p[k] != null) flashed.add(k);
      }
      setFlashFields(flashed);
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashFields(new Set()), 2600);
      return;
    }

    // تعبئة جزئية (المساعد الذكي أو تنبيه التكرار): يملأ اللي يعرفه ويترك الباقي
    const apply = (key, setter, val) => {
      if (val == null) return;
      setter(typeof val === 'string' ? val : String(val));
      flashed.add(key);
    };
    apply('clientName', setClientName, p.clientName);
    apply('clientPhone', setClientPhone, p.clientPhone);
    apply('location', setLocation, p.location);
    apply('roofAreaM2', setRoofAreaM2, p.roofAreaM2);
    apply('ampDay', setAmpDay, p.ampDay);
    apply('ampNight', setAmpNight, p.ampNight);
    apply('nightSupplyHours', setNightSupplyHours, p.nightSupplyHours);
    // نوع المنظومة يجي مع تعبئة العرض المفتوح للتعديل (مستنتج من أرقامه)
    if (p.systemType) {
      setSystemType(p.systemType);
      systemTypeRef.current = p.systemType;
    }
    if (p.tier != null) setTier(p.tier);
    if (p.overrides) setOverrides(p.overrides);
    if (p.secondarySelections) setSecondarySel(p.secondarySelections);
    // فتح عرض للتعديل يمرر adjustments دائماً (حتى لو null) — نرجع نسبه المحفوظة أو نصفرها
    if ('adjustments' in p) {
      const a = p.adjustments || {};
      setMarkupPercent(Number(a.markupPercent) > 0 ? String(a.markupPercent) : '');
      setMarkupMode(a.markupMode === 'distributed' ? 'distributed' : 'visible');
      setDiscountPercent(Number(a.discountPercent) > 0 ? String(a.discountPercent) : '');
      setInstallment(!!a.installment?.enabled);
      setInstallmentPlan(a.installment?.plan === 'cbi' ? 'cbi' : 'company');
      if (p.brands) setBrands({ ...emptyBrandPick(), ...p.brands });
      if (Number(p.panelSafetyFactor) > 0) setPanelSafetyFactor(Number(p.panelSafetyFactor));
      setInstallmentRate(a.installment?.rate ? String(a.installment.rate) : '');
      setInstallmentMonths(a.installment?.months ? String(a.installment.months) : '');
      setHideTotalInPdf(a.installment?.hideTotal === true);
      const x = p.extraUnits || a.extraUnits || {};
      setExtraUnits({ panel: Number(x.panel) || 0, battery: Number(x.battery) || 0, inverter: Number(x.inverter) || 0, integrated: Number(x.integrated) || 0 });
      setUnitCounts(p.unitCounts || a.unitCounts || {});
    }
    if (p.notes) setNotes(p.notes);
    // فتح عرض للتعديل يرجّع منشئه الحالي بحقل «العرض من طرف»
    if (p.createdBy != null) setCreatedBy(p.createdBy);
    setEditingQuote(p.editing || null);
    setSaveMessage('');
    setFlashFields(flashed);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashFields(new Set()), 2600);
  }

  // التعبئة تنطبق **مرة وحدة لكل أمر**. حالة App تحتفظ بآخر تعبئة ولا تمسحها، والصفحة
  // تنفكّ وترجع تتركب بكل تنقّل بين القوائم — فبلا هذا الحارس: كل رجوع لصفحة العرض
  // يعيد دعس نفس التعبئة القديمة ويمسح كل اللي كتبه البياع بعد فتح العرض.
  useEffect(() => {
    if (!prefill) return;
    const stamp = prefill.nonce ?? prefill;
    if (lastAppliedPrefill === stamp) return;
    lastAppliedPrefill = stamp;
    applyPrefill(prefill);
    // نبلّغ App حتى يمسحها من حالته — حزام ثاني فوق الحارس
    if (onPrefillUsed) onPrefillUsed();
  }, [prefill, onPrefillUsed]);

  // تغيّر اسم الزبون وإحنا بوضع التعديل = صار عرضاً لزبون آخر → ينقطع الارتباط
  // بالعرض القديم وترجع الأعداد للحساب التلقائي، حتى الحفظ ما يدعس على عرض غيره.
  // المواد الثانوية والملاحظات **ما تنمسح** — شغل البياع الحالي يبقى.
  // بتأخير نص ثانية حتى ما ينقطع الارتباط بأول حرف يكتبه وهو يصلّح الاسم.
  useEffect(() => {
    if (!editingQuote) return undefined;
    const original = normName(editingQuote.clientName || '');
    const t = setTimeout(() => {
      const now = normName(clientName || '');
      if (!now || now === original) return;
      setEditingQuote(null);
      setUnitCounts({});
      setSaveMessage(
        `انقطع وضع التعديل — تغيّر اسم الزبون عن العرض ${editingQuote.quote_number}. `
        + 'الحفظ راح ينشئ عرضاً جديداً، والأعداد رجعت للحساب التلقائي.'
      );
    }, 500);
    return () => clearTimeout(t);
  }, [clientName, editingQuote]);

  // فحص حي أثناء الكتابة: إذا الاسم أو الرقم موجود بعرض سابق يطلع تنبيه وسط الشاشة
  useEffect(() => {
    // بوضع التعديل ماكو أي فحص تكرار — إنت أصلاً گاعد تعدل عرض هذا العميل
    if (editingQuote) {
      setDupMatch(null);
      return;
    }
    const name = clientName.trim();
    const phone = clientPhone.trim();
    if (name.length < 3 && phone.length < 8) {
      setDupMatch(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const match = await window.api.quotes.findClientMatch({ clientName: name, clientPhone: phone });
        if (match && match.id !== editingQuote?.id && !dupDismissedRef.current.has(match.id)) {
          dupSeenRef.current.add(match.id);
          setDupMatch(match);
        } else {
          setDupMatch(null);
        }
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [clientName, clientPhone, editingQuote]);

  async function openDupForEdit() {
    const match = dupMatch;
    setDupMatch(null);
    const p = await buildEditPrefill(match.id);
    if (p) applyPrefill(p);
  }

  function dismissDup() {
    dupDismissedRef.current.add(dupMatch.id);
    setDupMatch(null);
  }

  // كلاس الحقل: وميض التعبئة التلقائية + تلوين أحمر لحقلي الاسم/الرقم عند وجود تكرار
  function fieldClass(key) {
    let cls = 'field';
    if (flashFields.has(key)) cls += ' flash-field';
    if (dupMatch && (key === 'clientName' || key === 'clientPhone')) cls += ' dup-field';
    return cls;
  }

  // إلغاء التعديل = شاشة نظيفة، فيمرّ من نفس طريق «عرض جديد».
  // كانت قائمة تصفير مكتوبة بالإيد ناسية `unitCounts` و`integrated` — فتخرج من
  // وضع التعديل وتبقى الأعداد اليدوية للعرض القديم شغّالة بالعرض اللي بعده.
  function exitEditMode() {
    startNewQuote();
  }

  async function handleUpdate() {
    setSaving(true);
    setSaveMessage('');
    try {
      const saved = await window.api.quotes.update(editingQuote.id, buildBaseInput());
      // بعد الخروج من وضع التعديل الفحص الحي يرجع يشتغل والحقول معبأة —
      // فنسجل هذا العرض كمتجاهَل حتى ما يطلع تحذير عن العرض اللي توك محدثه
      dupDismissedRef.current.add(editingQuote.id);
      if (saved?.id != null) dupDismissedRef.current.add(saved.id);
      setSaveMessage(`تم تحديث العرض رقم ${saved.quote_number} بنجاح ✔`);
      setSavedSnapshot(inputsKey);
      setEditingQuote(null);
    } catch (err) {
      setSaveMessage('حدث خطأ أثناء التحديث: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // useMemo ضروري: بدونه الكائن يتجدد بكل رندر → المؤقت ينعاد → حلقة إعادة حساب لا نهائية
  const inputs = useMemo(
    () => ({ roofAreaM2, ampDay, ampNight, nightSupplyHours, systemType, tier, brands, panelSafetyFactor, overrides, secondarySel, markupPercent, markupMode, discountPercent, installment, installmentPlan, installmentRate, installmentMonths, hideTotalInPdf, extraUnits, unitCounts }),
    [roofAreaM2, ampDay, ampNight, nightSupplyHours, systemType, tier, brands, panelSafetyFactor, overrides, secondarySel, markupPercent, markupMode, discountPercent, installment, installmentPlan, installmentRate, installmentMonths, hideTotalInPdf, extraUnits, unitCounts]
  );
  const debouncedInputs = useDebouncedValue(inputs, 300);

  // لقطة آخر إدخال انحفظ — أي تغيير بعده يرجّع الشاشة لحالة «ما محفوظ»
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const inputsKey = JSON.stringify({ ...inputs, clientName, clientPhone, location });
  useEffect(() => {
    setSavedSnapshot((prev) => (prev != null && prev !== inputsKey ? null : prev));
  }, [inputsKey]);

  const validInputs =
    Number(debouncedInputs.ampDay) >= 0 && Number(debouncedInputs.ampNight) >= 0 &&
    (Number(debouncedInputs.ampDay) > 0 || Number(debouncedInputs.ampNight) > 0) &&
    // المساحة مطلوبة فقط إذا اكو حمل نهاري (ألواح) — عرض بلا ألواح ما يحتاج سطح
    (Number(debouncedInputs.ampDay) === 0 || Number(debouncedInputs.roofAreaM2) > 0) &&
    // إذا اكو حمل ليلي لازم تحديد ساعات التجهيز — ما ننطي عدد بطاريات بدون ما يحددها البياع
    (Number(debouncedInputs.ampNight) === 0 || Number(debouncedInputs.nightSupplyHours) > 0);

  useEffect(() => {
    if (!validInputs) {
      setPreview(null);
      return;
    }
    setCalculating(true);
    window.api.quotes
      .preview({
        roofAreaM2: Number(debouncedInputs.roofAreaM2),
        ampDay: Number(debouncedInputs.ampDay),
        ampNight: Number(debouncedInputs.ampNight),
        nightSupplyHours: debouncedInputs.nightSupplyHours === '' ? null : Number(debouncedInputs.nightSupplyHours),
        tier: debouncedInputs.tier,
        brands: debouncedInputs.brands,
        panelSafetyFactor: debouncedInputs.panelSafetyFactor,
        overrides: debouncedInputs.overrides,
        secondarySelections: debouncedInputs.secondarySel,
        adjustments: {
          markupPercent: isAdmin ? Number(debouncedInputs.markupPercent) || 0 : 0,
          markupMode: debouncedInputs.markupMode,
          discountPercent: isAdmin ? Number(debouncedInputs.discountPercent) || 0 : 0,
        },
        installment: debouncedInputs.installment,
        installmentPlan: debouncedInputs.installmentPlan,
        installmentRate: debouncedInputs.installmentRate,
        installmentMonths: debouncedInputs.installmentMonths,
        extraUnits: debouncedInputs.extraUnits,
        unitCounts: debouncedInputs.unitCounts,
        systemType: debouncedInputs.systemType,
      })
      .then((res) => {
        setPreview(res);
        // تثبيت نسبة المصرف وأشهره بالمسودة بعد أول حساب: بدونها يرجع للعرض
        // بنسبة الإعدادات وقت الفتح، فلو تغيّرت الإعدادات يطلع مجموع غير اللي
        // شافه آخر مرة ويضطر يعدّله من جديد. التثبيت ينفكّ لمن يبدّل المصرف.
        const inst = res?.draft?.installment;
        if (inst && !debouncedInputs.installmentRate) setInstallmentRate(String(inst.rate));
        if (inst && !debouncedInputs.installmentMonths) setInstallmentMonths(String(inst.months));
      })
      .finally(() => setCalculating(false));
  }, [debouncedInputs, validInputs, isAdmin]);

  // تبديل المصرف يفكّ التثبيت — وإلا بقيت نسبة المصرف القديم مثبّتة على الجديد
  function changeInstallmentPlan(next) {
    if (next === installmentPlan) return;
    setInstallmentPlan(next);
    setInstallmentRate('');
    setInstallmentMonths('');
  }

  function setOverride(category, materialId) {
    setOverrides((o) => ({ ...o, [category]: materialId ? Number(materialId) : undefined }));
  }

  function buildBaseInput() {
    return {
      clientName,
      clientPhone,
      location,
      roofAreaM2: Number(roofAreaM2),
      ampDay: Number(ampDay),
      ampNight: Number(ampNight),
      nightSupplyHours: nightSupplyHours === '' ? null : Number(nightSupplyHours),
      tier,
      brands,
      panelSafetyFactor,
      overrides,
      secondarySelections: secondarySel,
      adjustments: {
        // الزيادة والخصم صلاحية مشرفين — أي قيمة بمسودة حساب غير مشرف ما تنطبق
        markupPercent: isAdmin ? Number(markupPercent) || 0 : 0,
        markupMode,
        discountPercent: isAdmin ? Number(discountPercent) || 0 : 0,
      },
      installment,
      installmentPlan,
      installmentRate,
      installmentMonths,
      hideTotalInPdf,
      extraUnits,
      // الأعداد اللي ثبّتها البياع بيده — بدونها الحفظ وملف الـPDF يرجعون للحساب
      // التلقائي ويطلع رقم غير اللي كتبه بالشاشة
      unitCounts,
      // نوع المنظومة والكابينة المتكاملة — بدونهما يرجع العرض المحفوظ بنوع «كاملة»
      systemType,
      // الإسناد لحساب أحمد فقط — null = الحساب الحالي عند الحفظ، وإبقاء المنشئ الأصلي عند التعديل
      createdBy: (canAttribute && createdBy) || null,
      notes: notes || [],
    };
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage('');
    try {
      // كشف تكرار: نافذة التأكيد تظهر مرة واحدة فقط — إذا التنبيه الحي ظهر أثناء كتابة
      // الاسم أو كان البياع بوضع تعديل عرض (يعرف شيسوي) فما نعيد إزعاجه عند الحفظ
      if ((clientName || clientPhone) && !editingQuote) {
        const dup = await window.api.quotes.findDuplicate({ clientName, clientPhone });
        if (dup && !dupSeenRef.current.has(dup.id) && !dupDismissedRef.current.has(dup.id)) {
          const dupDate = new Date(dup.created_at).toLocaleDateString('en-GB');
          const proceed = confirm(
            `يوجد عرض محفوظ لهذا العميل مسبقاً:\n` +
            `العرض رقم ${dup.quote_number} بتاريخ ${dupDate} بمجموع ${Math.round(dup.total_price).toLocaleString('en-US')} دينار.\n\n` +
            `هل تريد المتابعة وحفظ عرض جديد؟`
          );
          if (!proceed) {
            setSaveMessage('تم إلغاء الحفظ — العرض موجود مسبقاً');
            setSaving(false);
            return;
          }
        }
      }
      const saved = await window.api.quotes.save(buildBaseInput());
      // العرض المحفوظ توه ما نحذر عنه — بلياها الفحص الحي يلگيه فوراً ويطلع التنبيه
      if (saved?.id != null) dupDismissedRef.current.add(saved.id);
      setSaveMessage(`تم حفظ العرض رقم ${saved.quote_number} بنجاح ✔`);
      setSavedSnapshot(inputsKey);
    } catch (err) {
      setSaveMessage('حدث خطأ أثناء الحفظ: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleExportPdf() {
    setSaving(true);
    setSaveMessage('');
    try {
      const result = await window.api.quotes.exportDraftPdf(buildBaseInput());
      if (!result.canceled) setSaveMessage('تم تصدير ملف PDF بنجاح ✔');
    } catch (err) {
      setSaveMessage('حدث خطأ أثناء التصدير: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const draft = preview?.draft;
  const hasBlockingErrors = draft && Object.keys(draft.errors).length > 0;

  // «عرض ما محفوظ»: أكو حساب فعلي بالشاشة وما انحفظ منذ آخر تعديل. المسودة
  // المحلية تحمي من ضياع الشغل، بس هي مو عرضاً محفوظاً — والبياع كان يرجع
  // ويلگى أعداد المواد انحسبت من جديد لأن العرض ما انحفظ أصلاً.
  const unsaved = !!draft && draft.items.length > 0 && !savedSnapshot;
  useEffect(() => {
    if (onUnsavedChange) onUnsavedChange(unsaved);
    return () => { if (onUnsavedChange) onUnsavedChange(false); };
  }, [unsaved, onUnsavedChange]);
  // رفع المسودة الحية للتطبيق — حتى المساعد الذكي العائم يقرأ نتيجة الحساب الحالية
  useEffect(() => {
    if (onDraftChange) onDraftChange(draft || null);
  }, [draft, onDraftChange]);

  // قوائم التبديل اليدوي: البطاريات والانفيرترات من options، الألواح من draft (تعتمد على البطارية المختارة)
  function tiersResultFor(cat) {
    if (!preview) return null;
    if (cat === 'panel') return draft?.panelTiers;
    if (cat === 'battery') return preview.options.batteryTiers;
    return draft?.inverterTiers; // الانفيرتر صار يُختار بعد الألواح (يعتمد على مصفوفتها)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 className="page-title" style={{ flex: 1, marginBottom: 0 }}>إنشاء عرض سعر</h2>
        <button
          className="btn btn-secondary btn-sm"
          onClick={startNewQuote}
          title="تصفير الشاشة كاملة لبدء عرض جديد — تُمسح المسودة الحالية"
        >
          🆕 عرض جديد
        </button>
      </div>

      {dupMatch && (
        <div className="dup-overlay" onClick={dismissDup}>
          <div className="dup-popup" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '2rem' }}>⚠️</div>
            <h3 style={{ margin: '4px 0', color: 'var(--navy)' }}>يوجد عرض سابق لهذا العميل!</h3>
            <p style={{ margin: '4px 0' }}>
              <b>{dupMatch.client_name || '-'}</b>
              {dupMatch.client_phone ? ` — ${dupMatch.client_phone}` : ''}
              <br />
              عرض رقم <b>{dupMatch.quote_number}</b> بتاريخ {new Date(dupMatch.created_at).toLocaleDateString('en-GB')} بمجموع{' '}
              <b>{fmt(dupMatch.total_price)}</b> دينار
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10 }}>
              <button className="btn btn-primary" onClick={openDupForEdit}>
                ✏ فتح العرض للتعديل
              </button>
              <button className="btn btn-secondary" onClick={dismissDup}>
                تجاهل ومتابعة عرض جديد
              </button>
            </div>
          </div>
        </div>
      )}

      {editingQuote && (
        <div className="alert alert-warning" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b>✏ وضع التعديل — العرض رقم {editingQuote.quote_number}</b>
          <span className="muted">عدّل ما تشاء ثم احفظ التعديلات، أو احفظه كعرض جديد برقم جديد</span>
          <button className="btn btn-secondary btn-sm" onClick={exitEditMode} style={{ marginInlineStart: 'auto' }}>
            إلغاء التعديل
          </button>
        </div>
      )}

      <div className="card">
        <h3 className="card-heading">👤 معلومات الزبون</h3>
        <div className="grid-3">
          <div className={fieldClass('clientName')}>
            <label>اسم العميل</label>
            <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className={fieldClass('clientPhone')}>
            <label>رقم الموبايل</label>
            <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
          </div>
          <div className={fieldClass('location')}>
            <label>الموقع</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          {canAttribute && (
            <div className="field">
              <label>العرض من طرف</label>
              <select value={createdBy} onChange={(e) => setCreatedBy(e.target.value)}>
                <option value="">
                  {editingQuote ? 'المنشئ الحالي (بدون تغيير)' : `حسابي${myName ? ` (${displayCreator(myName)})` : ''}`}
                </option>
                {creatorOptions.map((n) => (
                  <option key={n} value={n}>{displayCreator(n)}</option>
                ))}
                {createdBy && !creatorOptions.includes(createdBy) && (
                  <option value={createdBy}>{displayCreator(createdBy)}</option>
                )}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="card-heading">⚡ متطلبات المنظومة</h3>

        {/* نوع المنظومة: يحدد أي حقول تظهر وأي مواد تنضاف تلقائياً */}
        <div className="tier-toggle" style={{ marginBottom: 12 }}>
          {SYSTEM_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={systemType === t.key ? 'active' : ''}
              onClick={() => changeSystemType(t.key)}
              title={t.hint}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* السستم المتكامل: الحمل المحسوب من الأمبيرية — ظاهر حتى ما ينخبى أي تحويل */}
        {isIntegrated && preview?.draft?.integrated?.required && (
          <div style={{ background: '#f2f6fb', border: '1px dashed #b9c9da', borderRadius: 12, padding: '10px 12px', marginBottom: 12, fontSize: '0.86rem', color: '#12456f' }}>
            الحمل المحسوب: <b>{Math.round(preview.draft.integrated.required.dayLoadKw || 0)} kW نهاراً</b>
            {' · '}
            <b>{Math.round(preview.draft.integrated.required.nightLoadKw || 0)} kW ليلاً</b>
            {' — '}المطلوب من الكابينة: <b>{Math.ceil(preview.draft.integrated.required.kw || 0)} kW</b>
            {preview.draft.integrated.required.kwh > 0 && (
              <> و <b>{Math.ceil(preview.draft.integrated.required.kwh)} kWh</b></>
            )}
          </div>
        )}

        <div className={isOffgrid ? 'big-inputs' : 'big-inputs big-inputs-4'}>
          {/* الأوف جرد ما يحتاج مساحة سطح (بلا ألواح ولا هيكل) */}
          {!isOffgrid && (
            <div className={fieldClass('roofAreaM2')}>
              <label>مساحة السطح (م²)</label>
              <input type="number" value={roofAreaM2} onChange={(e) => setRoofAreaM2(e.target.value)} />
            </div>
          )}
          {!isOffgrid && (
            <div className={fieldClass('ampDay')}>
              <label>أمبير مطلوب نهاراً</label>
              <input type="number" value={ampDay} onChange={(e) => setAmpDay(e.target.value)} />
            </div>
          )}
          {!isDayOnly && (
            <div className={fieldClass('ampNight')}>
              <label>{isOffgrid ? 'الأمبير المطلوب' : 'أمبير مطلوب ليلاً'}</label>
              <input type="number" value={ampNight} onChange={(e) => setAmpNight(e.target.value)} />
            </div>
          )}
          {!isDayOnly && (
            <div className={fieldClass('nightSupplyHours')}>
              <label>{isOffgrid ? 'ساعات التجهيز' : 'ساعات التجهيز الليلي'}</label>
              <input
                type="number"
                value={nightSupplyHours}
                onChange={(e) => setNightSupplyHours(e.target.value)}
                placeholder="تُحدد في كل عرض"
              />
            </div>
          )}
        </div>
        {isOffgrid && (
          <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.82rem' }}>
            منظومة انفيرتر وبطاريات بلا ألواح — ما تنضاف ألواح ولا هيكل ولا صبّات ولا بوردة حماية DC،
            والأسلاك وبقية التفاصيل تنتخب من «المواد الثانوية».
          </p>
        )}

        {/* البراند: قسم مستقل لكل فئة (لوح · بطارية · انفيرتر · كابينة) — المنظومة
            تنبني من الماركات المختارة، والأقسام المعروضة تتبع نوع المنظومة:
            النهارية بلا بطاريات، والأوف جرد بلا ألواح. الاختيار ما يمس تحجيم
            المنظومة إطلاقاً — بس يحصر المواد اللي ينتخب منها المحرك. */}
        {mayPickBrand && brandOptions && brandSections.length > 0 && (
          <div className="brand-pick">
            <div className="brand-pick-head">
              <b>البراند</b>
              <span className="muted">اختر ماركة كل قسم لحاله، أو «كل الماركات» ليختار البرنامج الأنسب</span>
            </div>
            {brandSections.map((cat) => (
              <div className="brand-section" key={cat}>
                <div className="brand-section-title">{BRAND_SECTION_LABELS[cat]}</div>
                {(brandOptions[cat] || []).length === 0 ? (
                  <p className="muted brand-empty">ماكو ماركات مسجّلة لهذا القسم بالمخزون</p>
                ) : (
                  <div className="brand-row">
                    <button
                      type="button"
                      className={`brand-chip${!brands[cat] ? ' active' : ''}`}
                      onClick={() => pickBrand(cat, '')}
                    >
                      <span className="brand-name">كل الماركات</span>
                    </button>
                    {(brandOptions[cat] || []).map((b) => (
                      <button
                        key={b}
                        type="button"
                        className={`brand-chip${brands[cat] === b ? ' active' : ''}`}
                        onClick={() => pickBrand(cat, brands[cat] === b ? '' : b)}
                        title={b}
                      >
                        <BrandLogo name={b} size={22} />
                        <span className="brand-name">{b}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="tier-toggle">
          {TIERS.map((t) => (
            <button key={t.key} className={tier === t.key ? 'active' : ''} onClick={() => setTier(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #d5dde6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setPricingOpen((o) => !o)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: 'var(--navy)', fontSize: '1rem' }}
            >
              💹 {isAdmin ? 'زيادة / خصم / تقسيط' : 'التقسيط'} {pricingOpen ? '▲' : '▼'}
            </button>
            {!pricingOpen && ((isAdmin && (Number(markupPercent) > 0 || Number(discountPercent) > 0)) || installment) && (
              <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                {isAdmin && Number(markupPercent) > 0 && (
                  <span style={{ background: '#fdf0d5', color: '#8a5b00', borderRadius: 12, padding: '2px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
                    زيادة {markupPercent}% {markupMode === 'distributed' ? 'موزعة' : 'علنية'}
                  </span>
                )}
                {isAdmin && Number(discountPercent) > 0 && (
                  <span style={{ background: '#e3f2e6', color: '#1c6b2e', borderRadius: 12, padding: '2px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
                    خصم {discountPercent}%
                  </span>
                )}
                {installment && (
                  <span style={{ background: '#e6f0fb', color: '#1a5a9c', borderRadius: 12, padding: '2px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
                    🏦 {installmentPlan === 'cbi' ? 'تقسيط — البنك المركزي' : 'تقسيط — مصرف النهرين'}
                  </span>
                )}
              </span>
            )}
          </div>
          {pricingOpen && (
          <>
          {/* الزيادة والخصم: صلاحية المشرفين فقط — البياع الاعتيادي يشوف التقسيط فقط */}
          {isAdmin && (
          <div className="opt-group">
          <div className="opt-group-title">الزيادة والخصم</div>
          <div className="grid-3">
            <div className={fieldClass('markupPercent')}>
              <label>نسبة الزيادة %</label>
              <input
                type="number"
                min="0"
                step="any"
                value={markupPercent}
                onChange={(e) => setMarkupPercent(e.target.value)}
                placeholder="بدون زيادة"
              />
            </div>
            <div className="field">
              <label>طريقة الزيادة</label>
              <div className="tier-toggle" style={{ margin: 0, opacity: Number(markupPercent) > 0 ? 1 : 0.45 }}>
                <button
                  type="button"
                  className={markupMode === 'visible' ? 'active' : ''}
                  onClick={() => setMarkupMode('visible')}
                  title="تنكتب سطر واضح بجدول العرض"
                >
                  علنية بالعرض
                </button>
                <button
                  type="button"
                  className={markupMode === 'distributed' ? 'active' : ''}
                  onClick={() => setMarkupMode('distributed')}
                  title="تنضرب على أسعار المواد نفسها — ما يبين منها شي للزبون"
                >
                  موزعة على الأسعار
                </button>
              </div>
            </div>
            <div className={fieldClass('discountPercent')}>
              <label>نسبة الخصم %</label>
              <input
                type="number"
                min="0"
                step="any"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                placeholder="بدون خصم"
              />
            </div>
          </div>
          </div>
          )}
          <div className="opt-group">
          <div className="opt-group-title">التقسيط</div>
          <label className="opt-line">
            <input type="checkbox" checked={installment} onChange={(e) => setInstallment(e.target.checked)} />
            <span><b>🏦 إدراج التقسيط بالعرض</b></span>
          </label>
          {/* خطتان: نظام الشركة المعتاد، أو مبادرة البنك المركزي (26% لسبع سنوات) */}
          {installment && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {[
                { key: 'company', label: 'مصرف النهرين', hint: 'نسبة وأشهر التقسيط من الإعدادات' },
                { key: 'cbi', label: 'مبادرة البنك المركزي', hint: 'فائدة 26% لمدة 7 سنوات' },
              ].map((pl) => (
                <button
                  key={pl.key}
                  type="button"
                  onClick={() => changeInstallmentPlan(pl.key)}
                  style={{
                    flex: '1 1 190px', textAlign: 'right', cursor: 'pointer', borderRadius: 12, padding: '9px 12px',
                    border: installmentPlan === pl.key ? '2px solid var(--navy)' : '1px solid #ccd6e2',
                    background: installmentPlan === pl.key ? '#e9f0f9' : '#fff',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--navy)' }}>
                    {installmentPlan === pl.key ? '◉' : '○'} {pl.label}
                  </div>
                  <div className="muted" style={{ fontSize: '0.78rem' }}>{pl.hint}</div>
                </button>
              ))}
            </div>
          )}
          {/* نسبة المصرف وأشهره تجي من الإعدادات لكل خطة — كانت هنا خانتان فارغتان
              «من الإعدادات» ما ينكتب بيهن شي بالعادة، فانشالن. والعرض المحفوظ يخزن
              النسبة والأشهر اللي انحسب بيهن فعلاً، فيرجع بنفس المجموع مهما تغيّرت
              الإعدادات بعدين. */}
          {installment && (
            <label className="opt-line" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={hideTotalInPdf}
                onChange={(e) => setHideTotalInPdf(e.target.checked)}
              />
              <span>
                <b>إخفاء المجموع الكلي من ملف الزبون</b>
                <small className="muted">
                  أسعار البنود تبقى مثل ما هي بالمخزون، ونسبة المصرف تنضرب على المجموع بس.
                  بالتأشير ينشال سطر «المجموع الكلي» من الملف ويبقى مجموع التقسيط والقسط الشهري.
                </small>
              </span>
            </label>
          )}
          </div>
          </>
          )}
        </div>

        {secondaryMaterials.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: '1px dashed #d5dde6' }}>
            <b style={{ color: 'var(--navy)' }}>المواد الثانوية بالعرض:</b>
            {secondaryMaterials
              .filter((m) => secondarySel[m.id])
              .map((m) => {
                const manual = secondarySel[m.id]?.qty;
                const perPanel = m.qty_per_panel > 0;
                const panels = preview?.draft?.panelBreakdown
                  ? preview.draft.panelBreakdown.feedPanels + preview.draft.panelBreakdown.chargePanels
                  : 0;
                const qty = manual !== '' && manual != null ? Number(manual) : perPanel ? panels || '؟' : m.unit === 'متر' ? '؟' : 1;
                return (
                  <span
                    key={m.id}
                    style={{ background: '#e6f0fb', color: '#1a5a9c', borderRadius: 14, padding: '3px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                  >
                    {m.model} ×{qty}
                  </span>
                );
              })}
            {Object.keys(secondarySel).length === 0 && <span className="muted">لا توجد مواد ثانوية محددة</span>}
            <button className="btn btn-primary btn-sm" onClick={() => setPickerOpen(true)} style={{ marginInlineStart: 'auto' }}>
              ➕ إضافة / تعديل
            </button>
          </div>
        )}
      </div>

      {pickerOpen && (
        <SecondaryPickerModal
          systemType={systemType}
          secondary={secondaryMaterials}
          selections={secondarySel}
          panelCount={preview?.draft?.panelBreakdown ? preview.draft.panelBreakdown.feedPanels + preview.draft.panelBreakdown.chargePanels : 0}
          onChange={setSecondarySel}
          onDefaultsSaved={(ids) => {
            // القائمة المعتمدة توّها انحفظت — نحدّث المرجعين حتى «عرض جديد»
            // ياخذها فوراً بدل القائمة اللي انحسبت عند فتح الشاشة
            savedSecondaryIdsRef.current = ids;
            secondaryDefaultsRef.current = computeSecondaryDefaults(secondaryMaterials, ids, systemTypeRef.current);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {!validInputs && (
        <div className="alert alert-info">
          أدخل الأمبير المطلوب (نهاراً و/أو ليلاً) — مع الحمل النهاري أدخل مساحة السطح، ومع الحمل الليلي أدخل ساعات التجهيز.
          <br />
          <small className="muted">
            أمبير الليل صفر = منظومة نهارية بلا بطاريات (زراعية...) • أمبير النهار صفر = انفيرتر وبطارية فقط بلا ألواح (بلا حاجة لمساحة سطح)
          </small>
        </div>
      )}

      {preview && draft && (
        <>
          {Object.entries(draft.errors).map(([key, msg]) => (
            <div className="alert alert-danger" key={key}>
              {msg}
            </div>
          ))}
          {Object.entries(draft.warnings || {}).map(([key, msg]) => (
            <div className="alert alert-warning" key={key}>
              {msg}
            </div>
          ))}
          {Object.entries(draft.singleOptionCategories)
            // بالسستم المتكامل ماكو بطارية ولا انفيرتر منفصلين — تنبيهاتهما ضجيج
            .filter(([cat, v]) => v && !(isIntegrated && (cat === 'battery' || cat === 'inverter')))
            .map(([cat]) => (
              <div className="alert alert-info" key={cat}>
                خيار وحيد متوفر حالياً لفئة {CATEGORY_LABELS[cat]}
              </div>
            ))}

          <div className="card">
            <div className="toolbar">
              <h3 style={{ margin: 0, color: 'var(--navy)' }}>معاينة العرض</h3>
              <span className="total-badge" style={calculating ? { opacity: 0.55 } : {}}>
                {calculating ? '⏳ جارٍ الحساب... ' : ''}المجموع الكلي: {fmt(draft.total)} دينار
              </span>
            </div>

            {draft.adjustments && (draft.adjustments.markupAmount > 0 || draft.adjustments.discountAmount > 0) && (
              <p className="muted" style={{ marginTop: 2 }}>
                مجموع البنود قبل الزيادة/الخصم: <b>{fmt(draft.adjustments.subtotal)}</b> دينار
                {draft.adjustments.markupAmount > 0 && (
                  <>
                    {' — '}زيادة {draft.adjustments.markupPercent}%{' '}
                    {draft.adjustments.markupMode === 'distributed' ? '(موزعة على الأسعار — ما تظهر للزبون)' : '(سطر علني بالعرض)'}:{' '}
                    <b>+{fmt(draft.adjustments.markupAmount)}</b>
                  </>
                )}
                {draft.adjustments.discountAmount > 0 && (
                  <>
                    {' — '}خصم {draft.adjustments.discountPercent}%: <b>−{fmt(draft.adjustments.discountAmount)}</b>
                  </>
                )}
              </p>
            )}

            {draft.installment && (
              <div className="alert alert-info" style={{ marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap', fontWeight: 700 }}>
                <span>💰 المجموع الكلي: {fmt(draft.installment.cashTotal)} دينار</span>
                <span>🏦 {draft.installment.label} (×{draft.installment.rate}): {fmt(draft.installment.totalWithInterest)} دينار</span>
                <span>القسط الشهري لمدة {draft.installment.months} شهر: {fmt(draft.installment.monthly)} دينار</span>
                {draft.installment.interestAmount > 0 && (
                  <span style={{ fontWeight: 600, color: 'var(--muted)' }}>
                    فائدة المصرف: {fmt(draft.installment.interestAmount)} دينار
                  </span>
                )}
              </div>
            )}

            {draft.internalNotes && draft.internalNotes.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowPriceNotes((v) => !v)}>
                  📌 ملاحظات الأسعار ({draft.internalNotes.length}) {showPriceNotes ? '▲' : '▼'}
                </button>
                {showPriceNotes && (
                  <div className="alert alert-warning" style={{ marginTop: 8, marginBottom: 0 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      ملاحظات داخلية للبائع (مصدر السعر وتاريخه) — لا تُطبع في العرض ولا يراها العميل:
                    </div>
                    {draft.internalNotes.map((n, i) => (
                      <div key={i}>
                        <b>{n.label}:</b> {n.note}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {draft.panelBreakdown && (
              <p className="muted" style={{ marginTop: 0 }}>
                الألواح: {draft.panelBreakdown.feedPanels} للتغذية النهارية + {draft.panelBreakdown.chargePanels} لشحن البطاريات
                {draft.panelBreakdown.extraPanels !== 0 &&
                  ` ${draft.panelBreakdown.extraPanels > 0 ? '+' : '−'} ${Math.abs(draft.panelBreakdown.extraPanels)} يدوياً`}
                {/* عرض محفوظ قبل قاعدة معامل الأمان — ألواحه أقل من عرض جديد
                    بنفس الأرقام، فنكول للبياع السبب بدل ما يظن اكو خلل */}
                {panelSafetyFactor < PANEL_SAFETY_FACTOR && (
                  <span className="pill-old-rule">
                    عرض قديم — بلا معامل أمان الألواح ({PANEL_SAFETY_FACTOR}×)، محفوظ مثل ما هو
                  </span>
                )}
              </p>
            )}

            {draft.counts && (
              <div style={{ background: '#f2f6fb', border: '1px dashed #b9c9da', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <b style={{ color: 'var(--navy)' }}>🛠 زيادة / نقصان يدوي:</b>
                  {[
                    { cat: 'panel', label: 'لوح' },
                    { cat: 'battery', label: 'بطارية' },
                    { cat: 'inverter', label: 'انفيرتر' },
                    { cat: 'integrated', label: 'كابينة' },
                  ].map(({ cat, label }) => {
                    const base = draft.baseCounts[cat] || 0;
                    if (!base) return null;
                    return (
                      <UnitCounter
                        key={cat}
                        label={label}
                        count={draft.counts[cat] || 0}
                        base={base}
                        onChange={(target) => setUnitCounts((u) => ({ ...u, [cat]: target }))}
                      />
                    );
                  })}
                  {(extraUnits.panel !== 0 || extraUnits.battery !== 0 || extraUnits.inverter !== 0 || extraUnits.integrated !== 0 || Object.keys(unitCounts).length > 0) && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setExtraUnits({ panel: 0, battery: 0, inverter: 0, integrated: 0 }); setUnitCounts({}); }}>
                      ↺ العودة للحساب التلقائي
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* قدرة المنظومة الفعلية — تظهر لكل الحسابات دائماً (مو داخل صندوق الأزرار) */}
            {draft.capability && (draft.capability.nightHours != null || draft.capability.dayAmps != null) && (
              <div style={{ background: '#eaf3fb', border: '1px solid #bcd6ec', borderRadius: 12, padding: '9px 12px', marginBottom: 12, fontSize: '0.9rem', color: '#12456f', fontWeight: 700 }}>
                {draft.capability.nightHours != null && (
                  <span>
                    🔋 {isIntegrated ? 'الكابينة تُجهّز' : 'البطاريات تُجهّز'} {ampNight} أمبير ليلياً لمدة ≈{draft.capability.nightHours} ساعة
                  </span>
                )}
                {draft.capability.nightHours != null && draft.capability.dayAmps != null && ' — '}
                {draft.capability.dayAmps != null && (
                  <span>⚡ {isIntegrated ? 'الكابينة تتحمل' : 'الانفيرترات تتحمل'} ≈{draft.capability.dayAmps} أمبير نهاراً</span>
                )}
                {draft.capability.chargeHours && (
                  <div style={{ fontWeight: 400, fontSize: '0.82rem', marginTop: 4, color: '#5b6b7c' }}>
                    ☀ الألواح محسوبة لشحن الكابينة خلال ≈{draft.capability.chargeHours} ساعات (الجهاز ما يقبل أسرع من ساعتين — 0.5P)
                  </div>
                )}
              </div>
            )}

            {/* السستم المتكامل: مبدّل الكابينة — يعرض القدرة والسعة والعدد المحسوب لكل خيار */}
            {isIntegrated && draft.integrated && draft.integrated.options.length > 0 && (
              <div className="field" style={{ marginBottom: 10 }}>
                <label>
                  الكابينة المتكاملة
                  {draft.integrated.required && (
                    <small style={{ fontWeight: 400, color: '#5b6b7c' }}>
                      {'  '}— المطلوب للحمل: ≈{Math.ceil(draft.integrated.required.kw)} kW
                      {draft.integrated.required.kwh > 0 && <> و ≈{Math.ceil(draft.integrated.required.kwh)} kWh</>}
                    </small>
                  )}
                </label>
                <select
                  value={draft.integrated.chosenId || ''}
                  onChange={(e) => setOverride('integrated', e.target.value)}
                >
                  {draft.integrated.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.brand} {o.model} — {o.kw ? `${o.kw} kW` : 'قدرة غير محددة'} / {o.kwh} kWh
                      {' '}× {o.units} = {fmt(o.totalPrice)} د.ع
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid-3">
              {(isIntegrated ? ['panel'] : ['panel', 'battery', 'inverter']).map((cat) => {
                const tiersResult = tiersResultFor(cat);
                if (!tiersResult || tiersResult.insufficient || tiersResult.none) return null;
                const chosenId = overrides[cat] ?? tiersResult[tier]?.material.id;
                // البطاريات: الأعداد تختلف حسب معامل أمان المستوى — ناخذ قائمة المستوى الحالي
                const optionsList = (tiersResult.allByTier && tiersResult.allByTier[tier]) || tiersResult.all;
                return (
                  <div className="field" key={cat}>
                    <label>تبديل {CATEGORY_LABELS[cat]} يدوياً</label>
                    <select value={chosenId || ''} onChange={(e) => setOverride(cat, e.target.value)}>
                      {optionsList.map((c) => (
                        <option key={c.material.id} value={c.material.id}>
                          {c.material.brand} {c.material.model} — {fmt(c.totalPrice)} د.ع
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>ت</th>
                  <th>المواد</th>
                  <th>الوحدة</th>
                  <th>الكمية</th>
                  <th>سعر الوحدة</th>
                  <th>المجموع</th>
                </tr>
              </thead>
              <tbody>
                {draft.items.map((item, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td style={{ whiteSpace: 'pre-line' }}>{item.description}</td>
                    <td>{item.unit}</td>
                    <td>{item.quantity}</td>
                    <td>{fmt(item.unit_price)}</td>
                    <td>{fmt(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <label style={{ fontWeight: 700, color: 'var(--navy)' }}>ملاحظات العرض (سطر لكل ملاحظة)</label>
            <textarea
              rows={5}
              value={(notes || []).join('\n')}
              onChange={(e) => setNotes(e.target.value.split('\n'))}
            />
          </div>

          {saveMessage && <div className="alert alert-info">{saveMessage}</div>}
          {/* تذكير الحفظ: المسودة المحلية تحمي الشغل من الضياع، بس العرض ما ينحفظ
              بقاعدة البيانات إلا بالزر — وبدون الحفظ يرجع البياع فيلگى الأعداد
              انحسبت من جديد بدل ما ترجع مثل ما تركها. */}
          {unsaved && !hasBlockingErrors && (
            <div className="alert alert-warning save-nudge">
              <span>⚠ هذا العرض <b>ما محفوظ</b> — احفظه حتى يرجع بنفس المواد والأعداد لمن تفتحه.</span>
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={editingQuote ? handleUpdate : handleSave}>
                {editingQuote ? '💾 حفظ التعديلات' : '💾 حفظ العرض'}
              </button>
            </div>
          )}
          {/* شريط إجراءات ثابت أسفل المحتوى: المجموع + الحفظ دائماً بمتناول اليد حتى مع التمرير */}
          <div className="action-bar">
            <span className="action-total">
              {calculating ? '⏳' : '💰'} {fmt(draft.total)} <small>دينار</small>
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" disabled={saving || hasBlockingErrors} onClick={handleExportPdf}>
                📄 PDF
              </button>
              {showcaseAllowed && (
                <button className="btn btn-secondary" disabled={hasBlockingErrors} onClick={() => setShowcaseOpen(true)} title="عرض تفاعلي ثلاثي الأبعاد للزبون">
                  🎬 عرض تفاعلي
                </button>
              )}
              {editingQuote ? (
                <>
                  <button className="btn btn-primary" disabled={saving || hasBlockingErrors} onClick={handleUpdate}>
                    💾 حفظ التعديلات ({editingQuote.quote_number})
                  </button>
                  <button className="btn btn-secondary" disabled={saving || hasBlockingErrors} onClick={handleSave}>
                    حفظ كجديد
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" disabled={saving || hasBlockingErrors} onClick={handleSave}>
                  💾 حفظ العرض
                </button>
              )}
            </div>
          </div>

          {showcaseOpen && showcaseAllowed && (
            <Suspense fallback={null}>
              {detectSceneType(draft) === 'pump' ? (
                // البرنامج فهم أن العرض منظومة مضخة ماء — يعرض مساحتها الزراعية
                <PumpShowcase
                  panels={draft.counts?.panel ?? 0}
                  inverters={draft.counts?.inverter ?? 1}
                  ampDay={Number(ampDay) || 0}
                  onClose={() => setShowcaseOpen(false)}
                />
              ) : (
                <SystemShowcase
                  panels={draft.counts?.panel ?? (draft.panelBreakdown ? draft.panelBreakdown.feedPanels + draft.panelBreakdown.chargePanels : 0)}
                  batteries={draft.counts?.battery ?? 0}
                  inverters={draft.counts?.inverter ?? 1}
                  nightHours={draft.capability?.nightHours ?? null}
                  dayAmps={draft.capability?.dayAmps ?? null}
                  ampDay={Number(ampDay) || 0}
                  ampNight={Number(ampNight) || 0}
                  onClose={() => setShowcaseOpen(false)}
                />
              )}
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
