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
import CrashScreen from './components/CrashScreen.jsx';

// نفس واجهة النسخ السابقة — الصفحات المشتركة تستدعي window.api بدون تعديل (الآن فوق Supabase)
// نغلف كل دوال الـapi بعدّاد انشغال: أي عملية جارية تطلق حدث يظهر شريط تحميل خفيف أعلى الشاشة
let pendingCount = 0;
function notifyBusy() {
  window.dispatchEvent(new CustomEvent('api-busy', { detail: { busy: pendingCount > 0 } }));
}
// سقف عمر النداء الواحد بعدّاد الانشغال. نداء ما يرجّع أبداً — مثل طلب شبكة
// معلّق بتلفون على شبكة ضعيفة — كان يخلي العدّاد فوق الصفر للأبد، فيبقى شريط
// التحميل يلف وكأن البرنامج شغال وهو أصلاً واقف. بعد هذا السقف نحرّر العدّاد
// حتى لو النداء بعده معلّق: الشريط يهدأ والواجهة تعرف إنها ما تنتظر شي مفيد.
const MAX_PENDING_MS = 45000;

function wrapBusy(obj) {
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'function') {
      out[key] = async function (...args) {
        pendingCount++;
        notifyBusy();
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          pendingCount = Math.max(0, pendingCount - 1);
          notifyBusy();
        };
        const stuckTimer = setTimeout(release, MAX_PENDING_MS);
        try {
          return await val.apply(obj, args);
        } finally {
          clearTimeout(stuckTimer);
          release();
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

// النسخة الجديدة تنزل **فوراً** لا بالفتحة الجاية: السيرفس وركر يثبّت نفسه
// ويستلم الصفحة (skipWaiting + clientsClaim)، بس الصفحة تبقى تشغّل الجافاسكربت
// القديم المحمّل أصلاً — فالمستخدم يحتاج يغلق ويفتح مرتين حتى يشوف الإصلاح،
// وإذا كانت النسخة القديمة منهارة يبقى على شاشة بيضاء بينهن.
if ('serviceWorker' in navigator) {
  // **أول تثبيت مو تحديثاً**: `clientsClaim` تخلي السيرفس وركر يستلم الصفحة
  // أول مرة كذلك، فيطلق `controllerchange` بأول زيارة أصلاً — وإعادة التحميل
  // هناك بلا فائدة وتقطع المستخدم بالنص (مقيس: الصفحة تنعاد بعد الدخول
  // مباشرة). نعيد التحميل فقط إذا كان أكو سيرفس وركر مستلم **قبلها** —
  // يعني تبدّل فعلي لنسخة جديدة.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;   // حارس ضد الحلقة وضد أول تثبيت
    reloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')).render(
  <CrashScreen>
    <App />
  </CrashScreen>,
);
