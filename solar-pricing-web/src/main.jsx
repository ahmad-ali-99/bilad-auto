import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
// الوزن 800 مستعمل بصفحة الغلاف (structureDiagram.js) — بدونه المتصفح «يزيّف» العريض
// بالضغط على الحرف، وبالعربي المتصل هذا يلزق الحروف ويطلعها مدهونة (أندرويد أسوأ من iOS)
import '@fontsource/cairo/800.css';
import './styles.css';
import { api } from './lib/dataApi.js';
import App from './App.jsx';

// نفس واجهة النسخ السابقة — الصفحات المشتركة تستدعي window.api بدون تعديل (الآن فوق Supabase)
// نغلف كل دوال الـapi بعدّاد انشغال: أي عملية جارية تطلق حدث يظهر شريط تحميل خفيف أعلى الشاشة
let pendingCount = 0;
function notifyBusy() {
  window.dispatchEvent(new CustomEvent('api-busy', { detail: { busy: pendingCount > 0 } }));
}
function wrapBusy(obj) {
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'function') {
      out[key] = async function (...args) {
        pendingCount++;
        notifyBusy();
        try {
          return await val.apply(obj, args);
        } finally {
          pendingCount--;
          notifyBusy();
        }
      };
    } else if (val && typeof val === 'object') {
      out[key] = wrapBusy(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}
window.api = wrapBusy(api);

createRoot(document.getElementById('root')).render(<App />);
