import React, { useState, useEffect } from 'react';
import { logActivity } from '../lib/activityLog.js';
import {
  CATEGORIES, categoryOf, applyUndo, undoInfo, hasDraft, undoneIds,
  UNDO, DRAFT, UNDONE, CAT, isReservedKey,
} from '../lib/activityUndo.js';

// سجل الحركات (الهستوري) — تظهر لحساب المشرف أحمد فقط (الحماية الفعلية بـRLS بقاعدة البيانات):
// كل حفظ/تعديل/حذف/تحويل/تغيير حالة داخل التطبيق، منو سواه وبأي حساب ووقتها.
// وكل حركة تحمل معها لقطة استرجاع — زر واحد يرجّع الشي مثل ما كان.
const ACTION_ICONS = {
  'حفظ عرض جديد': '🆕',
  'رفع عرض جاهز': '📤',
  'تعديل عرض': '✏️',
  'تعديل عرض + تحويل الحساب': '🔁',
  'حذف عرض (لسلة المحذوفات)': '🗑️',
  'استرجاع عرض من سلة المحذوفات': '♻️',
  'تفريغ سلة المحذوفات نهائياً': '🗑️',
  'تغيير حالة عرض': '🚦',
  'تصدير PDF لعرض محفوظ': '📄',
  'تصدير PDF معاينة (بلا حفظ)': '📄',
  'إرفاق تصميم بعرض': '📎',
  'حذف مرفق عرض': '📎',
  'إضافة مادة': '📦',
  'تعديل مادة': '📦',
  'حذف مادة': '🗑️',
  'استيراد إكسل للمخزون': '📥',
  'تفعيل مادة بالعروض': '☑️',
  'إخفاء مادة من العروض': '🚫',
  'إضافة أجور عمل': '🔧',
  'تعديل أجور عمل': '🔧',
  'حذف أجور عمل': '🗑️',
  'تعديل إعدادات الحساب': '⚙️',
  'تعديل إعداد مشترك': '⚙️',
  'تعديل ملف الشركة': '🏢',
  'حذف جهة تواصل زائر': '🗑️',
  'حذف طلب عرض زبون': '🗑️',
  'استرجاع حركة': '↩️',
};

const fmtVal = (v) => (typeof v === 'number' ? Math.round(v).toLocaleString('en-US') : String(v));

// المفاتيح المحجوزة (اللقطات) ما تنعرض — هي بيانات للبرنامج مو للقراءة
function detailsText(details) {
  if (!details || typeof details !== 'object') return '';
  return Object.entries(details)
    .filter(([k]) => !isReservedKey(k))
    .map(([k, v]) => `${k}: ${fmtVal(v)}`)
    .join(' — ');
}

const MAX_DETAILS_CHARS = 150;

