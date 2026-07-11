import React, { useState } from 'react';

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
        }
      : emptyForm(category)
  );

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
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
    });
  }

  const showCapacity = category === 'panel' || category === 'battery' || category === 'inverter';
  const capacityLabel = category === 'battery' ? 'السعة (kWh)' : 'القدرة (واط)';

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

          <div className="toolbar" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary">
              حفظ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
