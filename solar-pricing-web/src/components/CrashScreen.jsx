import React from 'react';

// آخر خط دفاع: أي خطأ ما انمسك بالشاشات يوصل هنا.
//
// بلا هذا الحاجز، خطأ واحد بأي مكوّن يفرّغ الشجرة كلها فيشوف المستخدم
// **صفحة بيضاء** بلا رسالة ولا زر ولا طريق للخروج — والتطبيق يبان ميّتاً
// حتى لو العطل بسطر واحد. هسه يطلع شرح وزر إصلاح.
export default class CrashScreen extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // محاولة إصلاح ذاتية **مرة وحدة بالجلسة**: أغلب الانهيارات بعد نشرة
    // جديدة سببها خليط — صفحة قديمة مخزّنة مع ملفات جديدة. تنظيف المخزن
    // وإعادة التحميل يحلّها بلا ما يسوي المستخدم شي. الحارس بالجلسة يمنع
    // حلقة إعادة تحميل لا نهائية إذا كان العطل حقيقياً بالكود.
    try {
      if (!sessionStorage.getItem('crash-healed')) {
        sessionStorage.setItem('crash-healed', String(error?.message || '1'));
        this.purgeAndReload();
      }
    } catch { /* المخزن مرفوض — نكتفي بعرض الشاشة */ }
  }

  async purgeAndReload() {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs || []).map((r) => r.unregister()));
    } catch { /* ماكو سيرفس وركر */ }
    try {
      const keys = await caches?.keys?.();
      await Promise.all((keys || []).map((k) => caches.delete(k)));
    } catch { /* ماكو مخزن */ }
    window.location.reload(true);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="splash-overlay login-scene">
        <div className="login-card login-staff" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.6rem' }}>🛠️</div>
          <h1 className="login-title">التطبيق يحتاج تحديث</h1>
          <p className="login-tagline" style={{ marginBottom: 14 }}>
            صارت مشكلة بالنسخة المخزّنة بجهازك. اضغط الزر وينصلح — بياناتك ما تتأثر.
          </p>
          <button className="btn btn-primary login-btn" onClick={() => this.purgeAndReload()}>
            🔄 إصلاح وتحديث الآن
          </button>
          <details style={{ marginTop: 14, textAlign: 'right', fontSize: '0.76rem', color: '#7b8a99' }}>
            <summary style={{ cursor: 'pointer' }}>تفاصيل فنية</summary>
            <pre style={{ whiteSpace: 'pre-wrap', direction: 'ltr', marginTop: 6 }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
