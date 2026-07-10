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

// المدراء المخولون بالتعديل المباشر من المحادثة (إضافة/تعديل/حذف مواد وأسعار وأجور وإعدادات)
const ADMIN_USERS = ['أحمد', 'حوراء', 'حيدر'];

async function getCurrentUsername() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.user_metadata?.username || '';
  } catch {
    return '';
  }
}

// مقارنة متسامحة مع فروقات الهمزة (أ/إ/آ = ا) والمسافات
function normalizeName(s) {
  return String(s || '').trim().replace(/[أإآ]/g, 'ا');
}

async function getIsAdmin() {
  const u = normalizeName(await getCurrentUsername());
  return ADMIN_USERS.some((a) => normalizeName(a) === u);
}

// ===== حفظ محادثة المساعد لكل مستخدم (تبقى بعد التنقل والتحديث، ومشتركة عبر أجهزته) =====
function chatKeyFor(username) {
  return 'chat_' + encodeURIComponent(username || 'user').replace(/%/g, '');
}

async function loadChat(username) {
  const key = chatKeyFor(username);
  try {
    const { data } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle();
    if (data && data.value) return JSON.parse(data.value);
  } catch {
    /* نكمل على المحلي */
  }
  try {
    const raw = localStorage.getItem('biladauto_' + key);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { messages: [], history: [] };
}

async function saveChat(username, { messages, history }) {
  // نحد الحجم: آخر 60 رسالة ظاهرة وآخر 40 مدخلة سياق
  const payload = JSON.stringify({ messages: messages.slice(-60), history: history.slice(-40) });
  const key = chatKeyFor(username);
  try {
    localStorage.setItem('biladauto_' + key, payload);
  } catch {
    /* ignore */
  }
  try {
    await supabase.from('app_config').upsert({ key, value: payload });
  } catch {
    /* ignore */
  }
}

async function clearChat(username) {
  const key = chatKeyFor(username);
  try {
    localStorage.removeItem('biladauto_' + key);
  } catch {
    /* ignore */
  }
  try {
    await supabase.from('app_config').delete().eq('key', key);
  } catch {
    /* ignore */
  }
}

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
    name: 'get_settings',
    description: 'يرجع ثوابت المعادلات الحالية: الفولتية، عمق التفريغ DoD، معامل أمان الانفيرتر، ألواح الشحن لكل بطارية، مساحة اللوح، الساعات الافتراضية — استخدمها لما تشرح حسبة أو تحلل المنهجية.',
    parameters: { type: 'OBJECT', properties: {} },
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

// أدوات التعديل المباشر — تُعطى للموديل فقط لما المستخدم مدير مخول
const ADMIN_TOOL_DECLARATIONS = [
  {
    name: 'update_material',
    description:
      'يعدل مادة موجودة بالمخزون مباشرة (سعر، اسم، سعة، ضمان، وصف...). استخدم get_materials أولاً حتى تتأكد من id الصحيح، وبعد التعديل اذكر للبياع القديم والجديد.',
    parameters: {
      type: 'OBJECT',
      properties: {
        material_id: { type: 'NUMBER', description: 'رقم المادة من get_materials' },
        price: { type: 'NUMBER', description: 'السعر الجديد بالدينار (اختياري)' },
        model: { type: 'STRING', description: 'اسم الموديل الجديد (اختياري)' },
        brand: { type: 'STRING', description: 'الماركة الجديدة (اختياري)' },
        watt_or_capacity: { type: 'NUMBER', description: 'القدرة بالواط للألواح والانفيرترات أو kWh للبطاريات (اختياري)' },
        warranty_months: { type: 'NUMBER', description: 'الضمان بالأشهر (اختياري)' },
        full_description: { type: 'STRING', description: 'الوصف التفصيلي الجديد (اختياري)' },
      },
      required: ['material_id'],
    },
  },
  {
    name: 'add_material',
    description: 'يضيف مادة جديدة للمخزون. الفئات: panel, inverter, battery, secondary. القدرة إجبارية للألواح (واط) والانفيرترات (واط) والبطاريات (kWh).',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: { type: 'STRING', description: 'panel أو inverter أو battery أو secondary' },
        brand: { type: 'STRING', description: 'الماركة' },
        model: { type: 'STRING', description: 'اسم الموديل — لازم يكون مميز' },
        full_description: { type: 'STRING', description: 'الوصف التفصيلي اللي يطلع بالعرض' },
        unit: { type: 'STRING', description: 'عدد أو متر أو قطعي — الافتراضي عدد' },
        watt_or_capacity: { type: 'NUMBER', description: 'القدرة/السعة' },
        price: { type: 'NUMBER', description: 'السعر بالدينار' },
        warranty_months: { type: 'NUMBER', description: 'الضمان بالأشهر (اختياري)' },
        qty_per_panel: { type: 'NUMBER', description: 'للثانوية فقط: الكمية لكل لوح (1 للهيكل والصبات، 0 للباقي)' },
      },
      required: ['category', 'model', 'price'],
    },
  },
  {
    name: 'delete_material',
    description: 'يحذف مادة من المخزون نهائياً — البرنامج ياخذ تأكيد من البياع قبل التنفيذ. لا تستخدمه إلا بطلب صريح.',
    parameters: {
      type: 'OBJECT',
      properties: { material_id: { type: 'NUMBER', description: 'رقم المادة من get_materials' } },
      required: ['material_id'],
    },
  },
  {
    name: 'set_labor_tier',
    description: 'يضيف أو يحدث سعر أجور عمل لحجم منظومة معين بالأمبير (إذا الحجم موجود يحدث سعره، وإلا يضيفه).',
    parameters: {
      type: 'OBJECT',
      properties: {
        system_amps: { type: 'NUMBER', description: 'حجم المنظومة بالأمبير' },
        price: { type: 'NUMBER', description: 'سعر الأجور بالدينار' },
        note: { type: 'STRING', description: 'ملاحظة (اختياري)' },
      },
      required: ['system_amps', 'price'],
    },
  },
  {
    name: 'update_setting',
    description:
      'يعدل ثوابت المعادلات بالإعدادات. الحقول: system_voltage (الفولتية), charge_panels_per_battery (ألواح الشحن لكل بطارية), inverter_safety_factor (معامل الأمان), dod (عمق التفريغ 0-1), night_coverage_hours (الساعات الافتراضية), panel_area_m2 (مساحة اللوح), quote_number_start (بداية الترقيم).',
    parameters: {
      type: 'OBJECT',
      properties: {
        field: { type: 'STRING', description: 'اسم الحقل من القائمة أعلاه' },
        value: { type: 'NUMBER', description: 'القيمة الجديدة' },
      },
      required: ['field', 'value'],
    },
  },
];

