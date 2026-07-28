import React, { useEffect, useRef, useState } from 'react';
import { buildEditPrefill } from '../lib/editPrefill.js';
import { getCurrentUsername } from '../lib/agent.js';

const TIER_LABELS = { economy: 'اقتصادي', standard: 'متوسط', premium: 'ممتاز' };
const MAX_ATTACH_MB = 8;

// حالات العرض: chip ملوّن بالجدول + ملاحظات تظهر عند مرور الماوس
const STATUS_LEVELS = [
  { key: 'normal', label: 'عادي' },
  { key: 'follow', label: 'قيد المتابعة' },
  { key: 'urgent', label: 'مستعجل' },
  { key: 'done', label: 'مكتمل' },
];
const STATUS_LABELS = Object.fromEntries(STATUS_LEVELS.map((l) => [l.key, l.label]));

function fmt(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB');
}

// اسم منشئ العرض: الحسابات المرقمة تظهر بالرقم فقط (مستخدم2 ← 2)
function creatorName(createdBy) {
  return (createdBy || '').replace(/^مستخدم(?=[0-9])/, '') || '-';
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
  // حالات العروض: { [quoteId]: {level, note} } + محرر الحالة المفتوح حالياً
  const [statuses, setStatuses] = useState({});
  const [statusEdit, setStatusEdit] = useState(null);
  const fileRef = useRef(null);
  const attachTargetRef = useRef(null);
  // تفريغ السلة نهائياً: صلاحية حصرية لحساب أحمد
  const [isAhmad, setIsAhmad] = useState(false);
  useEffect(() => {
    getCurrentUsername()
      .then((n) => setIsAhmad((n || '').replace(/[أإآ]/g, 'ا').trim() === 'احمد'))
      .catch(() => {});
  }, []);

  function reload() {
    window.api.quotes.list().then(setQuotes);
    window.api.quotes.listDeleted().then(setDeleted).catch(() => setDeleted([]));
    window.api.quotes.statuses().then(setStatuses).catch(() => {});
  }

  useEffect(reload, []);

  const q = search.trim().toLowerCase();
  const filtered = quotes.filter(
    (x) =>
      !q ||
      String(x.quote_number).includes(q) ||
      (x.client_name || '').toLowerCase().includes(q) ||
      (x.client_phone || '').includes(q) ||
      (x.location || '').toLowerCase().includes(q) ||
      creatorName(x.created_by).toLowerCase().includes(q)
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
    if (!confirm('سيُنقل العرض إلى سلة المحذوفات ويمكن استرداده خلال أسبوع — ثم يُحذف نهائياً. هل تريد المتابعة؟')) return;
    try {
      await window.api.quotes.remove(id);
      setMessage('حُذف العرض — سيبقى في سلة المحذوفات أسبوعاً كاملاً');
      reload();
    } catch (err) {
      setMessage('خطأ في الحذف: ' + err.message + ' — إذا ذكرت الرسالة deleted_at فنفّذ أسطر SQL المرسلة سابقاً');
    }
  }

  // فتح عرض محفوظ للتعديل الكامل بالشاشة الرئيسية (المنطق المشترك بـeditPrefill.js)
  async function handleEdit(id) {
    setBusyId(id);
    try {
      const prefill = await buildEditPrefill(id);
      if (prefill) onEditQuote(prefill);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestore(id, quoteNumber) {
    await window.api.quotes.restore(id);
    setMessage(`تم استرداد العرض رقم ${quoteNumber} ✔`);
    reload();
  }

  // تفريغ السلة نهائياً — لحساب أحمد فقط، ولا يمكن التراجع عنه
  async function handlePurge() {
    if (!confirm(`سيُحذف نهائياً ${deleted.length} عرض من سلة المحذوفات ولا يمكن استردادها أبداً. متأكد؟`)) return;
    setMessage('');
    try {
      const { count } = await window.api.quotes.purgeDeleted();
      setMessage(`تم تفريغ السلة — حُذف ${count} عرض نهائياً 🧹`);
      reload();
    } catch (err) {
      setMessage('خطأ في التفريغ: ' + err.message);
    }
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
      setMessage(`أُرفق التصميم "${file.name}" بالعرض ${quote.quote_number} — سيظهر في نهاية ملف الـPDF عند التصدير ✔`);
      reload();
    } catch (err) {
      setMessage('خطأ في الإرفاق: ' + err.message + ' — إذا ذكرت الرسالة attachment فنفّذ أسطر SQL المرسلة سابقاً');
    } finally {
      setBusyId(null);
    }
  }

  // حفظ حالة العرض تفاؤلياً: الواجهة تتحدث فوراً والتخزين بالخلفية
  function saveStatus() {
    const { id, level, note } = statusEdit;
    setStatuses((prev) => ({ ...prev, [id]: { level, note } }));
    setStatusEdit(null);
    window.api.quotes.setStatus(id, { level, note }).catch((err) => setMessage('تعذر حفظ الحالة: ' + err.message));
  }

  async function handleRemoveAttachment(quote) {
    if (!confirm(`هل تريد إزالة المرفق "${quote.attachment_name}" من العرض ${quote.quote_number}؟`)) return;
    await window.api.quotes.removeAttachment(quote.id);
    setMessage('أُزيلت المرفقات — تمت الإزالة');
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
          placeholder="🔍 بحث..."
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, color: '#a33', flex: 1 }}>سلة المحذوفات — تنحذف نهائياً بعد أسبوع من الحذف</h3>
            {isAhmad && deleted.length > 0 && (
              <button className="btn btn-danger btn-sm" style={{ background: '#a33', color: '#fff', border: 'none' }} onClick={handlePurge}>
                🧹 تفريغ السلة نهائياً
              </button>
            )}
          </div>
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>العدد</th>
                <th>العميل</th>
                <th>أنشأه</th>
                <th>المجموع</th>
                <th>حُذف بواسطة</th>
                <th>وقت الحذف</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deleted.map((d) => (
                <tr key={d.id}>
                  <td>{d.quote_number}</td>
                  <td>{d.client_name || '-'}</td>
                  <td>{creatorName(d.created_by)}</td>
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
                  <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 14 }}>
                    السلة فارغة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>العدد</th>
            <th>العميل</th>
            <th>الموقع</th>
            <th>النوع</th>
            <th>أنشأه</th>
            <th>الحالة</th>
            <th>التاريخ</th>
            <th>المجموع (د.ع)</th>
            <th>التصميم</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((qt, rowIdx) => (
            <tr key={qt.id}>
              <td>{qt.quote_number}</td>
              <td>
                {qt.client_name || '-'}
                {qt.client_phone && <div className="muted" style={{ fontSize: '0.78rem' }}>{qt.client_phone}</div>}
              </td>
              <td>{qt.location || '-'}</td>
              <td>{TIER_LABELS[qt.selected_tier] || qt.selected_tier}</td>
              <td style={{ fontWeight: 700, color: 'var(--navy)' }}>{creatorName(qt.created_by)}</td>
              <td>
                {(() => {
                  const st = statuses[qt.id] || { level: 'normal', note: '' };
                  const editing = statusEdit?.id === qt.id;
                  // بالصفوف الأخيرة النافذة تفتح فوق الـchip حتى ما ينقصها الجدول من الأسفل
                  const tipUp = filtered.length > 4 && rowIdx >= filtered.length - 2;
                  return (
                    <span className={`status-cell${tipUp ? ' up' : ''}`}>
                      <button
                        type="button"
                        className={`status-chip status-${st.level}`}
                        onClick={() => setStatusEdit(editing ? null : { id: qt.id, level: st.level, note: st.note })}
                        title=""
                      >
                        {STATUS_LABELS[st.level] || st.level}
                      </button>
                      {!editing && st.note && (
                        <span className="status-tip" role="tooltip">
                          <b>ملاحظات الحالة</b>
                          {st.note}
                        </span>
                      )}
                      {editing && (
                        <span className="status-editor" onClick={(e) => e.stopPropagation()}>
                          <span className="status-editor-levels">
                            {STATUS_LEVELS.map((l) => (
                              <button
                                key={l.key}
                                type="button"
                                className={`status-chip status-${l.key}${statusEdit.level === l.key ? ' selected' : ''}`}
                                onClick={() => setStatusEdit((s) => ({ ...s, level: l.key }))}
                              >
                                {l.label}
                              </button>
                            ))}
                          </span>
                          <textarea
                            rows={3}
                            placeholder="ملاحظات مهمة عن حالة العرض..."
                            value={statusEdit.note}
                            onChange={(e) => setStatusEdit((s) => ({ ...s, note: e.target.value }))}
                          />
                          <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStatusEdit(null)}>
                              إغلاق
                            </button>
                            <button type="button" className="btn btn-primary btn-sm" onClick={saveStatus}>
                              حفظ
                            </button>
                          </span>
                        </span>
                      )}
                    </span>
                  );
                })()}
              </td>
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
              <td colSpan={10} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                {quotes.length === 0 ? 'لا توجد عروض محفوظة بعد' : 'لا توجد نتائج لهذا البحث'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
