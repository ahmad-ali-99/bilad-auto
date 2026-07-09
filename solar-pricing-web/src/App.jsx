import React, { useState, useEffect } from 'react';
import Inventory from './pages/Inventory.jsx';
import QuoteBuilder from './pages/QuoteBuilder.jsx';
import Quotes from './pages/Quotes.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
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

  return (
    <div className="mobile-shell">
      <header className="mobile-topbar">
        <span>تسعير الطاقة الشمسية — بلاد اوتو</span>
        <button className="topbar-logout" onClick={logout} title="تسجيل الخروج">
          {currentUser ? `${currentUser} ⏻` : 'خروج'}
        </button>
      </header>
      <main className="mobile-content">
        {page === 'quote' && <QuoteBuilder />}
        {page === 'quotes' && <Quotes />}
        {page === 'inventory' && <Inventory />}
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
