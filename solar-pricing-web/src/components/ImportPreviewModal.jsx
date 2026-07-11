import React, { useState, useEffect } from 'react';

const CATEGORY_OPTIONS = [
  { value: 'panel', label: 'لوح' },
  { value: 'battery', label: 'بطارية' },
  { value: 'inverter', label: 'انفيرتر' },
  { value: 'secondary', label: 'ثانوية' },
];

function fmt(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

export default function ImportPreviewModal({ parsed, onClose, onDone }) {
  const [maxed, setMaxed] = useState(false);
  const [rows, setRows] = useState(parsed.rows.map((r) => ({ ...r, include: true })));
  const [laborRows, setLaborRows] = useState(parsed.labor.map((l) => ({ ...l, include: true })));
  const [existingLaborAmps, setExistingLaborAmps] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (parsed.labor.length === 0) return;
    window.api.laborTiers
      .list()
      .then((tiers) => setExistingLaborAmps(new Set((tiers || []).map((t) => Number(t.system_amps)))))
      .catch(() => setExistingLaborAmps(new Set()));
  }, [parsed.labor.length]);

  function setRow(idx, field, value) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function setLaborRow(idx, field, value) {
    setLaborRows((ls) => ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  const includedCount = rows.filter((r) => r.include).length;
  const includedLaborCount = laborRows.filter((l) => l.include).length;

  async function handleImport() {
    setImporting(true);
    try {
      const materials = rows
        .filter((r) => r.include)
        .map((r) => ({
          category: r.category,
          brand: r.brand,
          model: r.model,
          full_description: r.full_description,
          unit: r.unit,
          watt_or_capacity: r.watt_or_capacity === '' || r.watt_or_capacity == null ? null : Number(r.watt_or_capacity),
          price: Number(r.price) || 0,
          warranty_months: r.warranty_months,
          warranty_note: r.warranty_note,
          qty_per_panel: r.qty_per_panel,
        }));
      const summary = await window.api.materials.importRows({
        materials,
        labor: laborRows
          .filter((l) => l.include)
          .map((l) => ({ system_amps: Number(l.system_amps), price: Number(l.price) || 0, note: l.note })),
      });
      setResult(summary);
    } finally {
      setImporting(false);
    }
  }

  if (result) {
    return (
      <div className="modal-overlay" onClick={() => onDone()}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
          <h3>تم الاستيراد بنجاح ✔</h3>
          <p>
            مواد جديدة: <b>{result.added}</b> — مواد محدّثة: <b>{result.updated}</b>
            {(result.laborAdded > 0 || result.laborUpdated > 0) && (
              <>
                <br />
                أجور عمل جديدة: <b>{result.laborAdded}</b> — محدّثة: <b>{result.laborUpdated}</b>
              </>
            )}
          </p>
          <button className="btn btn-primary" onClick={() => onDone()}>
            إغلاق
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={maxed ? "modal modal-wide modal-max" : "modal modal-wide"} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-zoom-btn" onClick={() => setMaxed((m) => !m)} title="تكبير / تصغير النافذة">{maxed ? "🗕" : "⛶"}</button>
        <h3>معاينة الاستيراد — {parsed.fileName}</h3>
        <p className="muted">
          راجع الصفوف وعدّل أي شي غلط قبل الحفظ. المواد المعلّمة "تحديث" راح تحدّث سعر وكمية مادة موجودة
          (نفس الفئة والموديل والسعة)، والمعلّمة "جديد" تنضاف كمادة جديدة.
        </p>

        {parsed.warnings.length > 0 && (
          <div className="alert alert-warning">
            {parsed.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        <div className="import-table-wrap">
          <table className="data-table import-table">
            <thead>
              <tr>
                <th></th>
                <th>الحالة</th>
                <th>الفئة</th>
                <th>الموديل</th>
                <th>الوصف</th>
                <th>القدرة/السعة</th>
                <th>السعر</th>
                <th>المصدر</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className={row.issues.length > 0 ? 'row-issues' : ''}>
                  <td>
                    <input type="checkbox" checked={row.include} onChange={(e) => setRow(idx, 'include', e.target.checked)} />
                  </td>
                  <td>
                    {row.matchStatus === 'update' ? (
                      <span className="tag tag-update" title={`راح يحدّث: ${row.matchTarget}`}>تحديث</span>
                    ) : (
                      <span className="tag tag-new">جديد</span>
                    )}
                  </td>
                  <td>
                    <select value={row.category} onChange={(e) => setRow(idx, 'category', e.target.value)}>
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input type="text" value={row.model} onChange={(e) => setRow(idx, 'model', e.target.value)} />
                  </td>
                  <td>
                    <textarea rows={2} value={row.full_description} onChange={(e) => setRow(idx, 'full_description', e.target.value)} />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={row.watt_or_capacity ?? ''}
                      onChange={(e) => setRow(idx, 'watt_or_capacity', e.target.value)}
                    />
                  </td>
                  <td>
                    <input type="number" value={row.price} onChange={(e) => setRow(idx, 'price', e.target.value)} />
                  </td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {row.sourceRow}
                    {row.issues.map((issue, i) => (
                      <div className="issue-note" key={i}>
                        ⚠ {issue}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                    ما انقرأ أي صف مواد من الملف
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {laborRows.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <b>أجور العمل بالملف — اختار الي تريد تستوردها ({includedLaborCount} من {laborRows.length})</b>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const all = includedLaborCount < laborRows.length;
                  setLaborRows((ls) => ls.map((l) => ({ ...l, include: all })));
                }}
              >
                {includedLaborCount < laborRows.length ? 'تحديد الكل' : 'إلغاء تحديد الكل'}
              </button>
            </div>
            <div className="import-table-wrap">
              <table className="data-table import-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>الحالة</th>
                    <th>الحجم بالأمبير</th>
                    <th>السعر</th>
                    <th>ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {laborRows.map((l, idx) => (
                    <tr key={idx}>
                      <td>
                        <input type="checkbox" checked={l.include} onChange={(e) => setLaborRow(idx, 'include', e.target.checked)} />
                      </td>
                      <td>
                        {existingLaborAmps == null ? (
                          <span className="muted">...</span>
                        ) : existingLaborAmps.has(Number(l.system_amps)) ? (
                          <span className="tag tag-update" title="راح يحدّث سعر نفس الحجم الموجود">تحديث</span>
                        ) : (
                          <span className="tag tag-new">جديد</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{l.system_amps} أمبير</td>
                      <td>
                        <input type="number" value={l.price} onChange={(e) => setLaborRow(idx, 'price', e.target.value)} />
                      </td>
                      <td className="muted">{l.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="toolbar" style={{ marginTop: 14 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={importing}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleImport} disabled={importing || (includedCount === 0 && includedLaborCount === 0)}>
            {importing
              ? 'جاري الاستيراد...'
              : `استيراد ${fmt(includedCount)} مادة${includedLaborCount > 0 ? ` + ${fmt(includedLaborCount)} أجور` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