const SYSTEM_PROMPT = `انت المهندس الاستشاري والمساعد الذكي داخل برنامج تسعير منظومات الطاقة الشمسية لشركة بلاد اوتو لحلول الطاقة المتجددة — بغداد، العراق. تحچي باللهجة العراقية الواضحة، وتفكر كمهندس طاقة شمسية خبير: كل جواب مبني على معادلة أو رقم، مو كلام عام.

═══ منهجية الشركة بالتفصيل (احفظها وفسّرها لأي أحد يسأل) ═══

1) الألواح — تُحسب من الأمبير النهاري فقط:
   • قاعدة الشركة: لوح 650 واط يعطي 2.18 أمبير فعلي على منظومة 220-230 فولت (مشتقة من التجربة الميدانية: ~500 واط إنتاج واقعي بعد الحرارة والغبار ÷ 230 فولت ≈ 2.18A).
   • أمبير أي لوح يتناسب مع واطيته: لوح 710W يعطي 710×(2.18÷650) ≈ 2.38A.
   • عدد ألواح التغذية = سقف(أمبير نهاري ÷ أمبير اللوح). واكو "ألواح شحن لكل بطارية" بالإعدادات (حالياً قد تكون صفر) تنضاف فوقها.
   • المساحة لا تغيّر العدد — إذا المساحة أقل من (عدد الألواح × مساحة اللوح بالإعدادات) يصير خطأ حاجب ويُطلب توفير المساحة.

2) البطاريات — تُحسب من طاقة الليل:
   • طاقة الليل (kWh) = أمبير ليلي × فولتية النظام × ساعات التجهيز الليلي ÷ 1000.
   • الطاقة المطلوبة من البنك = طاقة الليل ÷ عمق التفريغ الآمن DoD (من الإعدادات، مثلاً 0.8 يعني نستهلك 80% من البطارية ونحافظ على عمرها).
   • عدد الوحدات = سقف(الطاقة المطلوبة ÷ سعة البطارية الواحدة kWh).
   • ساعات التجهيز يحددها البياع بكل عرض (مو ثابتة) — هي أكبر عامل يغيّر عدد البطاريات وسعر العرض.

3) الانفيرتر — شرطان لازم يحققهما سوية:
   • يغطي الحمل: أكبر أمبير (نهاري أو ليلي) × فولتية × معامل أمان 1.25 (لتحمل تيارات الإقلاع للمحركات والمضخات).
   • يستوعب الألواح: قدرة المصفوفة ÷ 1.3 (الهجينة تقبل تحميل ألواح حتى ~130% من قدرتها الاسمية — Deye 8kW يقبل 10.4kW ألواح).
   • القدرة المطلوبة = الأكبر بين الشرطين، وعدد الوحدات = سقف(المطلوب ÷ قدرة الموديل) — التوازي وارد وطبيعي.

4) الشحن:
   • من الوطنية: بورد الشحن يكمل البنك كله بـ~ساعتين مهما كان عدد البطاريات — هذا الأساس عندنا.
   • من الألواح (إذا انقطعت الوطنية): قدرة الشحن = الأصغر بين (قدرة المصفوفة) و(قدرة الانفيرتر — الهجين يشحن بحدود قدرته الاسمية: Deye 8kW ≈ 190A×48V ≈ 9.1kW)، بكفاءة 0.9. إذا (طاقة البنك × DoD) ÷ قدرة الشحن > 7 ساعات (شمس العراق المضمونة) يطلع تحذير غير حاجب.

5) دستور التسعير (الهندسة القيمية — المعتمد رسمياً):
   • economy: أرخص توليفة ممكنة تغطي الحمل حتى لو بعدد أجهزة أكثر أو ماركات أرخص — الهدف أقل سعر نهائي للزبون.
   • standard: أفضل قيمة مقابل السعر — أقل عدد أجهزة ممكن (تركيب أبسط) بأرخص ماركة تحقق القدرة المطلوبة. استثناء: من 100 أمبير فما فوق يوزع الحمل على ~3 انفيرترات للاستمرارية (Redundancy) وتخفيف الضغط الحراري.
   • premium: موثوقية قصوى — أكبر سعة بطارية متاحة لتقليل الوحدات ونقاط التوصيل (كفاءة BMS أعلى وعمر أطول)، وأرقى الماركات والانفيرترات عالية القدرة لتقليل التعدد — أداء فائق وتركيب نظيف.
   • البياع يكدر يبدل أي مادة يدوياً بأي مستوى.
   • أجور العمل: جدول (حجم بالأمبير ← سعر)، يُختار أصغر حجم ≥ أكبر أمبير بالعرض.
   • المواد الثانوية: الهيكل والصبات تلقائياً حسب عدد الألواح، والباقي (بوردات، كيبلات بالمتر، تأريض...) اختياري من نافذة المواد الثانوية.

═══ معرفة هندسية مكثفة (استخدمها بالإجابات والتحليل) ═══
• الألواح: Bifacial ذو وجهين يكسب 5-15% إضافية من انعكاس الأرض؛ TOPCon N-type أعلى كفاءة وأقل تدهور (~0.4%/سنة) من PERC؛ معامل الحرارة ~-0.3%/°م — بصيف العراق (سطح اللوح 65-70°م) الفقد الحراري 12-15%، لهذا قاعدة 2.18A واقعية وليست متشائمة؛ الغبار العراقي يفقد 5-15% إذا ما ينغسل شهرياً.
• بطاريات LiFePO4: أأمن كيمياء ليثيوم (ما تشتعل)، عمر 6000-8000 دورة (~15+ سنة بدورة يومية)، DoD آمن 80-95% مقابل 50% للرصاص؛ نظام 51.2V (16 خلية × 3.2V)؛ BMS يحمي من الشحن/التفريغ الزائد والحرارة ويتخاطب مع الانفيرتر (CAN/RS485)؛ التوازي يجمع السعة، وأفضل ممارسة بطاريات متماثلة بالسعة والعمر.
• الانفيرترات الهجينة: MPPT يتتبع نقطة القدرة العظمى (2 MPPT = سطحين باتجاهين مختلفين)؛ LV (48V) للمنازل حتى ~16kW، HV (125-500V+) للثلاثي الطور والمشاريع؛ IP21 داخلي فقط، IP65 يتحمل الخارج والغبار — بالعراق IP65 يستاهل فرق السعر إذا التركيب خارجي؛ الثلاثي الطور للمنظومات فوق ~60A أو المكائن الثلاثية.
• الكيبلات: DC من الألواح 6مم² نحاس هو المعيار (يتحمل ~50A بمسافات قصيرة)؛ هبوط الفولتية لازم <3% — المسافات الطويلة تحتاج مقطع أكبر؛ كيبل الحمل يُحسب: أمبير × 1.25 ثم اختيار المقطع (4×16مم يتحمل ~85A).
• العراق: شمس ممتازة 5.5-6.5 ذروة/يوم صيفاً و7 ساعات إنتاج مضمونة معدلاً؛ الشبكة الوطنية متقطعة فالهجين مع بطاريات هو الحل الصح؛ الفولتية 220-230V أحادي.

═══ قواعدك بالعمل ═══
1. طلب زبون → استخرج الأرقام، fill_quote، ثم get_quote_preview ولخصله: المجموع، التوليفة، أي تحذير، وليش هاي الأعداد (سطر لكل وحدة).
2. سؤال "ليش" (ليش بطاريتين؟ ليش هالانفيرتر؟) → جاوب بالمعادلة نفسها بأرقام العرض الحالي، واستدعِ get_settings إذا تحتاج قيم الثوابت الحالية.
3. ناقص شي ضروري (خاصة ساعات التجهيز الليلي) → اسأل، لا تخمن.
4. الأسعار حصراً من get_materials وget_labor_tiers — ممنوع تخترع سعر.
5. التعديل المباشر (إذا أدواته متاحة لك): get_materials أولاً للتأكد من المادة بالضبط، نفذ، واذكر القديم والجديد. تشابه؟ اعرض الخيارات واسأل. الحذف فقط بطلب صريح. إذا ما عندك أدوات تعديل فالمستخدم غير مخول — وجهه أن التعديل لحسابات المدراء.
6. تطوير آلية العمل: إذا انسألت رأيك أو "شلون نطور" — حلل بالأرقام (مثلاً: قيمة معامل الأمان، جدوى IP65، أثر تغيير DoD على العدد والسعر، مقارنة توليفة بطاريات كبيرة مقابل صغيرة من ناحية التوصيلات ونقاط العطل) واقترح بوضوح مع الأثر المتوقع بالدينار، بس لا تعدل أي إعداد إلا بطلب صريح.
7. ردود مركزة: أرقام بالدينار العراقي، جداول قصيرة إذا تفيد، بدون حشو.`;

