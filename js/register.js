// تسجيل اهتمام الزوار: دخول بحساب Google ثم إدخال رقم الهاتف — يخزن بقاعدة بيانات المبيعات
// المفتاح أدناه علني (anon) ومحمي بسياسات RLS: الزائر يكتب ويقرأ سجله فقط.
(function () {
  var SUPA_URL = 'https://ojdidnobtvsrtifhvwjn.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZGlkbm9idHZzcnRpZmh2d2puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDA2MDksImV4cCI6MjA5OTE3NjYwOX0.q3VZ6bSPF_sGaLgjNUBFa934TMSYTPT2Wc4bZWq3nd4';
  var root = document.getElementById('register-widget');
  if (!root || typeof supabase === 'undefined') return;
  var client = supabase.createClient(SUPA_URL, SUPA_KEY);

  function el(id) { return document.getElementById(id); }
  function show(id) {
    ['reg-start', 'reg-phone-step', 'reg-done'].forEach(function (x) {
      el(x).style.display = x === id ? 'block' : 'none';
    });
  }
  function status(msg, isError) {
    var s = el('reg-status');
    s.textContent = msg || '';
    s.style.color = isError ? '#c0392b' : '#2f8a4b';
  }

  async function render() {
    var res = await client.auth.getSession();
    var session = res.data ? res.data.session : null;
    if (!session) { show('reg-start'); return; }
    // حسابات الشركة الداخلية ما تسجل كجهات تواصل
    if (String(session.user.email || '').indexOf('@biladauto.local') > -1) {
      await client.auth.signOut({ scope: 'local' });
      show('reg-start');
      return;
    }
    var name = (session.user.user_metadata && (session.user.user_metadata.full_name || session.user.user_metadata.name)) || '';
    var lead = null;
    try {
      var q = await client.from('leads').select('phone').eq('user_id', session.user.id).maybeSingle();
      lead = q.data;
    } catch (e) { /* الجدول بعده غير منشأ */ }
    if (lead && lead.phone) {
      el('reg-done-name').textContent = name || session.user.email;
      show('reg-done');
    } else {
      el('reg-hello').textContent = name ? 'أهلاً ' + name + ' 👋' : 'أهلاً بك 👋';
      show('reg-phone-step');
    }
  }

  el('reg-google').addEventListener('click', async function () {
    status('');
    var redirect = window.location.origin + window.location.pathname + '#register';
    var res = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect } });
    if (res.error) status('تعذر بدء تسجيل الدخول: ' + res.error.message, true);
  });

  el('reg-save').addEventListener('click', async function () {
    var phone = el('reg-phone').value.trim();
    if (phone.replace(/\D/g, '').length < 10) { status('يرجى إدخال رقم هاتف صحيح (11 رقماً)', true); return; }
    var res = await client.auth.getSession();
    var session = res.data.session;
    if (!session) { show('reg-start'); return; }
    var meta = session.user.user_metadata || {};
    var up = await client.from('leads').upsert({
      user_id: session.user.id,
      full_name: meta.full_name || meta.name || null,
      email: session.user.email,
      phone: phone,
      source: 'website',
    }, { onConflict: 'user_id' });
    if (up.error) { status('تعذر الحفظ: ' + up.error.message, true); return; }
    status('');
    render();
  });

  Array.prototype.forEach.call(document.querySelectorAll('.reg-signout'), function (b) {
    b.addEventListener('click', async function () {
      await client.auth.signOut({ scope: 'local' });
      show('reg-start');
    });
  });

  client.auth.onAuthStateChange(function () { render(); });
  render();
})();
