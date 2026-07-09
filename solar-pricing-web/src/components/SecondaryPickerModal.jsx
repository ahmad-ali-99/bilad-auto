import React from 'react';

function fmt(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

// الكمية الفعلية اللي راح تنضاف: يدوية إن وجدت، وإلا تلقائية (حسب الألواح أو وحدة واحدة)
function effectiveQty(material, sel, panelCount) {
  const manual = sel && sel.qty !== '' && sel.qty != null ? Number(sel.qty) : null;
  if (manual != null && manual > 0) return manual;
  if (material.unit === 'متر') return 0;
  if (material.qty_per_panel && material.qty_per_panel > 0) return Math.ceil(panelCount * material.qty_per_panel);
  return 1;
}

// نافذة وحدة لاختيار المواد الثانوية للعرض — الأساسيات (حسب الألواح) محددة افتراضياً والباقي حسب الحاجة
export default function SecondaryPickerModal({ secondary, selections, panelCount, onChange, onClose }) {
  function toggle(material, checked) {
    const next = { ...selections };
    if (checked) next[material.id] = { qty: '' };
    else delete next[material.id];
    onChange(next);
  }

  function setQty(material, value) {
    onChange({ ...selections, [material.id]: { qty: value } });
  }

  const includedTotal = secondary.reduce((sum, m) => {
    const sel = selections[m.id];
    if (!sel) return sum;
    return sum + effectiveQty(m, sel, panelCount) * m.price;
  }, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>المواد الثانوية للعرض</h3>
        <p className="muted">
          أشّر على المواد اللي تريدها بهذا العرض. الهيكل والصبات محددة تلقائياً (أساسية بكل عرض)، وتكدر تشيل أو
          تضيف أي مادة. الكمية الفارغة = تلقائية حسب عدد الألواح، ومواد المتر تحتاج إدخال الأمتار.
        </p>

        <div className="import-table-wrap">
          <table className="data-table import-table">
            <thead>
              <tr>
                <th></th>
                <th>المادة</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>المجموع</th>
              </tr>
            </thead>
            <tbody>
              {secondary.map((m) => {
                const sel = selections[m.id];
                const included = !!sel;
                const qty = included ? effectiveQty(m, sel, panelCount) : 0;
                const isAutoPerPanel = m.qty_per_panel && m.qty_per_panel > 0;
                return (
                  <tr key={m.id} style={included ? {} : { opacity: 0.55 }}>
                    <td>
                      <input type="checkbox" checked={included} onChange={(e) => toggle(m, e.target.checked)} />
                    </td>
                    <td style={{ fontWeight: included ? 700 : 400 }}>{m.model}</td>
                    <td>{m.unit}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        disabled={!included}
                        value={sel ? sel.qty : ''}
                        onChange={(e) => setQty(m, e.target.value)}
                        placeholder={
                          m.unit === 'متر' ? 'أدخل الأمتار' : isAutoPerPanel ? `تلقائي (${qty || '—'})` : 'تلقائي (1)'
                        }
                        style={{ maxWidth: 130 }}
                      />
                      {included && m.unit === 'متر' && qty <= 0 && (
                        <div className="issue-note">⚠ بدون أمتار ما تنضاف</div>
                      )}
                    </td>
                    <td>{fmt(m.price)}</td>
                    <td style={{ fontWeight: 700 }}>{included && qty > 0 ? fmt(qty * m.price) : '—'}</td>
                  </tr>
                );
              })}
              {secondary.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                    ما اكو مواد ثانوية بالمخزون
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="toolbar" style={{ marginTop: 14 }}>
          <span className="total-badge">مجموع الثانوية المضافة: {fmt(includedTotal)} دينار</span>
          <button className="btn btn-primary" onClick={onClose}>
            تم
          </button>
        </div>
      </div>
    </div>
  );
}

export { effectiveQty };
