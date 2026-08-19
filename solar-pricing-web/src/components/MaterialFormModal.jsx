import React, { useState, useEffect, useRef } from 'react';
import { parseIp, IP_RANGE_ERROR } from '../lib/materialSpecs.js';
import ModalPortal from './ModalPortal.jsx';
import { humanizeSaveError } from '../lib/saveErrors.js';
import { compressImageFile } from '../lib/materialImages.js';

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
    ip_rating: '',
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
          ip_rating: initial.ip_rating ?? '',
        }
      : emptyForm(category)
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // صورة المنتج — تُستعمل بمنشور الباقات. `undefined` = ما انلمست، `null` = المستخدم شالها
  const [image, setImage] = useState(undefined);
  const [imageError, setImageError] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  // الصورة المحمّلة من القاعدة — تنقارن بيها حتى ما ينكتب أمر صورة بكل حفظة.
  // بدونها كل تعديل سعر لمادة بلا صورة يسجّل «حذف صورة مادة» بسجل الحركات.
  const loadedImage = useRef(undefined);

  useEffect(() => {
    if (!initial?.id) return;
    window.api.materials.getImage(initial.id).then((v) => {
      loadedImage.current = v || null;
      setImage(v || null);
    }).catch(() => {});
  }, [initial?.id]);

  async function pickImage(file) {
    setImageError('');
    if (!file) return;
    setImageBusy(true);
    try {
      const { dataUrl, bytes } = await compressImageFile(file);
      setImage(dataUrl);
      setImageError(`تم — حجم الصورة بعد الضغط ${Math.round(bytes / 1024)} كيلوبايت`);
    } catch (err) {
      setImageError(err.message);
    } finally {
      setImageBusy(false);
    }
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (saveError) setSaveError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    // درجة الحماية: نفحصها قبل الحفظ حتى الرسالة تطلع بالنافذة مو بعد رحلة للقاعدة
    if (String(form.ip_rating).trim() !== '' && parseIp(form.ip_rating) == null) {
      setSaveError(IP_RANGE_ERROR);
      return;
    }
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
        ip_rating: form.ip_rating === '' ? null : form.ip_rating,
        ...(isIntegrated ? { integrated_kw: form.integrated_kw === '' ? null : Number(form.integrated_kw) } : {}),
        // الصورة تنمرّر بس إذا تغيّرت فعلاً — بلا هيك كل حفظة تكتب أو تمسح صورة بلا داعي
        ...(image === loadedImage.current ? {} : { product_image: image }),
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
    <ModalPortal>
    <div className="modal-overlay">
      <div className={maxed ? "modal modal-max" : "modal"}>
        <button type="button" className="modal-zoom-btn" onClick={() => setMaxed((m) => !m)} title="تكبير / تصغير النافذة">{maxed ? "🗕" : "⛶"}</button>
        <h3>{initial ? 'تعديل مادة' : 'إضافة مادة جديدة'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
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
            {/* درجة الحماية: حقل مستقل مثل القدرة — عليه ينبني مستوى الانفيرتر
                (اقتصادي/متوسط/ممتاز)، فمادة بلاه تطيح بأدنى درجة */}
            <div className="field">
              <label>درجة الحماية IP</label>
              {/* بلا min/max بالـHTML: المتصفح يوقف الإرسال برسالته الإنكليزية
                  ويخفي رسالتنا العربية — الفحص عدنا بـparseIp قبل الحفظ */}
              <input
                type="number"
                value={form.ip_rating}
                onChange={(e) => set('ip_rating', e.target.value)}
                placeholder="مثال: 21 أو 65"
              />
              <small className="muted">
                {category === 'inverter'
                  ? 'عليها ينبني مستوى الانفيرتر — بلاها تنحسب بأدنى درجة'
                  : 'اكتبها إذا مذكورة بالداتا شيت'}
              </small>
            </div>
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

          {/* صورة المنتج — تطلع بمنشور الباقات. اختيارية تماماً. */}
          <div className="field" style={{ marginTop: 12 }}>
            <label>صورة المنتج (اختيارية — تظهر بمنشور الباقات)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {image ? (
                <img
                  src={image} alt=""
                  style={{ width: 84, height: 84, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}
                />
              ) : (
                <div style={{ width: 84, height: 84, border: '2px dashed #ccd7e4', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9db0c4', fontSize: '1.6rem' }}>🖼</div>
              )}
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                {imageBusy ? '⏳ جاري الضغط…' : (image ? 'تبديل الصورة' : 'اختيار صورة')}
                <input
                  type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={(e) => { pickImage(e.target.files && e.target.files[0]); e.target.value = ''; }}
                />
              </label>
              {image && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => { setImage(null); setImageError(''); }}>
                  حذف الصورة
                </button>
              )}
            </div>
            {imageError && <div className="muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>{imageError}</div>}
          </div>

          {saveError && (
            <div className="alert alert-danger" style={{ marginTop: 14, whiteSpace: 'pre-line' }}>
              ⚠ ما انحفظت المادة — {saveError}
            </div>
          )}

          </div>
          <div className="toolbar modal-footer">
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
    </ModalPortal>
  );
}
