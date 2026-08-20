import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(HERE, '../src/lib/pdfExport.js'), 'utf8');
const builder = fs.readFileSync(path.join(HERE, '../src/pages/QuoteBuilder.jsx'), 'utf8');
const customer = fs.readFileSync(path.join(HERE, '../src/pages/CustomerView.jsx'), 'utf8');

// العطل المُبلَّغ: بمتصفح التلفون `navigator.share` ما رجّع أبداً (لا نجاح ولا خطأ)
// لأن «لمسة المستخدم» تنتهي أثناء توليد الملف — فبقى شريط التحميل يلف بلا نهاية.
describe('التصدير بالتلفون ما يعلّق بلا نهاية', () => {
  it('المشاركة منسابقة بمهلة — ماكو await عارية على navigator.share', () => {
    expect(src).toContain('function shareFile');
    expect(src).toContain('SHARE_TIMED_OUT');
    // ماكو نداء مباشر بلا حارس داخل deliverPdf
    const deliver = src.slice(src.indexOf('export async function deliverPdf'));
    const body = deliver.slice(0, deliver.indexOf('\n}'));
    expect(body).toContain('shareFile(pdfFile, fileName)');
    expect(body).not.toMatch(/await navigator\.share\(/);
  });

  it('انتهاء المهلة يفتح نافذة الخيارات مو يرمي خطأ', () => {
    const deliver = src.slice(src.indexOf('export async function deliverPdf'));
    const body = deliver.slice(0, deliver.indexOf('\n}'));
    expect(body).toContain('showDeliverDialog({ pdfFile, blob, fileName, allowShare: true })');
  });

  it('الإلغاء من المستخدم يبقى إلغاءً مو خطأ', () => {
    expect(src).toContain("outcome.name === 'AbortError'");
  });

  it('لوحة المشاركة إذا انفتحت فعلاً ما تنقطع بالمهلة', () => {
    // فقدان تركيز الصفحة = اللوحة مفتوحة والدور على المستخدم
    expect(src).toContain("window.addEventListener('blur', onLeave)");
    expect(src).toContain("document.addEventListener('visibilitychange', onVisibility)");
    expect(src).toContain('if (!wentAway) finish(SHARE_TIMED_OUT)');
  });

  it('شريط التحميل يطفى وقت انتظار المستخدم — مو وقت انتظار الجهاز', () => {
    expect(src).toContain('function stopBusyIndicator');
    // يُنادى بمكانين: عند فتح لوحة المشاركة، وعند فتح نافذة الخيارات
    expect([...src.matchAll(/stopBusyIndicator\(\)/g)].length).toBeGreaterThanOrEqual(3);
  });

  it('المهلة معقولة — لا قصيرة تقطع اللوحة ولا طويلة تخلي البياع ينتظر', () => {
    const m = src.match(/const SHARE_TIMEOUT_MS = (\d+);/);
    expect(m).toBeTruthy();
    const ms = Number(m[1]);
    expect(ms).toBeGreaterThanOrEqual(8000);
    expect(ms).toBeLessThanOrEqual(20000);
  });
});

describe('حارس عام: التصدير والحفظ ما يعلقون', () => {
  it('شاشة الموظف تحرس التصدير والحفظ', () => {
    expect(builder).toContain('const EXPORT_TIMEOUT_MS = 60000');
    expect(builder).toContain('function withTimeout');
    expect([...builder.matchAll(/withTimeout\(/g)].length).toBeGreaterThanOrEqual(3);
  });
  it('الرسالة تدل البياع على زر تحديث النسخة', () => {
    expect(builder).toContain('🔄');
  });
  it('شاشة الزبون محروسة هي هم', () => {
    expect(customer).toContain('التصدير طوّل أكثر من 60 ثانية');
  });
});

// العطل الثاني المُبلَّغ: التصدير من صفحة «العروض» يشتغل ومن الشاشة الرئيسية لا.
// السبب: exportDraftPdf كان ينادي `supabase.auth.getUser()` — وهو **نداء شبكة**
// لخادم المصادقة — بينما exportPdf (العروض) ما ينادي المصادقة إطلاقاً.
// بتلفون على شبكة ضعيفة النداء يبقى معلّقاً بلا مهلة، فيعلّق التصدير كله.
describe('التصدير ما يعتمد على نداء مصادقة شبكي', () => {
  const dataApi = fs.readFileSync(path.join(HERE, '../src/lib/dataApi.js'), 'utf8');
  const log = fs.readFileSync(path.join(HERE, '../src/lib/activityLog.js'), 'utf8');

  it('ماكو نداء getUser مباشر بطبقة البيانات — كله يمر بـcurrentUser', () => {
    const direct = [...dataApi.matchAll(/supabase\.auth\.getUser\(\)/g)];
    // نداء واحد بس: الفولباك المحروس داخل currentUser نفسها
    expect(direct.length).toBe(1);
    const helper = dataApi.slice(dataApi.indexOf('async function currentUser()'));
    expect(helper.slice(0, helper.indexOf('\n}\n'))).toContain('supabase.auth.getUser()');
  });

  it('الجلسة المحلية أولاً — بلا شبكة', () => {
    const helper = dataApi.slice(dataApi.indexOf('async function currentUser()'));
    const body = helper.slice(0, helper.indexOf('\n}\n'));
    expect(body.indexOf('getSession()')).toBeLessThan(body.indexOf('getUser()'));
  });

  it('الفولباك الشبكي محروس بمهلة وما يرمي', () => {
    expect(dataApi).toContain('AUTH_NETWORK_TIMEOUT_MS');
    const helper = dataApi.slice(dataApi.indexOf('async function currentUser()'));
    const body = helper.slice(0, helper.indexOf('\n}\n'));
    expect(body).toContain('Promise.race');
    expect(body).toContain('return null');
  });

  it('مسار التصدير يستعمل currentUser مو النداء الخام', () => {
    const fn = dataApi.slice(dataApi.indexOf('async exportDraftPdf(input)'));
    const body = fn.slice(0, fn.indexOf('\n    },'));
    expect(body).toContain('const pdfUser = await currentUser();');
    expect(body).not.toContain('supabase.auth.getUser()');
  });

  it('سجل الحركات ما يوقف العملية بنداء شبكة', () => {
    expect(log).not.toContain('supabase.auth.getUser()');
    expect(log).toContain('supabase.auth.getSession()');
  });
});

// «ما طلعت أي رسالة وانتظرت 3 دقائق»: الحارس كان يشتغل فعلاً، بس الرسالة
// تنرسم بوسط الصفحة والبياع بالتلفون واقف عند الشريط اللاصق بالأسفل — فما
// يشوفها. وشريط التحميل يبقى يلف لأن النداء المعلّق ما يحرّر عدّاد الانشغال.
describe('الرسالة تبين والشريط يهدأ', () => {
  const styles = fs.readFileSync(path.join(HERE, '../src/styles.css'), 'utf8');
  const main = fs.readFileSync(path.join(HERE, '../src/main.jsx'), 'utf8');

  it('الرسالة داخل الشريط اللاصق مو بوسط الصفحة', () => {
    const bar = builder.slice(builder.indexOf('<div className="action-bar">'));
    const body = bar.slice(0, bar.indexOf('</div>\n\n'));
    expect(body).toContain('className="action-msg"');
    // ما بقت مرمية بمنتصف المحتوى
    expect(builder).not.toContain('{saveMessage && <div className="alert alert-info">{saveMessage}</div>}');
  });

  it('الرسالة إلها زر إغلاق وتتمرر إذا طالت', () => {
    expect(builder).toContain('action-msg-x');
    const block = styles.slice(styles.indexOf('.action-msg {'));
    expect(block.slice(0, block.indexOf('}'))).toMatch(/overflow-y:\s*auto/);
    expect(block.slice(0, block.indexOf('}'))).toMatch(/flex:\s*1 0 100%/);
  });

  it('نداء معلّق ما يقدر يخلي شريط التحميل يلف للأبد', () => {
    expect(main).toContain('MAX_PENDING_MS');
    expect(main).toContain('const stuckTimer = setTimeout(release, MAX_PENDING_MS)');
    // التحرير مرة وحدة بس — ما ننقص العدّاد مرتين لو رجع النداء بعد السقف
    expect(main).toContain('if (released) return;');
    expect(main).toContain('pendingCount = Math.max(0, pendingCount - 1)');
  });
});

// السلسلة اللي وصفها المستخدم: صدّر ← نافذة الخيارات ← «مشاركة» ← واتساب ←
// رجع للبرنامج ← وبعدها طلعت «التصدير طوّل أكثر من 60 ثانية» رغم إن الملف
// انبعث فعلاً. السبب: `navigator.share` ما يرجّع أبداً بعد الرجوع من واتساب.
describe('الرجوع من واتساب يعني إن المشاركة خلصت', () => {
  it('ننتظر رجوع الصفحة للمقدمة مو رد المشاركة لحاله', () => {
    expect(src).toContain('SHARE_RETURNED');
    expect(src).toContain("window.addEventListener('focus', onReturn)");
    expect(src).toContain("document.addEventListener('visibilitychange', onVisibility)");
    // الخروج والرجوع الاثنان مرصودان
    expect(src).toContain("document.visibilityState === 'hidden'");
  });

  it('الرجوع يُحسب نجاحاً مو خطأ', () => {
    const deliver = src.slice(src.indexOf('export async function deliverPdf'));
    const body = deliver.slice(0, deliver.indexOf('\n}'));
    expect(body).toContain('if (outcome === SHARE_RETURNED) return { canceled: false, shared: true }');
  });

  it('زر المشاركة بنافذة الخيارات يمر بنفس القاعدة', () => {
    const dlg = src.slice(src.indexOf('shareBtn.onclick'));
    const body = dlg.slice(0, dlg.indexOf('};'));
    expect(body).toContain('shareFile(pdfFile, fileName)');
    expect(body).toContain('SHARE_RETURNED');
    expect(body).not.toMatch(/await navigator\.share\(/);
  });

  it('مهلة قصيرة بعد الرجوع تنطي فرصة للنتيجة الحقيقية', () => {
    expect(src).toMatch(/returnTimer = setTimeout\(\(\) => finish\(SHARE_RETURNED\), \d+\)/);
  });

  it('المهلة الأصلية تنطبق فقط إذا اللوحة ما انفتحت', () => {
    expect(src).toContain('if (!wentAway) finish(SHARE_TIMED_OUT)');
  });

  it('الإلغاء الصريح يبقى إلغاءً', () => {
    expect(src).toContain("outcome.name === 'AbortError'");
  });
});

// المستخدم حصر العطل: «بس بجهازي وبس بمتصفح سفاري». وسفاري الآيفون له سلوكان
// معروفان يكسران التسليم: يتجاهل خاصية `download` بروابط blob:، وتحرير الرابط
// فوراً بعد الضغط يقطع التنزيل قبل ما يبدي.
describe('تسليم الملف بسفاري الآيفون', () => {
  it('يتعرّف على سفاري الآيفون ويستثني كروم وفايرفوكس الآيفون', () => {
    expect(src).toContain('function isIosSafari');
    expect(src).toMatch(/CriOS\|FxiOS\|EdgiOS\|OPiOS\|Chrome/);
    // الآيباد بوضع سطح المكتب ينحسب iOS هم
    expect(src).toContain("navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1");
  });

  it('بسفاري يفتح الملف بتبويب بدل <a download> اللي يتجاهلها', () => {
    const fn = src.slice(src.indexOf('function downloadBlob'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('if (isIosSafari())');
    expect(body).toContain("window.open(url, '_blank')");
    // وإذا انمنعت النوافذ المنبثقة نفتحه بنفس التبويب بدل ما ما يصير شي
    expect(body).toContain('window.location.href = url');
  });

  it('تحرير رابط blob مؤجل — ما يقطع التنزيل', () => {
    const fn = src.slice(src.indexOf('function downloadBlob'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/setTimeout\(\(\) => URL\.revokeObjectURL\(url\), \d+\)/);
    // ماكو تحرير فوري بعد الضغط
    expect(body).not.toMatch(/a\.click\(\);\s*URL\.revokeObjectURL/);
  });

  it('المسار الاعتيادي (غير سفاري) يبقى تنزيلاً مباشراً', () => {
    const fn = src.slice(src.indexOf('function downloadBlob'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('a.download = fileName');
    expect(body).toContain('a.click()');
  });
});

// العطل بقي بعد إصلاح المشاركة: الرسالة «التصدير طوّل» تعني إن التعليق **قبل**
// خطوة التسليم — أي بتوليد الملف. ومسار التوليد فيه انتظارات مفتوحة بلا نهاية،
// و`try/catch` ما ينفع معها: هو يمسك الأخطاء لا التعليق.
describe('كل خطوة بتوليد الملف إلها سقف زمني', () => {
  it('اكو مساعد سقف عام ببديل بدل الرمي', () => {
    expect(src).toContain('function withLimit');
    expect(src).toMatch(/const guard = new Promise\(\(resolve\) => \{ timer = setTimeout\(\(\) => resolve\(fallback\)/);
  });

  it('انتظار جاهزية الخطوط محدود — ممكن ما تنحل بسفاري', () => {
    expect(src).toContain('withLimit(document.fonts.ready, FONT_READY_LIMIT)');
    expect(src).not.toMatch(/^\s*await document\.fonts\.ready;$/m);
  });

  it('تحميل حزمة الثري-دي محدود — `import()` المعلّق ما يمسكه catch', () => {
    expect(src).toContain('STRUCTURE_LIMIT');
    const blk = src.slice(src.indexOf("await import('./structure3d.js')") - 400);
    expect(blk.slice(0, 700)).toContain('withLimit(');
    // بلا صورة نتخطى صفحة الغلاف بدل ما نمرر قيمة فارغة
    expect(src).toContain('if (img) return buildStructurePageHtml(');
  });

  it('toBlob محدود وله بديل متزامن', () => {
    expect(src).toContain('TO_BLOB_LIMIT');
    expect(src).toContain("canvas.toDataURL('image/png').split(',')[1]");
    expect(src).not.toContain('const blob = await new Promise((res) => canvas.toBlob(res, ');
  });

  it('السقوف معقولة — تكفي الجهاز البطيء وما تخلي البياع ينتظر', () => {
    for (const [name, lo, hi] of [['FONT_READY_LIMIT', 4000, 15000],
                                  ['STRUCTURE_LIMIT', 8000, 30000],
                                  ['TO_BLOB_LIMIT', 5000, 20000]]) {
      const m = src.match(new RegExp('const ' + name + ' = (\\d+);'));
      expect(m, name).toBeTruthy();
      const v = Number(m[1]);
      expect(v, name).toBeGreaterThanOrEqual(lo);
      expect(v, name).toBeLessThanOrEqual(hi);
    }
  });
});

// العطل بقي بعد كل الإصلاحات، والمستخدم مسح البيانات وأعاد التشغيل بلا فايدة.
// الرسالة العامة «التصدير طوّل» ما تدل على مكان — فصارت كل خطوة تسمّي نفسها،
// حتى أول رسالة تجي تحدد الخطوة العالقة بدل التخمين.
describe('كل خطوة تسمّي نفسها عند التعليق', () => {
  const dataApi = fs.readFileSync(path.join(HERE, '../src/lib/dataApi.js'), 'utf8');

  it('مساعد الخطوة يرمي خطأً باسم الخطوة', () => {
    expect(src).toContain('function withStep');
    expect(src).toMatch(/reject\(new Error\(`علقت خطوة: \$\{name\}`\)\)/);
    expect(dataApi).toContain('function netStep');
    expect(dataApi).toMatch(/reject\(new Error\(`علقت خطوة: \$\{name\}`\)\)/);
  });

  it('ماكو نداء html2canvas بلا سقف واسم', () => {
    const calls = [...src.matchAll(/html2canvas\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    // كل نداء لازم يسبقه withStep بنفس السطر أو اللي قبله
    for (const m of calls) {
      const before = src.slice(Math.max(0, m.index - 200), m.index);
      expect(before, `نداء html2canvas بلا withStep عند ${m.index}`).toContain('withStep(');
    }
  });

  it('أسماء الخطوات عربية ومفهومة للبياع', () => {
    for (const name of ['رسم صفحة الفاتورة', 'رسم صفحة التصميم', 'رسم الصورة']) {
      expect(src, name).toContain(`'${name}'`);
    }
    for (const name of ['قراءة المخزون والإعدادات', 'قراءة ملف الشركة', 'حجز رقم العرض']) {
      expect(dataApi, name).toContain(`'${name}'`);
    }
  });

  it('طلبات الشبكة بمسار التصدير محدودة — مكتبة سوبابيس بلا مهلة', () => {
    expect(dataApi).toContain('const NET_STEP_LIMIT');
    const fn = dataApi.slice(dataApi.indexOf('async exportDraftPdf(input)'));
    const body = fn.slice(0, fn.indexOf('\n    },'));
    // النداءات مكتوبة بأسطر متعددة، فنفحص الاسم داخل جسم الدالة
    for (const name of ['قراءة المخزون والإعدادات', 'قراءة ملف الشركة', 'حجز رقم العرض']) {
      expect(body, name).toContain(`'${name}'`);
    }
    expect((body.match(/netStep\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
