import React, { useState, useEffect, useRef } from 'react';
import Inventory from './pages/Inventory.jsx';
import QuoteBuilder from './pages/QuoteBuilder.jsx';
import Quotes from './pages/Quotes.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import GlobalLoadingBar from './components/GlobalLoadingBar.jsx';
import AssistantBar from './components/AssistantBar.jsx';
import CustomerView from './pages/CustomerView.jsx';
import { supabase } from './lib/supabase.js';

const PAGES = [
  { key: 'quote', label: 'عرض سعر', icon: '🧮' },
  { key: 'quotes', label: 'العروض', icon: '📄' },
  { key: 'inventory', label: 'المخزون', icon: '📦' },
  { key: 'settings', label: 'الإعدادات', icon: '⚙' },
];

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
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
        {page === 'settings' && <Settings />}
      </main>
      <nav className="mobile-bottomnav">
        {PAGES.map((p) => (
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
