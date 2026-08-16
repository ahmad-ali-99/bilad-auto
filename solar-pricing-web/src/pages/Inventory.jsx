import React, { useEffect, useState, useCallback } from 'react';
import MaterialFormModal from '../components/MaterialFormModal.jsx';
import LaborTable from '../components/LaborTable.jsx';
import ImportPreviewModal from '../components/ImportPreviewModal.jsx';
import { getCurrentUsername } from '../lib/agent.js';
import { canEditInventory } from '../lib/permissions.js';
import { useMediaQuery, PHONE } from '../lib/useMediaQuery.js';

const TABS = [
  { key: 'panel', label: 'الألواح' },
  { key: 'battery', label: 'البطاريات' },
  { key: 'inverter', label: 'الانفيرترات' },
  { key: 'integrated', label: 'سستم متكامل' },
  { key: 'secondary', label: 'مواد ثانوية' },
  { key: 'labor', label: 'أجور العمل' },
];

function capacityLabel(category) {
  if (category === 'battery' || category === 'integrated') return 'السعة (kWh)';
  if (category === 'panel' || category === 'inverter') return 'القدرة (واط)';
  return 'القدرة/السعة';
}

// بطاقة مادة — شكل الموبايل. الجدول بثمانية أعمدة عرضه الأدنى ٦٤٠ بكسل والتلفون
// ٤٣٠، فالسعر وأزرار التعديل كانوا يطلعون برّا الشاشة ويحتاجون تمريراً أفقياً
// داخل صندوق. بالبطاقة كل شي بمتناول الإصبع بلا أي تمرير أفقي.
function MaterialCard({ m, capacityLabel, canEdit, onToggle, onEdit, onDelete }) {
  const hidden = m.active === false;
  return (
    <div className={`inv-card${hidden ? ' inv-card-off' : ''}`}>
      <div className="inv-card-head">
        <label
          className="inv-card-check"
          title={hidden ? 'مخفية من العروض — أشّر عليها لتستعملها' : 'مفعّلة — شيل التأشير لتخفيها من العروض'}
        >
          <input type="checkbox" checked={!hidden} disabled={!canEdit} onChange={() => onToggle(m)} />
        </label>
        <div className="inv-card-title">
          <b>{m.brand}</b> {m.model}
          {hidden && <span className="inv-card-badge">مخفية</span>}
        </div>
      </div>
      {/* بلا نقطتين بعد القوس اللاتيني — بالعربي تنطّ النقطتان لمحل غلط */}
      <div className="inv-card-meta">
        <span>#{m.id}</span>
        <span>{m.unit}</span>
        <span>{capacityLabel} <b>{m.watt_or_capacity ?? '-'}</b></span>
        <span>ضمان <b>{m.warranty_months ?? '-'}</b> شهر</span>
      </div>
      <div className="inv-card-actions">
        <div className="inv-card-price">
          {Number(m.price).toLocaleString('en-US')} <small>دينار</small>
        </div>
        {canEdit && (
          <span className="inv-card-btns">
            <button className="btn btn-secondary btn-sm" onClick={() => onEdit(m)}>تعديل</button>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(m.id)}>حذف</button>
          </span>
        )}
      </div>
    </div>
  );
}

