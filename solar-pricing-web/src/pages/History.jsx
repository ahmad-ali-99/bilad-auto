import React, { useState, useEffect } from 'react';

// سجل الحركات (الهستوري) — تظهر لحساب المشرف أحمد فقط (الحماية الفعلية بـRLS بقاعدة البيانات):
// كل حفظ/تعديل/حذف/تحويل/تغيير حالة داخل التطبيق، منو سواه وبأي حساب ووقتها.
const ACTION_ICONS = {
  'حفظ عرض جديد': '🆕',
  'تعديل عرض': '✏️',
  'تعديل عرض + تحويل الحساب': '🔁',
  'حذف عرض (لسلة المحذوفات)': '🗑️',
  'استرجاع عرض من سلة المحذوفات': '♻️',
  'تغيير حالة عرض': '🚦',
  'تصدير PDF لعرض محفوظ': '📄',
  'تصدير PDF معاينة (بلا حفظ)': '📄',
  'إرفاق تصميم بعرض': '📎',
  'حذف مرفق عرض': '📎',
  'إضافة مادة': '📦',
  'تعديل مادة': '📦',
  'حذف مادة': '🗑️',
  'استيراد إكسل للمخزون': '📥',
  'إضافة أجور عمل': '🔧',
  'تعديل أجور عمل': '🔧',
  'حذف أجور عمل': '🗑️',
  'تعديل إعدادات الحساب': '⚙️',
  'تعديل إعداد مشترك': '⚙️',
  'تعديل ملف الشركة': '🏢',
  'حذف جهة تواصل زائر': '🗑️',
  'حذف طلب عرض زبون': '🗑️',
};

const fmtVal = (v) => (typeof v === 'number' ? Math.round(v).toLocaleString('en-US') : String(v));

function detailsText(details) {
  if (!details || typeof details !== 'object') return '';
  return Object.entries(details)
    .map(([k, v]) => `${k}: ${fmtVal(v)}`)
    .join(' — ');
}

function fmtTime(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

// الحسابات المرقمة تظهر بالرقم فقط — نفس بقية الصفحات
const displayUser = (r) => (r.user_name || r.user_email || 'غير معروف').replace(/^مستخدم(?=[0-9])/, '');

export default function History() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');

  async function load() {
    setError('');
    try {
      setRows(await window.api.history.list());
    } catch (e) {
      setError('تعذر تحميل السجل: ' + e.message);
      setRows([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const users = [...new Set((rows || []).map(displayUser))];
  const q = search.trim();
  const filtered = (rows || []).filter((r) => {
    if (userFilter && displayUser(r) !== userFilter) return false;
    if (!q) return true;
    return [r.action, r.entity, displayUser(r), detailsText(r.details)].join(' ').includes(q);
  });

  return (
    <div>
      <h2 className="page-title">🕓 سجل الحركات</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        كل حركة داخل التطبيق: منو سواها، بأي حساب، ووقتها — هذه الصفحة لحسابك فقط ولا يمكن لأحد مسح السجل.
      </p>

      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 بحث: رقم عرض، عميل، مادة..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 2, minWidth: 160 }}
        />
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} style={{ flex: 1, minWidth: 110 }}>
          <option value="">كل الحسابات</option>
          {users.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={load}>🔄 تحديث</button>
      </div>

      {error && <div className="alert alert-warning">{error}</div>}
      {rows === null && <div className="muted" style={{ textAlign: 'center', padding: 20 }}>⏳ جاري التحميل...</div>}
      {rows !== null && !filtered.length && !error && (
        <div className="muted" style={{ textAlign: 'center', padding: 20 }}>لا توجد حركات مسجلة بعد — السجل يبدأ من لحظة تفعيل الميزة.</div>
      )}

      {filtered.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ whiteSpace: 'nowrap' }}>الوقت</th>
                <th>الحساب</th>
                <th>الحركة</th>
                <th>التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.82em' }} dir="ltr">{fmtTime(r.created_at)}</td>
                  <td style={{ fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{displayUser(r)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {ACTION_ICONS[r.action] || '•'} {r.action}
                    {r.entity ? <span className="muted" style={{ fontSize: '0.8em' }}> ({r.entity})</span> : null}
                  </td>
                  <td style={{ fontSize: '0.85em' }}>{detailsText(r.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
