import React, { useEffect, useMemo, useState } from 'react';

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

export default function QuoteBuilder() {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [location, setLocation] = useState('');
  const [roofAreaM2, setRoofAreaM2] = useState('');
  const [ampDay, setAmpDay] = useState('');
  const [ampNight, setAmpNight] = useState('');
  const [tier, setTier] = useState('economy');
  const [overrides, setOverrides] = useState({});
  const [cableMeters, setCableMeters] = useState({});
  const [notes, setNotes] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    window.api.company.get().then((c) => setNotes(c.notes_default || []));
  }, []);

  const debouncedInputs = useDebouncedValue(
    { roofAreaM2, ampDay, ampNight, tier, overrides, cableMeters },
    300
  );

  const validInputs =
    Number(debouncedInputs.roofAreaM2) > 0 && Number(debouncedInputs.ampDay) >= 0 && Number(debouncedInputs.ampNight) >= 0 &&
    (Number(debouncedInputs.ampDay) > 0 || Number(debouncedInputs.ampNight) > 0);

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
        tier: debouncedInputs.tier,
        overrides: debouncedInputs.overrides,
        cableMeters: debouncedInputs.cableMeters,
      })
      .then(setPreview);
  }, [debouncedInputs, validInputs]);

  const cableMaterials = useMemo(
    () => (preview ? preview.options.secondary.filter((m) => m.unit === 'متر') : []),
    [preview]
  );

  function setOverride(category, materialId) {
    setOverrides((o) => ({ ...o, [category]: materialId ? Number(materialId) : undefined }));
  }

  function setCableMeter(materialId, value) {
    setCableMeters((c) => ({ ...c, [materialId]: value }));
  }

  function buildBaseInput() {
    return {
      clientName,
      clientPhone,
      location,
      roofAreaM2: Number(roofAreaM2),
      ampDay: Number(ampDay),
      ampNight: Number(ampNight),
      tier,
      overrides,
      cableMeters,
      notes: notes || [],
    };
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage('');
    try {
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

  return (
    <div>
      <h2 className="page-title">إنشاء عرض سعر</h2>

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
        <div className="big-inputs">
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
        </div>

        {cableMaterials.length > 0 && (
          <div className="grid-3">
            {cableMaterials.map((m) => (
              <div className="field" key={m.id}>
                <label>أمتار: {m.model}</label>
                <input
                  type="number"
                  value={cableMeters[m.id] || ''}
                  onChange={(e) => setCableMeter(m.id, e.target.value)}
                  placeholder="حسب الذرعة الموقعية"
                />
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
      </div>

      {!validInputs && <div className="alert alert-info">أدخل مساحة السطح والأمبير المطلوب (نهاراً و/أو ليلاً) لعرض الحساب</div>}

      {preview && draft && (
        <>
          {draft.roofLimitedWarning && (
            <div className="alert alert-warning">تنبيه: مساحة السطح لا تكفي لتغطية الحمل المطلوب كاملاً — تم اعتماد أقصى عدد ألواح يسمح به السطح المتوفر</div>
          )}
          {Object.entries(draft.errors).map(([key, msg]) => (
            <div className="alert alert-danger" key={key}>
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

            <div className="grid-3">
              {['panel', 'battery', 'inverter'].map((cat) => {
                const tiersResult = cat === 'panel' ? preview.options.panelTiers : cat === 'battery' ? preview.options.batteryTiers : preview.options.inverterTiers;
                if (tiersResult.insufficient) return null;
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