export default function Inventory({ initialSearch }) {
  const isPhone = useMediaQuery(PHONE);
  const [tab, setTab] = useState('panel');
  // حسابات مقيّدة: تشوف المخزون والأسعار كاملة بس بلا أي تعديل
  const [canEdit, setCanEdit] = useState(true);
  useEffect(() => {
    getCurrentUsername().then((n) => setCanEdit(canEditInventory(n))).catch(() => {});
  }, []);
  const [materials, setMaterials] = useState([]);
  const [search, setSearch] = useState('');

  // توجيه من المساعد: يعبي البحث وينتقل للتبويب المناسب حسب كلمة المادة
  useEffect(() => {
    if (!initialSearch || !initialSearch.term) return;
    const term = initialSearch.term;
    if (/بطاري|نضائد|ليثيوم/.test(term)) setTab('battery');
    else if (/سستم متكامل|متكامل|كابينة|كابينه/.test(term)) setTab('integrated');
    else if (/انفيرتر|انفرتر|عاكس/.test(term)) setTab('inverter');
    else if (/لوح|الواح|ألواح|طاقة/.test(term)) setTab('panel');
    else if (/اجور|أجور|عمل/.test(term)) setTab('labor');
    else setTab('secondary');
    setSearch(term.replace(/^(بطارية|بطاريات|انفيرتر|انفرتر|لوح|الواح|ألواح)\s*/, '').trim() || term);
  }, [initialSearch]);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [importParsed, setImportParsed] = useState(null);
  const [importMessage, setImportMessage] = useState('');

  const reload = useCallback(() => {
    if (tab === 'labor') return;
    window.api.materials.list(tab).then(setMaterials);
  }, [tab]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = materials.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(m.id) === q ||
      String(m.id).includes(q) ||
      (m.model || '').toLowerCase().includes(q) ||
      (m.brand || '').toLowerCase().includes(q) ||
      (m.full_description || '').toLowerCase().includes(q) ||
      String(m.watt_or_capacity ?? '').includes(q)
    );
  });

  // الجيك بوكس: المادة المؤشرة تنعرض وتنستعمل بالعروض، وغير المؤشرة تبقى بالمخزون
  // بس تختفي من كل مسارات الاستخدام. التغيير يظهر فوراً ثم ينحفظ (وينسجل بالحركات).
  async function toggleActive(m) {
    const next = m.active === false;
    setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, active: next } : x)));
    try {
      await window.api.materials.setActive(m.id, next);
    } catch (e) {
      setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, active: !next } : x)));
      alert('تعذر الحفظ: ' + e.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('هل أنت متأكد من حذف هذه المادة؟')) return;
    await window.api.materials.remove(id);
    reload();
  }

  function openAddForm() {
    setEditingMaterial(null);
    setShowForm(true);
  }

  function openEditForm(material) {
    setEditingMaterial(material);
    setShowForm(true);
  }

  async function handleSaveForm(data) {
    // صورة المنتج مو عمود بجدول المواد — تنفصل وتنحفظ بـapp_config.
    // بدون الفصل يفشل الحفظ كله بـ«column product_image does not exist».
    const { product_image: image, ...fields } = data;
    const saved = editingMaterial
      ? await window.api.materials.update(editingMaterial.id, fields)
      : await window.api.materials.create(fields);
    const id = editingMaterial ? editingMaterial.id : saved?.id;
    if (image !== undefined && id != null) {
      await window.api.materials.setImage(id, image);
    }
    setShowForm(false);
    reload();
  }

  async function handleImportExcel() {
    setImportMessage('');
    const parsed = await window.api.materials.parseExcel();
    if (parsed.canceled) return;
    setImportParsed(parsed);
  }

  async function handleDownloadTemplate() {
    const result = await window.api.materials.downloadTemplate();
    if (!result.canceled) setImportMessage('تم حفظ القالب — املأه بموادك ثم ارفعه بزر الاستيراد ✔');
  }

  return (
    <div>
      <div className="toolbar">
        <h2 className="page-title" style={{ margin: 0 }}>المخزون</h2>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
              تحميل قالب Excel
            </button>
            <button className="btn btn-primary" onClick={handleImportExcel}>
              ⬆ استيراد من Excel
            </button>
          </div>
        )}
      </div>
      {importMessage && <div className="alert alert-info">{importMessage}</div>}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'labor' ? (
        <LaborTable canEdit={canEdit} />
      ) : (
        <>
          <div className="toolbar">
            <input
              className="search-input"
              type="text"
              placeholder="بحث..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {canEdit && (
              <button className="btn btn-primary" onClick={openAddForm}>
                + إضافة مادة
              </button>
            )}
          </div>

          {isPhone ? (
            // الموبايل: بطاقات بالصفحة نفسها — بلا صندوق تمرير داخلي، فالصفحة
            // تتمرر عادي وتوصل لكل مادة، وبلا تمرير أفقي أصلاً
            <div className="inv-cards">
              {filtered.map((m) => (
                <MaterialCard
                  key={m.id}
                  m={m}
                  capacityLabel={capacityLabel(tab)}
                  canEdit={canEdit}
                  onToggle={toggleActive}
                  onEdit={openEditForm}
                  onDelete={handleDelete}
                />
              ))}
              {filtered.length === 0 && (
                <div className="card muted" style={{ textAlign: 'center', padding: 20 }}>
                  لا توجد مواد بهذه الفئة بعد
                </div>
              )}
            </div>
          ) : (
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th title="المؤشّرة فقط تنعرض وتنستعمل بالعروض">بالعروض</th>
                <th>الرقم</th>
                <th>الماركة / الموديل</th>
                <th>الوحدة</th>
                <th>{capacityLabel(tab)}</th>
                <th>السعر (دينار)</th>
                <th>الضمان (شهر)</th>
                {canEdit && <th>إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} style={m.active === false ? { opacity: 0.55, background: '#fbfbfc' } : undefined}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={m.active !== false}
                      disabled={!canEdit}
                      onChange={() => toggleActive(m)}
                      title={m.active === false ? 'مخفية من العروض — أشّر عليها لتستعملها' : 'مفعّلة — شيل التأشير لتخفيها من العروض'}
                      style={{ width: 18, height: 18, cursor: canEdit ? 'pointer' : 'default' }}
                    />
                  </td>
                  <td className="muted">{m.id}</td>
                  <td>
                    <b>{m.brand}</b> {m.model}
                    {m.active === false && <span className="muted" style={{ fontSize: '0.78em' }}> — مخفية</span>}
                  </td>
                  <td>{m.unit}</td>
                  <td>{m.watt_or_capacity ?? '-'}</td>
                  <td>{Number(m.price).toLocaleString('en-US')}</td>
                  <td>{m.warranty_months ?? '-'}</td>
                  {canEdit && (
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditForm(m)}>
                        تعديل
                      </button>{' '}
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(m.id)}>
                        حذف
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                    لا توجد مواد بهذه الفئة بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          )}
        </>
      )}

      {showForm && (
        <MaterialFormModal
          category={tab}
          initial={editingMaterial}
          onClose={() => setShowForm(false)}
          onSave={handleSaveForm}
        />
      )}

      {importParsed && (
        <ImportPreviewModal
          parsed={importParsed}
          onClose={() => setImportParsed(null)}
          onDone={() => {
            setImportParsed(null);
            setImportMessage('تم الاستيراد بنجاح ✔');
            reload();
          }}
        />
      )}
    </div>
  );
}
