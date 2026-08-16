import React, { useState, useEffect } from 'react';
import ModalPortal from './ModalPortal.jsx';
import { humanizeSaveError } from '../lib/saveErrors.js';
import { buildPackagesPosterHtml, buildPackageRow, POSTER_W, POSTER_H } from '../lib/packagesPoster.js';
import { exportPosterPng } from '../lib/pdfExport.js';

// باقة فارغة — البياع يكتب الأمبير والبرنامج يطلع الباقي
const blankRow = (amp) => ({ ampDay: String(amp), ampNight: String(amp), hours: '8', tier: 'economy' });

const TIERS = [
  { key: 'economy', label: 'اقتصادي' },
  { key: 'standard', label: 'متوسط' },
  { key: 'premium', label: 'ممتاز' },
];

export default function PackagesModal({ onClose }) {
  const [rows, setRows] = useState([blankRow(10), blankRow(20), blankRow(30)]);
  const [installment, setInstallment] = useState(true);
  const [installmentPlan, setInstallmentPlan] = useState('company');
  const [warranty, setWarranty] = useState({ panel: '', inverter: '5 سنوات', battery: '10 سنوات' });
  const [title, setTitle] = useState('باقات الطاقة الشمسية');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);   // { html, rows }
  const [company, setCompany] = useState({});

  useEffect(() => {
    window.api.company.get().then(setCompany).catch(() => {});
  }, []);

  const setRow = (i, field, value) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, [field]: value } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow(10)]);
  const removeRow = (i) => setRows((rs) => rs.filter((_, k) => k !== i));

  // كل باقة تمرّ بنفس مسار المعاينة اللي تشتغل بيه شاشة العرض — نفس المخزون
  // ونفس الأسعار ونفس التقسيط. ماكو حساب موازٍ ينحرف عن البرنامج.
  async function compute() {
    setBusy(true);
    setError('');
    try {
      const materials = await window.api.materials.list();
      const images = await window.api.materials.images();
      const out = [];
      for (const r of rows) {
        const ampDay = Number(r.ampDay) || 0;
        const ampNight = Number(r.ampNight) || 0;
        if (ampDay <= 0 && ampNight <= 0) continue;
        const { draft } = await window.api.quotes.preview({
          roofAreaM2: 0, ampDay, ampNight,
          nightSupplyHours: r.hours === '' ? null : Number(r.hours),
          tier: r.tier, overrides: {}, secondarySelections: null,
          adjustments: { markupPercent: 0, markupMode: 'visible', discountPercent: 0 },
          installment, installmentPlan, extraUnits: null, unitCounts: null, systemType: null,
        });
        out.push(buildPackageRow({ draft, materials, images, ampDay, ampNight }));
      }
      if (out.length === 0) throw new Error('اكتب الأمبير لباقة وحدة على الأقل');
      const html = buildPackagesPosterHtml({
        packages: out, company, warranty, title,
        logo: `${import.meta.env.BASE_URL || '/'}logo-mark.png`,
      });
      setPreview({ html, rows: out });
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>🖼 منشور الباقات</h3>
        <p className="muted">
          اكتب أمبير كل باقة والبرنامج يطلع الألواح والانفيرتر والبطاريات والمجموع من مخزونك وأسعارك —
          ثم ينزل المنشور صورة جاهزة للنشر بمقاس {POSTER_W}×{POSTER_H}.
        </p>

        <div className="import-table-wrap" style={{ maxHeight: '34dvh' }}>
          <table className="data-table import-table">
            <thead>
              <tr>
                <th>الباقة</th><th>أمبير نهاراً</th><th>أمبير ليلاً</th>
                <th>ساعات التجهيز</th><th>الجودة</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 800, color: 'var(--navy)' }}>{String(i + 1).padStart(2, '0')}</td>
                  <td><input type="number" min="0" value={r.ampDay} onChange={(e) => setRow(i, 'ampDay', e.target.value)} /></td>
                  <td><input type="number" min="0" value={r.ampNight} onChange={(e) => setRow(i, 'ampNight', e.target.value)} /></td>
                  <td><input type="number" min="1" value={r.hours} onChange={(e) => setRow(i, 'hours', e.target.value)} /></td>
                  <td>
                    <select value={r.tier} onChange={(e) => setRow(i, 'tier', e.target.value)}>
                      {TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </td>
                  <td>
                    {rows.length > 1 && (
                      <button className="btn btn-danger btn-sm" onClick={() => removeRow(i)}>حذف</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={addRow}>+ باقة</button>

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

        {preview && (() => {
          // المعاينة تُصغَّر بـtransform، والحاوية تاخذ الارتفاع المصغَّر — بدونها
          // يبقى مربع فاضي بارتفاع 1080 تحت المعاينة
          const k = Math.min(1, 760 / POSTER_W);
          return (
            <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff', width: POSTER_W * k, height: POSTER_H * k, marginInline: 'auto' }}>
              <div
                style={{ width: POSTER_W, height: POSTER_H, transform: `scale(${k})`, transformOrigin: 'top right' }}
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            </div>
          );
        })()}

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
