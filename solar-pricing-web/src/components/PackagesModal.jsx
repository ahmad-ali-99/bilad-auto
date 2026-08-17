import React, { useState, useEffect } from 'react';
import ModalPortal from './ModalPortal.jsx';
import { humanizeSaveError } from '../lib/saveErrors.js';
import { computeSecondaryDefaults } from '../lib/secondaryDefaults.js';
import { buildPackagesPosterHtml, buildPackageRow, POSTER_W, POSTER_H } from '../lib/packagesPoster.js';
import { exportPosterPng } from '../lib/pdfExport.js';

// باقة فارغة — البياع يكتب الأمبير والبرنامج يطلع الباقي.
// `pick` = اختيار يدوي للمادة من المخزون؛ فارغ = يخليها للبرنامج حسب الجودة.
const blankRow = (amp) => ({
  ampDay: String(amp), ampNight: String(amp), hours: '8', tier: 'economy',
  pick: { panel: '', inverter: '', battery: '' },
});

const TIERS = [
  { key: 'economy', label: 'اقتصادي' },
  { key: 'standard', label: 'متوسط' },
  { key: 'premium', label: 'ممتاز' },
];

const PICKERS = [
  { key: 'panel', label: 'اللوح' },
  { key: 'inverter', label: 'الانفيرتر' },
  { key: 'battery', label: 'البطارية' },
];

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

