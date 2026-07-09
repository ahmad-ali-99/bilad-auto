// الايجنت الحقيقي — يعمل على Google Gemini (الطبقة المجانية) مع أدوات حقيقية:
// يعبي العرض، يقرأ المخزون والأسعار، يفتح المخزون، ويعدل سعر مادة (بتأكيد من البياع).
// المفتاح مجاني من https://aistudio.google.com/apikey — يخزن مشتركاً بجدول app_config
// إذا موجود، وإلا محلياً بالجهاز (localStorage).
import { supabase } from './supabase.js';

const LS_KEY = 'biladauto_gemini_key';
// مرتبة: الأقوى أولاً، والخفيفة احتياط لأنها الأقل ازدحاماً بالطبقة المجانية —
// عند 404 (موديل متقاعد) أو 503 (ازدحام) أو 429 (حصة ممتلئة) ننتقل للي بعده تلقائياً
const MODELS = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'];

// ===== تخزين المفتاح =====
async function getAgentKey() {
  try {
    const { data, error } = await supabase.from('app_config').select('value').eq('key', 'gemini_api_key').maybeSingle();
    if (!error && data && data.value) return data.value;
  } catch {
    /* الجدول غير موجود بعد — نكمل على المحلي */
  }
  return localStorage.getItem(LS_KEY) || '';
}

// يحاول الحفظ المشترك بقاعدة البيانات، وإذا الجدول غير موجود يحفظ محلياً
async function setAgentKey(key) {
  const clean = String(key || '').trim();
  localStorage.setItem(LS_KEY, clean);
  try {
    const { error } = await supabase.from('app_config').upsert({ key: 'gemini_api_key', value: clean });
    if (!error) return { shared: true };
  } catch {
    /* ignore */
  }
  return { shared: false };
}

// SQL ينفذه المستخدم مرة وحدة بمحرر SQL بلوحة Supabase حتى يصير المفتاح مشتركاً لكل الموظفين
const SHARE_KEY_SQL = `create table if not exists app_config (key text primary key, value text);
alter table app_config enable row level security;
drop policy if exists app_config_auth on app_config;
create policy app_config_auth on app_config for all to authenticated using (true) with check (true);`;

// ===== تعريف الأدوات للموديل =====
const TOOL_DECLARATIONS = [
  {
    name: 'fill_quote',
    description:
      'يعبي حقول عرض السعر بالبرنامج ويحسب المنظومة فوراً. مرر فقط الحقول المعروفة من طلب الزبون. ساعات التجهيز الليلي إجبارية إذا اكو أمبير ليلي.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clientName: { type: 'STRING', description: 'اسم الزبون' },
        clientPhone: { type: 'STRING', description: 'رقم موبايل الزبون' },
        location: { type: 'STRING', description: 'الموقع/المنطقة' },
        roofAreaM2: { type: 'NUMBER', description: 'مساحة السطح بالمتر المربع' },
        ampDay: { type: 'NUMBER', description: 'الأمبير المطلوب نهاراً' },
        ampNight: { type: 'NUMBER', description: 'الأمبير المطلوب ليلاً' },
        nightSupplyHours: { type: 'NUMBER', description: 'ساعات التجهيز الليلي (تتحكم بعدد البطاريات)' },
        tier: { type: 'STRING', description: 'المستوى: economy أو standard أو premium' },
      },
    },
  },
  {
    name: 'get_quote_preview',
    description: 'يرجع ملخص العرض المحسوب حالياً بالشاشة (البنود والكميات والأسعار والمجموع والتحذيرات) — استخدمه بعد fill_quote حتى تشرح النتيجة للبياع أو تتأكد من التحذيرات.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_materials',
    description: 'يقرأ مواد المخزون وأسعارها. الفئات: panel (ألواح), inverter (انفيرترات), battery (بطاريات), secondary (ثانوية). استخدمه للإجابة عن الأسعار أو للمقارنة.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: { type: 'STRING', description: 'panel أو inverter أو battery أو secondary — اتركه فارغ للكل' },
        search: { type: 'STRING', description: 'نص بحث بالاسم أو الماركة (اختياري)' },
      },
    },
  },
  {
    name: 'get_labor_tiers',
    description: 'يرجع جدول أجور العمل (حجم المنظومة بالأمبير ← السعر).',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'set_material_price',
    description: 'يعدل سعر مادة بالمخزون بعد موافقة البياع (يطلع له تأكيد). استخدم get_materials أولاً حتى تعرف id المادة.',
    parameters: {
      type: 'OBJECT',
      properties: {
        material_id: { type: 'NUMBER', description: 'رقم المادة من get_materials' },
        new_price: { type: 'NUMBER', description: 'السعر الجديد بالدينار العراقي' },
      },
      required: ['material_id', 'new_price'],
    },
  },
  {
    name: 'open_inventory',
    description: 'يفتح صفحة المخزون للبياع مع تعبئة البحث — استخدمه لما يريد يتصفح أو يعدل أشياء متعددة بنفسه.',
    parameters: {
      type: 'OBJECT',
      properties: { search: { type: 'STRING', description: 'نص البحث' } },
      required: ['search'],
    },
  },
];

