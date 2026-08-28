import React, { useState, useEffect, useRef } from 'react';
import Inventory from './pages/Inventory.jsx';
import QuoteBuilder from './pages/QuoteBuilder.jsx';
import Quotes from './pages/Quotes.jsx';
import Packages from './pages/Packages.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import GlobalLoadingBar from './components/GlobalLoadingBar.jsx';
import AssistantBar from './components/AssistantBar.jsx';
import CustomerView from './pages/CustomerView.jsx';
import Requests from './pages/Requests.jsx';
import History from './pages/History.jsx';
import { supabase } from './lib/supabase.js';
import { isAdminName } from './lib/agent.js';
import { isOwnerAccount } from './lib/permissions.js';
import { forceUpdateApp } from './lib/appUpdate.js';
import { clearExportMethod } from './lib/exportMethod.js';
import { startFitTables } from './lib/fitTables.js';

const PAGES = [
  { key: 'quote', label: 'عرض', icon: '🧮' },
  { key: 'quotes', label: 'العروض', icon: '📄' },
  { key: 'inventory', label: 'مخزون', icon: '📦' },
  { key: 'settings', label: 'إعدادات', icon: '⚙' },
];

// صفحة الطلبات (جهات التواصل + طلبات العروض) للمشرفين الثلاثة فقط
const ADMIN_PAGES = [{ key: 'requests', label: 'طلبات', icon: '📨' }];

