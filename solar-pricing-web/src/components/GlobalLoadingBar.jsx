import React, { useEffect, useRef, useState } from 'react';

// شريط تحميل خفيف أعلى الشاشة — يظهر تلقائياً مع أي عملية (حساب، حفظ، تصدير، استيراد...)
// تأخير قصير قبل الظهور حتى العمليات اللحظية ما تسبب وميض
export default function GlobalLoadingBar() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    function onBusy(e) {
      const busy = e.detail?.busy;
      if (busy) {
        if (!timerRef.current) {
          timerRef.current = setTimeout(() => setVisible(true), 120);
        }
      } else {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        setVisible(false);
      }
    }
    window.addEventListener('api-busy', onBusy);
    return () => {
      window.removeEventListener('api-busy', onBusy);
      clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible) return null;
  return (
    <div className="global-loading">
      <div className="global-loading-bar" />
    </div>
  );
}
