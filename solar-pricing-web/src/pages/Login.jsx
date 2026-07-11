import React, { useState, useEffect } from 'react';
import { supabase, usernameToEmail, isConfigured } from '../lib/supabase.js';

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.from('company_profile').select('company_name, company_name_en, logo_path').eq('id', 1).single()
      .then(({ data }) => setCompany(data))
      .catch(() => {});
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !code) {
      setError('أدخل اسم المستخدم والرمز');
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password: code,
      });
      if (authError) {
        setError('اسم المستخدم أو الرمز غير صحيح');
        return;
      }
      onLoggedIn();
    } catch (err) {
      setError('تعذّر الاتصال — تحقق من الإنترنت');
    } finally {
      setBusy(false);
    }
  }

  // شعار الشركة: المرفوع بقاعدة البيانات إن وجد، وإلا الشعار الرسمي المضمن بالتطبيق
  const logo = company?.logo_path && company.logo_path.startsWith('data:') ? company.logo_path : 'logo.png';

  return (
    <div className="splash-overlay">
      <form className="login-card" onSubmit={handleLogin}>
        <img className="login-logo" src={logo} alt="بلاد اوتو" />
        <h1 className="login-title">{company?.company_name || 'تسعير الطاقة الشمسية'}</h1>
        <p className="login-sub">تسجيل الدخول</p>

        {!isConfigured && (
          <div className="alert alert-warning" style={{ textAlign: 'center' }}>
            لم تُربط قاعدة البيانات بعد — يحتاج إعداد Supabase
          </div>
        )}

        <div className="field">
          <label>اسم المستخدم</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus placeholder="مثال: حيدر — أو رقمك مثل 2" />
        </div>
        <div className="field">
          <label>الرمز</label>
          <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="الرمز البسيط" />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button className="btn btn-primary login-btn" type="submit" disabled={busy}>
          {busy ? 'جاري الدخول...' : 'دخول'}
        </button>
        <div className="login-dev">تطوير: احمد علي — 07728736250</div>
      </form>
    </div>
  );
}
