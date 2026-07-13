import React, { useEffect, useMemo, useRef, useState } from 'react';
import SecondaryPickerModal from '../components/SecondaryPickerModal.jsx';
import AssistantBar from '../components/AssistantBar.jsx';
import { buildEditPrefill } from '../lib/editPrefill.js';

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

export default function QuoteBuilder({ prefill, onAssistantQuote, onAssistantInventory }) {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [location, setLocation] = useState('');
  const [roofAreaM2, setRoofAreaM2] = useState('');
  const [ampDay, setAmpDay] = useState('');
  const [ampNight, setAmpNight] = useState('');
  const [nightSupplyHours, setNightSupplyHours] = useState('');
  const [tier, setTier] = useState('economy');
  // نسبة الزيادة: علنية (سطر بالعرض) أو موزعة (تنضرب على أسعار البنود نفسها) + نسبة الخصم
  const [markupPercent, setMarkupPercent] = useState('');
  const [markupMode, setMarkupMode] = useState('visible');
  const [discountPercent, setDiscountPercent] = useState('');
  // التقسيط المصرفي: جيك بوينت — النسبة والأشهر من الإعدادات، والمعادلة: المجموع × النسبة ÷ الأشهر
  const [installment, setInstallment] = useState(false);
  const [overrides, setOverrides] = useState({});
  // المواد الثانوية المختارة للعرض: { [materialId]: { qty } } — تبدأ بالأساسيات (هيكل + صبات)
  const [secondarySel, setSecondarySel] = useState({});
  const [secondaryMaterials, setSecondaryMaterials] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showPriceNotes, setShowPriceNotes] = useState(false);
  const [notes, setNotes] = useState(null);
  const [preview, setPreview] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    window.api.company.get().then((c) => setNotes(c.notes_default || []));
    // ساعات التجهيز الليلي بدون قيمة افتراضية — البياع يحددها بكل عرض
    // الافتراضي: القائمة الدائمة المشتركة من قاعدة البيانات (يحفظها الفريق من نافذة الثانوية)،
    // وإذا ما محفوظة بعد: الأساسيات حسب الألواح (هيكل + صبات) + بوردة الحماية DC
    Promise.all([window.api.materials.list(), window.api.config.get('secondary_defaults')]).then(([all, savedIds]) => {
      const secondary = (all || []).filter((m) => m.category === 'secondary');
      setSecondaryMaterials(secondary);
      setSecondarySel((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const defaults = {};
        if (Array.isArray(savedIds) && savedIds.length > 0) {
          const existing = new Set(secondary.map((m) => m.id));
          for (const id of savedIds) if (existing.has(id)) defaults[id] = { qty: '' };
          return defaults;
        }
        for (const m of secondary) {
          if (m.qty_per_panel && m.qty_per_panel > 0) defaults[m.id] = { qty: '' };
        }
        const dcBoard = secondary.find((m) => {
          const name = `${m.model || ''} ${m.brand || ''}`;
          if (!/بورد/.test(name)) return false;
          if (/AC|نضائد|رئيسي|Main/i.test(name)) return false;
          return /DC/i.test(name) || /حماية/.test(name);
        });
        if (dcBoard) defaults[dcBoard.id] = { qty: '' };
        return defaults;
      });
    });
  }, []);

  // وضع تعديل عرض محفوظ: {id, quote_number} — الحفظ يحدث نفس العرض
  const [editingQuote, setEditingQuote] = useState(null);
  // الحقول المعبأة تلقائياً (من المساعد أو فتح عرض) تومض حتى ينتبهلها البياع
  const [flashFields, setFlashFields] = useState(new Set());
  const flashTimerRef = useRef(null);
  // تنبيه التكرار الحي: عرض سابق لنفس الاسم/الرقم
  const [dupMatch, setDupMatch] = useState(null);
  const dupDismissedRef = useRef(new Set());

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
    }
    if (p.notes) setNotes(p.notes);
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
    setSaveMessage('');
  }

  async function handleUpdate() {
    setSaving(true);
    setSaveMessage('');
    try {
      const saved = await window.api.quotes.update(editingQuote.id, buildBaseInput());
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
    () => ({ roofAreaM2, ampDay, ampNight, nightSupplyHours, tier, overrides, secondarySel, markupPercent, markupMode, discountPercent, installment }),
    [roofAreaM2, ampDay, ampNight, nightSupplyHours, tier, overrides, secondarySel, markupPercent, markupMode, discountPercent, installment]
  );
  const debouncedInputs = useDebouncedValue(inputs, 300);

  const validInputs =
    Number(debouncedInputs.roofAreaM2) > 0 && Number(debouncedInputs.ampDay) >= 0 && Number(debouncedInputs.ampNight) >= 0 &&
    (Number(debouncedInputs.ampDay) > 0 || Number(debouncedInputs.ampNight) > 0) &&
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
      notes: notes || [],
    };
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage('');
    try {
      // كشف تكرار: هل يوجد عرض محفوظ لنفس العميل ورقمه؟
      if (clientName || clientPhone) {
        const dup = await window.api.quotes.findDuplicate({ clientName, clientPhone });
        if (dup) {
          const dupDate = new Date(dup.created_at).toLocaleDateString('en-GB');
          const proceed = confirm(
            `يوجد عرض محفوظ لهذا العميل مسبقاً:\n` +
            `العرض رقم ${dup.quote_number} بتاريخ ${dupDate} بمجموع ${Math.round(dup.total_price).toLocaleString('en-US')} دينار.\n\n` +
            `تريد تكمل وتحفظ عرضاً جديداً؟`
          );
          if (!proceed) {
            setSaveMessage('تم إلغاء الحفظ — العرض موجود مسبقاً');
            setSaving(false);
            return;
          }
        }
      }
      const saved = await window.api.quotes.save(buildBaseInput());
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
  // مرجع حي للمسودة حتى يقدر الايجنت يقرأ نتيجة الحساب الحالية
  const draftRef = useRef(null);
  draftRef.current = draft || null;

  // قوائم التبديل اليدوي: البطاريات والانفيرترات من options، الألواح من draft (تعتمد على البطارية المختارة)
  function tiersResultFor(cat) {
    if (!preview) return null;
    if (cat === 'panel') return draft?.panelTiers;
    if (cat === 'battery') return preview.options.batteryTiers;
    return draft?.inverterTiers; // الانفيرتر صار يُختار بعد الألواح (يعتمد على مصفوفتها)
  }

  return (
    <div>
      <h2 className="page-title">إنشاء عرض سعر</h2>

      {dupMatch && (
        <div className="dup-overlay" onClick={dismissDup}>
          <div className="dup-popup" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '2rem' }}>⚠️</div>
            <h3 style={{ margin: '4px 0', color: 'var(--navy)' }}>سويت لهذا الشخص عرض من قبل!</h3>
            <p style={{ margin: '4px 0' }}>
              <b>{dupMatch.client_name || '-'}</b>
              {dupMatch.client_phone ? ` — ${dupMatch.client_phone}` : ''}
              <br />
              عرض رقم <b>{dupMatch.quote_number}</b> بتاريخ {new Date(dupMatch.created_at).toLocaleDateString('en-GB')} بمجموع{' '}
              <b>{fmt(dupMatch.total_price)}</b> دينار
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10 }}>
              <button className="btn btn-primary" onClick={openDupForEdit}>
                ✏ وديني عليه للتعديل
              </button>
              <button className="btn btn-secondary" onClick={dismissDup}>
                تجاهل وكمل عرض جديد
              </button>
            </div>
          </div>
        </div>
      )}

      {editingQuote && (
        <div className="alert alert-warning" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b>✏ وضع التعديل — العرض رقم {editingQuote.quote_number}</b>
          <span className="muted">عدل أي شي وبعدها احفظ التعديلات، أو احفظه كعرض جديد برقم جديد</span>
          <button className="btn btn-secondary btn-sm" onClick={exitEditMode} style={{ marginInlineStart: 'auto' }}>
            إلغاء التعديل
          </button>
        </div>
      )}

      <AssistantBar onQuote={onAssistantQuote} onInventory={onAssistantInventory} getDraft={() => draftRef.current} />

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
              placeholder="حددها بكل عرض"
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
          <b style={{ color: 'var(--navy)' }}>💹 زيادة / خصم على العرض</b>
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
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
            العلنية تظهر سطر «نسبة زيادة» بجدول العرض، والموزعة ترفع أسعار البنود نفسها بدون أي سطر إضافي.
            الخصم يظهر دائماً سطر «خصم» وينطرح من المجموع النهائي.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontWeight: 700, color: 'var(--navy)', cursor: 'pointer' }}>
            <input type="checkbox" checked={installment} onChange={(e) => setInstallment(e.target.checked)} style={{ width: 18, height: 18 }} />
            🏦 إدراج التقسيط المصرفي بالعرض
            <span className="muted" style={{ fontWeight: 400, fontSize: '0.82rem' }}>
              (المجموع × نسبة فائدة المصرف ÷ عدد الأشهر — النسبة والأشهر من الإعدادات)
            </span>
          </label>
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
            {Object.keys(secondarySel).length === 0 && <span className="muted">ماكو مواد ثانوية محددة</span>}
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
          أدخل مساحة السطح والأمبير المطلوب (نهاراً و/أو ليلاً) — وإذا اكو حمل ليلي أدخل ساعات التجهيز الليلي (تتحكم بعدد البطاريات)
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
                {calculating ? '⏳ يحسب... ' : ''}المجموع الكلي: {fmt(draft.total)} دينار
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
                      هاي ملاحظات داخلية إلك (مصدر السعر وتاريخه) — ما تنطبع بالعرض ولا يشوفها الزبون:
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
              </p>
            )}

            <div className="grid-3">
              {['panel', 'battery', 'inverter'].map((cat) => {
                const tiersResult = tiersResultFor(cat);
                if (!tiersResult || tiersResult.insufficient) return null;
                const chosenId = overrides[cat] ?? tiersResult[tier]?.material.id;
                return (
                  <div className="field" key={cat}>
                    <label>تبديل {CATEGORY_LABELS[cat]} يدوياً</label>
                    <select value={chosenId || ''} onChange={(e) => setOverride(cat, e.target.value)}>
                      {tiersResult.all.map((c) => (
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
        </>
      )}
    </div>
  );
}
