import React, { useEffect, useState, useCallback } from 'react';
import MaterialFormModal from '../components/MaterialFormModal.jsx';
import LaborTable from '../components/LaborTable.jsx';

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

export default function Inventory() {
  const [tab, setTab] = useState('panel');
  const [materials, setMaterials] = useState([]);
  const [search, setSearch] = useState('');
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(() => {
    if (tab === 'labor') return;
    window.api.materials.list(tab).then(setMaterials);
  }, [tab]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = materials.filter((m) => {
    const q = search.trim();
    if (!q) return true;
    return (m.model || '').includes(q) || (m.brand || '').includes(q) || (m.full_description || '').includes(q);
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

  return (
    <div>
      <h2 className="page-title">المخزون</h2>
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
              placeholder="بحث بالاسم أو الوصف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-primary" onClick={openAddForm}>
              + إضافة مادة
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>الماركة / الموديل</th>
                <th>الوحدة</th>
                <th>{capacityLabel(tab)}</th>
                <th>السعر (دينار)</th>
                <th>الضمان (شهر)</th>
                <th>المخزون</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td>
                    <b>{m.brand}</b> {m.model}
                  </td>
                  <td>{m.unit}</td>
                  <td>{m.watt_or_capacity ?? '-'}</td>
                  <td>{Number(m.price).toLocaleString('en-US')}</td>
                  <td>{m.warranty_months ?? '-'}</td>
                  <td>{m.quantity_stock}</td>
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
    </div>
  );
}
