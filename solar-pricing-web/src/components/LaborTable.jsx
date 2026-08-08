import React, { useEffect, useState } from 'react';

export default function LaborTable({ canEdit = true }) {
  const [rows, setRows] = useState([]);
  const [newRow, setNewRow] = useState({ system_amps: '', price: '', note: '' });

  function reload() {
    window.api.laborTiers.list().then(setRows);
  }

  useEffect(reload, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newRow.system_amps || !newRow.price) return;
    await window.api.laborTiers.create({
      system_amps: Number(newRow.system_amps),
      price: Number(newRow.price),
      note: newRow.note || null,
    });
    setNewRow({ system_amps: '', price: '', note: '' });
    reload();
  }

  async function handleUpdate(row, field, value) {
    const updated = { ...row, [field]: value };
    setRows((rs) => rs.map((r) => (r.id === row.id ? updated : r)));
    await window.api.laborTiers.update(row.id, {
      system_amps: field === 'system_amps' ? Number(value) : row.system_amps,
      price: field === 'price' ? Number(value) : row.price,
      note: field === 'note' ? value : row.note,
    });
  }

  async function handleDelete(id) {
    if (!confirm('حذف هذا الحجم من أجور العمل؟')) return;
    await window.api.laborTiers.remove(id);
    reload();
  }

  return (
    <div>
      <p className="muted">
        حجم المنظومة = الأكبر بين أمبير النهار والليل. يختار البرنامج تلقائياً أقرب حجم معرّف هنا أكبر أو يساوي الحجم المطلوب.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>الحجم (أمبير)</th>
            <th>السعر (دينار)</th>
            <th>ملاحظة</th>
            {canEdit && <th>إجراءات</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <input type="number" defaultValue={r.system_amps} disabled={!canEdit} onBlur={(e) => handleUpdate(r, 'system_amps', e.target.value)} />
              </td>
              <td>
                <input type="number" defaultValue={r.price} disabled={!canEdit} onBlur={(e) => handleUpdate(r, 'price', e.target.value)} />
              </td>
              <td>
                <input type="text" defaultValue={r.note || ''} disabled={!canEdit} onBlur={(e) => handleUpdate(r, 'note', e.target.value)} />
              </td>
              {canEdit && (
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>
                    حذف
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {canEdit && (
      <form className="card" onSubmit={handleAdd} style={{ marginTop: 14 }}>
        <div className="grid-3">
          <div className="field">
            <label>الحجم (أمبير)</label>
            <input type="number" value={newRow.system_amps} onChange={(e) => setNewRow({ ...newRow, system_amps: e.target.value })} />
          </div>
          <div className="field">
            <label>السعر (دينار)</label>
            <input type="number" value={newRow.price} onChange={(e) => setNewRow({ ...newRow, price: e.target.value })} />
          </div>
          <div className="field">
            <label>ملاحظة (اختياري)</label>
            <input type="text" value={newRow.note} onChange={(e) => setNewRow({ ...newRow, note: e.target.value })} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary">
          + إضافة حجم جديد
        </button>
      </form>
      )}
    </div>
  );
}
