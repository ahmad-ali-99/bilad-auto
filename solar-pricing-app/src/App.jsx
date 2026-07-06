import React, { useState } from 'react';
import Inventory from './pages/Inventory.jsx';
import QuoteBuilder from './pages/QuoteBuilder.jsx';
import Quotes from './pages/Quotes.jsx';
import Settings from './pages/Settings.jsx';
import SplashScreen from './components/SplashScreen.jsx';

const PAGES = [
  { key: 'quote', label: 'إنشاء عرض سعر' },
  { key: 'quotes', label: 'العروض المحفوظة' },
  { key: 'inventory', label: 'المخزون' },
  { key: 'settings', label: 'الإعدادات' },
];

export default function App() {
  const [page, setPage] = useState('quote');
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <SplashScreen onEnter={() => setShowSplash(false)} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>تسعير الطاقة الشمسية</h1>
        <nav>
          {PAGES.map((p) => (
            <button key={p.key} className={page === p.key ? 'active' : ''} onClick={() => setPage(p.key)}>
              {p.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        {page === 'quote' && <QuoteBuilder />}
        {page === 'quotes' && <Quotes />}
        {page === 'inventory' && <Inventory />}
        {page === 'settings' && <Settings />}
      </main>
    </div>
  );
}
