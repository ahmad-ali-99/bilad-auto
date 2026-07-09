import React, { useEffect, useState } from 'react';

const TIER_LABELS = { economy: 'اقتصادي', standard: 'متوسط', premium: 'ممتاز' };

function fmt(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB');
}

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [message, setMessage] = useState('');

  function reload() {
    window.api.quotes.list().then(setQuotes);
  }

  useEffect(reload, []);

  async function handleExport(id, quoteNumber) {
    setMessage('');
    try {
      const result = await window.api.quotes.exportPdf(id);
      if (!result.canceled) setMessage(`تم تصدير عرض رقم ${quoteNumber} بنجاح ✔`);
    } catch (err) {
      setMessage('خطأ بالتصدير: ' + err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('هل تريد حذف هذا العرض نهائياً؟')) return;
    await window.api.quotes.remove(id);
    reload();
  }

  return (
    <div>
      <h2 className="page-title">العروض المحفوظة</h2>
      {message && <div className="alert alert-info">{message}</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>العدد</th>
            <th>العميل</th>
            <th>الموقع</th>
            <th>النوع</th>
            <th>التاريخ</th>
            <th>المجموع (د.ع)</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id}>
              <td>{q.quote_number}</td>
              <td>{q.client_name || '-'}</td>
              <td>{q.location || '-'}</td>
              <td>{TIER_LABELS[q.selected_tier] || q.selected_tier}</td>
              <td>{fmtDate(q.created_at)}</td>
              <td>{fmt(q.total_price)}</td>
              <td>
                <button className="btn btn-secondary btn-sm" onClick={() => handleExport(q.id, q.quote_number)}>
                  إعادة تصدير PDF
                </button>{' '}
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(q.id)}>
                  حذف
                </button>
              </td>
            </tr>
          ))}
          {quotes.length === 0 && (
            <tr>
              <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                لا توجد عروض محفوظة بعد
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