// شاشة تعيين كلمة مرور جديدة — تظهر عند فتح رابط الاستعادة من الإيميل
function ResetPasswordScreen({ onDone }) {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (pw1.length < 6) return setMsg('كلمة المرور 6 أحرف على الأقل');
    if (pw1 !== pw2) return setMsg('الكلمتان غير متطابقتين');
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) {
        setMsg('تعذر الحفظ: ' + error.message);
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="splash-overlay login-scene">
      <form className="login-card login-card-v2" onSubmit={save}>
        <div style={{ fontSize: '2.2rem', textAlign: 'center' }}>🔑</div>
        <h1 className="login-title">تعيين كلمة مرور جديدة</h1>
        {msg && <div className="login-error">{msg}</div>}
        <div className="field">
          <label>كلمة المرور الجديدة</label>
          <input type="password" dir="ltr" value={pw1} onChange={(e) => setPw1(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>تأكيد كلمة المرور</label>
          <input type="password" dir="ltr" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <button className="btn btn-primary login-btn" type="submit" disabled={busy}>
          {busy ? 'جاري الحفظ...' : 'حفظ والدخول'}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState('quote');
  // عرض محسوب وما انحفظ بعد — نسأل قبل ما نغادر صفحته
  const [quoteUnsaved, setQuoteUnsaved] = useState(false);
  // صناديق الجداول تاخذ الارتفاع المتاح بالضبط — حتى شريط التمرير الأفقي يبقى ظاهراً
  useEffect(() => startFitTables(), []);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // تعبئة من المساعد: للعرض (حقول جاهزة) أو للمخزون (نص بحث) — nonce حتى تنطبق بكل أمر جديد
  const [quotePrefill, setQuotePrefill] = useState(null);
  const [inventorySearch, setInventorySearch] = useState(null);
  // المساعد الذكي بنافذة عائمة متاحة من كل الصفحات — مسودة العرض الحالية تنرفع من QuoteBuilder
  const [assistantOpen, setAssistantOpen] = useState(false);
  const draftRef = useRef(null);

  // وضع استعادة كلمة المرور: يتفعل عند فتح رابط الاستعادة المرسل بالإيميل
  const [recovery, setRecovery] = useState(false);
  // زر التحديث قيد التنفيذ — كل الـhooks لازم تبقى هنا فوق قبل أي return مشروط
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    // صمام أمان: مهما صار ما تبقى شاشة التحميل معلقة — بعد 6 ثوانٍ نعرض الدخول
    const failsafe = setTimeout(() => setLoading(false), 6000);
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
      setLoading(false);
    });
    return () => {
      clearTimeout(failsafe);
      sub.subscription.unsubscribe();
    };
  }, []);

  // سجل الصلاحيات ينحمّل مرة وحدة عند بدء الجلسة، ويُحطّ بطبقة الصلاحيات
  // قبل ما ترسم أي شاشة. **متزامن بعده**: دوال الصلاحيات تنندى أثناء الرسم
  // فما ينفع تكون async، فالحمل غير المتزامن يصير هنا مرة وحدة.
  const [rolesReady, setRolesReady] = useState(false);
  useEffect(() => {
    if (!session) {
      setRolesReady(false);
      clearExportMethod();   // الحساب الجاي ما يرث اختيار اللي قبله
      return;
    }
    let alive = true;
    const done = () => { if (alive) setRolesReady(true); };
    // **مهلة قصوى ٢.٥ ثانية**: هذا التطبيق PWA يشتغل أوفلاين بالكامل بعد أول
    // فتح، وكانت قراءة السجل تحجز الشاشة كلها بلا مهلة — فأي شبكة واقفة أو
    // بطيئة تخلي المستخدم على «جاري التحميل...» للأبد والتطبيق يبان ميّتاً.
    // بانتهاء المهلة نكمل بالافتراضات، والسجل يلحق لما يوصل.
    const timer = setTimeout(done, 2500);
    // Promise.resolve يلف النتيجة: لو النداء ما رجّع وعداً (نسخة مخزّنة قديمة
    // بلا api.staff) كان `.catch` على undefined يرمي ويطيح التطبيق كله
    Promise.all([
      Promise.resolve(window.api?.staff?.load?.()).catch(() => {}),
      // تفضيل محرك التصدير يخص الحساب — ينقرا معه بنفس الجولة
      Promise.resolve(window.api?.exportPref?.load?.()).catch(() => {}),
    ]).finally(() => { clearTimeout(timer); done(); });
    return () => { alive = false; clearTimeout(timer); };
  }, [session]);

  // جلسة حساب مو موظف — بقايا التسجيل العام قبل ما ينشال. نطلّعها بهدوء
  // بدل ما تبقى معلّقة بشاشة ماكو إلها محتوى. (بإفكت لا أثناء الرسم.)
  useEffect(() => {
    if (!session) return;
    const staff = String(session.user?.email || '').endsWith('@biladauto.local');
    if (staff) return;
    supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    setSession(null);
  }, [session]);

  // كلك أيمن نسخ/لصق: أغلفة سطح المكتب (Electron) والموبايل (Capacitor) ما عندها
  // قائمة سياق أصلاً — نبني قائمة صغيرة تشتغل بحقول الإدخال وبأي نص محدد.
  // بالمتصفح العادي نترك قائمة المتصفح الأصلية مثل ما هي.
  useEffect(() => {
    const isShell = /Electron/i.test(navigator.userAgent) || !!window.Capacitor;
    if (!isShell) return;

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.style.display = 'none';
    document.body.appendChild(menu);
    const hide = () => (menu.style.display = 'none');

    // تعديل قيمة حقل بطريقة يلتقطها React (setter الأصلي + حدث input)
    const setNativeValue = (el, value) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const mkBtn = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.onmousedown = (ev) => ev.preventDefault();
      b.onclick = async () => {
        try {
          await fn();
        } catch {
          /* الحافظة مرفوضة — ما نكسر شي */
        }
        hide();
      };
      return b;
    };

    const onCtx = (e) => {
      const editable = e.target.closest('input, textarea');
      const isTextField = editable && !/checkbox|radio|file|button/.test(editable.type || 'text');
      const selText = String(window.getSelection());
      if (!isTextField && !selText) return hide();
      e.preventDefault();
      menu.innerHTML = '';

      const editSel = () => (isTextField ? editable.value.slice(editable.selectionStart ?? 0, editable.selectionEnd ?? 0) : '');
      const copyText = isTextField ? editSel() || editable.value : selText;

      if (copyText) menu.appendChild(mkBtn('📋 نسخ', () => navigator.clipboard.writeText(copyText)));
      if (isTextField && (editSel() || editable.value)) {
        menu.appendChild(
          mkBtn('✂ قص', async () => {
            const hasSel = editSel().length > 0;
            const start = hasSel ? editable.selectionStart : 0;
            const end = hasSel ? editable.selectionEnd : editable.value.length;
            await navigator.clipboard.writeText(editable.value.slice(start, end));
            setNativeValue(editable, editable.value.slice(0, start) + editable.value.slice(end));
          })
        );
      }
      if (isTextField) {
        menu.appendChild(
          mkBtn('📥 لصق', async () => {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            const start = editable.selectionStart ?? editable.value.length;
            const end = editable.selectionEnd ?? editable.value.length;
            setNativeValue(editable, editable.value.slice(0, start) + text + editable.value.slice(end));
          })
        );
        menu.appendChild(mkBtn('☑ تحديد الكل', () => editable.select()));
      }
      if (!menu.childElementCount) return hide();

      menu.style.display = 'block';
      const mw = 160;
      menu.style.left = Math.min(e.clientX, window.innerWidth - mw - 8) + 'px';
      menu.style.top = Math.min(e.clientY, window.innerHeight - menu.childElementCount * 40 - 12) + 'px';
    };

    document.addEventListener('contextmenu', onCtx);
    document.addEventListener('click', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('contextmenu', onCtx);
      document.removeEventListener('click', hide);
      window.removeEventListener('scroll', hide, true);
      menu.remove();
    };
  }, []);

  // ── واجهة الزبون: **مخفية مؤقتاً** ──────────────────────────────────────
  // التسجيل العام ودخول Google انشالوا من شاشة الدخول، فما عاد أكو طريق
  // يوصل هذي الشاشة. الكود باقٍ لأنه راح ينرجعله بالتحسين — بس ما ينعرض،
  // والجلسات القديمة تنطلع بدل ما تشوف شاشة نص شغّالة بلا مخرج.
  const CUSTOMER_VIEW_ENABLED = false;

  if (loading) {
    return (
      <div className="splash-overlay">
        <div className="splash-center">
          <img src="logo.png" alt="بلاد اوتو" className="splash-brand-logo" />
          <p style={{ color: '#fff' }}>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login onLoggedIn={() => {}} />;
  }

  if (recovery) {
    return <ResetPasswordScreen onDone={() => setRecovery(false)} />;
  }

  // بلا انتظار السجل، أول رسمة تطلع بالافتراضات القديمة وبعدها تنقلب —
  // تبويبات تظهر ثم تختفي قدّام عين المستخدم
  if (!rolesReady) {
    return (
      <div className="splash-overlay">
        <div className="splash-center">
          <img src="logo.png" alt="بلاد اوتو" className="splash-brand-logo" />
          <p style={{ color: '#fff' }}>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  // زبون (دخول Google): حاسبة تسعير مبسطة فقط — بلا تنقل ولا أدوات إدارية ولا مساعد
  const isStaff = String(session.user?.email || '').endsWith('@biladauto.local');
  if (!isStaff && !CUSTOMER_VIEW_ENABLED) {
    // بقايا حساب زبون (Google أو إيميل) — نرجّعه لشاشة الدخول، والخروج
    // الفعلي يصير بالإفكت أدناه حتى ما ننادي جانباً أثناء الرسم
    return <Login onLoggedIn={() => {}} />;
  }
  if (!isStaff) {
    return (
      <div className="mobile-shell">
        <GlobalLoadingBar />
        <header className="mobile-topbar">
          <span className="brand">
            <span className="brand-logo">
              <img src="logo-mark.png" alt="" />
            </span>
            <span className="brand-text">
              <b>بلاد اوتو</b>
              <small>حاسبة الطاقة الشمسية</small>
            </span>
          </span>
          <button
            className="topbar-chip"
            onClick={async () => {
              await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 1500))]);
              setSession(null);
            }}
            title="تسجيل الخروج"
          >
            خروج ⏻
          </button>
        </header>
        <main className="mobile-content" style={{ paddingBottom: 90 }}>
          <CustomerView user={session.user} />
        </main>
      </div>
    );
  }

  // حسابات الموظفين المرقمة تظهر بالرقم فقط (مستخدم2 ← 2)
  const currentUser = (session.user?.user_metadata?.username || '').replace(/^مستخدم(?=[0-9])/, '');
  // تبويب الطلبات للمشرفين الثلاثة فقط
  const isAdmin = isAdminName(session.user?.user_metadata?.username || '');
  // سجل الحركات (الهستوري) لحساب أحمد حصراً — الحماية الفعلية بـRLS بقاعدة البيانات
  const isAhmad = isOwnerAccount(session.user?.user_metadata?.username || '');
  // «العروض» متاحة للجميع — لكن البياع يشوف عروضه هو فقط (الفلترة بطبقة البيانات)
  const navPages = [
    ...(isAdmin ? [...PAGES.slice(0, 2), ...ADMIN_PAGES, ...PAGES.slice(2)] : PAGES),
    { key: 'packages', label: 'باقات', icon: '🖼' },
    ...(isAhmad ? [{ key: 'history', label: 'حركات', icon: '🕓' }] : []),
  ];

  // مغادرة صفحة العرض وبيه عرض محسوب ما انحفظ: نسأل بدل ما يروح ويرجع فيلگى
  // الأعداد انحسبت من جديد. المسودة المحلية تبقى محفوظة بالحالتين — السؤال عن
  // الحفظ بقاعدة البيانات مو عن ضياع المكتوب.
  function goToPage(next) {
    if (next === page) return;
    if (page === 'quote' && quoteUnsaved) {
      const go = confirm('العرض ما محفوظ بعد. تريد تطلع من الصفحة؟\n\nشغلك ما يضيع — بس العرض ما ينحفظ بقاعدة البيانات إلا بزر الحفظ.');
      if (!go) return;
    }
    setPage(next);
  }

  // خروج فوري: نمسح الجلسة محلياً بدون انتظار السيرفر (كان يعلق إذا الشبكة بطيئة)
  async function logout() {
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } finally {
      setSession(null);
    }
  }

  // رفرش كامل بضغطة: إجبار جلب آخر نسخة من الشبكة (يتخطى كاش النسخة القديمة)
  async function hardRefresh() {
    setRefreshing(true);
    await forceUpdateApp();
  }

  return (
    <div className="mobile-shell">
      <GlobalLoadingBar />
      <header className="mobile-topbar">
        <span className="brand">
          <span className="brand-logo">
            <img src="logo-mark.png" alt="" />
          </span>
          <span className="brand-text">
            <b>بلاد اوتو</b>
            <small>
              تسعير الطاقة الشمسية{' '}
              <span style={{ opacity: 0.55 }}>{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''}</span>
            </small>
          </span>
        </span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="topbar-chip" onClick={hardRefresh} disabled={refreshing} title="تحديث التطبيق لآخر نسخة">
            {refreshing ? '⏳' : '🔄'}
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
            onDraftChange={(d) => (draftRef.current = d)}
            onUnsavedChange={setQuoteUnsaved}
            // التعبئة تُستهلك مرة وحدة: كانت تبقى بالحالة، وصفحة العرض تنفكّ وترجع
            // تتركب بكل تنقّل — فيرجع البياع من قائمة ثانية ويلگى شغله انمسح
            // وحلّت محله بيانات العرض مثل ما انفتح أول مرة
            onPrefillUsed={() => setQuotePrefill(null)}
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
        {page === 'requests' && isAdmin && <Requests />}
        {page === 'history' && isAhmad && (
          <History
            onRestoreDraft={(prefill) => {
              setQuotePrefill({ ...prefill, nonce: Date.now() });
              setPage('quote');
            }}
          />
        )}
        {page === 'packages' && <Packages />}
        {page === 'settings' && <Settings />}
      </main>
      {/* المساعد الذكي عنصر بشريط التنقل — كان زراً عائماً يطبق على صفوف الجداول
          وعلى زر «حفظ التعديلات»، فانتقل هنا حتى ما يغطي ولا بكسل من المحتوى */}
      <nav className="mobile-bottomnav">
        {navPages.map((p) => (
          <button key={p.key} className={page === p.key ? 'active' : ''} onClick={() => goToPage(p.key)}>
            <span className="nav-icon">{p.icon}</span>
            <span>{p.label}</span>
          </button>
        ))}
        <button
          className={`nav-assistant${assistantOpen ? ' active' : ''}`}
          onClick={() => setAssistantOpen((o) => !o)}
          title="المساعد الذكي"
          aria-label="المساعد الذكي"
        >
          <span className="nav-icon">{assistantOpen ? '✕' : '🤖'}</span>
          <span>مساعد</span>
        </button>
      </nav>
      {assistantOpen && (
        <div className="assistant-drawer-overlay" onClick={() => setAssistantOpen(false)}>
          <div className="assistant-drawer" onClick={(e) => e.stopPropagation()}>
            <AssistantBar
              fill
              onQuote={(fields) => {
                setQuotePrefill({ ...fields, nonce: Date.now() });
                setPage('quote');
              }}
              onInventory={(search) => {
                setInventorySearch({ term: search, nonce: Date.now() });
                setPage('inventory');
              }}
              getDraft={() => draftRef.current}
            />
          </div>
        </div>
      )}
    </div>
  );
}
