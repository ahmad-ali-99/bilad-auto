import React, { useState } from 'react';

// أخطاء قاعدة البيانات تجي بنص إنكليزي خام ما يفهمه البياع — نترجم المعروف منها
// لكلام واضح يكول شنو المطلوب بالضبط، والباقي يمر كما هو حتى ما نخفي شي.
function humanizeSaveError(err, category) {
  const raw = String(err?.message || err || 'خطأ غير معروف');
  const low = raw.toLowerCase();
  if (low.includes('check constraint') || low.includes('violates check')) {
    if (category === 'integrated') {
      return 'قاعدة البيانات ما تقبل فئة «سستم متكامل» بعد — لازم يتشغّل كويري التفعيل مرة وحدة (ملف integrated-v2.sql) وبعدها تنحفظ عادي.';
    }
    return `القاعدة رفضت قيمة بأحد الحقول: ${raw}`;
  }
  if (low.includes('row-level security') || low.includes('permission') || low.includes('محصور') || low.includes('صلاحية')) {
    return `ما عندك صلاحية للحفظ: ${raw}`;
  }
  if (low.includes('failed to fetch') || low.includes('networkerror')) {
    return 'ما وصلنا للقاعدة — تأكد من الإنترنت وحاول مرة ثانية.';
  }
  return raw;
}

function emptyForm(category) {
  return {
    category,
    brand: '',
    model: '',
    full_description: '',
    unit: category === 'secondary' ? 'عدد' : 'عدد',
    watt_or_capacity: '',
    price: '',
    warranty_months: '',
    warranty_note: '',
    qty_per_panel: category === 'secondary' ? 1 : '',
    integrated_kw: '',
  };
}

export default function MaterialFormModal({ category, initial, onClose, onSave }) {
  const [maxed, setMaxed] = useState(false);
  const [form, setForm] = useState(
    initial
      ? {
          ...initial,
          watt_or_capacity: initial.watt_or_capacity ?? '',
          warranty_months: initial.warranty_months ?? '',
          warranty_note: initial.warranty_note ?? '',
          qty_per_panel: initial.qty_per_panel ?? '',
          integrated_kw: initial.integrated_kw ?? '',
        }
      : emptyForm(category)
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (saveError) setSaveError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave({
      category,
      brand: form.brand || null,
      model: form.model || null,
      full_description: form.full_description,
      unit: form.unit,
      watt_or_capacity: form.watt_or_capacity === '' ? null : Number(form.watt_or_capacity),
      price: Number(form.price) || 0,
      warranty_months: form.warranty_months === '' ? null : Number(form.warranty_months),
      warranty_note: form.warranty_note || null,
      qty_per_panel: form.qty_per_panel === '' ? null : Number(form.qty_per_panel),
      // قدرة انفيرتر الكابينة (kW) — تنخزن بـapp_config لأن الجدول ما بيه عمود إلها
        ...(isIntegrated ? { integrated_kw: form.integrated_kw === '' ? null : Number(form.integrated_kw) } : {}),
      });
    } catch (err) {
      // البيانات تبقى بالنموذج كما هي — الخطأ يظهر والبياع يعيد المحاولة بلا ما يكتب من جديد
      setSaveError(humanizeSaveError(err, category));
    } finally {
      setSaving(false);
    }
  }

  const isIntegrated = category === 'integrated';
  const showCapacity = category === 'panel' || category === 'battery' || category === 'inverter' || isIntegrated;
  const capacityLabel = category === 'battery' || isIntegrated ? 'السعة (kWh)' : 'القدرة (واط)';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={maxed ? "modal modal-max" : "modal"} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-zoom-btn" onClick={() => setMaxed((m) => !m)} title="تكبير / تصغير النافذة">{maxed ? "🗕" : "⛶"}</button>
        <h3>{initial ? 'تعديل مادة' : 'إضافة مادة جديدة'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="field">
              <label>الماركة</label>
              <input type="text" value={form.brand || ''} onChange={(e) => set('brand', e.target.value)} />
            </div>
            <div className="field">
              <label>الموديل</label>
              <input type="text" value={form.model || ''} onChange={(e) => set('model', e.target.value)} required />
            </div>
          </div>

          <div className="field">
            <label>الوصف التفصيلي الكامل (يشمل نص الضمان صراحةً - كما سيُطبع بالفاتورة)</label>
            <textarea value={form.full_description || ''} onChange={(e) => set('full_description', e.target.value)} required />
          </div>

          <div className="grid-3">
            <div className="field">
              <label>الوحدة</label>
              {category === 'secondary' ? (
                <select value={form.unit} onChange={(e) => set('unit', e.target.value)}>
                  <option value="عدد">عدد</option>
                  <option value="متر">متر</option>
                  <option value="قطعي">قطعي</option>
                </select>
              ) : (
                <input type="text" value="عدد" disabled />
              )}
            </div>
            {showCapacity && (
              <div className="field">
                <label>{capacityLabel}</label>
                <input type="number" step="any" value={form.watt_or_capacity} onChange={(e) => set('watt_or_capacity', e.target.value)} required />
              </div>
            )}
            {isIntegrated && (
              <div className="field">
                <label>قدرة الانفيرتر بالكابينة (kW)</label>
                <input type="number" step="any" value={form.integrated_kw} onChange={(e) => set('integrated_kw', e.target.value)} placeholder="مثال: 125" />
              </div>
            )}
            <div className="field">
              <label>السعر (دينار عراقي)</label>
              <input type="number" step="any" value={form.price} onChange={(e) => set('price', e.target.value)} required />
            </div>
          </div>

          <div className="grid-3">
            <div className="field">
              <label>الضمان (شهر)</label>
              <input type="number" value={form.warranty_months} onChange={(e) => set('warranty_months', e.target.value)} />
            </div>
            {category === 'secondary' && form.unit === 'عدد' && (
              <div className="field">
                <label>الكمية لكل لوح (0 = وحدة ثابتة بغض النظر عن عدد الألواح)</label>
                <input type="number" step="any" value={form.qty_per_panel} onChange={(e) => set('qty_per_panel', e.target.value)} />
              </div>
            )}
          </div>

          {(category === 'panel' || category === 'battery' || category === 'inverter') && (
            <div className="field">
              <label>ملاحظة ضمان مختصرة تُضاف كملاحظة منفصلة أسفل الفاتورة (اختياري)</label>
              <input type="text" value={form.warranty_note || ''} onChange={(e) => set('warranty_note', e.target.value)} placeholder="مثال: ضمان الألواح 10 سنوات لا يشمل الكسر" />
            </div>
          )}

          {saveError && (
            <div className="alert alert-danger" style={{ marginTop: 14, whiteSpace: 'pre-line' }}>
              ⚠ ما انحفظت المادة — {saveError}
            </div>
          )}

          <div className="toolbar" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '⏳ جاري الحفظ…' : 'حفظ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
