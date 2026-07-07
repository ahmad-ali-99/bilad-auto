import React, { useState } from 'react';
import Inventory from './pages/Inventory.jsx';
import QuoteBuilder from './pages/QuoteBuilder.jsx';
import Quotes from './pages/Quotes.jsx';
import Settings from './pages/Settings.jsx';
import SplashScreen from './components/SplashScreen.jsx';

const PAGES = [
  { key: 'quote', label: 'عرض سعر', icon: '🧮' },
  { key: 'quotes', label: 'العروض', icon: '📄' },
  { key: 'inventory', label: 'المخزون', icon: '📦' },
  { key: 'settings', label: 'الإعدادات', icon: '⚙' },
];

export default function App() {
  const [page, setPage] = useState('quote');
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <SplashScreen onEnter={() => setShowSplash(false)} />;
  }

  return (
    <div className="mobile-shell">
      <header className="mobile-topbar">تسعير الطاقة الشمسية — بلاد اوتو</header>
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
