import React, { useEffect, useState, useCallback } from 'react';
import MaterialFormModal from '../components/MaterialFormModal.jsx';
import LaborTable from '../components/LaborTable.jsx';
import ImportPreviewModal from '../components/ImportPreviewModal.jsx';

const TABS = [
  { key: 'panel', label: 'الألواح' },
  { key: 'battery', label: 'البطاريات' },
  { key: 'inverter', label: 'الانفيرترات' },
  { key: 'secondary', label: 'مواد ثانوية' },
  { key: 'labor', label: 'أجور العمل' },
];

function capacityLabel(category) {
  if (category === 'battery') return 'السعة (kWh)';
  if (category === 'panel' || category === 'inverter') return 'القدرة (واط)';
  return 'القدرة/السعة';
}

export default function Inventory({ initialSearch }) {
  const [tab, setTab] = useState('panel');
  const [materials, setMaterials] = useState([]);
  const [search, setSearch] = useState('');

  // توجيه من المساعد: يعبي البحث وينتقل للتبويب المناسب حسب كلمة المادة
  useEffect(() => {
    if (!initialSearch || !initialSearch.term) return;
    const term = initialSearch.term;
    if (/بطاري|نضائد|ليثيوم/.test(term)) setTab('battery');
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
    if (editingMaterial) {
      await window.api.materials.update(editingMaterial.id, data);
    } else {
      await window.api.materials.create(data);
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
            تحميل قالب Excel
          </button>
          <button className="btn btn-primary" onClick={handleImportExcel}>
            ⬆ استيراد من Excel
          </button>
        </div>
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
        <LaborTable />
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
            <button className="btn btn-primary" onClick={openAddForm}>
              + إضافة مادة
            </button>
          </div>

          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>الماركة / الموديل</th>
                <th>الوحدة</th>
                <th>{capacityLabel(tab)}</th>
                <th>السعر (دينار)</th>
                <th>الضمان (شهر)</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td className="muted">{m.id}</td>
                  <td>
                    <b>{m.brand}</b> {m.model}
                  </td>
                  <td>{m.unit}</td>
                  <td>{m.watt_or_capacity ?? '-'}</td>
                  <td>{Number(m.price).toLocaleString('en-US')}</td>
                  <td>{m.warranty_months ?? '-'}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEditForm(m)}>
                      تعديل
                    </button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(m.id)}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                    لا توجد مواد بهذه الفئة بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
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