const SYSTEM_PROMPT = `انت مساعد مبيعات ذكي داخل برنامج تسعير منظومات الطاقة الشمسية لشركة بلاد اوتو بالعراق. تحچي باللهجة العراقية المختصرة والواضحة.

طريقة عمل البرنامج:
- عرض السعر يحتاج: مساحة السطح (م²)، أمبير نهاري، أمبير ليلي، وساعات التجهيز الليلي (إجبارية إذا اكو حمل ليلي — هي اللي تتحكم بعدد البطاريات).
- عدد البطاريات = طاقة الليل (أمبير ليلي × فولتية × ساعات) ÷ عمق التفريغ ÷ سعة البطارية.
- الألواح تُحسب من الأمبير النهاري (لوح 650 واط = 2.18 أمبير وتتناسب مع الواطية).
- الانفيرتر لازم يغطي الحمل ×1.25 ويستوعب مصفوفة الألواح ÷1.3.
- المستويات: economy أرخص توليفة، standard وسط، premium أغلى/أفخم.
- شحن البطاريات أساساً من الوطنية (كل البنك ~ساعتين)، وإذا انقطعت يصير من الألواح — اكو تحذير بالبرنامج إذا الشحن الشمسي ضعيف.

قواعدك:
1. لما البياع يكتب طلب زبون، استخرج الأرقام واستدعي fill_quote، وبعدها get_quote_preview حتى تلخصله النتيجة (المجموع، البطاريات، أي تحذير).
2. إذا ناقص شي ضروري (خاصة ساعات التجهيز الليلي)، اسأله بدل ما تخمن.
3. أسئلة الأسعار جاوبها من get_materials و get_labor_tiers — لا تخترع أسعار.
4. تعديل سعر: تأكد من المادة بـget_materials ثم set_material_price — البرنامج ياخذ موافقة البياع تلقائياً.
5. ردودك قصيرة وعملية، أرقام واضحة بالدينار العراقي، بدون مبالغة.`;

