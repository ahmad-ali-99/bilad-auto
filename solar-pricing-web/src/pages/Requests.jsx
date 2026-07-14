import React, { useEffect, useState } from 'react';

// صفحة المشرفين: طلبات العروض من الحاسبة العامة + كل المسجلين — عرض وبحث وحذف
const TIER_LABELS = { economy: 'اقتصادي', standard: 'متوسط', premium: 'ممتاز' };

function fmt(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-GB') : '-';
}

export default function Requests() {
  const [requests, setRequests] = useState(null);
  const [leads, setLeads] = useState(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  function reload() {
    window.api.quoteRequests.list().then(setRequests).catch(() => setRequests([]));
    window.api.leads.list().then(setLeads).catch(() => setLeads([]));
  }

  useEffect(reload, []);

  const q = search.trim().toLowerCase();
  const match = (x) =>
    !q ||
    (x.full_name || '').toLowerCase().includes(q) ||
    (x.email || '').toLowerCase().includes(q) ||
    (x.phone || '').includes(q);
  const filteredRequests = (requests || []).filter(match);
  const filteredLeads = (leads || []).filter(match);

  async function deleteRequest(r) {
    if (!confirm(`حذف طلب العرض من "${r.full_name || r.email || r.phone}"؟`)) return;
    try {
      await window.api.quoteRequests.remove(r.id);
      setMessage('حُذف الطلب ✔');
      reload();
    } catch (err) {
      setMessage('تعذر الحذف: ' + err.message + ' — إذا ذكرت الرسالة policy فنفّذ أسطر SQL المرسلة');
    }
  }

  async function deleteLead(l) {
    if (!confirm(`حذف المسجل "${l.full_name || l.email}"؟ سيُحذف من قاعدة التواصل فقط`)) return;
    try {
      await window.api.leads.remove(l.id);
      setMessage('حُذف المسجل ✔');
      reload();
    } catch (err) {
      setMessage('تعذر الحذف: ' + err.message + ' — إذا ذكرت الرسالة policy فنفّذ أسطر SQL المرسلة');
    }
  }

  return (
    <div>
      <h2 className="page-title">📨 الطلبات وجهات التواصل</h2>
      {message && <div className="alert alert-info">{message}</div>}

      <div className="toolbar" style={{ gap: 10 }}>
        <input
          type="text"
          className="search-input"
          placeholder="🔍 بحث بالاسم أو البريد أو الهاتف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <button className="btn btn-secondary" onClick={reload}>🔄 تحديث</button>
      </div>

      <div className="card">
        <h3 style={{ color: 'var(--navy)', marginTop: 0 }}>
          📨 طلبات العروض {requests ? `(${filteredRequests.length})` : '...'}
        </h3>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>نهاري/ليلي</th>
                <th>ساعات</th>
                <th>المستوى</th>
                <th>المجموع (د.ع)</th>
                <th>تقسيط</th>
                <th>التاريخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.full_name || '-'}
                    {r.email && <div className="muted" style={{ fontSize: '0.75rem' }} dir="ltr">{r.email}</div>}
                  </td>
                  <td dir="ltr">{r.phone || '-'}</td>
                  <td>{r.amp_day} / {r.amp_night}</td>
                  <td>{r.night_hours ?? '-'}</td>
                  <td>{TIER_LABELS[r.tier] || r.tier}</td>
                  <td>{fmt(r.total_price)}</td>
                  <td>{r.installment ? `✔ ${r.monthly ? fmt(r.monthly) + '/شهر' : ''}` : '-'}</td>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteRequest(r)}>حذف</button>
                  </td>
                </tr>
              ))}
              {requests && filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                    {q ? 'لا توجد نتائج لهذا البحث' : 'لا توجد طلبات عروض بعد'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ color: 'var(--navy)', marginTop: 0 }}>
          📇 المسجلون {leads ? `(${filteredLeads.length})` : '...'}
        </h3>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>البريد</th>
                <th>الهاتف</th>
                <th>المصدر</th>
                <th>تاريخ التسجيل</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((l) => (
                <tr key={l.id}>
                  <td>{l.full_name || '-'}</td>
                  <td dir="ltr">{l.email || '-'}</td>
                  <td dir="ltr">{l.phone || '-'}</td>
                  <td>{l.source === 'website' ? 'الموقع' : 'التطبيق'}</td>
                  <td>{fmtDate(l.created_at)}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteLead(l)}>حذف</button>
                  </td>
                </tr>
              ))}
              {leads && filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                    {q ? 'لا توجد نتائج لهذا البحث' : 'لا يوجد مسجلون بعد'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
