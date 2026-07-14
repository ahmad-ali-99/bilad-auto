import React, { useState, useEffect, useRef } from 'react';
import Inventory from './pages/Inventory.jsx';
import QuoteBuilder from './pages/QuoteBuilder.jsx';
import Quotes from './pages/Quotes.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import GlobalLoadingBar from './components/GlobalLoadingBar.jsx';
import AssistantBar from './components/AssistantBar.jsx';
import CustomerView from './pages/CustomerView.jsx';
import Requests from './pages/Requests.jsx';
import { supabase } from './lib/supabase.js';
import { isAdminName } from './lib/agent.js';

const PAGES = [
  { key: 'quote', label: 'عرض سعر', icon: '🧮' },
  { key: 'quotes', label: 'العروض', icon: '📄' },
  { key: 'inventory', label: 'المخزون', icon: '📦' },
  { key: 'settings', label: 'الإعدادات', icon: '⚙' },
];

// صفحة الطلبات (جهات التواصل + طلبات العروض) للمشرفين الثلاثة فقط
const ADMIN_PAGES = [{ key: 'requests', label: 'الطلبات', icon: '📨' }];

// شاشة تعيين كلمة مرور جديدة — تظهر عند فتح رابط الاستعادة من الإيميل
function ResetPasswordScreen({ onDone }) {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (pw1.length < 6) return setMsg('كلمة المرور 6 أحرف على الأقل');
    if (pw1 !== pw2) return setMsg('الكلمتان غير متطابقتين');
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) {
        setMsg('تعذر الحفظ: ' + error.message);
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="splash-overlay login-scene">
      <form className="login-card login-card-v2" onSubmit={save}>
        <div style={{ fontSize: '2.2rem', textAlign: 'center' }}>🔑</div>
        <h1 className="login-title">تعيين كلمة مرور جديدة</h1>
        {msg && <div className="login-error">{msg}</div>}
        <div className="field">
          <label>كلمة المرور الجديدة</label>
          <input type="password" dir="ltr" value={pw1} onChange={(e) => setPw1(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>تأكيد كلمة المرور</label>
          <input type="password" dir="ltr" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <button className="btn btn-primary login-btn" type="submit" disabled={busy}>
          {busy ? 'جاري الحفظ...' : 'حفظ والدخول'}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState('quote');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // تعبئة من المساعد: للعرض (حقول جاهزة) أو للمخزون (نص بحث) — nonce حتى تنطبق بكل أمر جديد
  const [quotePrefill, setQuotePrefill] = useState(null);
  const [inventorySearch, setInventorySearch] = useState(null);
  // المساعد الذكي بنافذة عائمة متاحة من كل الصفحات — مسودة العرض الحالية تنرفع من QuoteBuilder
  const [assistantOpen, setAssistantOpen] = useState(false);
  const draftRef = useRef(null);

  // وضع استعادة كلمة المرور: يتفعل عند فتح رابط الاستعادة المرسل بالإيميل
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    // صمام أمان: مهما صار ما تبقى شاشة التحميل معلقة — بعد 6 ثوانٍ نعرض الدخول
    const failsafe = setTimeout(() => setLoading(false), 6000);
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
      setLoading(false);
    });
    return () => {
      clearTimeout(failsafe);
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="splash-overlay">
        <div className="splash-center">
          <img src="logo.png" alt="بلاد اوتو" className="splash-brand-logo" />
          <p style={{ color: '#fff' }}>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login onLoggedIn={() => {}} />;
  }

  if (recovery) {
    return <ResetPasswordScreen onDone={() => setRecovery(false)} />;
  }

  // زبون (دخول Google): حاسبة تسعير مبسطة فقط — بلا تنقل ولا أدوات إدارية ولا مساعد
  const isStaff = String(session.user?.email || '').endsWith('@biladauto.local');
  if (!isStaff) {
    return (
      <div className="mobile-shell">
        <GlobalLoadingBar />
        <header className="mobile-topbar">
          <span className="brand">
            <span className="brand-logo">
              <img src="logo-mark.png" alt="" />
            </span>
            <span className="brand-text">
              <b>بلاد اوتو</b>
              <small>حاسبة الطاقة الشمسية</small>
            </span>
          </span>
          <button
            className="topbar-chip"
            onClick={async () => {
              await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 1500))]);
              setSession(null);
            }}
            title="تسجيل الخروج"
          >
            خروج ⏻
          </button>
        </header>
        <main className="mobile-content" style={{ paddingBottom: 90 }}>
          <CustomerView user={session.user} />
        </main>
      </div>
    );
  }

  // حسابات الموظفين المرقمة تظهر بالرقم فقط (مستخدم2 ← 2)
  const currentUser = (session.user?.user_metadata?.username || '').replace(/^مستخدم(?=[0-9])/, '');
  // تبويب الطلبات للمشرفين الثلاثة فقط
  const isAdmin = isAdminName(session.user?.user_metadata?.username || '');
  const navPages = isAdmin ? [...PAGES.slice(0, 2), ...ADMIN_PAGES, ...PAGES.slice(2)] : PAGES;

  // خروج فوري: نمسح الجلسة محلياً بدون انتظار السيرفر (كان يعلق إذا الشبكة بطيئة)
  async function logout() {
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } finally {
      setSession(null);
    }
  }

  // رفرش كامل بضغطة: يفحص وجود نسخة أحدث من التطبيق ثم يعيد التحميل بأحدث بيانات
  async function hardRefresh() {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      /* نكمل للتحديث */
    }
    window.location.reload();
  }

  return (
    <div className="mobile-shell">
      <GlobalLoadingBar />
      <header className="mobile-topbar">
        <span className="brand">
          <span className="brand-logo">
            <img src="logo-mark.png" alt="" />
          </span>
          <span className="brand-text">
            <b>بلاد اوتو</b>
            <small>
              تسعير الطاقة الشمسية{' '}
              <span style={{ opacity: 0.55 }}>{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''}</span>
            </small>
          </span>
        </span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="topbar-chip" onClick={hardRefresh} title="تحديث التطبيق والبيانات">
            🔄
          </button>
          <button className="topbar-chip" onClick={logout} title="تسجيل الخروج">
            {currentUser ? `${currentUser} ⏻` : 'خروج'}
          </button>
        </span>
      </header>
      <main className="mobile-content">
        {page === 'quote' && (
          <QuoteBuilder prefill={quotePrefill} onDraftChange={(d) => (draftRef.current = d)} />
        )}
        {page === 'quotes' && (
          <Quotes
            onEditQuote={(prefill) => {
              setQuotePrefill({ ...prefill, nonce: Date.now() });
              setPage('quote');
            }}
          />
        )}
        {page === 'inventory' && <Inventory initialSearch={inventorySearch} />}
        {page === 'requests' && isAdmin && <Requests />}
        {page === 'settings' && <Settings />}
      </main>
      <nav className="mobile-bottomnav">
        {navPages.map((p) => (
          <button key={p.key} className={page === p.key ? 'active' : ''} onClick={() => setPage(p.key)}>
            <span className="nav-icon">{p.icon}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </nav>

      {/* المساعد الذكي: زر عائم يفتح نافذة محادثة فوق أي صفحة */}
      <button
        className="assistant-fab"
        onClick={() => setAssistantOpen((o) => !o)}
        title="المساعد الذكي"
        aria-label="المساعد الذكي"
      >
        {assistantOpen ? '✕' : '🤖'}
      </button>
      {assistantOpen && (
        <div className="assistant-drawer-overlay" onClick={() => setAssistantOpen(false)}>
          <div className="assistant-drawer" onClick={(e) => e.stopPropagation()}>
            <AssistantBar
              fill
              onQuote={(fields) => {
                setQuotePrefill({ ...fields, nonce: Date.now() });
                setPage('quote');
              }}
              onInventory={(search) => {
                setInventorySearch({ term: search, nonce: Date.now() });
                setPage('inventory');
              }}
              getDraft={() => draftRef.current}
            />
          </div>
        </div>
      )}
    </div>
  );
}
