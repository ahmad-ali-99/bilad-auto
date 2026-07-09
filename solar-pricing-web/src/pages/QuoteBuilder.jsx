import React, { useEffect, useState } from 'react';
import SecondaryPickerModal from '../components/SecondaryPickerModal.jsx';
import AssistantBar from '../components/AssistantBar.jsx';

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
  const [overrides, setOverrides] = useState({});
  // المواد الثانوية المختارة للعرض: { [materialId]: { qty } } — تبدأ بالأساسيات (هيكل + صبات)
  const [secondarySel, setSecondarySel] = useState({});
  const [secondaryMaterials, setSecondaryMaterials] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showPriceNotes, setShowPriceNotes] = useState(false);
  const [notes, setNotes] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    window.api.company.get().then((c) => setNotes(c.notes_default || []));
    // ساعات التجهيز الليلي بدون قيمة افتراضية — البياع يحددها بكل عرض
    // الافتراضي: الأساسيات اللي تنحسب حسب عدد الألواح (هيكل + صبات) تبقى بالعرض تلقائياً
    window.api.materials.list().then((all) => {
      const secondary = (all || []).filter((m) => m.category === 'secondary');
      setSecondaryMaterials(secondary);
      setSecondarySel((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const defaults = {};
        for (const m of secondary) {
          if (m.qty_per_panel && m.qty_per_panel > 0) defaults[m.id] = { qty: '' };
        }
        return defaults;
      });
    });
  }, []);

  // تعبئة من المساعد: أي حقل جاء بالأمر ينكتب، والباقي يبقى مثل ما هو
  useEffect(() => {
    if (!prefill) return;
    if (prefill.clientName != null) setClientName(prefill.clientName);
    if (prefill.clientPhone != null) setClientPhone(prefill.clientPhone);
    if (prefill.roofAreaM2 != null) setRoofAreaM2(String(prefill.roofAreaM2));
    if (prefill.ampDay != null) setAmpDay(String(prefill.ampDay));
    if (prefill.ampNight != null) setAmpNight(String(prefill.ampNight));
    if (prefill.nightSupplyHours != null) setNightSupplyHours(String(prefill.nightSupplyHours));
    if (prefill.tier != null) setTier(prefill.tier);
  }, [prefill]);

  const debouncedInputs = useDebouncedValue(
    { roofAreaM2, ampDay, ampNight, nightSupplyHours, tier, overrides, secondarySel },
    300
  );

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
    window.api.quotes
      .preview({
        roofAreaM2: Number(debouncedInputs.roofAreaM2),
        ampDay: Number(debouncedInputs.ampDay),
        ampNight: Number(debouncedInputs.ampNight),
        nightSupplyHours: debouncedInputs.nightSupplyHours === '' ? null : Number(debouncedInputs.nightSupplyHours),
        tier: debouncedInputs.tier,
        overrides: debouncedInputs.overrides,
        secondarySelections: debouncedInputs.secondarySel,
      })
      .then(setPreview);
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

      <AssistantBar onQuote={onAssistantQuote} onInventory={onAssistantInventory} />

      <div className="card">
        <div className="grid-3">
          <div className="field">
            <label>اسم العميل</label>
            <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="field">
            <label>رقم الموبايل</label>
            <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
          </div>
          <div className="field">
            <label>الموقع</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="big-inputs big-inputs-4">
          <div className="field">
            <label>مساحة السطح (م²)</label>
            <input type="number" value={roofAreaM2} onChange={(e) => setRoofAreaM2(e.target.value)} />
          </div>
          <div className="field">
            <label>أمبير مطلوب نهاراً</label>
            <input type="number" value={ampDay} onChange={(e) => setAmpDay(e.target.value)} />
          </div>
          <div className="field">
            <label>أمبير مطلوب ليلاً</label>
            <input type="number" value={ampNight} onChange={(e) => setAmpNight(e.target.value)} />
          </div>
          <div className="field">
            <label>ساعات التجهيز الليلي</label>
            <input
              type="number"
              value={nightSupplyHours}
              onChange={(e) => setNightSupplyHours(e.target.value)}
              placeholder="حددها بكل عرض"
            />
          </div>
        </div>

        <div className="tier-toggle" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {TIERS.map((t) => (
            <button key={t.key} className={tier === t.key ? 'active' : ''} onClick={() => setTier(t.key)}>
              {t.label}
            </button>
          ))}
          {secondaryMaterials.length > 0 && (
            <button className="btn btn-secondary" onClick={() => setPickerOpen(true)} style={{ marginInlineStart: 'auto' }}>
              المواد الثانوية ({Object.keys(secondarySel).length} مضافة)
            </button>
          )}
        </div>
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
              <span className="total-badge">المجموع الكلي: {fmt(draft.total)} دينار</span>
            </div>

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

          <div className="toolbar">
            <div>{saveMessage && <span className="muted">{saveMessage}</span>}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" disabled={saving || hasBlockingErrors} onClick={handleExportPdf}>
                تصدير PDF
              </button>
              <button className="btn btn-primary" disabled={saving || hasBlockingErrors} onClick={handleSave}>
                حفظ العرض
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
