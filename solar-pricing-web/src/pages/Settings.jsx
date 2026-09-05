import React, { useEffect, useState } from 'react';
import { getAgentKey, setAgentKey, SHARE_KEY_SQL } from '../lib/agent.js';
import { getCurrentUsername } from '../lib/agent.js';
import { canEditSettings } from '../lib/permissions.js';
import StaffManager from '../components/StaffManager.jsx';
import { EXPORT_METHODS, getExportMethod } from '../lib/exportMethod.js';

const SETTINGS_FIELDS = [
  { key: 'system_voltage', label: 'فولتية النظام (لتحويل الأمبير لواط)' },
  { key: 'charge_panels_per_battery', label: 'ألواح الشحن الإضافية لكل بطارية' },
  { key: 'inverter_safety_factor', label: 'معامل أمان الانفيرتر' },
  { key: 'dod', label: 'نسبة التفريغ الآمن للبطارية (0-1)' },
  { key: 'night_coverage_hours', label: 'ساعات التجهيز الليلي الافتراضية (تتغير بكل عرض)' },
  { key: 'panel_area_m2', label: 'مساحة اللوح الواحد مع هامش التركيب (م²)' },
  { key: 'quote_number_start', label: 'بداية ترقيم العروض' },
];

export default function Settings() {
  // حسابات مقيّدة: صفحة الإعدادات كلها للقراءة — بلا تعديل ثوابت أو ملف شركة أو مفاتيح
  const [canEdit, setCanEdit] = useState(true);
  // طريقة التصدير: تفضيل محلي لهذا الجهاز (مو بقاعدة البيانات)
  const [exportMethod, setExportMethodState] = useState(getExportMethod);
  // القيمة تجي من الحساب عند بدء الجلسة، فنعيد المزامنة عند فتح الشاشة
  useEffect(() => { setExportMethodState(getExportMethod()); }, []);
  // تبديل الرموز وإنشاء الحسابات: حيدر وأحمد حصراً (قرار المستخدم) — بقية
  // المشرفين يعدّلون الصلاحيات بس
  const [mayManageCodes, setMayManageCodes] = useState(false);
  useEffect(() => {
    getCurrentUsername()
      .then((n) => {
        setCanEdit(canEditSettings(n));
        const norm = String(n || '').trim().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا');
        setMayManageCodes(norm === 'احمد' || norm === 'حيدر');
      })
      .catch(() => {});
  }, []);
  const [settings, setSettings] = useState(null);
  const [company, setCompany] = useState(null);
  const [message, setMessage] = useState('');
  const [agentKey, setAgentKeyInput] = useState('');
  const [agentMsg, setAgentMsg] = useState(null);
  // التقسيط المصرفي: نسبة الفائدة (معامل ضرب مثل 1.35) وعدد الأشهر — مشتركة لكل الموظفين
  const [instRate, setInstRate] = useState('1.35');
  const [instMonths, setInstMonths] = useState('60');
  const [instMsg, setInstMsg] = useState('');
  // المصرف الأهلي العراقي: نسبته وأشهره مستقلة — كان يستعير إعداد النهرين
  // فيطلع عرضه بـ35% بدل نسبته هو
  const [ahliRate, setAhliRate] = useState('1.26');
  const [ahliMonths, setAhliMonths] = useState('84');
  const [ahliMsg, setAhliMsg] = useState('');
  // مصرف الإقليم التجاري — مصرف ثالث يدعم مبادرة البنك المركزي، بنسبته وأشهره
  const [iqRate, setIqRate] = useState('1.26');
  const [iqMonths, setIqMonths] = useState('84');
  const [iqMsg, setIqMsg] = useState('');
  function reload() {
    window.api.settings.get().then(setSettings);
    window.api.company.get().then(setCompany);
    getAgentKey().then(setAgentKeyInput);
    window.api.config.get('installment').then((cfg) => {
      if (cfg?.rate > 0) setInstRate(String(cfg.rate));
      if (cfg?.months > 0) setInstMonths(String(cfg.months));
    }).catch(() => {});
    window.api.config.get('installment_ahli').then((cfg) => {
      if (cfg?.rate > 0) setAhliRate(String(cfg.rate));
      if (cfg?.months > 0) setAhliMonths(String(cfg.months));
    }).catch(() => {});
    window.api.config.get('installment_iqleem').then((cfg) => {
      if (cfg?.rate > 0) setIqRate(String(cfg.rate));
      if (cfg?.months > 0) setIqMonths(String(cfg.months));
    }).catch(() => {});
  }

  async function saveInstallment(e) {
    e.preventDefault();
    const rate = Number(instRate);
    const months = Math.round(Number(instMonths));
    if (!(rate > 0) || !(months > 0)) {
      setInstMsg('أدخل نسبة وأشهر صحيحة — النسبة معامل ضرب مثل 1.35');
      return;
    }
    await window.api.config.set('installment', { rate, months });
    setInstMsg(`تم الحفظ ✔ كل عرض مؤشَّر عليه التقسيط سيُحسب: المجموع × ${rate} ÷ ${months} شهراً`);
  }

  async function saveAhli(e) {
    e.preventDefault();
    const rate = Number(ahliRate);
    const months = Math.round(Number(ahliMonths));
    if (!(rate > 0) || !(months > 0)) {
      setAhliMsg('أدخل نسبة وأشهر صحيحة — النسبة معامل ضرب مثل 1.26');
      return;
    }
    await window.api.config.set('installment_ahli', { rate, months });
    setAhliMsg(`تم الحفظ ✔ عروض المصرف الأهلي العراقي: المجموع × ${rate} ÷ ${months} شهراً`);
  }

  async function saveIqleem(e) {
    e.preventDefault();
    const rate = Number(iqRate);
    const months = Math.round(Number(iqMonths));
    if (!(rate > 0) || !(months > 0)) {
      setIqMsg('أدخل نسبة وأشهر صحيحة — النسبة معامل ضرب مثل 1.26');
      return;
    }
    await window.api.config.set('installment_iqleem', { rate, months });
    setIqMsg(`تم الحفظ ✔ عروض مصرف الإقليم التجاري: المجموع × ${rate} ÷ ${months} شهراً`);
  }

  useEffect(reload, []);

  async function saveAgentKey(e) {
    e.preventDefault();
    const { shared } = await setAgentKey(agentKey);
    if (!agentKey.trim()) {
      setAgentMsg({ kind: 'info', text: 'حُذف المفتاح — عاد المساعد إلى الوضع السريع المحلي' });
    } else if (shared) {
      setAgentMsg({ kind: 'info', text: 'تم الحفظ ✔ المفتاح مشترك لكل الموظفين — المساعد الذكي الكامل شغال' });
    } else {
      setAgentMsg({ kind: 'warn', text: 'تم الحفظ على هذا الجهاز فقط ✔ لكي يصبح مشتركاً لجميع الموظفين، افتح لوحة Supabase ← SQL Editor والصق الأسطر أدناه واضغط Run، ثم احفظ المفتاح مرة أخرى من هنا.' });
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    const saved = await window.api.settings.update(settings);
    setSettings(saved);
    setMessage('تم حفظ ثوابت المعادلات ✔');
  }

  async function saveCompany(e) {
    e.preventDefault();
    const saved = await window.api.company.update(company);
    setCompany(saved);
    setMessage('تم حفظ بيانات الشركة ✔');
  }

  async function pickLogo() {
    const path = await window.api.company.pickLogo();
    if (path) setCompany((c) => ({ ...c, logo_path: path }));
  }

  function updateNote(idx, value) {
    setCompany((c) => {
      const notes = [...c.notes_default];
      notes[idx] = value;
      return { ...c, notes_default: notes };
    });
  }

  function addNote() {
    setCompany((c) => ({ ...c, notes_default: [...c.notes_default, ''] }));
  }

  function removeNote(idx) {
    setCompany((c) => ({ ...c, notes_default: c.notes_default.filter((_, i) => i !== idx) }));
  }

  function moveNote(idx, dir) {
    setCompany((c) => {
      const notes = [...c.notes_default];
      const target = idx + dir;
      if (target < 0 || target >= notes.length) return c;
      [notes[idx], notes[target]] = [notes[target], notes[idx]];
      return { ...c, notes_default: notes };
    });
  }

  if (!settings || !company) return <p>جاري التحميل...</p>;

  return (
    <div>
      <h2 className="page-title">الإعدادات</h2>
      {message && <div className="alert alert-info">{message}</div>}
      {!canEdit && (
        <div className="alert alert-warning">
          👁 هذا الحساب للاطلاع فقط — يمكنك رؤية الإعدادات لكن التعديل محصور بحسابات الإدارة.
        </div>
      )}
      {canEdit && <StaffManager canManageCodes={mayManageCodes} />}

      {/* تفضيل هذا الجهاز — برّا fieldset المعطّل عمداً: مو إعداداً مشتركاً يمس
          الفريق، بل خيار محلي ينحفظ بذاكرة المتصفح.
          **مفتوح لكل الحسابات**: الجهاز اللي يتعثّر عنده الرسم (يعلّق أو يطيح
          التبويب) لازم صاحبه يبدّل طريقته بنفسه — وكان محصوراً بحساب واحد،
          يعني أي بياع يتعطّل عنده التصدير ما عنده مخرج إلا ينتظر غيره. */}
      <div className="card">
        <h3 style={{ color: 'var(--navy)', marginTop: 0 }}>📄 محرك تصدير ملف العرض (هذا الجهاز فقط)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          الكل يشتغل بـ<b>المحرك الخفيف</b> افتراضياً. الخيارات هنا للمقارنة والفحص —
          تخص <b>هذا الجهاز وحده</b> وما تأثر على أي حساب ولا جهاز ثاني.
        </p>
        <div className="export-method">
          {EXPORT_METHODS.map((m) => (
            <label key={m.key} className={`export-method-opt${exportMethod === m.key ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="export-method"
                checked={exportMethod === m.key}
                onChange={() => {
                  // الحفظ يمر بطبقة البيانات: ينحفظ **بالحساب** لا بالمتصفح،
                  // فيمشي معه لأي جهاز يدخل منه. والشاشة تتحدث فوراً بلا انتظار.
                  setExportMethodState(m.key);
                  window.api.exportPref.set(m.key).catch((err) => {
                    setMessage('ما انحفظ التفضيل بالحساب: ' + err.message);
                    setExportMethodState(getExportMethod());
                  });
                  setMessage(`طريقة التصدير بهذا الجهاز: ${m.label} ✔`);
                }}
              />
              <span>
                <b>{m.label}</b>
                <small>{m.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </div>

      <fieldset disabled={!canEdit} style={{ border: 'none', padding: 0, margin: 0, minInlineSize: 'auto' }}>

      <form className="card" onSubmit={saveSettings}>
        <h3 style={{ color: 'var(--navy)', marginTop: 0 }}>ثوابت المعادلات</h3>
        <div className="grid-3">
          {SETTINGS_FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <input
                type="number"
                step="any"
                value={settings[f.key]}
                onChange={(e) => setSettings({ ...settings, [f.key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
        <button className="btn btn-primary" type="submit">
          حفظ ثوابت المعادلات
        </button>
      </form>

      

      <form className="card" onSubmit={saveInstallment}>
        <h3 style={{ color: 'var(--navy)', marginTop: 0 }}>🏦 التقسيط عبر مصرف النهرين</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          الخطة الأولى اللي تظهر للبياع عند تأشير التقسيط. يُحسب تلقائياً: <b>المجموع الكلي × نسبة الفائدة ÷ عدد الأشهر</b>{' '}
          ويطلع بالعرض المجموع مع الفائدة والقسط الشهري. النسبة معامل ضرب مباشر (مثال: 1.35 يعني المجموع + 35%).
        </p>
        <div className="grid-2">
          <div className="field">
            <label>نسبة فائدة المصرف (معامل الضرب)</label>
            <input type="number" step="any" min="0" value={instRate} onChange={(e) => setInstRate(e.target.value)} placeholder="مثال: 1.35" />
          </div>
          <div className="field">
            <label>عدد أشهر التقسيط</label>
            <input type="number" min="1" value={instMonths} onChange={(e) => setInstMonths(e.target.value)} placeholder="60" />
          </div>
        </div>
        <button className="btn btn-primary" type="submit">
          حفظ إعدادات التقسيط
        </button>
        {instMsg && <div className="alert alert-info" style={{ marginTop: 10, marginBottom: 0 }}>{instMsg}</div>}
      </form>

      <form className="card" onSubmit={saveAhli}>
        <h3 style={{ color: 'var(--navy)', marginTop: 0 }}>🏦 المصرف الأهلي العراقي</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          نسبة الأهلي وأشهره <b>مستقلة عن النهرين</b> — قبل هذا كان يستعير نسبة النهرين
          فيطلع مجموعه أعلى من الصحيح. النسبة معامل ضرب مباشر (مثال: 1.25 يعني المجموع + 25%).
        </p>
        <div className="grid-2">
          <div className="field">
            <label>نسبة فائدة المصرف (معامل الضرب)</label>
            <input type="number" step="any" min="0" value={ahliRate} onChange={(e) => setAhliRate(e.target.value)} placeholder="مثال: 1.26" />
          </div>
          <div className="field">
            <label>عدد أشهر التقسيط</label>
            <input type="number" min="1" value={ahliMonths} onChange={(e) => setAhliMonths(e.target.value)} placeholder="84" />
          </div>
        </div>
        <button className="btn btn-primary" type="submit">
          حفظ إعدادات الأهلي
        </button>
        {ahliMsg && <div className="alert alert-info" style={{ marginTop: 10, marginBottom: 0 }}>{ahliMsg}</div>}
      </form>

      <form className="card" onSubmit={saveIqleem}>
        <h3 style={{ color: 'var(--navy)', marginTop: 0 }}>🏦 مصرف الإقليم التجاري</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          مصرف يدعم مبادرة البنك المركزي، ونسبته وأشهره <b>مستقلة</b> عن النهرين والأهلي.
          القيم أدناه افتراض أولي — <b>ثبّت نسبة المصرف الحقيقية من هنا قبل أول عرض</b>.
        </p>
        <div className="grid-2">
          <div className="field">
            <label>نسبة فائدة المصرف (معامل الضرب)</label>
            <input type="number" step="any" min="0" value={iqRate} onChange={(e) => setIqRate(e.target.value)} placeholder="مثال: 1.26" />
          </div>
          <div className="field">
            <label>عدد أشهر التقسيط</label>
            <input type="number" min="1" value={iqMonths} onChange={(e) => setIqMonths(e.target.value)} placeholder="84" />
          </div>
        </div>
        <button className="btn btn-primary" type="submit">
          حفظ إعدادات الإقليم التجاري
        </button>
        {iqMsg && <div className="alert alert-info" style={{ marginTop: 10, marginBottom: 0 }}>{iqMsg}</div>}
      </form>

      

      <form className="card" onSubmit={saveAgentKey}>
        <h3 style={{ color: 'var(--navy)', marginTop: 0 }}>🤖 المساعد الذكي (مجاني)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          المساعد يشتغل على Google Gemini بالطبقة المجانية (بدون بطاقة). طريقة الحصول على المفتاح:
          <br />1. افتح <b>aistudio.google.com/apikey</b> وسجل بحساب Google
          <br />2. اضغط <b>Create API key</b> وانسخ المفتاح
          <br />3. الصقه هنا واحفظ — يعمل فوراً لجميع الموظفين
        </p>
        <div className="field">
          <label>مفتاح Gemini API</label>
          <input
            type="password"
            value={agentKey}
            onChange={(e) => setAgentKeyInput(e.target.value)}
            placeholder="AIza..."
            dir="ltr"
          />
        </div>
        <button className="btn btn-primary" type="submit">
          حفظ مفتاح المساعد
        </button>
        {agentMsg && (
          <div className={`alert ${agentMsg.kind === 'warn' ? 'alert-warning' : 'alert-info'}`} style={{ marginTop: 10, marginBottom: 0 }}>
            {agentMsg.text}
            {agentMsg.kind === 'warn' && (
              <pre dir="ltr" style={{ background: '#fff', padding: 8, borderRadius: 6, marginTop: 8, overflowX: 'auto', fontSize: '0.78rem' }}>{SHARE_KEY_SQL}</pre>
            )}
          </div>
        )}
      </form>

      <form className="card" onSubmit={saveCompany}>
        <h3 style={{ color: 'var(--navy)', marginTop: 0 }}>بيانات الشركة</h3>
        <div className="grid-2">
          <div className="field">
            <label>اسم الشركة (عربي)</label>
            <input type="text" value={company.company_name || ''} onChange={(e) => setCompany({ ...company, company_name: e.target.value })} />
          </div>
          <div className="field">
            <label>اسم الشركة (إنجليزي)</label>
            <input type="text" value={company.company_name_en || ''} onChange={(e) => setCompany({ ...company, company_name_en: e.target.value })} />
          </div>
        </div>
        <div className="grid-3">
          <div className="field">
            <label>الإيميل</label>
            <input type="text" value={company.email || ''} onChange={(e) => setCompany({ ...company, email: e.target.value })} />
          </div>
          <div className="field">
            <label>هاتف 1</label>
            <input type="text" value={company.phone1 || ''} onChange={(e) => setCompany({ ...company, phone1: e.target.value })} />
          </div>
          <div className="field">
            <label>هاتف 2</label>
            <input type="text" value={company.phone2 || ''} onChange={(e) => setCompany({ ...company, phone2: e.target.value })} />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>اسم المدير المفوض</label>
            <input type="text" value={company.manager_name || ''} onChange={(e) => setCompany({ ...company, manager_name: e.target.value })} />
          </div>
          <div className="field">
            <label>شعار الشركة</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" className="btn btn-secondary" onClick={pickLogo}>
                اختر صورة...
              </button>
              {company.logo_path && company.logo_path.startsWith('data:') ? (
                <img src={company.logo_path} alt="الشعار" style={{ width: 44, height: 44, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 6 }} />
              ) : (
                <span className="muted">لا يوجد شعار</span>
              )}
            </div>
          </div>
        </div>

        <h4 style={{ color: 'var(--navy)' }}>الملاحظات الافتراضية للعروض الجديدة</h4>
        {company.notes_default.map((note, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input type="text" value={note} onChange={(e) => updateNote(idx, e.target.value)} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveNote(idx, -1)}>
              ↑
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveNote(idx, 1)}>
              ↓
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => removeNote(idx)}>
              حذف
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-secondary" onClick={addNote} style={{ marginBottom: 14 }}>
          + إضافة ملاحظة
        </button>
        <br />
        <button className="btn btn-primary" type="submit">
          حفظ بيانات الشركة
        </button>
      </form>

      <div className="card">
        <h3 style={{ color: 'var(--navy)', marginTop: 0 }}>البيانات السحابية</h3>
        <p className="muted">
          كل البيانات (المخزون والعروض والإعدادات) محفوظة على السحابة ومشتركة بين كل الأجهزة والموظفين تلقائياً —
          أي تعديل من أي جهاز يظهر عند الجميع فوراً. لا حاجة لنسخ احتياطية يدوية.
        </p>
      </div>
      </fieldset>
    </div>
  );
}