export default function PackagesModal({ onClose }) {
  const [rows, setRows] = useState([blankRow(10), blankRow(20), blankRow(30)]);
  const [installment, setInstallment] = useState(true);
  const [installmentPlan, setInstallmentPlan] = useState('company');
  const [warranty, setWarranty] = useState({ panel: '', inverter: '5 سنوات', battery: '10 سنوات' });
  const [title, setTitle] = useState('باقات الطاقة الشمسية');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);   // { html, packs }
  const [company, setCompany] = useState({});
  const [materials, setMaterials] = useState([]);
  const [secondarySel, setSecondarySel] = useState(null);

  // المخزون والمواد الثانوية الافتراضية تنجلب مرة وحدة — نفس مصدر شاشة العرض
  useEffect(() => {
    window.api.company.get().then(setCompany).catch(() => {});
    Promise.all([window.api.materials.list(), window.api.config.get('secondary_defaults')])
      .then(([all, savedIds]) => {
        const active = (all || []).filter((m) => m.active !== false);
        setMaterials(active);
        setSecondarySel(computeSecondaryDefaults(active.filter((m) => m.category === 'secondary'), savedIds, 'full'));
      })
      .catch((err) => setError(humanizeSaveError(err)));
  }, []);

  const byCategory = (c) => materials.filter((m) => m.category === c);
  const secondaryNames = secondarySel
    ? materials.filter((m) => secondarySel[m.id]).map((m) => m.model || m.brand)
    : [];

  const setRow = (i, field, value) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, [field]: value } : r)));
  const setPick = (i, cat, value) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, pick: { ...r.pick, [cat]: value } } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow(10)]);
  const removeRow = (i) => setRows((rs) => rs.filter((_, k) => k !== i));

  // كل باقة تمرّ بنفس مسار المعاينة اللي تشتغل بيه شاشة العرض — نفس المخزون ونفس
  // المواد الثانوية المعتمدة ونفس التقسيط. ماكو حساب موازٍ ينحرف عن البرنامج.
  async function compute() {
    setBusy(true);
    setError('');
    try {
      if (secondarySel == null) throw new Error('لسه ما وصل المخزون — انطر ثانية وجرّب');
      const images = await window.api.materials.images();
      const packs = [];
      const problems = [];
      for (const [i, r] of rows.entries()) {
        const ampDay = Number(r.ampDay) || 0;
        const ampNight = Number(r.ampNight) || 0;
        if (ampDay <= 0 && ampNight <= 0) continue;
        const overrides = {};
        for (const { key } of PICKERS) if (r.pick[key]) overrides[key] = Number(r.pick[key]);
        const { draft } = await window.api.quotes.preview({
          // المنشور مو لسطح زبون معيّن — فماكو قيد مساحة، وإلا طلع خطأ «المساحة ما تكفي»
          // بكل باقة وهو خطأ ما إله معنى بمنشور إعلاني.
          roofAreaM2: Number.MAX_SAFE_INTEGER,
          ampDay, ampNight,
          nightSupplyHours: r.hours === '' ? null : Number(r.hours),
          tier: r.tier, overrides,
          // نفس المواد الثانوية المعتمدة بشاشة العرض. لو مررناها null يرجع المحرك
          // للسلوك القديم ويحشر كل مادة ثانوية بالمخزون بكل باقة — وهذا يضاعف
          // المجموع أضعافاً بلا ما ينتبه أحد.
          secondarySelections: secondarySel,
          adjustments: { markupPercent: 0, markupMode: 'visible', discountPercent: 0 },
          installment, installmentPlan, extraUnits: null, unitCounts: null, systemType: null,
        });
        for (const msg of Object.values(draft.errors || {})) problems.push(`الباقة ${i + 1}: ${msg}`);
        packs.push({ draft, row: buildPackageRow({ draft, materials, images, ampDay, ampNight }) });
      }
      if (packs.length === 0) throw new Error('اكتب الأمبير لباقة وحدة على الأقل');
      // المسودة الناقصة ما تنطبع منشوراً — ينعرض الخطأ ويوقف
      if (problems.length > 0) throw new Error(problems.join('\n'));
      const html = buildPackagesPosterHtml({
        packages: packs.map((p) => p.row), company, warranty, title,
        logo: `${import.meta.env.BASE_URL || '/'}logo-mark.png`,
      });
      setPreview({ html, packs });
    } catch (err) {
      setError(humanizeSaveError(err));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      await exportPosterPng(preview.html, `${title || 'باقات'}.png`, { width: POSTER_W, height: POSTER_H, scale: 2 });
    } catch (err) {
      setError(humanizeSaveError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal>
    <div className="modal-overlay">
      <div className="modal modal-wide">
        <h3>🖼 منشور الباقات</h3>
        <div className="modal-body">
        <p className="muted">
          اكتب أمبير كل باقة والبرنامج يطلع الألواح والانفيرتر والبطاريات والمجموع من مخزونك وأسعارك —
          بنفس حساب شاشة العرض بالضبط. تكدر تثبّت أي مادة بيدك من قوائم المخزون.
        </p>

        {/* كل باقة بلوك مستقل — بالتلفون الجدول العريض يطلع نصه برّا الشاشة */}
        <div className="pkg-rows">
          {rows.map((r, i) => (
            <div className="card pkg-row" key={i}>
              <div className="pkg-row-head">
                <b>الباقة {String(i + 1).padStart(2, '0')}</b>
                {rows.length > 1 && (
                  <button className="btn btn-danger btn-sm" onClick={() => removeRow(i)}>حذف</button>
                )}
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>أمبير نهاراً</label>
                  <input type="number" min="0" value={r.ampDay} onChange={(e) => setRow(i, 'ampDay', e.target.value)} />
                </div>
                <div className="field">
                  <label>أمبير ليلاً</label>
                  <input type="number" min="0" value={r.ampNight} onChange={(e) => setRow(i, 'ampNight', e.target.value)} />
                </div>
                <div className="field">
                  <label>ساعات التجهيز الليلي</label>
                  <input type="number" min="1" value={r.hours} onChange={(e) => setRow(i, 'hours', e.target.value)} />
                </div>
                <div className="field">
                  <label>الجودة (إذا ما ثبّت المواد بيدك)</label>
                  <select value={r.tier} onChange={(e) => setRow(i, 'tier', e.target.value)}>
                    {TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                {PICKERS.map(({ key, label }) => (
                  <div className="field" key={key}>
                    <label>{label}</label>
                    <select value={r.pick[key]} onChange={(e) => setPick(i, key, e.target.value)}>
                      <option value="">تلقائي — حسب الجودة</option>
                      {byCategory(key).map((m) => (
                        <option key={m.id} value={m.id}>
                          {[m.brand, m.model].filter(Boolean).join(' ')} — {fmt(m.price)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={addRow}>+ باقة</button>

        {secondarySel && (
          <p className="muted" style={{ marginTop: 10 }}>
            المواد الثانوية المشمولة (نفس المعتمدة بشاشة العرض):{' '}
            {secondaryNames.length ? <b>{secondaryNames.join(' · ')}</b> : <b>لا شيء</b>}
            {' — '}تتعدل من نافذة المواد الثانوية بشاشة العرض.
          </p>
        )}

        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>عنوان المنشور</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>ضمان الألواح (يُكتب بالمنشور)</label>
            <input type="text" value={warranty.panel} onChange={(e) => setWarranty((w) => ({ ...w, panel: e.target.value }))} placeholder="مثال: 15 سنة" />
          </div>
          <div className="field">
            <label>ضمان الانفيرتر</label>
            <input type="text" value={warranty.inverter} onChange={(e) => setWarranty((w) => ({ ...w, inverter: e.target.value }))} />
          </div>
          <div className="field">
            <label>ضمان البطاريات</label>
            <input type="text" value={warranty.battery} onChange={(e) => setWarranty((w) => ({ ...w, battery: e.target.value }))} />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontWeight: 700, color: 'var(--navy)', cursor: 'pointer' }}>
          <input type="checkbox" checked={installment} onChange={(e) => setInstallment(e.target.checked)} style={{ width: 18, height: 18 }} />
          🏦 أسعار بالتقسيط (يطلع عمود القسط الشهري)
        </label>
        {installment && (
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {[{ k: 'company', l: 'مصرف النهرين' }, { k: 'cbi', l: 'مبادرة البنك المركزي' }].map((pl) => (
              <button
                key={pl.k} type="button" className={`btn btn-sm ${installmentPlan === pl.k ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setInstallmentPlan(pl.k)}
              >
                {pl.l}
              </button>
            ))}
          </div>
        )}

        {error && <div className="alert alert-danger" style={{ marginTop: 12, whiteSpace: 'pre-line' }}>⚠ {error}</div>}

        {/* تفصيل كل باقة — البياع يشوف من وين طلع الرقم قبل ما ينشره */}
        {preview && (
          <div style={{ marginTop: 14 }}>
            <h4 style={{ margin: '0 0 6px' }}>تفصيل الحساب</h4>
            {preview.packs.map((p, i) => (
              <details key={i} className="card" style={{ marginBottom: 8, padding: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 800, color: 'var(--navy)' }}>
                  الباقة {String(i + 1).padStart(2, '0')} — {fmt(p.draft.total)} دينار
                  {p.draft.installment ? ` (قسط شهري ${fmt(p.draft.installment.monthly)} لمدة ${p.draft.installment.months} شهر)` : ''}
                </summary>
                <div className="table-scroll" style={{ marginTop: 8 }}>
                  <table className="data-table">
                    <thead><tr><th>المادة</th><th>العدد</th><th>سعر الوحدة</th><th>المجموع</th></tr></thead>
                    <tbody>
                      {p.draft.items.map((it, k) => (
                        <tr key={k}>
                          <td>{it.description}</td>
                          <td>{fmt(it.quantity)} {it.unit}</td>
                          <td>{fmt(it.unit_price)}</td>
                          <td>{fmt(it.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {Object.values(p.draft.warnings || {}).map((w, k) => (
                  <div className="alert alert-info" key={k} style={{ marginTop: 8 }}>{w}</div>
                ))}
              </details>
            ))}
          </div>
        )}

        {preview && (() => {
          // المعاينة تُصغَّر بـtransform، والحاوية تاخذ الارتفاع المصغَّر — بدونها
          // يبقى مربع فاضي بارتفاع 1080 تحت المعاينة
          const k = Math.min(1, 760 / POSTER_W);
          return (
            <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff', width: POSTER_W * k, height: POSTER_H * k, marginInline: 'auto', maxWidth: '100%' }}>
              <div
                style={{ width: POSTER_W, height: POSTER_H, transform: `scale(${k})`, transformOrigin: 'top right' }}
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            </div>
          );
        })()}

        </div>
        <div className="toolbar modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>إغلاق</button>
          <button className="btn btn-secondary" onClick={compute} disabled={busy}>
            {busy ? '⏳ جاري الحساب…' : '🧮 احسب واعرض'}
          </button>
          <button className="btn btn-primary" onClick={download} disabled={busy || !preview}>
            ⬇ تنزيل المنشور PNG
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
