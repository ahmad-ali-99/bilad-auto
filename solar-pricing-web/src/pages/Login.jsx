import React, { useState, useEffect } from 'react';
import { supabase, usernameToEmail, isConfigured } from '../lib/supabase.js';
import { forceUpdateApp } from '../lib/appUpdate.js';

// شاشة الدخول: **دخول موظفي الشركة حصراً**.
//
// انشال من هنا: التسجيل العام بالإيميل، والدخول بالإيميل، ودخول Google،
// واسترجاع كلمة المرور، ومربع «موظفو الشركة» اللي كان يخبّي المدخل الحقيقي
// خلف تأشيرة. البرنامج أداة داخلية — ما كان إله معنى يفتح باب تسجيل لأي
// واحد بالإنترنت، والحسابات كلها تنصنع من شاشة الإعدادات.
export default function Login({ onLoggedIn }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState(null);
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.from('company_profile').select('company_name, company_name_en, logo_path').eq('id', 1).single()
      .then(({ data }) => setCompany(data))
      .catch(() => {});
  }, []);

  async function handleStaffLogin(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !code) {
      setError('اكتب اسم المستخدم والرمز');
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
      <div className="login-card login-staff">
        <img className="login-logo" src={logo} alt="بلاد اوتو" />
        <h1 className="login-title">{company?.company_name || 'بلاد اوتو'}</h1>
        <p className="login-tagline">دخول موظفي الشركة</p>

        {!isConfigured && (
          <div className="alert alert-warning" style={{ textAlign: 'center' }}>
            لم تُربط قاعدة البيانات بعد — يحتاج إعداد Supabase
          </div>
        )}
        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleStaffLogin}>
          <div className="field">
            <label>اسم المستخدم</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              placeholder="اسمك مثل ما مسجّل"
            />
          </div>
          <div className="field">
            <label>الرمز</label>
            {/* زر الإظهار جوّا الخانة: بالجوال الرمز ينكتب بالعمى وأي غلطة حرف
                ترجع «اسم المستخدم أو الرمز غير صحيح» بلا ما يعرف السبب */}
            <div className="code-wrap">
              <input
                type={showCode ? 'text' : 'password'}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="current-password"
                placeholder="رمز الدخول"
              />
              <button
                type="button"
                className="code-eye"
                onClick={() => setShowCode((v) => !v)}
                title={showCode ? 'إخفاء الرمز' : 'إظهار الرمز'}
                aria-label={showCode ? 'إخفاء الرمز' : 'إظهار الرمز'}
              >
                {showCode ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <button className="btn btn-primary login-btn" type="submit" disabled={busy}>
            {busy ? 'جاري الدخول…' : 'دخول'}
          </button>
        </form>

        <div className="login-foot">
          <button type="button" className="login-link" onClick={forceUpdateApp}>
            🔄 تحديث التطبيق لآخر نسخة
          </button>
          <div className="login-dev">تطوير: احمد علي — 07728736250</div>
        </div>
      </div>
    </div>
  );
}
