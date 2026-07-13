import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// واجهة الزبون (دخول Google): حاسبة تسعير مبسطة — نفس محرك الشركة بالدستور المعتمد،
// بدون أي أدوات إدارية. بوابة الهاتف أولاً (تبني قاعدة تواصل المبيعات) ثم الحاسبة.
const TIERS = [
  { key: 'economy', label: 'اقتصادي' },
  { key: 'standard', label: 'متوسط' },
  { key: 'premium', label: 'ممتاز' },
];

function fmt(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CustomerView({ user }) {
  // بوابة الهاتف: null = جارٍ الفحص، '' = مطلوب إدخاله، نص = مكتمل
  const [phone, setPhone] = useState(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [gateMsg, setGateMsg] = useState('');

  const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';

  useEffect(() => {
    // صمام أمان: إذا تأخر الجلب لأي سبب نعرض بوابة الهاتف بدل تعليق شاشة التحميل
    const failsafe = setTimeout(() => setPhone((p) => (p === null ? '' : p)), 7000);
    supabase
      .from('leads')
      .select('phone')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setPhone(data?.phone || ''))
      .catch(() => setPhone(''));
    return () => clearTimeout(failsafe);
  }, [user.id]);

  async function savePhone() {
    const p = phoneInput.trim();
    if (p.replace(/\D/g, '').length < 10) {
      setGateMsg('يرجى إدخال رقم هاتف صحيح (11 رقماً)');
      return;
    }
    const { error } = await supabase.from('leads').upsert(
      { user_id: user.id, full_name: fullName || null, email: user.email, phone: p, source: 'app' },
      { onConflict: 'user_id' }
    );
    if (error) {
      setGateMsg('تعذر الحفظ: ' + error.message);
      return;
    }
    setPhone(p);
  }

  // مدخلات الحاسبة
  const [roofAreaM2, setRoofAreaM2] = useState('');
  const [ampDay, setAmpDay] = useState('');
  const [ampNight, setAmpNight] = useState('');
  const [nightSupplyHours, setNightSupplyHours] = useState('');
  const [tier, setTier] = useState('standard');
  const [installment, setInstallment] = useState(false);
  const [preview, setPreview] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const inputs = useMemo(
    () => ({ roofAreaM2, ampDay, ampNight, nightSupplyHours, tier, installment }),
    [roofAreaM2, ampDay, ampNight, nightSupplyHours, tier, installment]
  );
  const debounced = useDebouncedValue(inputs, 350);

  const validInputs =
    Number(debounced.roofAreaM2) > 0 &&
    Number(debounced.ampDay) >= 0 &&
    Number(debounced.ampNight) >= 0 &&
    (Number(debounced.ampDay) > 0 || Number(debounced.ampNight) > 0) &&
    (Number(debounced.ampNight) === 0 || Number(debounced.nightSupplyHours) > 0);

  useEffect(() => {
    if (!validInputs) {
      setPreview(null);
      return;
    }
    setCalculating(true);
    window.api.quotes
      .preview({
        roofAreaM2: Number(debounced.roofAreaM2),
        ampDay: Number(debounced.ampDay),
        ampNight: Number(debounced.ampNight),
        nightSupplyHours: debounced.nightSupplyHours === '' ? null : Number(debounced.nightSupplyHours),
        tier: debounced.tier,
        installment: debounced.installment,
      })
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setCalculating(false));
  }, [debounced, validInputs]);

  const draft = preview?.draft;
  const hasBlockingErrors = draft && Object.keys(draft.errors).length > 0;

  function baseInput() {
    return {
      clientName: fullName,
      clientPhone: phone,
      roofAreaM2: Number(roofAreaM2),
      ampDay: Number(ampDay),
      ampNight: Number(ampNight),
      nightSupplyHours: nightSupplyHours === '' ? null : Number(nightSupplyHours),
      tier,
      installment,
    };
  }

  async function handlePdf() {
    setBusy(true);
    setMessage('');
    try {
      const result = await window.api.quotes.exportDraftPdf(baseInput());
      if (!result.canceled) setMessage('تم تصدير ملف العرض ✔');
    } catch (err) {
      setMessage('تعذر التصدير: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRequest() {
    setBusy(true);
    setMessage('');
    try {
      await window.api.quoteRequests.create({
        user_id: user.id,
        full_name: fullName || null,
        email: user.email,
        phone,
        roof_area_m2: Number(roofAreaM2),
        amp_day: Number(ampDay),
        amp_night: Number(ampNight),
        night_hours: nightSupplyHours === '' ? null : Number(nightSupplyHours),
        tier,
        total_price: draft.total,
        installment,
        monthly: draft.installment ? draft.installment.monthly : null,
      });
      setMessage('✅ وصل طلبك — سيتواصل معك فريق المبيعات قريباً');
    } catch (err) {
      setMessage('تعذر إرسال الطلب: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  if (phone === null) {
    return <p style={{ textAlign: 'center', marginTop: 40 }}>جاري التحميل...</p>;
  }

  // بوابة الهاتف
  if (!phone) {
    return (
      <div className="card" style={{ maxWidth: 460, margin: '40px auto', textAlign: 'center' }}>
        <div style={{ fontSize: '2.2rem' }}>📱</div>
        <h3 style={{ color: 'var(--navy)', margin: '6px 0' }}>أهلاً {fullName || 'بك'} 👋</h3>
        <p className="muted">خطوة أخيرة قبل الحاسبة: أدخل رقم هاتفك حتى يتمكن فريقنا من التواصل معك</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <input
            type="tel"
            dir="ltr"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="07xxxxxxxxx"
            style={{ maxWidth: 200, textAlign: 'center' }}
          />
          <button className="btn btn-primary" onClick={savePhone}>
            متابعة
          </button>
        </div>
        {gateMsg && <div className="alert alert-warning" style={{ marginTop: 10 }}>{gateMsg}</div>}
      </div>
    );
  }

  return (
    <div>
      <h2 className="page-title">احسب سعر منظومتك الشمسية</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        أدخل احتياجك وسيظهر لك عرض السعر فوراً بأسعارنا الفعلية — وبإمكانك طلب العرض ليتواصل معك فريق المبيعات
      </p>

      <div className="card">
        <h3 className="card-heading">⚡ متطلبات المنظومة</h3>
        <div className="big-inputs big-inputs-4">
          <div className="field">
            <label>مساحة السطح (م²)</label>
            <input type="number" value={roofAreaM2} onChange={(e) => setRoofAreaM2(e.target.value)} />
          </div>
          <div className="field">
            <label>أمبير مطلوب نهاراً</label>
            <input type="number" value={ampDay} onChange={(e) => setAmpDay(e.target.value)} />
          </div>
          <div className="field">
            <label>أمبير مطلوب ليلاً</label>
            <input type="number" value={ampNight} onChange={(e) => setAmpNight(e.target.value)} />
          </div>
          <div className="field">
            <label>ساعات التجهيز الليلي</label>
            <input type="number" value={nightSupplyHours} onChange={(e) => setNightSupplyHours(e.target.value)} />
          </div>
        </div>

        <div className="tier-toggle">
          {TIERS.map((t) => (
            <button key={t.key} className={tier === t.key ? 'active' : ''} onClick={() => setTier(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontWeight: 700, color: 'var(--navy)', cursor: 'pointer' }}>
          <input type="checkbox" checked={installment} onChange={(e) => setInstallment(e.target.checked)} style={{ width: 18, height: 18 }} />
          🏦 أرغب بالتقسيط المصرفي
        </label>
      </div>

      {!validInputs && (
        <div className="alert alert-info">
          أدخل مساحة السطح والأمبير المطلوب (نهاراً و/أو ليلاً) — وعند وجود حمل ليلي أدخل ساعات التجهيز الليلي
        </div>
      )}

      {draft && (
        <>
          {Object.entries(draft.errors).map(([key, msg]) => (
            <div className="alert alert-danger" key={key}>
              {msg}
            </div>
          ))}

          <div className="card">
            <div className="toolbar">
              <h3 style={{ margin: 0, color: 'var(--navy)' }}>عرض السعر</h3>
              <span className="total-badge" style={calculating ? { opacity: 0.55 } : {}}>
                {calculating ? '⏳ ' : ''}المجموع الكلي: {fmt(draft.total)} دينار
              </span>
            </div>

            {draft.installment && (
              <div className="alert alert-info" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontWeight: 700 }}>
                <span>🏦 المجموع بالتقسيط: {fmt(draft.installment.totalWithInterest)} دينار</span>
                <span>القسط الشهري لمدة {draft.installment.months} شهراً: {fmt(draft.installment.monthly)} دينار</span>
              </div>
            )}

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ت</th>
                    <th>المواد</th>
                    <th>الوحدة</th>
                    <th>الكمية</th>
                    <th>سعر الوحدة</th>
                    <th>المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td style={{ whiteSpace: 'pre-line' }}>{item.description}</td>
                      <td>{item.unit}</td>
                      <td>{item.quantity}</td>
                      <td>{fmt(item.unit_price)}</td>
                      <td>{fmt(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {message && <div className="alert alert-info">{message}</div>}
          <div className="action-bar">
            <span className="action-total">
              {calculating ? '⏳' : '💰'} {fmt(draft.total)} <small>دينار</small>
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" disabled={busy || hasBlockingErrors} onClick={handlePdf}>
                📄 تصدير PDF
              </button>
              <button className="btn btn-primary" disabled={busy || hasBlockingErrors} onClick={handleRequest}>
                📨 اطلب العرض — يتواصل معك فريقنا
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
