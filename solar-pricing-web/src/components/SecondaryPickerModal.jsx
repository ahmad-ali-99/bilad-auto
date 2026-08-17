import React, { useState } from 'react';
import { isPanelSideMaterial } from '../lib/secondaryDefaults.js';
import ModalPortal from './ModalPortal.jsx';

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

// نافذة وحدة لاختيار المواد الثانوية للعرض — الأساسيات محددة افتراضياً والباقي حسب الحاجة
export default function SecondaryPickerModal({ secondary, selections, panelCount, onChange, onClose, systemType = 'full' }) {
  // عرض أوف جرد (بلا ألواح): مواد جهة الألواح (هيكل/صبات/بورد DC) ما تنعرض أصلاً —
  // كميتها تطلع صفر وتنشال من العرض، فعرضها بالقائمة تشويش يغلّط البياع
  const list = systemType === 'offgrid' ? secondary.filter((m) => !isPanelSideMaterial(m)) : secondary;
  const [maxed, setMaxed] = useState(false);
  const [defaultsMsg, setDefaultsMsg] = React.useState('');

  // اعتماد التحديد الحالي كافتراضي دائم مشترك لكل المستخدمين (يخزن بقاعدة البيانات)
  async function saveAsDefaults() {
    try {
      const ids = list.filter((m) => selections[m.id]).map((m) => m.id);
      await window.api.config.set('secondary_defaults', ids);
      setDefaultsMsg(`تم ✔ أصبحت هذه المواد (${ids.length}) افتراضية دائمة في كل عرض جديد ولجميع الموظفين`);
    } catch (err) {
      setDefaultsMsg('خطأ بالحفظ: ' + err.message);
    }
  }

  function toggle(material, checked) {
    const next = { ...selections };
    if (checked) next[material.id] = { qty: '' };
    else delete next[material.id];
    onChange(next);
  }

  function setQty(material, value) {
    onChange({ ...selections, [material.id]: { qty: value } });
  }

  const includedTotal = list.reduce((sum, m) => {
    const sel = selections[m.id];
    if (!sel) return sum;
    return sum + effectiveQty(m, sel, panelCount) * m.price;
  }, 0);

  return (
    <ModalPortal>
    <div className="modal-overlay">
      <div className={maxed ? "modal modal-wide modal-max" : "modal modal-wide"}>
        <button type="button" className="modal-zoom-btn" onClick={() => setMaxed((m) => !m)} title="تكبير / تصغير النافذة">{maxed ? "🗕" : "⛶"}</button>
        <h3>المواد الثانوية للعرض</h3>
        <div className="modal-body">
        <p className="muted">
          {systemType === 'offgrid'
            ? 'منظومة أوف جرد: مواد الألواح (الهيكل والصبات وبوردة الحماية DC) غير معروضة لأنها لا تدخل هذا العرض. أشّر على الأسلاك والبوردات وبقية التفاصيل المطلوبة — ومواد المتر تحتاج إدخال الأمتار.'
            : 'أشّر على المواد المطلوبة في هذا العرض. الهيكل والصبات محددة تلقائياً (أساسية في كل عرض)، ويمكنك إزالة أو إضافة أي مادة. الكمية الفارغة = تلقائية حسب عدد الألواح، ومواد المتر تحتاج إدخال الأمتار.'}
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
              {list.map((m) => {
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
                        <div className="issue-note">⚠ لن تُضاف بدون أمتار</div>
                      )}
                    </td>
                    <td>{fmt(m.price)}</td>
                    <td style={{ fontWeight: 700 }}>{included && qty > 0 ? fmt(qty * m.price) : '—'}</td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                    لا توجد مواد ثانوية في المخزون
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {defaultsMsg && <div className="alert alert-info" style={{ marginTop: 10 }}>{defaultsMsg}</div>}
        </div>
        <div className="toolbar modal-footer" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="total-badge">مجموع الثانوية المضافة: {fmt(includedTotal)} دينار</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* بوضع الأوف جرد القائمة منقوصة (بلا مواد الألواح) — اعتمادها كافتراضي دائم
                راح يمسح الهيكل والصبات من عروض الفريق كلها، فالزر ينحجب بهذا الوضع */}
            {systemType !== 'offgrid' && (
              <button className="btn btn-secondary" onClick={saveAsDefaults} title="يصبح التحديد الحالي هو الافتراضي الدائم في كل عرض جديد ولجميع الموظفين">
                💾 اعتماد كافتراضي دائم للكل
              </button>
            )}
            <button className="btn btn-primary" onClick={onClose}>
              تم
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

export { effectiveQty };
