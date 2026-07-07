import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import './styles.css';
import { api } from './lib/api.js';
import App from './App.jsx';

// نفس واجهة سطح المكتب — الصفحات المشتركة تستدعي window.api بدون تعديل
window.api = api;

createRoot(document.getElementById('root')).render(<App />);