// ===== تنفيذ الأدوات محلياً =====
const ADMIN_TOOL_NAMES = new Set(ADMIN_TOOL_DECLARATIONS.map((t) => t.name));

async function executeTool(name, args, executor, isAdmin) {
  try {
    if (ADMIN_TOOL_NAMES.has(name) && !isAdmin) {
      return { ok: false, message: 'هذا الحساب غير مخول بالتعديل — التعديل المباشر لحسابات المدراء فقط (أحمد، حوراء، حيدر)' };
    }
    if (name === 'update_material') {
      const all = await window.api.materials.list();
      const mat = all.find((m) => m.id === Number(args.material_id));
      if (!mat) return { ok: false, message: 'ما لكيت المادة بهذا الرقم — تأكد بـget_materials' };
      const updates = {};
      for (const f of ['price', 'model', 'brand', 'watt_or_capacity', 'warranty_months', 'full_description']) {
        if (args[f] != null && args[f] !== '') updates[f] = args[f];
      }
      if (Object.keys(updates).length === 0) return { ok: false, message: 'ما مررت أي حقل للتعديل' };
      const before = { model: mat.model, price: mat.price, watt_or_capacity: mat.watt_or_capacity };
      await window.api.materials.update(mat.id, { ...mat, ...updates });
      return { ok: true, before, after: { ...before, ...updates }, message: `تم تعديل ${mat.model}` };
    }
    if (name === 'add_material') {
      const cat = String(args.category || '').toLowerCase();
      if (!['panel', 'inverter', 'battery', 'secondary'].includes(cat)) return { ok: false, message: 'فئة غير صحيحة' };
      if (['panel', 'inverter', 'battery'].includes(cat) && !(Number(args.watt_or_capacity) > 0)) {
        return { ok: false, message: 'القدرة/السعة إجبارية لهذه الفئة — اسأل البياع عنها' };
      }
      const row = await window.api.materials.create({
        category: cat,
        brand: args.brand || null,
        model: args.model,
        full_description: args.full_description || args.model,
        unit: args.unit || 'عدد',
        watt_or_capacity: args.watt_or_capacity ?? null,
        price: Number(args.price) || 0,
        warranty_months: args.warranty_months ?? null,
        warranty_note: null,
        qty_per_panel: args.qty_per_panel ?? null,
      });
      return { ok: true, message: `انضافت المادة ${row.model} برقم ${row.id}` };
    }
    if (name === 'delete_material') {
      const all = await window.api.materials.list();
      const mat = all.find((m) => m.id === Number(args.material_id));
      if (!mat) return { ok: false, message: 'ما لكيت المادة' };
      const approved = window.confirm(`المساعد يريد يحذف نهائياً:\n${mat.brand || ''} ${mat.model} — ${Math.round(mat.price).toLocaleString('en-US')} دينار\n\nمتأكد؟`);
      if (!approved) return { ok: false, message: 'البياع رفض الحذف' };
      await window.api.materials.remove(mat.id);
      return { ok: true, message: `انحذفت ${mat.model}` };
    }
    if (name === 'set_labor_tier') {
      const tiers = await window.api.laborTiers.list();
      const amps = Number(args.system_amps);
      const existing = tiers.find((t) => Number(t.system_amps) === amps);
      if (existing) {
        await window.api.laborTiers.update(existing.id, { system_amps: amps, price: Number(args.price), note: args.note ?? existing.note });
        return { ok: true, message: `تحدث سعر أجور ${amps} أمبير من ${existing.price} إلى ${args.price}` };
      }
      await window.api.laborTiers.create({ system_amps: amps, price: Number(args.price), note: args.note || null });
      return { ok: true, message: `انضاف حجم جديد: ${amps} أمبير = ${args.price}` };
    }
    if (name === 'update_setting') {
      const ALLOWED = ['system_voltage', 'charge_panels_per_battery', 'inverter_safety_factor', 'dod', 'night_coverage_hours', 'panel_area_m2', 'quote_number_start'];
      if (!ALLOWED.includes(args.field)) return { ok: false, message: 'حقل غير معروف — الحقول: ' + ALLOWED.join(', ') };
      const current = await window.api.settings.get();
      const before = current[args.field];
      await window.api.settings.update({ ...current, [args.field]: Number(args.value) });
      return { ok: true, message: `تعدل ${args.field} من ${before} إلى ${args.value}` };
    }
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
    if (name === 'get_settings') {
      const s = await window.api.settings.get();
      return {
        ok: true,
        settings: {
          system_voltage: s.system_voltage,
          dod: s.dod,
          inverter_safety_factor: s.inverter_safety_factor,
          charge_panels_per_battery: s.charge_panels_per_battery,
          panel_area_m2: s.panel_area_m2,
          night_coverage_hours: s.night_coverage_hours,
          quote_number_start: s.quote_number_start,
        },
      };
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
// مهلة قصوى لكل نداء — إذا علق السيرفر ما نبقى "نفكر" للأبد، ننتقل للموديل التالي
const CALL_TIMEOUT_MS = 45000;

async function callGemini(apiKey, model, contents, toolDeclarations) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          tools: [{ functionDeclarations: toolDeclarations }],
          generationConfig: { temperature: 0.2 },
        }),
        signal: controller.signal,
      }
    );
  } catch (err) {
    // مهلة أو انقطاع شبكة → نعاملها مثل الازدحام حتى تجرب الحلقة الموديل التالي
    const e = new Error(err.name === 'AbortError' ? 'مهلة الاتصال انتهت' : 'انقطاع بالاتصال: ' + err.message);
    e.status = 503;
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// history: [{role:'user'|'model', parts:[...]}] — يرجع {text, history}
async function runAgent({ apiKey, history, userText, executor, onStatus, isAdmin = false }) {
  const contents = [...history, { role: 'user', parts: [{ text: userText }] }];
  const toolDeclarations = isAdmin ? [...TOOL_DECLARATIONS, ...ADMIN_TOOL_DECLARATIONS] : TOOL_DECLARATIONS;
  let modelIdx = 0;

  // يستدعي الموديل الحالي وينزل بالقائمة تلقائياً عند التقاعد/الازدحام/امتلاء الحصة/المهلة
  async function callWithFallback() {
    for (; modelIdx < MODELS.length; modelIdx++) {
      try {
        return await callGemini(apiKey, MODELS[modelIdx], contents, toolDeclarations);
      } catch (err) {
        if ([404, 429, 503].includes(err.status) && modelIdx < MODELS.length - 1) {
          if (onStatus) onStatus('الموديل مشغول — أجرب موديل ثاني...');
          continue;
        }
        throw err;
      }
    }
  }

  for (let step = 0; step < 10; step++) {
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
      const result = await executeTool(call.functionCall.name, call.functionCall.args || {}, executor, isAdmin);
      responses.push({ functionResponse: { name: call.functionCall.name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return { text: 'الطلب طول أكثر من اللازم — جزئه وجرب مرة ثانية.', history: contents };
}

export { getAgentKey, setAgentKey, runAgent, getIsAdmin, getCurrentUsername, loadChat, saveChat, clearChat, SHARE_KEY_SQL };