function fmtTime(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

// الحسابات المرقمة تظهر بالرقم فقط — نفس بقية الصفحات
const displayUser = (r) => (r.user_name || r.user_email || 'غير معروف').replace(/^مستخدم(?=[0-9])/, '');

export default function History({ onRestoreDraft }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [category, setCategory] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [flash, setFlash] = useState('');

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

  // استرجاع حركة: ينفّذ القلب، ثم يسجّل حركة استرجاع تحمل معرّف الأصل —
  // بيها الواجهة تعرف إن الأصل انسترجع وتطفي زره (بلا أي تعديل على صفوف السجل نفسه)
  async function undo(entry) {
    const info = undoInfo(entry);
    if (!info.can) return;
    const when = fmtTime(entry.created_at);
    if (!confirm(`${info.confirm}\n\nالحركة بتاريخ ${when} من حساب ${displayUser(entry)}.\nإذا أحد غيّر نفس الشي بعدها، الاسترجاع راح يكتب فوق تعديله.\n\nتكمل؟`)) return;
    setBusyId(entry.id);
    setFlash('');
    try {
      await applyUndo(entry);
      logActivity('استرجاع حركة', entry.entity, {
        'الحركة المسترجعة': entry.action,
        'وقتها': when,
        'حسابها': displayUser(entry),
        [UNDONE]: entry.id,
        [CAT]: categoryOf(entry.action, entry.details),
        [UNDO]: { kind: 'none', why: 'حركة استرجاع — ما تنسترجع مرة ثانية' },
      });
      setFlash(`تم الاسترجاع ✔ — ${info.label}`);
      // التسجيل «أطلق وانسَ»، فنمهل الإدراج لحظة قبل إعادة القراءة
      setTimeout(load, 700);
    } catch (e) {
      setError('تعذر الاسترجاع: ' + e.message);
    } finally {
      setBusyId(null);
    }
  }

  // العرض المُصدَّر بلا حفظ: مدخلاته كاملة محفوظة باللقطة — نفتحه بالمحرر أو نحفظه فوراً
  function openDraft(entry) {
    const input = entry.details?.[DRAFT];
    if (!input || !onRestoreDraft) return;
    // المحرر يقرأ التقسيط من داخل adjustments، بينما مدخلات الحفظ تخليه بالأعلى —
    // نوحّدهما هنا وإلا يرجع العرض بلا تقسيط
    onRestoreDraft({
      ...input,
      editing: null,
      adjustments: {
        ...(input.adjustments || {}),
        installment: input.installment ? { enabled: true, plan: input.installmentPlan || 'company' } : null,
      },
    });
  }

  async function saveDraft(entry) {
    const input = entry.details?.[DRAFT];
    if (!input) return;
    if (!confirm(`حفظ عرض «${input.clientName || 'بلا اسم'}» برقم عرض جديد؟`)) return;
    setBusyId(entry.id);
    setFlash('');
    try {
      const saved = await window.api.quotes.save(input);
      setFlash(`تم حفظ العرض رقم ${saved.quote_number} ✔`);
      setTimeout(load, 700);
    } catch (e) {
      setError('تعذر الحفظ: ' + e.message);
    } finally {
      setBusyId(null);
    }
  }

  const all = rows || [];
  const undone = undoneIds(all);
  const users = [...new Set(all.map(displayUser))];
  const q = search.trim();

  // البحث وفلتر الحساب ينطبقون قبل عدّ الفئات — العدّاد يعكس اللي راح تشوفه فعلاً
  const preFiltered = all.filter((r) => {
    if (userFilter && displayUser(r) !== userFilter) return false;
    if (!q) return true;
    return [r.action, r.entity, displayUser(r), detailsText(r.details)].join(' ').includes(q);
  });
  const counts = {};
  for (const r of preFiltered) {
    const c = categoryOf(r.action, r.details);
    counts[c] = (counts[c] || 0) + 1;
  }
  counts.all = preFiltered.length;
  const filtered = category === 'all' ? preFiltered : preFiltered.filter((r) => categoryOf(r.action, r.details) === category);
  // الفئات الفارغة تُخفى حتى ما يمتلئ الشريط بأزرار بلا فائدة
  const shownCategories = CATEGORIES.filter((c) => c.key === 'all' || c.key === category || counts[c.key] > 0);

  return (
    <div>
      <h2 className="page-title">🕓 سجل الحركات</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        كل حركة داخل التطبيق: منو سواها، بأي حساب، ووقتها — وأغلبها تنسترجع بضغطة إذا أحد غيّر شي بالغلط.
      </p>

      <div className="card" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 10 }}>
        {shownCategories.map((c) => {
          const active = category === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              style={{
                border: `1px solid ${active ? 'var(--navy)' : '#d5dde6'}`,
                background: active ? 'var(--navy)' : '#fff',
                color: active ? '#fff' : 'var(--navy)',
                borderRadius: 20, padding: '5px 12px', fontWeight: 700, fontSize: '0.85em', cursor: 'pointer',
              }}
            >
              {c.icon} {c.label}
              <span style={{ opacity: 0.7, marginInlineStart: 5 }}>{counts[c.key] || 0}</span>
            </button>
          );
        })}
      </div>

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

      {flash && <div className="alert alert-success">{flash}</div>}
      {error && <div className="alert alert-warning">{error}</div>}
      {rows === null && <div className="muted" style={{ textAlign: 'center', padding: 20 }}>⏳ جاري التحميل...</div>}
      {rows !== null && !filtered.length && !error && (
        <div className="muted" style={{ textAlign: 'center', padding: 20 }}>ماكو حركات بهذه الفئة.</div>
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
                <th style={{ whiteSpace: 'nowrap' }}>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const text = detailsText(r.details);
                const info = undoInfo(r);
                const isUndone = undone.has(r.id);
                const busy = busyId === r.id;
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82em' }} dir="ltr">{fmtTime(r.created_at)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{displayUser(r)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {ACTION_ICONS[r.action] || '•'} {r.action}
                      {r.entity ? <span className="muted" style={{ fontSize: '0.8em' }}> ({r.entity})</span> : null}
                    </td>
                    <td style={{ fontSize: '0.85em' }} title={text}>
                      {text.length > MAX_DETAILS_CHARS ? text.slice(0, MAX_DETAILS_CHARS) + '…' : text}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {hasDraft(r) ? (
                        <span style={{ display: 'inline-flex', gap: 4 }}>
                          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => openDraft(r)} title="يرجّع كل مدخلات العرض لصفحة الإنشاء">
                            ↩️ افتحه بالمحرر
                          </button>
                          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => saveDraft(r)} title="يحفظه فوراً برقم عرض جديد">
                            {busy ? '⏳' : '💾 احفظه'}
                          </button>
                        </span>
                      ) : isUndone ? (
                        <span className="muted" style={{ fontSize: '0.8em' }}>✓ تم استرجاعها</span>
                      ) : info.can ? (
                        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => undo(r)} title={info.confirm}>
                          {busy ? '⏳' : `↩️ ${info.label}`}
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.78em' }}>{info.why}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
