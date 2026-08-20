import React, { useEffect, useRef, useState } from 'react';
import { buildEditPrefill } from '../lib/editPrefill.js';
import { getCurrentUsername } from '../lib/agent.js';
import { canViewQuotes, isOwnerAccount } from '../lib/permissions.js';
import { creatorsOf, filterByCreators, normName } from '../lib/quotesFilter.js';
import AnchoredPopup from '../components/AnchoredPopup.jsx';

const TIER_LABELS = { economy: 'اقتصادي', standard: 'متوسط', premium: 'ممتاز' };
const MAX_ATTACH_MB = 8;
// اختيار الحسابات ينحفظ محلياً حتى ما يرجع للصفر كل ما يطلع ويرجع للصفحة
const CREATOR_FILTER_KEY = 'quotes_creator_filter_v1';
// أنواع ملفات العرض الجاهز المقبولة بالرفع
const UPLOAD_ACCEPT = '.pdf,.xlsx,.xls,.doc,.docx,image/*,application/pdf';

// حالات العرض: chip ملوّن بالجدول + ملاحظات تظهر عند مرور الماوس
const STATUS_LEVELS = [
  { key: 'normal', label: 'عادي' },
  { key: 'follow', label: 'قيد المتابعة' },
  { key: 'urgent', label: 'مستعجل' },
  { key: 'done', label: 'مكتمل' },
];
const STATUS_LABELS = Object.fromEntries(STATUS_LEVELS.map((l) => [l.key, l.label]));

