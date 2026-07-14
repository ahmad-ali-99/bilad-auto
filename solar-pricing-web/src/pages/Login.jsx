import React, { useState, useEffect } from 'react';
import { supabase, usernameToEmail, isConfigured } from '../lib/supabase.js';

// شاشة الدخول العامة: حساب جديد بالإيميل / دخول / Google / استرجاع كلمة المرور —
// ومدخل الموظفين مخفي خلف مربع «موظفو الشركة» أسفل البطاقة.
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.4 35.3 44 30 44 24c0-1.3-.1-2.6-.4-3.9z" />
  </svg>
);

export default function Login({ onLoggedIn }) {
  // mode: signin | signup | forgot
  const [mode, setMode] = useState('signin');
  const [staffOpen, setStaffOpen] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState(null);

  // حقول الزبائن
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  // حقول الموظفين
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');

  const [oauthPending, setOauthPending] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.from('company_profile').select('company_name, company_name_en, logo_path').eq('id', 1).single()
      .then(({ data }) => setCompany(data))
      .catch(() => {});
  }, []);

  // رسائل رجوع OAuth/الاسترجاع: نعرض الخطأ بدل الفشل الصامت
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);
    const desc = hashParams.get('error_description') || queryParams.get('error_description');
    const err = hashParams.get('error') || queryParams.get('error');
    if (desc || err) {
      setError('فشل الدخول: ' + decodeURIComponent(desc || err).replace(/\+/g, ' '));
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    if (queryParams.get('code') || hashParams.get('access_token')) {
      setOauthPending(true);
      const t = setTimeout(() => {
        setOauthPending(false);
        setError('لم يكتمل الدخول — أعد المحاولة');
      }, 8000);
      return () => clearTimeout(t);
    }
  }, []);

  function switchMode(m) {
    setMode(m);
    setError('');
    setInfo('');
  }

  async function loginWithGoogle() {
    setError('');
    const cleanPath = window.location.pathname.replace(/index\.html$/, '');
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + cleanPath },
    });
    if (oauthError) setError('تعذر بدء الدخول بحساب Google: ' + oauthError.message);
  }

  async function handleSignin(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('أدخل البريد الإلكتروني وكلمة المرور');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        setError('البريد أو كلمة المرور غير صحيحة');
        return;
      }
      onLoggedIn();
    } catch {
      setError('تعذر الاتصال — تحقق من الإنترنت');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) return setError('أدخل اسمك');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('أدخل بريداً إلكترونياً صحيحاً');
    if (phone.trim().replace(/\D/g, '').length < 10) return setError('أدخل رقم هاتف صحيح (11 رقماً)');
    if (password.length < 6) return setError('كلمة المرور 6 أحرف على الأقل');
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim(), phone: phone.trim() } },
      });
      if (err) {
        setError(/registered/i.test(err.message) ? 'هذا البريد مسجل مسبقاً — جرب تسجيل الدخول' : 'تعذر إنشاء الحساب: ' + err.message);
        return;
      }
      onLoggedIn();
    } catch {
      setError('تعذر الاتصال — تحقق من الإنترنت');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('أدخل بريدك الإلكتروني المسجل');
    setBusy(true);
    try {
      const cleanPath = window.location.pathname.replace(/index\.html$/, '');
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + cleanPath,
      });
      if (err) {
        setError('تعذر الإرسال: ' + err.message);
        return;
      }
      setInfo('أرسلنا رابط استعادة كلمة المرور إلى بريدك — افتح الرسالة واضغط الرابط');
    } finally {
      setBusy(false);
    }
  }

  async function handleStaffLogin(e) {
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
    } catch {
      setError('تعذر الاتصال — تحقق من الإنترنت');
    } finally {
      setBusy(false);
    }
  }

  const logo = company?.logo_path && company.logo_path.startsWith('data:') ? company.logo_path : 'logo.png';

  return (
    <div className="splash-overlay login-scene">
      <div className="login-card login-card-v2">
        <img className="login-logo" src={logo} alt="بلاد اوتو" />
        <h1 className="login-title">{company?.company_name || 'بلاد اوتو'}</h1>
        <p className="login-tagline">☀️ احسب سعر منظومتك الشمسية خلال دقيقة — بأسعار حقيقية وعرض جاهز</p>

        {!isConfigured && (
          <div className="alert alert-warning" style={{ textAlign: 'center' }}>
            لم تُربط قاعدة البيانات بعد — يحتاج إعداد Supabase
          </div>
        )}

        {oauthPending && <div className="alert alert-info" style={{ textAlign: 'center' }}>⏳ جارٍ إتمام الدخول...</div>}
        {info && <div className="alert alert-info">{info}</div>}
        {error && <div className="login-error">{error}</div>}

        {!staffOpen && (
          <>
            <div className="login-tabs">
              <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => switchMode('signin')}>
                تسجيل الدخول
              </button>
              <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>
                حساب جديد
              </button>
            </div>

            {mode === 'signup' && (
              <form onSubmit={handleSignup}>
                <div className="field">
                  <label>الاسم</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="اسمك الكامل" />
                </div>
                <div className="field">
                  <label>البريد الإلكتروني</label>
                  <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
                </div>
                <div className="field">
                  <label>رقم الهاتف</label>
                  <input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xxxxxxxxx" />
                </div>
                <div className="field">
                  <label>كلمة المرور</label>
                  <input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6 أحرف فأكثر" />
                </div>
                <button className="btn btn-primary login-btn" type="submit" disabled={busy}>
                  {busy ? 'جاري الإنشاء...' : '✨ إنشاء الحساب والدخول'}
                </button>
              </form>
            )}

            {mode === 'signin' && (
              <form onSubmit={handleSignin}>
                <div className="field">
                  <label>البريد الإلكتروني</label>
                  <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
                </div>
                <div className="field">
                  <label>كلمة المرور</label>
                  <input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <button className="btn btn-primary login-btn" type="submit" disabled={busy}>
                  {busy ? 'جاري الدخول...' : 'دخول'}
                </button>
                <button type="button" className="login-link" onClick={() => switchMode('forgot')}>
                  نسيت كلمة المرور؟
                </button>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={handleForgot}>
                <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>
                  أدخل بريدك المسجل وسنرسل لك رابط تعيين كلمة مرور جديدة
                </p>
                <div className="field">
                  <label>البريد الإلكتروني</label>
                  <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
                </div>
                <button className="btn btn-primary login-btn" type="submit" disabled={busy}>
                  {busy ? 'جاري الإرسال...' : '📮 إرسال رابط الاستعادة'}
                </button>
                <button type="button" className="login-link" onClick={() => switchMode('signin')}>
                  ← رجوع لتسجيل الدخول
                </button>
              </form>
            )}

            {mode !== 'forgot' && (
              <>
                <div className="login-divider">
                  <span>أو</span>
                </div>
                <button type="button" className="google-btn" onClick={loginWithGoogle}>
                  <GoogleIcon /> المتابعة بحساب Google
                </button>
              </>
            )}
          </>
        )}

        {staffOpen && (
          <form onSubmit={handleStaffLogin}>
            <p className="muted" style={{ textAlign: 'center', marginTop: 4 }}>دخول موظفي الشركة</p>
            <div className="field">
              <label>اسم المستخدم</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus placeholder="مثال: حيدر — أو رقمك (2 مثلاً)" />
            </div>
            <div className="field">
              <label>الرمز</label>
              <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="رمز الدخول" />
            </div>
            <button className="btn btn-primary login-btn" type="submit" disabled={busy}>
              {busy ? 'جاري الدخول...' : 'دخول الموظفين'}
            </button>
          </form>
        )}

        <label className="staff-toggle">
          <input type="checkbox" checked={staffOpen} onChange={(e) => { setStaffOpen(e.target.checked); setError(''); setInfo(''); }} />
          موظفو الشركة
        </label>

        <div className="login-dev">تطوير: احمد علي — 07728736250</div>
        <button
          type="button"
          className="login-link"
          style={{ fontSize: '0.75rem' }}
          onClick={async () => {
            try {
              const reg = await navigator.serviceWorker?.getRegistration();
              await reg?.update();
            } catch {
              /* نكمل */
            }
            window.location.reload();
          }}
        >
          🔄 تحديث التطبيق لآخر نسخة
        </button>
      </div>
    </div>
  );
}
