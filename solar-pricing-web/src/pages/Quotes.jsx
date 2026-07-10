import React, { useEffect, useRef, useState } from 'react';

const TIER_LABELS = { economy: 'اقتصادي', standard: 'متوسط', premium: 'ممتاز' };
const MAX_ATTACH_MB = 8;

function fmt(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB');
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function Quotes({ onEditQuote }) {
  const [quotes, setQuotes] = useState([]);
  const [deleted, setDeleted] = useState([]);
  const [showTrash, setShowTrash] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState(null);
  const fileRef = useRef(null);
  const attachTargetRef = useRef(null);

  function reload() {
    window.api.quotes.list().then(setQuotes);
    window.api.quotes.listDeleted().then(setDeleted).catch(() => setDeleted([]));
  }

  useEffect(reload, []);

  const q = search.trim().toLowerCase();
  const filtered = quotes.filter(
    (x) =>
      !q ||
      String(x.quote_number).includes(q) ||
      (x.client_name || '').toLowerCase().includes(q) ||
      (x.client_phone || '').includes(q) ||
      (x.location || '').toLowerCase().includes(q)
  );

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
    if (!confirm('العرض يروح لسلة المحذوفات ويكدر أي أحد يرجعه خلال أسبوع — بعدها ينحذف نهائياً. تريد تكمل؟')) return;
    try {
      await window.api.quotes.remove(id);
      setMessage('انحذف العرض — موجود بسلة المحذوفات أسبوعاً كاملاً');
      reload();
    } catch (err) {
      setMessage('خطأ بالحذف: ' + err.message + ' — إذا الرسالة تذكر deleted_at، شغّل سطور SQL اللي دزيتها إلك');
    }
  }

  // فتح عرض محفوظ للتعديل الكامل بالشاشة الرئيسية: نستنتج المواد المبدلة يدوياً
  // والثانوية المختارة من بنود العرض المحفوظة (material_id) — بلا أي أعمدة جديدة
  async function handleEdit(id) {
    setBusyId(id);
    try {
      const [full, materials] = await Promise.all([window.api.quotes.get(id), window.api.materials.list()]);
      if (!full) return;
      const byId = new Map(materials.map((m) => [m.id, m]));
      const overrides = {};
      const secondarySelections = {};
      for (const item of full.items) {
        const mat = item.material_id != null ? byId.get(item.material_id) : null;
        if (!mat) continue; // أجور العمل أو مادة انحذفت من المخزون
        if (mat.category === 'secondary') {
          // المرتبطة بالألواح ترجع تلقائية حتى تتبع أي تعديل، والباقي بكميتها المحفوظة
          secondarySelections[mat.id] = { qty: mat.qty_per_panel > 0 ? '' : item.quantity };
        } else {
          overrides[mat.category] = mat.id;
        }
      }
      onEditQuote({
        editing: { id: full.quote.id, quote_number: full.quote.quote_number },
        clientName: full.quote.client_name || '',
        clientPhone: full.quote.client_phone || '',
        location: full.quote.location || '',
        roofAreaM2: full.quote.roof_area_m2,
        ampDay: full.quote.required_amp_day,
        ampNight: full.quote.required_amp_night,
        nightSupplyHours: full.quote.night_supply_hours,
        tier: full.quote.selected_tier,
        overrides,
        secondarySelections,
        notes: full.notes.map((n) => n.note_text),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestore(id, quoteNumber) {
    await window.api.quotes.restore(id);
    setMessage(`تم استرداد العرض رقم ${quoteNumber} ✔`);
    reload();
  }

  function pickAttachment(quote) {
    attachTargetRef.current = quote;
    fileRef.current?.click();
  }

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const quote = attachTargetRef.current;
    if (!file || !quote) return;
    if (!/^image\/|^application\/pdf/.test(file.type)) {
      setMessage('نوع الملف غير مدعوم — صورة أو PDF فقط');
      return;
    }
    if (file.size > MAX_ATTACH_MB * 1024 * 1024) {
      setMessage(`الملف كبير — الحد ${MAX_ATTACH_MB} ميغا`);
      return;
    }
    setBusyId(quote.id);
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await window.api.quotes.setAttachment(quote.id, { name: file.name, data });
      setMessage(`انرفق التصميم "${file.name}" بالعرض ${quote.quote_number} — راح يطلع بنهاية الـPDF عند التصدير ✔`);
      reload();
    } catch (err) {
      setMessage('خطأ بالإرفاق: ' + err.message + ' — إذا الرسالة تذكر attachment، شغّل سطور SQL اللي دزيتها إلك');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemoveAttachment(quote) {
    if (!confirm(`تشيل المرفق "${quote.attachment_name}" من العرض ${quote.quote_number}؟`)) return;
    await window.api.quotes.removeAttachment(quote.id);
    setMessage('انشال المرفق');
    reload();
  }

  return (
    <div>
      <h2 className="page-title">العروض المحفوظة</h2>
      {message && <div className="alert alert-info">{message}</div>}

      <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
        <input
          type="text"
          className="search-input"
          placeholder="🔍 دور بالاسم أو الرقم أو الموبايل أو الموقع..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <button className="btn btn-secondary" onClick={() => setShowTrash((v) => !v)}>
          🗑 سلة المحذوفات ({deleted.length})
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleFileChosen} />

      {showTrash && (
        <div className="card" style={{ border: '1px solid #e0b4b4' }}>
          <h3 style={{ marginTop: 0, color: '#a33' }}>سلة المحذوفات — تنحذف نهائياً بعد أسبوع من الحذف</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>العدد</th>
                <th>العميل</th>
                <th>المجموع</th>
                <th>منو حذفه</th>
                <th>وكت الحذف</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deleted.map((d) => (
                <tr key={d.id}>
                  <td>{d.quote_number}</td>
                  <td>{d.client_name || '-'}</td>
                  <td>{fmt(d.total_price)}</td>
                  <td style={{ fontWeight: 700 }}>{d.deleted_by || '-'}</td>
                  <td>{fmtDateTime(d.deleted_at)}</td>
                  <td>
                    <button className="btn btn-primary btn-sm" onClick={() => handleRestore(d.id, d.quote_number)}>
                      ↩ استرداد
                    </button>
                  </td>
                </tr>
              ))}
              {deleted.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 14 }}>
                    السلة فارغة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>العدد</th>
            <th>العميل</th>
            <th>الموقع</th>
            <th>النوع</th>
            <th>التاريخ</th>
            <th>المجموع (د.ع)</th>
            <th>التصميم</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((qt) => (
            <tr key={qt.id}>
              <td>{qt.quote_number}</td>
              <td>
                {qt.client_name || '-'}
                {qt.client_phone && <div className="muted" style={{ fontSize: '0.78rem' }}>{qt.client_phone}</div>}
              </td>
              <td>{qt.location || '-'}</td>
              <td>{TIER_LABELS[qt.selected_tier] || qt.selected_tier}</td>
              <td>{fmtDate(qt.created_at)}</td>
              <td>{fmt(qt.total_price)}</td>
              <td>
                {qt.attachment_name ? (
                  <span title={qt.attachment_name} style={{ whiteSpace: 'nowrap' }}>
                    📎 مرفق{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => handleRemoveAttachment(qt)} title="إزالة المرفق">
                      ✕
                    </button>
                  </span>
                ) : (
                  <button className="btn btn-secondary btn-sm" disabled={busyId === qt.id} onClick={() => pickAttachment(qt)}>
                    {busyId === qt.id ? '...' : '📎 إرفاق تصميم'}
                  </button>
                )}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-primary btn-sm" disabled={busyId === qt.id} onClick={() => handleEdit(qt.id)}>
                  ✏ تعديل
                </button>{' '}
                <button className="btn btn-secondary btn-sm" onClick={() => handleExport(qt.id, qt.quote_number)}>
                  تصدير PDF{qt.attachment_name ? ' + التصميم' : ''}
                </button>{' '}
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(qt.id)}>
                  حذف
                </button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                {quotes.length === 0 ? 'لا توجد عروض محفوظة بعد' : 'ماكو نتائج لهذا البحث'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
