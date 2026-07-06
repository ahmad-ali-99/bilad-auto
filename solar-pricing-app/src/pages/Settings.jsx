import React, { useEffect, useState } from 'react';

const SETTINGS_FIELDS = [
  { key: 'system_voltage', label: 'فولتية النظام (لتحويل الأمبير لواط)' },
  { key: 'charge_panels_per_battery', label: 'ألواح الشحن الإضافية لكل بطارية' },
  { key: 'battery_charge_hours', label: 'ساعات شحن البطارية الواحدة' },
  { key: 'inverter_safety_factor', label: 'معامل أمان الانفيرتر' },
  { key: 'dod', label: 'نسبة التفريغ الآمن للبطارية (0-1)' },
  { key: 'night_coverage_hours', label: 'ساعات التجهيز الليلي الافتراضية (تتغير بكل عرض)' },
  { key: 'panel_area_m2', label: 'مساحة اللوح الواحد مع هامش التركيب (م²)' },
  { key: 'quote_number_start', label: 'بداية ترقيم العروض' },
];

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [company, setCompany] = useState(null);
  const [message, setMessage] = useState('');

  function reload() {
    window.api.settings.get().then(setSettings);
    window.api.company.get().then(setCompany);
  }

  useEffect(reload, []);

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
              <span className="muted">{company.logo_path ? company.logo_path.split(/[\\/]/).pop() : 'لا يوجد شعار'}</span>
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
    </div>
  );
}
