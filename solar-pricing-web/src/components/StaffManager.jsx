import React, { useEffect, useState, useCallback } from 'react';
import { CAPABILITIES, CAPABILITY_KEYS, emptyRole, adminRole } from '../lib/staffRoles.js';

// أسماء تظهر بالسجل حتى لو ما انحفظ إلها صف بعد — حتى المشرف يشوف الفريق
// كله بنظرة بدل ما يتذكر الأسماء ويكتبها بيده. الصلاحيات الفعلية لهذي
// الأسماء تبقى بالافتراضات لحد ما ينحفظ صف.
const KNOWN = [
  'أحمد', 'حيدر', 'حوراء', 'بكر', 'علي سبتي', 'ليث كرادة',
  'براء مكتب النواعير', 'ابو يزن الطاقة الخضراء', 'مصطفى شركة سيل',
  'حسين انوار المدينه', 'محمد يعقوب كربلاء 42',
];

function rowFrom(username, role) {
  return { username, ...emptyRole(), hiddenMarkupPercent: 0, ...(role || {}), username };
}

export default function StaffManager({ canManageCodes }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [resetFor, setResetFor] = useState(null);
  const [resetCode, setResetCode] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const roles = await window.api.staff.list();
      // الأسماء المعروفة + أي اسم بالسجل — بلا تكرار
      const seen = new Set();
      const list = [];
      for (const n of KNOWN) { seen.add(n); list.push(rowFrom(n, roles[n] || Object.values(roles).find((r) => r.label === n))); }
      for (const r of Object.values(roles)) {
        if (r.label && !seen.has(r.label)) { seen.add(r.label); list.push(rowFrom(r.label, r)); }
      }
      setRows(list);
    } catch (err) {
      setMsg('تعذر قراءة السجل: ' + err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggle(i, key) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: !r[key] } : r)));
  }

  function setMarkup(i, v) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, hiddenMarkupPercent: v } : r)));
  }

  function applyPreset(i, preset) {
    setRows((rs) => rs.map((r, j) => {
      if (j !== i) return r;
      if (preset === 'admin') return { ...r, ...adminRole() };
      if (preset === 'none') return { ...r, ...emptyRole() };
      // «بياع»: يسوّي عروضاً ويضيف مواد ويملكها — بلا مخزون قديم ولا أجور ولا إعدادات
      return { ...r, ...emptyRole(), addMaterial: true };
    }));
  }

  async function save() {
    setBusy(true); setMsg('');
    try {
      await window.api.staff.save(rows);
      setMsg('انحفظت الصلاحيات ✔ — تنطبق على كل حساب بأول دخول جديد إله');
    } catch (err) {
      setMsg('تعذر الحفظ: ' + err.message);
    } finally { setBusy(false); }
  }

  async function createAccount(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const res = await window.api.staff.create({ username: newName, code: newCode });
      setMsg(`انخلق حساب «${res.username}» ✔ — يدخل باسمه والرمز اللي كتبته`);
      setRows((rs) => (rs.some((r) => r.username === res.username) ? rs : [...rs, rowFrom(res.username, null)]));
      setNewName(''); setNewCode('');
    } catch (err) {
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  const sql = resetFor && resetCode.length >= 6
    ? window.api.staff.resetCodeSql(resetFor, resetCode)
    : '';

  return (
    <div className="card staff-manager">
      <h3 style={{ color: 'var(--navy)', marginTop: 0 }}>👥 الحسابات والصلاحيات</h3>
      {msg && <div className="alert alert-info">{msg}</div>}

      {canManageCodes && (
        <form className="staff-new" onSubmit={createAccount}>
          <div className="field">
            <label>حساب جديد — الاسم</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: كرار مكتب الرشيد" />
          </div>
          <div className="field">
            <label>الرمز</label>
            <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="6 أحرف فأكثر" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>+ إنشاء</button>
        </form>
      )}

      <div className="staff-rows">
        {rows.map((r, i) => (
          <div className="staff-row" key={r.username}>
            <div className="staff-row-head">
              <b>{r.username}</b>
              <span className="staff-presets">
                <button type="button" className="btn btn-sm" onClick={() => applyPreset(i, 'admin')}>مشرف</button>
                <button type="button" className="btn btn-sm" onClick={() => applyPreset(i, 'seller')}>بياع</button>
                <button type="button" className="btn btn-sm" onClick={() => applyPreset(i, 'none')}>اطلاع فقط</button>
                {canManageCodes && (
                  <button type="button" className="btn btn-sm btn-secondary"
                    onClick={() => { setResetFor(r.username); setResetCode(''); setCopied(false); }}>
                    تبديل الرمز
                  </button>
                )}
              </span>
            </div>
            <div className="staff-caps">
              {CAPABILITY_KEYS.map((k) => (
                <label key={k} className={r[k] ? 'cap on' : 'cap'}>
                  <input type="checkbox" checked={r[k] === true} onChange={() => toggle(i, k)} />
                  {CAPABILITIES[k]}
                </label>
              ))}
              <label className="cap cap-markup">
                زيادة مخفية %
                <input
                  type="number" min="0" step="any" value={r.hiddenMarkupPercent || ''}
                  onChange={(e) => setMarkup(i, e.target.value)} placeholder="0"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-primary" onClick={save} disabled={busy}>
        {busy ? 'جاري الحفظ…' : '💾 حفظ الصلاحيات'}
      </button>

      {resetFor && (
        <div className="staff-reset">
          <h4 style={{ margin: '0 0 6px' }}>تبديل رمز «{resetFor}»</h4>
          <p className="muted" style={{ marginTop: 0, lineHeight: 1.7 }}>
            تبديل رمز حساب ثانٍ ما يصير من المتصفح — يحتاج مفتاح الخدمة، وحطّه
            بالتطبيق يعني أي واحد يفتح الكود يملك القاعدة كلها. فهذا الأمر جاهز
            ينلصق بمحرر SQL بلوحة Supabase.
          </p>
          <div className="field">
            <label>الرمز الجديد</label>
            <input value={resetCode} onChange={(e) => { setResetCode(e.target.value); setCopied(false); }} placeholder="6 أحرف فأكثر" />
          </div>
          {sql && (
            <>
              <pre className="staff-sql" dir="ltr">{sql}</pre>
              <div className="toolbar" style={{ gap: 8 }}>
                <button type="button" className="btn btn-primary"
                  onClick={() => { navigator.clipboard?.writeText(sql); setCopied(true); }}>
                  {copied ? 'انتسخ ✔' : '📋 انسخ الأمر'}
                </button>
                <button type="button" className="btn" onClick={() => setResetFor(null)}>إغلاق</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