// ===== تنفيذ الأدوات محلياً =====
async function executeTool(name, args, executor) {
  try {
    if (name === 'fill_quote') {
      executor.fillQuote(args);
      return { ok: true, message: 'انعبت الحقول وقاعد يحسب — استدعي get_quote_preview للنتيجة' };
    }
    if (name === 'get_quote_preview') {
      // ننطي الواجهة فرصة تحسب (debounce 300ms + جلب)
      await new Promise((r) => setTimeout(r, 900));
      const d = executor.getDraft();
      if (!d) return { ok: false, message: 'ما اكو حساب بعد — تأكد من تعبئة المساحة والأمبير والساعات' };
      return {
        ok: true,
        total: d.total,
        items: d.items.map((i) => ({ desc: i.description.split('\n')[0].slice(0, 60), qty: i.quantity, unit_price: i.unit_price, subtotal: i.subtotal })),
        errors: d.errors,
        warnings: d.warnings,
        panelBreakdown: d.panelBreakdown,
      };
    }
    if (name === 'get_materials') {
      const all = await window.api.materials.list(args.category || undefined);
      const q = (args.search || '').trim().toLowerCase();
      const rows = all
        .filter((m) => !q || `${m.brand || ''} ${m.model} ${m.full_description}`.toLowerCase().includes(q))
        .slice(0, 40)
        .map((m) => ({ id: m.id, category: m.category, brand: m.brand, model: m.model, capacity: m.watt_or_capacity, unit: m.unit, price: m.price }));
      return { ok: true, count: rows.length, materials: rows };
    }
    if (name === 'get_labor_tiers') {
      const tiers = await window.api.laborTiers.list();
      return { ok: true, tiers: tiers.map((t) => ({ amps: t.system_amps, price: t.price, note: t.note })) };
    }
    if (name === 'set_material_price') {
      const all = await window.api.materials.list();
      const mat = all.find((m) => m.id === Number(args.material_id));
      if (!mat) return { ok: false, message: 'ما لكيت المادة بهذا الرقم' };
      const approved = window.confirm(
        `المساعد يريد يعدل سعر:\n${mat.brand || ''} ${mat.model}\nمن ${Math.round(mat.price).toLocaleString('en-US')} إلى ${Math.round(args.new_price).toLocaleString('en-US')} دينار\n\nموافق؟`
      );
      if (!approved) return { ok: false, message: 'البياع رفض التعديل' };
      await window.api.materials.update(mat.id, { ...mat, price: Number(args.new_price) });
      return { ok: true, message: `تم تحديث سعر ${mat.model} إلى ${args.new_price}` };
    }
    if (name === 'open_inventory') {
      executor.openInventory(args.search || '');
      return { ok: true, message: 'انفتح المخزون مع البحث' };
    }
    return { ok: false, message: 'أداة غير معروفة' };
  } catch (err) {
    return { ok: false, message: 'خطأ بالتنفيذ: ' + err.message };
  }
}

// ===== حلقة الايجنت =====
async function callGemini(apiKey, model, contents) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        generationConfig: { temperature: 0.2 },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// history: [{role:'user'|'model', parts:[...]}] — يرجع {text, history}
async function runAgent({ apiKey, history, userText, executor, onStatus }) {
  const contents = [...history, { role: 'user', parts: [{ text: userText }] }];
  let modelIdx = 0;

  // يستدعي الموديل الحالي وينزل بالقائمة تلقائياً عند التقاعد/الازدحام/امتلاء الحصة
  async function callWithFallback() {
    for (; modelIdx < MODELS.length; modelIdx++) {
      try {
        return await callGemini(apiKey, MODELS[modelIdx], contents);
      } catch (err) {
        if ([404, 429, 503].includes(err.status) && modelIdx < MODELS.length - 1) continue;
        throw err;
      }
    }
  }

  for (let step = 0; step < 6; step++) {
    let data;
    try {
      data = await callWithFallback();
    } catch (err) {
      if (err.status === 429 || err.status === 503) {
        return { text: 'كل الموديلات المجانية مزدحمة أو ممتلئة هاللحظة — انتظر دقيقة وعيد المحاولة.', history: contents };
      }
      if (err.status === 400 || err.status === 403) {
        return { text: 'المفتاح غير صالح أو منتهي — تأكد من مفتاح Gemini بالإعدادات.', history: contents };
      }
      throw err;
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const calls = parts.filter((p) => p.functionCall);
    // نستبعد أجزاء "التفكير" الداخلية للموديلات الحديثة — للبياع النص النهائي فقط
    const texts = parts.filter((p) => p.text && !p.thought).map((p) => p.text);

    if (calls.length === 0) {
      const text = texts.join('\n').trim() || 'ما وصلني رد مفهوم — عيد صياغة الطلب.';
      contents.push({ role: 'model', parts: [{ text }] });
      return { text, history: contents };
    }

    contents.push({ role: 'model', parts });
    const responses = [];
    for (const call of calls) {
      if (onStatus) onStatus(`⚙ ${call.functionCall.name}...`);
      const result = await executeTool(call.functionCall.name, call.functionCall.args || {}, executor);
      responses.push({ functionResponse: { name: call.functionCall.name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return { text: 'الطلب طول أكثر من اللازم — جزئه وجرب مرة ثانية.', history: contents };
}

export { getAgentKey, setAgentKey, runAgent, SHARE_KEY_SQL };
