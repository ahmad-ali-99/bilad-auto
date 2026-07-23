import React, { useState } from 'react';
import SystemShowcase from './SystemShowcase.jsx';
import CityScene from './CityScene.jsx';

// نسخة سطح المكتب: شاشة إدخال أرقام الأفر ← مدينة المسوحات الفوتوغرامترية
// ببيت البطل والمنظومة. العرض الهندسي القديم باقٍ خلف ?classic=1
export default function App() {
  const classic = new URLSearchParams(location.search).has('classic');
  const autoShot = new URLSearchParams(location.search).has('shot');
  const [running, setRunning] = useState(autoShot);
  const [form, setForm] = useState({ panels: 24, batteries: 4, inverters: 1, nightHours: 8, ampDay: 20 });
  const set = (k) => (e) => setForm({ ...form, [k]: Number(e.target.value) || 0 });

  if (running) {
    const Scene = classic ? SystemShowcase : CityScene;
    return (
      <Scene
        panels={form.panels}
        batteries={form.batteries}
        inverters={form.inverters}
        nightHours={form.nightHours}
        dayAmps={form.ampDay}
        ampDay={form.ampDay}
        ampNight={0}
        onClose={() => setRunning(false)}
      />
    );
  }

  return (
    <div className="desk-setup">
      <div className="desk-card">
        <h1>⚡ بلاد أوتو — العرض الهندسي</h1>
        <p className="desk-sub">أدخل أرقام عرض السعر وشغّل العرض — نسخة الحاسوب بالجودة القصوى</p>
        <div className="desk-grid">
          <label>عدد الألواح<input type="number" min="0" value={form.panels} onChange={set('panels')} /></label>
          <label>عدد البطاريات<input type="number" min="0" value={form.batteries} onChange={set('batteries')} /></label>
          <label>عدد الانفرترات<input type="number" min="1" value={form.inverters} onChange={set('inverters')} /></label>
          <label>تجهيز ليلي (ساعة)<input type="number" min="0" value={form.nightHours} onChange={set('nightHours')} /></label>
          <label>أمبير نهاري<input type="number" min="0" value={form.ampDay} onChange={set('ampDay')} /></label>
        </div>
        <button className="desk-start" onClick={() => setRunning(true)}>🎬 شغّل العرض</button>
        <p className="desk-attr">City pack 7 — by Pasha (Sketchfab, CC-BY) بعد تركيبه</p>
      </div>
    </div>
  );
}
