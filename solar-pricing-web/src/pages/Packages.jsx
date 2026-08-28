import React, { useState, useEffect, useMemo, useRef } from 'react';
import { humanizeSaveError } from '../lib/saveErrors.js';
import { computeSecondaryDefaults } from '../lib/secondaryDefaults.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';
import { buildPackagesPosterHtml, buildPackageRow, POSTER_W, POSTER_H } from '../lib/packagesPoster.js';
import { exportPosterPng } from '../lib/pdfExport.js';

// باقة فارغة — البياع يكتب الأمبير والبرنامج يطلع الباقي.
// `pick` = تثبيت مادة من المخزون؛ فارغ = يخليها للبرنامج حسب الجودة.
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

const STATE_KEY = 'packages_state_v1';
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY)) || null;
  } catch {
    return null;
  }
}

export default function Packages() {
  const saved = useRef(readSaved()).current;
  const [rows, setRows] = useState(saved?.rows ?? [blankRow(10), blankRow(20), blankRow(30)]);
  const [installment, setInstallment] = useState(saved?.installment ?? true);
  const [installmentPlan, setInstallmentPlan] = useState(saved?.installmentPlan ?? 'company');
  const [warranty, setWarranty] = useState(saved?.warranty ?? { panel: '', inverter: '5 سنوات', battery: '10 سنوات' });
  const [title, setTitle] = useState(saved?.title ?? 'باقات الطاقة الشمسية');
  const [downloading, setDownloading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);   // { html, packs }
  const [detailOpen, setDetailOpen] = useState(false);
  const [company, setCompany] = useState({});
  const [materials, setMaterials] = useState([]);
  const [images, setImages] = useState({});
  const [secondarySel, setSecondarySel] = useState(null);

  // المخزون والصور والمواد الثانوية المعتمدة — نفس مصادر شاشة العرض
  useEffect(() => {
    window.api.company.get().then(setCompany).catch(() => {});
    window.api.materials.images().then(setImages).catch(() => {});
    Promise.all([window.api.materials.list(), window.api.config.get('secondary_defaults')])
      .then(([all, savedIds]) => {
        const active = (all || []).filter((m) => m.active !== false);
        setMaterials(active);
        setSecondarySel(computeSecondaryDefaults(active.filter((m) => m.category === 'secondary'), savedIds, 'full'));
      })
      .catch((err) => setError(humanizeSaveError(err)));
  }, []);

  // الإعدادات تبقى بين الزيارات — يرجع للتبويب فيلگى باقاته مثل ما تركها
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STATE_KEY, JSON.stringify({ rows, installment, installmentPlan, warranty, title }));
      } catch { /* التخزين ممتلئ أو محجوب — الشاشة تشتغل عادي بلا حفظ */ }
    }, 400);
    return () => clearTimeout(t);
  }, [rows, installment, installmentPlan, warranty, title]);

  const byCategory = (c) => materials.filter((m) => m.category === c);
  const secondaryNames = secondarySel
    ? materials.filter((m) => secondarySel[m.id]).map((m) => m.model || m.brand)
    : [];

  const setRow = (i, field, value) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, [field]: value } : r)));
  const setPick = (i, cat, value) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, pick: { ...r.pick, [cat]: value } } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow(10)]);
  const removeRow = (i) => setRows((rs) => rs.filter((_, k) => k !== i));

  // useMemo ضروري: بدونه الكائن يتجدد بكل رندر فالمؤقت ينعاد وتصير حلقة حساب لا تنتهي
  const inputs = useMemo(
    () => ({ rows, installment, installmentPlan, title, warranty }),
    [rows, installment, installmentPlan, title, warranty]
  );
  const debounced = useDebouncedValue(inputs, 400);

  // حساب حي: أي تعديل بأمبير أو مادة أو ضمان يعيد بناء المنشور لحاله بعد ما تهدأ
  // الكتابة — ماكو زر «احسب» ينضغط بعد كل تغيير.
  useEffect(() => {
    if (secondarySel == null || materials.length === 0) return;
    let cancelled = false;
    const run = async () => {
      setCalculating(true);
      try {
        const packs = [];
        const problems = [];
        for (const [i, r] of debounced.rows.entries()) {
          const ampDay = Number(r.ampDay) || 0;
          const ampNight = Number(r.ampNight) || 0;
          if (ampDay <= 0 && ampNight <= 0) continue;
          const overrides = {};
          for (const { key } of PICKERS) if (r.pick[key]) overrides[key] = Number(r.pick[key]);
          const { draft } = await window.api.quotes.preview({
            // منشور إعلاني مو لسطح زبون معيّن — فماكو قيد مساحة
            roofAreaM2: Number.MAX_SAFE_INTEGER,
            ampDay, ampNight,
            nightSupplyHours: r.hours === '' ? null : Number(r.hours),
            tier: r.tier, overrides,
            // نفس المواد الثانوية المعتمدة بشاشة العرض — `null` يحشر كل مخزونك بكل باقة
            secondarySelections: secondarySel,
            adjustments: { markupPercent: 0, markupMode: 'visible', discountPercent: 0 },
            installment: debounced.installment, installmentPlan: debounced.installmentPlan,
            extraUnits: null, unitCounts: null, systemType: null,
          });
          for (const msg of Object.values(draft.errors || {})) problems.push(`الباقة ${i + 1}: ${msg}`);
          packs.push({ draft, row: buildPackageRow({ draft, materials, images, ampDay, ampNight }) });
        }
        if (cancelled) return;
        if (packs.length === 0) {
          setResult(null);
          setError('اكتب الأمبير لباقة وحدة على الأقل');
          return;
        }
        if (problems.length > 0) {
          setResult(null);
          setError(problems.join('\n'));
          return;
        }
        setError('');
        setResult({
          packs,
          html: buildPackagesPosterHtml({
            packages: packs.map((p) => p.row), company,
            warranty: debounced.warranty, title: debounced.title,
            logo: `${import.meta.env.BASE_URL || '/'}logo-mark.png`,
          }),
        });
      } catch (err) {
        if (!cancelled) { setError(humanizeSaveError(err)); setResult(null); }
      } finally {
        if (!cancelled) setCalculating(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [debounced, secondarySel, materials, images, company]);

  async function download() {
    if (!result) return;
    setDownloading(true);
    setError('');
    try {
      await exportPosterPng(result.html, `${title || 'باقات'}.png`, { width: POSTER_W, height: POSTER_H, scale: 2 });
    } catch (err) {
      setError(humanizeSaveError(err));
    } finally {
      setDownloading(false);
    }
  }

  const k = Math.min(1, 900 / POSTER_W);

  return (
    <div>
      <div className="toolbar">
        <h2 className="page-title" style={{ margin: 0 }}>🖼 الباقات</h2>
        <button className="btn btn-primary" onClick={download} disabled={downloading || !result}>
          {downloading ? '⏳ جاري التنزيل…' : '⬇ تنزيل المنشور PNG'}
        </button>
      </div>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          اكتب أمبير كل باقة والبرنامج يطلع الألواح والانفيرتر والبطاريات والمجموع من مخزونك وأسعارك —
          بنفس حساب شاشة العرض. المنشور يتحدث لحاله مع كل تعديل، ومقاسه {POSTER_W}×{POSTER_H} جاهز للنشر.
        </p>

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
          </p>
        )}
      </div>

      <div className="card">
        <div className="opt-group" style={{ marginTop: 0 }}>
          <div className="opt-group-title">نصوص المنشور</div>
          <div className="grid-2">
            <div className="field">
              <label>عنوان المنشور</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label>ضمان الألواح</label>
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
        </div>

        <div className="opt-group">
          <div className="opt-group-title">التقسيط</div>
          <label className="opt-line">
            <input type="checkbox" checked={installment} onChange={(e) => setInstallment(e.target.checked)} />
            <span>
              <b>🏦 أسعار بالتقسيط</b>
              <small className="muted">يطلع عمود «القسط الشهري» بالمنشور. بلا تأشير يطلع المبلغ الكلي نقداً.</small>
            </span>
          </label>
          {installment && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {[{ k: 'company', l: 'مصرف النهرين' }, { k: 'ahli', l: 'المصرف الأهلي العراقي' }].map((pl) => (
                <button
                  key={pl.k} type="button"
                  className={`btn btn-sm ${installmentPlan === pl.k ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setInstallmentPlan(pl.k)}
                >
                  {pl.l}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ whiteSpace: 'pre-line' }}>⚠ {error}</div>}

      {result && (
        <div className="card">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setDetailOpen((o) => !o)}
          >
            🧾 تفصيل الحساب {detailOpen ? '▲' : '▼'}
          </button>
          {detailOpen && result.packs.map((p, i) => (
            <div key={i} style={{ marginTop: 10 }}>
              <b style={{ color: 'var(--navy)' }}>
                الباقة {String(i + 1).padStart(2, '0')} — {fmt(p.draft.total)} دينار
                {p.draft.installment ? ` (قسط شهري ${fmt(p.draft.installment.monthly)} لمدة ${p.draft.installment.months} شهر)` : ''}
              </b>
              <div className="table-scroll" style={{ marginTop: 6 }}>
                <table className="data-table">
                  <thead><tr><th>المادة</th><th>العدد</th><th>سعر الوحدة</th><th>المجموع</th></tr></thead>
                  <tbody>
                    {p.draft.items.map((it, n) => (
                      <tr key={n}>
                        <td>{it.description}</td>
                        <td>{fmt(it.quantity)} {it.unit}</td>
                        <td>{fmt(it.unit_price)}</td>
                        <td>{fmt(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ position: 'relative' }}>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <b style={{ color: 'var(--navy)' }}>معاينة المنشور</b>
          {calculating && <span className="muted">⏳ جاري التحديث…</span>}
        </div>
        {result ? (
          // المعاينة تُصغَّر بـtransform والحاوية تاخذ الارتفاع المصغَّر — بدونها
          // يبقى مربع فاضي بارتفاع ١٠٨٠ تحتها
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff', width: POSTER_W * k, height: POSTER_H * k, maxWidth: '100%', marginInline: 'auto', opacity: calculating ? 0.55 : 1, transition: 'opacity .15s' }}>
            <div
              style={{ width: POSTER_W, height: POSTER_H, transform: `scale(${k})`, transformOrigin: 'top right' }}
              dangerouslySetInnerHTML={{ __html: result.html }}
            />
          </div>
        ) : (
          <p className="muted" style={{ textAlign: 'center', padding: 20 }}>
            {calculating ? '⏳ جاري الحساب…' : 'اكتب أمبير باقة وحدة على الأقل ليطلع المنشور'}
          </p>
        )}
      </div>
    </div>
  );
}
