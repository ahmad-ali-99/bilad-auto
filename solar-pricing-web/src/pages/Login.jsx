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

  // دخول الزبائن بحساب Google — يرجع لنفس رابط التطبيق بعد المصادقة
  async function loginWithGoogle() {
    setError('');
    const redirectTo = window.location.origin + window.location.pathname;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (oauthError) setError('تعذر بدء الدخول بحساب Google: ' + oauthError.message);
  }

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

        <button
          type="button"
          onClick={loginWithGoogle}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%',
            background: '#fff', border: '1px solid #c9d3de', borderRadius: 12, padding: '12px 16px',
            fontFamily: 'inherit', fontSize: '1.02rem', fontWeight: 700, color: '#12263f', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,.07)', marginBottom: 6,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.4 35.3 44 30 44 24c0-1.3-.1-2.6-.4-3.9z" />
          </svg>
          الدخول بحساب Google — احسب سعر منظومتك
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--border, #d5dde6)' }} />
          <span className="muted" style={{ fontSize: '0.82rem' }}>موظفو الشركة</span>
          <span style={{ flex: 1, height: 1, background: 'var(--border, #d5dde6)' }} />
        </div>

        <div className="field">
          <label>اسم المستخدم</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus placeholder="مثال: حيدر — أو رقمك (2 مثلاً)" />
        </div>
        <div className="field">
          <label>الرمز</label>
          <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="رمز الدخول" />
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
