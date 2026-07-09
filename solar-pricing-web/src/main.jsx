import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import './styles.css';
import { api } from './lib/dataApi.js';
import App from './App.jsx';

// نفس واجهة النسخ السابقة — الصفحات المشتركة تستدعي window.api بدون تعديل (الآن فوق Supabase)
window.api = api;

createRoot(document.getElementById('root')).render(<App />);