// خلية الحالة: chip + محرر منبثق + فقاعة الملاحظة.
// المحرر والفقاعة يُرسمان بـAnchoredPopup (portal على body) لأنهما كانا
// `position: absolute` داخل `.table-scroll{overflow:auto}` فتنقص أزرارهما بحدود
// الحاوية — وكان التخمين القديم «آخر صفين يفتحون للأعلى» ما يعالج القص الأفقي
// ولا الصف الأول. الحساب الآن حقيقي ومحصور بالشاشة.
function StatusCell({ st, editing, statusEdit, setStatusEdit, saveStatus, quoteId, rowHovered }) {
  const chipRef = useRef(null);
  return (
    <span className="status-cell">
      <button
        ref={chipRef}
        type="button"
        className={`status-chip status-${st.level}`}
        onClick={() => setStatusEdit(editing ? null : { id: quoteId, level: st.level, note: st.note })}
      >
        {STATUS_LABELS[st.level] || st.level}
      </button>

      {!editing && st.note && rowHovered && (
        <AnchoredPopup anchorRef={chipRef} className="status-tip" style={{ pointerEvents: 'none' }}>
          <b>ملاحظات الحالة</b>
          {st.note}
        </AnchoredPopup>
      )}

      {editing && (
        <AnchoredPopup anchorRef={chipRef} className="status-editor" onClose={() => setStatusEdit(null)}>
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
        </AnchoredPopup>
      )}
    </span>
  );
}

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
  // الصف اللي عليه الماوس — تُظهر فقاعة ملاحظة الحالة (كانت بـCSS hover، وما تنفع
  // مع البورتال) — بالموبايل ماكو hover أصلاً فما تتأثر
  const [hoveredRow, setHoveredRow] = useState(null);
  const fileRef = useRef(null);
  const attachTargetRef = useRef(null);
  // تفريغ السلة نهائياً: صلاحية حصرية لحساب أحمد
  const [isAhmad, setIsAhmad] = useState(false);
  // البياع الاعتيادي يشوف عروضه هو فقط — نوضحها بالعنوان حتى ما يظن أن عروضاً ضاعت
  const [seesAll, setSeesAll] = useState(true);
  // أرقام العروض المرفوعة (ملفات جاهزة من برة) — تتميّز بشارة وأزرار مختلفة
  const [uploadedIds, setUploadedIds] = useState([]);
  // الحسابات المختارة للعرض بالجدول (فاضية = الكل)
  const [selectedCreators, setSelectedCreators] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CREATOR_FILTER_KEY));
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  // بطاقة رفع عرض جاهز
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ clientName: '', clientPhone: '', location: '', totalPrice: '' });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef(null);

  useEffect(() => {
    getCurrentUsername()
      .then((n) => {
        setIsAhmad(isOwnerAccount(n));
        setSeesAll(canViewQuotes(n));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CREATOR_FILTER_KEY, JSON.stringify(selectedCreators));
    } catch {
      /* المتصفح ممكن يمنع التخزين — الفلترة تشتغل على أي حال */
    }
  }, [selectedCreators]);

  function reload() {
    window.api.quotes.list().then(setQuotes);
    window.api.quotes.listDeleted().then(setDeleted).catch(() => setDeleted([]));
    window.api.quotes.statuses().then(setStatuses).catch(() => {});
    window.api.quotes.uploadedIds?.().then((ids) => setUploadedIds(ids || [])).catch(() => {});
  }

  useEffect(reload, []);

  const q = search.trim().toLowerCase();
  // أسماء الحسابات وأعداد عروضها — تُشتق من العروض المحمّلة نفسها بلا استعلام إضافي
  const creators = seesAll ? creatorsOf(quotes) : [];
  const uploadedSet = new Set(uploadedIds);
  const isUploaded = (qt) => uploadedSet.has(qt.id);
  const filtered = filterByCreators(quotes, seesAll ? selectedCreators : null).filter(
    (x) =>
      !q ||
      String(x.quote_number).includes(q) ||
      (x.client_name || '').toLowerCase().includes(q) ||
      (x.client_phone || '').includes(q) ||
      (x.location || '').toLowerCase().includes(q) ||
      creatorName(x.created_by).toLowerCase().includes(q)
  );

  function toggleCreator(key) {
    setSelectedCreators((prev) => {
      const has = prev.some((n) => normName(n) === key);
      return has ? prev.filter((n) => normName(n) !== key) : [...prev, key];
    });
  }

  // ── رفع عرض جاهز انعمل خارج البرنامج ─────────────────────────────────────
  function pickUploadFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_ATTACH_MB * 1024 * 1024) {
      setMessage(`الملف كبير — الحد ${MAX_ATTACH_MB} ميغا`);
      return;
    }
    setUploadFile(file);
    setMessage('');
  }

  async function submitUpload() {
    if (!uploadFile) {
      setMessage('اختر ملف العرض أولاً');
      return;
    }
    setUploading(true);
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(uploadFile);
      });
      const quote = await window.api.quotes.createUploaded({
        ...uploadForm,
        file: { name: uploadFile.name, data },
      });
      setMessage(`أُضيف العرض المرفوع برقم ${quote.quote_number} — "${uploadFile.name}" ✔`);
      setUploadOpen(false);
      setUploadForm({ clientName: '', clientPhone: '', location: '', totalPrice: '' });
      setUploadFile(null);
      reload();
    } catch (err) {
      setMessage('تعذّر رفع العرض: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  // تنزيل ملف العرض المرفوع كما هو (مو تصدير PDF — العرض المرفوع بلا بنود)
  function downloadUploaded(qt) {
    if (!qt.attachment_data) {
      setMessage('ملف هذا العرض غير متوفر');
      return;
    }
    const a = document.createElement('a');
    a.href = qt.attachment_data;
    a.download = qt.attachment_name || `عرض_${qt.quote_number}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

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
    } catch (err) {
      // منها منع الملكية: العرض يخص حساباً ثانياً — نوري السبب بدل ما تنبلع الرسالة
      setMessage('تعذر فتح العرض: ' + err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestore(id, quoteNumber) {
    try {
      await window.api.quotes.restore(id);
    } catch (err) {
      setMessage('تعذر استرداد العرض: ' + err.message);
      return;
    }
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
      <h2 className="page-title">{seesAll ? 'العروض المحفوظة' : 'عروضي المحفوظة'}</h2>
      {!seesAll && (
        <p className="muted" style={{ marginTop: -6 }}>تظهر هنا العروض التي أنشأتها بحسابك فقط.</p>
      )}
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
        <button className="btn btn-primary" onClick={() => setUploadOpen((v) => !v)}>
          ⬆ رفع عرض جاهز
        </button>
        <button className="btn btn-secondary" onClick={() => setShowTrash((v) => !v)}>
          🗑 سلة المحذوفات ({deleted.length})
        </button>
      </div>

      {/* اختيار الحسابات: يظهر للإدارة فقط — البياع أصلاً يشوف عروضه هو */}
      {seesAll && creators.length > 1 && (
        <div className="card" style={{ padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <b style={{ color: 'var(--navy)' }}>👥 الحسابات:</b>
            <button
              type="button"
              onClick={() => setSelectedCreators([])}
              style={{
                cursor: 'pointer', borderRadius: 20, padding: '5px 14px', fontFamily: 'inherit', fontWeight: 700,
                border: selectedCreators.length === 0 ? '2px solid var(--navy)' : '1px solid #ccd6e2',
                background: selectedCreators.length === 0 ? 'var(--navy)' : '#fff',
                color: selectedCreators.length === 0 ? '#fff' : 'var(--navy)',
              }}
            >
              {selectedCreators.length === 0 ? '✓ ' : ''}الكل ({quotes.length})
            </button>
            {creators.map((c) => {
              const on = selectedCreators.some((n) => normName(n) === c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleCreator(c.key)}
                  style={{
                    cursor: 'pointer', borderRadius: 20, padding: '5px 14px', fontFamily: 'inherit', fontWeight: 700,
                    border: on ? '2px solid var(--navy)' : '1px solid #ccd6e2',
                    background: on ? '#e9f0f9' : '#fff',
                    color: 'var(--navy)',
                  }}
                >
                  {on ? '✓ ' : ''}{creatorName(c.name)} ({c.count})
                </button>
              );
            })}
          </div>
          {selectedCreators.length > 0 && (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.8rem' }}>
              معروض {filtered.length} من {quotes.length} عرضاً — اضغط «الكل» لعرض عروض الفريق كاملة.
            </p>
          )}
        </div>
      )}

      {/* رفع عرض جاهز انعمل خارج البرنامج */}
      {uploadOpen && (
        <div className="card" style={{ border: '1px solid #bcd6ec' }}>
          <h3 style={{ marginTop: 0, color: 'var(--navy)' }}>⬆ رفع عرض جاهز</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            للعروض المجهّزة خارج البرنامج (PDF أو إكسل أو وورد أو صورة) — تنضاف لقائمة العروض
            برقم عرض جديد من نفس التسلسل، ويبقى الملف محفوظاً معها.
          </p>
          <div className="grid-2">
            <div className="field">
              <label>اسم العميل</label>
              <input
                type="text"
                value={uploadForm.clientName}
                onChange={(e) => setUploadForm((f) => ({ ...f, clientName: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>رقم الموبايل</label>
              <input
                type="text"
                value={uploadForm.clientPhone}
                onChange={(e) => setUploadForm((f) => ({ ...f, clientPhone: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>الموقع</label>
              <input
                type="text"
                value={uploadForm.location}
                onChange={(e) => setUploadForm((f) => ({ ...f, location: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>المبلغ الكلي (دينار)</label>
              <input
                type="number"
                min="0"
                value={uploadForm.totalPrice}
                onChange={(e) => setUploadForm((f) => ({ ...f, totalPrice: e.target.value }))}
              />
            </div>
          </div>
          <input ref={uploadRef} type="file" accept={UPLOAD_ACCEPT} style={{ display: 'none' }} onChange={pickUploadFile} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
            <button type="button" className="btn btn-secondary" onClick={() => uploadRef.current?.click()}>
              📄 اختيار الملف
            </button>
            <span className={uploadFile ? '' : 'muted'}>
              {uploadFile ? `✔ ${uploadFile.name}` : `ماكو ملف مختار — الحد ${MAX_ATTACH_MB} ميغا`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button type="button" className="btn btn-primary" disabled={uploading || !uploadFile} onClick={submitUpload}>
              {uploading ? 'جاري الرفع...' : '⬆ رفع وإضافة للعروض'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setUploadOpen(false); setUploadFile(null); }}>
              إلغاء
            </button>
          </div>
        </div>
      )}

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
          {filtered.map((qt) => (
            // الملاحظة تنبثق بمرور الماوس على أي جزء من صف العرض — مو بس على الحالة
            <tr
              key={qt.id}
              onMouseEnter={() => setHoveredRow(qt.id)}
              onMouseLeave={() => setHoveredRow((r) => (r === qt.id ? null : r))}
            >
              <td style={{ whiteSpace: 'nowrap' }}>
                {qt.quote_number}
                {isUploaded(qt) && (
                  <div
                    title="عرض جاهز مرفوع من خارج البرنامج"
                    style={{
                      display: 'inline-block', marginRight: 4, background: '#eaf3fb', color: '#1a5a9c',
                      border: '1px solid #bcd6ec', borderRadius: 10, padding: '1px 7px',
                      fontSize: '0.7rem', fontWeight: 700,
                    }}
                  >
                    📤 مرفوع
                  </div>
                )}
              </td>
              <td>
                {qt.client_name || '-'}
                {qt.client_phone && <div className="muted" style={{ fontSize: '0.78rem' }}>{qt.client_phone}</div>}
              </td>
              <td>{qt.location || '-'}</td>
              {/* الفئة (اقتصادي/متوسط/ممتاز) ما إلها معنى بعرض مرفوع جاهز */}
              <td>{isUploaded(qt) ? 'ملف جاهز' : TIER_LABELS[qt.selected_tier] || qt.selected_tier}</td>
              <td style={{ fontWeight: 700, color: 'var(--navy)' }}>{creatorName(qt.created_by)}</td>
              <td>
                <StatusCell
                  quoteId={qt.id}
                  st={statuses[qt.id] || { level: 'normal', note: '' }}
                  editing={statusEdit?.id === qt.id}
                  statusEdit={statusEdit}
                  setStatusEdit={setStatusEdit}
                  saveStatus={saveStatus}
                  rowHovered={hoveredRow === qt.id}
                />
              </td>
              <td>{fmtDate(qt.created_at)}</td>
              <td>{fmt(qt.total_price)}</td>
              <td>
                {isUploaded(qt) ? (
                  /* ملف العرض المرفوع هو العرض نفسه — إزالته تخلي السجل فاضي، فما ننطي زر حذف */
                  <span title={qt.attachment_name} style={{ whiteSpace: 'nowrap' }}>📎 ملف العرض</span>
                ) : qt.attachment_name ? (
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
                {/* العرض المرفوع ملف جاهز بلا بنود: ما ينفتح بشاشة التعديل ولا ينبني منه PDF */}
                {isUploaded(qt) ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => downloadUploaded(qt)}>
                    ⬇ تنزيل الملف
                  </button>
                ) : (
                  <>
                    <button className="btn btn-primary btn-sm" disabled={busyId === qt.id} onClick={() => handleEdit(qt.id)}>
                      ✏ تعديل
                    </button>{' '}
                    <button className="btn btn-secondary btn-sm" onClick={() => handleExport(qt.id, qt.quote_number)}>
                      تصدير PDF{qt.attachment_name ? ' + التصميم' : ''}
                    </button>
                  </>
                )}{' '}
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
