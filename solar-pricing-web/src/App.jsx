import React, { useState, useEffect } from 'react';
import Inventory from './pages/Inventory.jsx';
import QuoteBuilder from './pages/QuoteBuilder.jsx';
import Quotes from './pages/Quotes.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import GlobalLoadingBar from './components/GlobalLoadingBar.jsx';
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
          <div className="splash-logo-fallback">☀</div>
          <p style={{ color: '#fff' }}>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login onLoggedIn={() => {}} />;
  }

  const currentUser = session.user?.user_metadata?.username || '';

  async function logout() {
    await supabase.auth.signOut();
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
          <span className="brand-logo">☀</span>
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
          <QuoteBuilder
            prefill={quotePrefill}
            onAssistantQuote={(fields) => setQuotePrefill({ ...fields, nonce: Date.now() })}
            onAssistantInventory={(search) => {
              setInventorySearch({ term: search, nonce: Date.now() });
              setPage('inventory');
            }}
          />
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
    </div>
  );
}
