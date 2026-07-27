import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import SecondaryPickerModal from '../components/SecondaryPickerModal.jsx';
// العرض التفاعلي 3D يُحمّل عند الطلب فقط (يجرّ three.js) حتى ما يثقل فتح الصفحة
const SystemShowcase = lazy(() => import('../components/SystemShowcase.jsx'));
import { buildEditPrefill } from '../lib/editPrefill.js';
import { getIsAdmin, getCurrentUsername, ADMIN_USERS } from '../lib/agent.js';
import { computeSecondaryDefaults } from '../lib/secondaryDefaults.js';

// مسودة العرض الجارية تنحفظ محلياً — الرفرش أو التنقل بين الصفحات ما يمسح الشغل،
// والأسعار تتحدث تلقائياً لأن المعاينة تعيد الجلب والحساب من القاعدة بكل مرة
const DRAFT_KEY = 'quote_draft_v1';
function readSavedDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null;
  } catch {
    return null;
  }
}

const TIERS = [
  { key: 'economy', label: 'اقتصادي' },
  { key: 'standard', label: 'متوسط' },
  { key: 'premium', label: 'ممتاز' },
];

const CATEGORY_LABELS = { panel: 'اللوح', battery: 'البطارية', inverter: 'الانفيرتر' };

function fmt(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function QuoteBuilder({ prefill, onDraftChange }) {
  // المسودة المحفوظة (إن وجدت) تسترد بأول تركيب — تتقدم على القيم الفارغة وتخضع للـprefill
  const savedDraft = useRef(readSavedDraft()).current;
  const [clientName, setClientName] = useState(savedDraft?.clientName ?? '');
  const [clientPhone, setClientPhone] = useState(savedDraft?.clientPhone ?? '');
  const [location, setLocation] = useState(savedDraft?.location ?? '');
  const [roofAreaM2, setRoofAreaM2] = useState(savedDraft?.roofAreaM2 ?? '');
  const [ampDay, setAmpDay] = useState(savedDraft?.ampDay ?? '');
  const [ampNight, setAmpNight] = useState(savedDraft?.ampNight ?? '');
  const [nightSupplyHours, setNightSupplyHours] = useState(savedDraft?.nightSupplyHours ?? '');
  const [tier, setTier] = useState(savedDraft?.tier ?? 'economy');
  // نسبة الزيادة: علنية (سطر بالعرض) أو موزعة (تنضرب على أسعار البنود نفسها) + نسبة الخصم
  const [markupPercent, setMarkupPercent] = useState(savedDraft?.markupPercent ?? '');
  const [markupMode, setMarkupMode] = useState(savedDraft?.markupMode ?? 'visible');
  const [discountPercent, setDiscountPercent] = useState(savedDraft?.discountPercent ?? '');
  // التقسيط المصرفي: جيك بوينت — النسبة والأشهر من الإعدادات، والمعادلة: المجموع × النسبة ÷ الأشهر
  const [installment, setInstallment] = useState(savedDraft?.installment ?? false);
  // زيادة/نقصان يدوي بالوحدات (لوح ±2، بطارية وانفيرتر ±1) — للمستخدمين الرئيسيين فقط
  const [extraUnits, setExtraUnits] = useState(savedDraft?.extraUnits ?? { panel: 0, battery: 0, inverter: 0 });
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
  const showcaseAllowed = isAdmin && (myName || '').replace(/[أإآ]/g, 'ا').trim() === 'احمد';
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

  useEffect(() => {
    // الملاحظات الافتراضية فقط إذا ماكو ملاحظات قائمة (مسودة محفوظة أو عرض مفتوح للتعديل) —
    // حتى ما تنداس ملاحظات البياع كل ما يرجع للصفحة أو يوصل الرد متأخر وهو يكتب
    window.api.company.get().then((c) => setNotes((prev) => (prev == null ? c.notes_default || [] : prev)));
    // ساعات التجهيز الليلي بدون قيمة افتراضية — البياع يحددها بكل عرض
    // الافتراضي: القائمة الدائمة المشتركة من قاعدة البيانات (يحفظها الفريق من نافذة الثانوية)،
    // وإذا ما محفوظة بعد: الأساسيات حسب الألواح (هيكل + صبات) + بوردة الحماية DC
    Promise.all([window.api.materials.list(), window.api.config.get('secondary_defaults')]).then(([all, savedIds]) => {
      const secondary = (all || []).filter((m) => m.category === 'secondary');
      setSecondaryMaterials(secondary);
      const defaults = computeSecondaryDefaults(secondary, savedIds);
      secondaryDefaultsRef.current = defaults;
      // الافتراضيات تنطبق فقط إذا ماكو مسودة محفوظة ولا اختيار قائم — حتى ما ندعس على شغل البياع
      setSecondarySel((prev) => (Object.keys(prev).length > 0 || savedDraft?.secondarySel ? prev : defaults));
    });
  }, []);

  // وضع تعديل عرض محفوظ: {id, quote_number} — الحفظ يحدث نفس العرض
  const [editingQuote, setEditingQuote] = useState(savedDraft?.editingQuote ?? null);

  // حفظ المسودة محلياً بكل تغيير (مؤجل نص ثانية) — الرفرش والتنقل ما يمسحون الشغل
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            clientName, clientPhone, location, roofAreaM2, ampDay, ampNight, nightSupplyHours,
            tier, overrides, secondarySel, markupPercent, markupMode, discountPercent,
            installment, extraUnits, notes, editingQuote, pricingOpen, createdBy,
          })
        );
      } catch {
        /* التخزين المحلي ممتلئ أو معطل — نكمل بدون حفظ */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [clientName, clientPhone, location, roofAreaM2, ampDay, ampNight, nightSupplyHours, tier, overrides, secondarySel, markupPercent, markupMode, discountPercent, installment, extraUnits, notes, editingQuote, pricingOpen, createdBy]);

  // 🆕 عرض جديد: تصفير كامل + مسح المسودة المحفوظة + رجوع الثانوية لافتراضياتها
  function startNewQuote() {
    setEditingQuote(null);
    setClientName('');
    setClientPhone('');
    setLocation('');
    setRoofAreaM2('');
    setAmpDay('');
    setAmpNight('');
    setNightSupplyHours('');
    setTier('economy');
    setOverrides({});
    setMarkupPercent('');
    setMarkupMode('visible');
    setDiscountPercent('');
    setInstallment(false);
    setExtraUnits({ panel: 0, battery: 0, inverter: 0 });
    setCreatedBy('');
    setSecondarySel(secondaryDefaultsRef.current);
    window.api.company.get().then((c) => setNotes(c.notes_default || [])).catch(() => {});
    setSaveMessage('');
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
      const x = p.extraUnits || a.extraUnits || {};
      setExtraUnits({ panel: Number(x.panel) || 0, battery: Number(x.battery) || 0, inverter: Number(x.inverter) || 0 });
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

  useEffect(() => {
    if (prefill) applyPrefill(prefill);
  }, [prefill]);

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

  function exitEditMode() {
    setEditingQuote(null);
    setClientName('');
    setClientPhone('');
    setLocation('');
    setRoofAreaM2('');
    setAmpDay('');
    setAmpNight('');
    setNightSupplyHours('');
    setOverrides({});
    setMarkupPercent('');
    setMarkupMode('visible');
    setDiscountPercent('');
    setInstallment(false);
    setExtraUnits({ panel: 0, battery: 0, inverter: 0 });
    setCreatedBy('');
    setSaveMessage('');
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
      setEditingQuote(null);
    } catch (err) {
      setSaveMessage('حدث خطأ أثناء التحديث: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // useMemo ضروري: بدونه الكائن يتجدد بكل رندر → المؤقت ينعاد → حلقة إعادة حساب لا نهائية
  const inputs = useMemo(
    () => ({ roofAreaM2, ampDay, ampNight, nightSupplyHours, tier, overrides, secondarySel, markupPercent, markupMode, discountPercent, installment, extraUnits }),
    [roofAreaM2, ampDay, ampNight, nightSupplyHours, tier, overrides, secondarySel, markupPercent, markupMode, discountPercent, installment, extraUnits]
  );
  const debouncedInputs = useDebouncedValue(inputs, 300);

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
        overrides: debouncedInputs.overrides,
        secondarySelections: debouncedInputs.secondarySel,
        adjustments: {
          markupPercent: Number(debouncedInputs.markupPercent) || 0,
          markupMode: debouncedInputs.markupMode,
          discountPercent: Number(debouncedInputs.discountPercent) || 0,
        },
        installment: debouncedInputs.installment,
        extraUnits: debouncedInputs.extraUnits,
      })
      .then(setPreview)
      .finally(() => setCalculating(false));
  }, [debouncedInputs, validInputs]);

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
      overrides,
      secondarySelections: secondarySel,
      adjustments: {
        markupPercent: Number(markupPercent) || 0,
        markupMode,
        discountPercent: Number(discountPercent) || 0,
      },
      installment,
      extraUnits,
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
        <div className="big-inputs big-inputs-4">
          <div className={fieldClass('roofAreaM2')}>
            <label>مساحة السطح (م²)</label>
            <input type="number" value={roofAreaM2} onChange={(e) => setRoofAreaM2(e.target.value)} />
          </div>
          <div className={fieldClass('ampDay')}>
            <label>أمبير مطلوب نهاراً</label>
            <input type="number" value={ampDay} onChange={(e) => setAmpDay(e.target.value)} />
          </div>
          <div className={fieldClass('ampNight')}>
            <label>أمبير مطلوب ليلاً</label>
            <input type="number" value={ampNight} onChange={(e) => setAmpNight(e.target.value)} />
          </div>
          <div className={fieldClass('nightSupplyHours')}>
            <label>ساعات التجهيز الليلي</label>
            <input
              type="number"
              value={nightSupplyHours}
              onChange={(e) => setNightSupplyHours(e.target.value)}
              placeholder="تُحدد في كل عرض"
            />
          </div>
        </div>

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
              💹 زيادة / خصم / تقسيط {pricingOpen ? '▲' : '▼'}
            </button>
            {!pricingOpen && (Number(markupPercent) > 0 || Number(discountPercent) > 0 || installment) && (
              <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                {Number(markupPercent) > 0 && (
                  <span style={{ background: '#fdf0d5', color: '#8a5b00', borderRadius: 12, padding: '2px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
                    زيادة {markupPercent}% {markupMode === 'distributed' ? 'موزعة' : 'علنية'}
                  </span>
                )}
                {Number(discountPercent) > 0 && (
                  <span style={{ background: '#e3f2e6', color: '#1c6b2e', borderRadius: 12, padding: '2px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
                    خصم {discountPercent}%
                  </span>
                )}
                {installment && (
                  <span style={{ background: '#e6f0fb', color: '#1a5a9c', borderRadius: 12, padding: '2px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
                    🏦 تقسيط
                  </span>
                )}
              </span>
            )}
          </div>
          {pricingOpen && (
          <>
          <div className="grid-3" style={{ marginTop: 8 }}>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontWeight: 700, color: 'var(--navy)', cursor: 'pointer' }}>
            <input type="checkbox" checked={installment} onChange={(e) => setInstallment(e.target.checked)} style={{ width: 18, height: 18 }} />
            🏦 إدراج التقسيط المصرفي بالعرض
          </label>
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
          secondary={secondaryMaterials}
          selections={secondarySel}
          panelCount={preview?.draft?.panelBreakdown ? preview.draft.panelBreakdown.feedPanels + preview.draft.panelBreakdown.chargePanels : 0}
          onChange={setSecondarySel}
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
            .filter(([, v]) => v)
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
                <span>🏦 المجموع مع فائدة المصرف (×{draft.installment.rate}): {fmt(draft.installment.totalWithInterest)} دينار</span>
                <span>القسط الشهري لمدة {draft.installment.months} شهر: {fmt(draft.installment.monthly)} دينار</span>
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
              </p>
            )}

            {isAdmin && draft.counts && (
              <div style={{ background: '#f2f6fb', border: '1px dashed #b9c9da', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <b style={{ color: 'var(--navy)' }}>🛠 زيادة / نقصان يدوي:</b>
                  {[
                    { cat: 'panel', label: 'لوح', step: 2, floor: 2 },
                    { cat: 'battery', label: 'بطارية', step: 1, floor: 1 },
                    { cat: 'inverter', label: 'انفيرتر', step: 1, floor: 1 },
                  ].map(({ cat, label, step, floor }) => {
                    const count = draft.counts[cat] || 0;
                    const base = draft.baseCounts[cat] || 0;
                    if (!base) return null;
                    const setTo = (target) => setExtraUnits((x) => ({ ...x, [cat]: target - base }));
                    return (
                      <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #d5dde6', borderRadius: 20, padding: '4px 8px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ borderRadius: '50%', width: 30, height: 30, padding: 0, fontWeight: 800 }}
                          disabled={count <= floor}
                          onClick={() => setTo(Math.max(floor, count - step))}
                          title={`نقصان ${step} ${label}`}
                        >
                          −
                        </button>
                        <b style={{ minWidth: 58, textAlign: 'center', color: 'var(--navy)' }}>
                          {label} ×{count}
                          {count !== base && <small style={{ color: '#b8860b' }}> ({count > base ? '+' : ''}{count - base})</small>}
                        </b>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ borderRadius: '50%', width: 30, height: 30, padding: 0, fontWeight: 800 }}
                          onClick={() => setTo(count + step)}
                          title={`زيادة ${step} ${label}`}
                        >
                          +
                        </button>
                      </span>
                    );
                  })}
                  {(extraUnits.panel !== 0 || extraUnits.battery !== 0 || extraUnits.inverter !== 0) && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExtraUnits({ panel: 0, battery: 0, inverter: 0 })}>
                      ↺ العودة للحساب التلقائي
                    </button>
                  )}
                </div>
                {draft.capability && (draft.capability.nightHours != null || draft.capability.dayAmps != null) && (
                  <div style={{ marginTop: 8, fontSize: '0.88rem', color: '#1a5a9c', fontWeight: 700 }}>
                    {draft.capability.nightHours != null && (
                      <span>🔋 البطاريات تُجهّز {ampNight} أمبير ليلياً لمدة ≈{draft.capability.nightHours} ساعة</span>
                    )}
                    {draft.capability.nightHours != null && draft.capability.dayAmps != null && ' — '}
                    {draft.capability.dayAmps != null && <span>⚡ الانفيرترات تتحمل ≈{draft.capability.dayAmps} أمبير نهاراً</span>}
                  </div>
                )}
              </div>
            )}

            <div className="grid-3">
              {['panel', 'battery', 'inverter'].map((cat) => {
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
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
