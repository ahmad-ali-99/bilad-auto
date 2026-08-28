// طبقة البيانات السحابية — تعطي نفس شكل window.api القديم لكن فوق Supabase
// كل الدوال async؛ الصفحات المشتركة تناديها بنفس الطريقة بدون تعديل يُذكر.
import { supabase, usernameToEmail } from './supabase.js';
import * as quoteService from './quoteService.js';
import * as calc from './calc.js';
import * as excelImport from './excelImport.js';
import { exportInvoicePdf, quoteFileName } from './pdfExport.js';
import { logActivity } from './activityLog.js';
import { UNDO, DRAFT } from './activityUndo.js';
import { isRestrictedUser, canEditSettings, canAddMaterial, canEditMaterial, canEditInventory, canImportInventory, canImportUpdates, canEditLabor, hiddenMarkupPercentFor, applyStaffRoles } from './permissions.js';
import { parseRoles, serializeRoles, normName as normStaffName } from './staffRoles.js';
import { applyExportMethod, setExportMethod, getExportMethod } from './exportMethod.js';
import { createClient } from '@supabase/supabase-js';
import { canAccessQuote, visibleQuotes, canAttributeQuote, accessDeniedMessage } from './quoteAccess.js';
import { installmentPlanLabel } from './installment.js';
import { imageKey, isImageKey } from './materialImages.js';
import { ipKey, isIpKey, materialIdFromIpKey, parseIp, IP_RANGE_ERROR } from './materialSpecs.js';
import {
  BRAND_CATEGORIES, normalizeBrandPick, pruneBrandPick, filterMaterialsByBrands, hasBrandPick,
} from './brandPick.js';
import { PANEL_SAFETY_FACTOR, DEFAULT_BATTERY_FACTORS } from './calc.js';

// معامل أمان الألواح الخاص بهذا العرض. العروض المحفوظة تمرّره صراحةً (والقديمة
// تمرّر 1)، وأي حساب جديد بلا قيمة ياخذ المعامل الحالي.
// خطوة شبكة بسقف واسم. مكتبة سوبابيس ما تحط أي مهلة على طلباتها، فطلب واحد
// معلّق بتلفون على شبكة ضعيفة يوقف العملية كلها بصمت. الاسم يخلي الرسالة تدل
// على المكان بدل ما تكون «التصدير طوّل» وخلص.
const NET_STEP_LIMIT = 20000;

function netStep(name, promise, ms = NET_STEP_LIMIT) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`علقت خطوة: ${name}`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

function panelSafetyFactorOf(input) {
  const v = Number(input?.panelSafetyFactor);
  return v > 0 ? v : PANEL_SAFETY_FACTOR;
}

// معاملات البطاريات الخاصة بهذا العرض. العروض المحفوظة قبل إلغاء المعامل تمرّر
// معاملاتها القديمة صراحةً (من editPrefill)، وأي حساب جديد ياخذ الحالي (بلا معامل).
function batteryFactorsOf(input) {
  const f = input?.batteryFactors;
  if (!f) return DEFAULT_BATTERY_FACTORS;
  const pick = (k) => (Number(f[k]) > 0 ? Number(f[k]) : DEFAULT_BATTERY_FACTORS[k]);
  return { economy: pick('economy'), standard: pick('standard'), premium: pick('premium') };
}

function throwIf(error) {
  if (error) throw new Error(error.message || 'خطأ بالاتصال بقاعدة البيانات');
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      resolve(file || null);
    };
    input.click();
  });
}

const readArrayBuffer = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });

const readDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

function materialPayload(data) {
  return {
    category: data.category,
    brand: data.brand || null,
    model: data.model || null,
    full_description: data.full_description,
    unit: data.unit,
    watt_or_capacity: data.watt_or_capacity ?? null,
    price: Number(data.price) || 0,
    warranty_months: data.warranty_months ?? null,
    warranty_note: data.warranty_note || null,
    qty_per_panel: data.qty_per_panel ?? null,
    updated_at: new Date().toISOString(),
  };
}

// قدرة انفيرتر الكابينة المتكاملة (kW): ماكو عمود إلها بالجدول، فتنخزن بـapp_config
// بمفتاح integrated_specs_<id> — نفس حيلة quote_adj_<id> المعتمدة (بلا أي DDL).
async function saveIntegratedKw(materialId, data) {
  if (data.category !== 'integrated' || data.integrated_kw == null) return;
  try {
    await setConfigRaw(`integrated_specs_${materialId}`, { kw: Number(data.integrated_kw) || 0 });
  } catch {
    /* app_config اختياري — المادة انحفظت على أي حال */
  }
}

// درجة الحماية IP: حقل يُدخل بالمخزون مثل القدرة — ماكو عمود إله بالجدول فينخزن
// بـapp_config بمفتاح material_ip_<id>. فارغ = يمسح المفتاح (المادة بلا IP).
async function saveIpRating(materialId, data) {
  if (!('ip_rating' in (data || {}))) return;
  const raw = data.ip_rating;
  const empty = raw == null || String(raw).trim() === '';
  const n = empty ? null : parseIp(raw);
  if (!empty && n == null) throw new Error(IP_RANGE_ERROR);
  try {
    await setConfigRaw(ipKey(materialId), n == null ? null : { ip: n });
  } catch {
    /* app_config اختياري — المادة انحفظت على أي حال */
  }
}

// يلحق درجة الحماية بكل المواد بنداء واحد
async function withIpRating(rows) {
  if (!rows.length) return rows;
  try {
    const { data } = await supabase.from('app_config').select('key,value').like('key', `${'material_ip_'}%`);
    const parse = (v) => {
      if (v == null) return null;
      return typeof v === 'string' ? JSON.parse(v) : v; // عمود text أو jsonb
    };
    const byId = new Map();
    for (const r of data || []) {
      const id = materialIdFromIpKey(r.key);
      const val = parse(r.value);
      if (id != null && val && val.ip != null) byId.set(id, Number(val.ip));
    }
    return rows.map((m) => ({ ...m, ip_rating: byId.has(Number(m.id)) ? byId.get(Number(m.id)) : null }));
  } catch {
    return rows.map((m) => ({ ...m, ip_rating: null }));
  }
}

async function withIntegratedKw(rows) {
  const ids = rows.filter((m) => m.category === 'integrated').map((m) => m.id);
  if (!ids.length) return rows;
  try {
    const { data } = await supabase.from('app_config').select('key,value')
      .in('key', ids.map((id) => `integrated_specs_${id}`));
    const parse = (v) => {
      if (v == null) return {};
      return typeof v === 'string' ? JSON.parse(v) : v; // عمود text أو jsonb — الحالتين تشتغل
    };
    const byId = new Map((data || []).map((r) => [Number(r.key.replace('integrated_specs_', '')), parse(r.value)]));
    return rows.map((m) => (m.category === 'integrated' ? { ...m, integrated_kw: byId.get(m.id)?.kw ?? null } : m));
  } catch {
    return rows;
  }
}

// المواد المخفية من الاستخدام: المادة تبقى بالمخزون بكل تفاصيلها لكن ما تنعرض
// ولا تنستعمل بالعروض. المفتاح قائمة معرّفات بـapp_config — بلا عمود جديد بالقاعدة،
// ولهذا العروض المحفوظة اللي فيها مادة انخفت لاحقاً تبقى مثل ما هي (بنودها لقطات).
const MATERIALS_DISABLED_KEY = 'materials_disabled';
const STAFF_ROLES_KEY = 'staff_roles';
// تفضيل محرك التصدير لكل حساب — مفتاح باسمه المُوحّد
const exportPrefKey = (name) => `export_method_${normStaffName(name)}`;

async function withActive(rows) {
  try {
    const ids = await api.config.get(MATERIALS_DISABLED_KEY);
    const off = new Set((Array.isArray(ids) ? ids : []).map(Number));
    return rows.map((m) => ({ ...m, active: !off.has(Number(m.id)) }));
  } catch {
    // تعذر قراءة القائمة — الافتراض إن الكل مفعّل حتى ما تختفي مواد بالغلط
    return rows.map((m) => ({ ...m, active: true }));
  }
}

// كتابة مباشرة لـapp_config بلا فحص صلاحية — للاستدعاءات الداخلية اللي فحصت
// صلاحيتها قبل (setActive وحفظ العرض...). الواجهة العامة api.config.set محروسة.
async function setConfigRaw(key, value) {
  const { error } = await supabase.from('app_config').upsert({ key, value: JSON.stringify(value) });
  throwIf(error);
}

// رقم المادة من مفاتيح app_config المرتبطة بمادة
function materialIdOfConfigKey(key) {
  const m = /^(?:material_image_|material_ip_|integrated_specs_|material_owner_)(\d+)$/.exec(String(key));
  return m ? Number(m[1]) : null;
}

/**
 * حارس الكتابة على app_config من الواجهة العامة.
 *
 * **ليش لازم**: `app_config` مفتوح للكتابة لأي حساب مسجّل (سياسة RLS
 * `for all to authenticated`)، وبنفس الجدول تنخزن **بيانات الصلاحية نفسها** —
 * `material_owner_<id>`. يعني بلا هذا الحارس، حساب «يضيف بس» يكدر يكتب
 * `material_owner_<id>` باسمه لأي مادة قديمة وبعدها يعدّلها بشكل شرعي تماماً:
 * الحارس assertCanEditMaterial راح يشوف إنه هو المالك ويسمح. باب خلفي كامل
 * للمخزون القديم بسطر واحد من الكونسول.
 */
async function assertCanWriteConfig(key) {
  const k = String(key);

  // الملكية ما تنكتب من برّة أبداً — تنكتب داخلياً وقت الإضافة فقط
  if (k.startsWith('material_owner_')) {
    throw new Error('ملكية المواد تنحدد وقت الإضافة — ما تنكتب من برّة');
  }

  const id = materialIdOfConfigKey(k);
  if (id != null) {
    await assertCanEditMaterial(id, 'هذه المادة');
    return;
  }

  // قائمة المواد المخفية = إخفاء/إظهار مواد المخزون. المسار الشرعي setActive
  // يفحص المادة بعينها ويكتب بـsetConfigRaw، فالكتابة المباشرة هنا ممنوعة
  // على أي حساب ما يعدّل المخزون كاملاً.
  if (k === MATERIALS_DISABLED_KEY && !canEditInventory(await currentUsername())) {
    throw new Error('إخفاء وإظهار مواد المخزون محصور بحسابات الإدارة');
  }

  // سجل الصلاحيات نفسه: **هو بيانات الصلاحية**، فمن يكتبه يكتب صلاحيات
  // الجميع بضمنها صلاحياته. محصور بمن يعدّل الإعدادات — ولازم يمر من هنا
  // لأن app_config مفتوح للكتابة لأي حساب مسجّل
  if (k === STAFF_ROLES_KEY && !canEditSettings(await currentUsername())) {
    throw new Error('تعديل صلاحيات الحسابات محصور بحسابات الإدارة');
  }

  // تفضيل محرك التصدير: **كل حساب يكتب مفتاحه هو بس**. app_config مفتوح
  // للكتابة لأي حساب مسجّل، فبلا هذا الحارس يقدر أي واحد يبدّل محرك تصدير
  // غيره — وهو تفضيل شخصي ما إله علاقة بأحد ثانٍ.
  if (k.startsWith('export_method_') && k !== exportPrefKey(await currentUsername())) {
    throw new Error('تفضيل محرك التصدير يخص كل حساب بنفسه');
  }
}

// المفاتيح الداخلية ما تنسجل كـ«تعديل إعداد مشترك» — إلها تسجيلها الخاص بمكان الاستدعاء
const isInternalConfigKey = (key) =>
  key.startsWith('quote_') || key.startsWith('integrated_specs_') || isImageKey(key) || isIpKey(key)
  || key === MATERIALS_DISABLED_KEY;

async function allMaterials() {
  const { data, error } = await supabase.from('materials').select('*').order('category').order('id');
  throwIf(error);
  // قدرة الكابينات المتكاملة (kW) لازمة للتحجيم التلقائي — تنلحق من app_config
  // والصفوف ترجع كلها (حتى المخفية) لأن الاستيراد والعروض المحفوظة تحتاجها
  return withActive(await withIpRating(await withIntegratedKw(data || [])));
}

async function nextQuoteNumber() {
  const [{ data: settings }, { data: maxRows }] = await Promise.all([
    supabase.from('settings').select('quote_number_start').eq('id', 1).single(),
    supabase.from('quotes').select('quote_number').order('quote_number', { ascending: false }).limit(1),
  ]);
  const start = settings?.quote_number_start ?? 7400;
  const maxNum = maxRows && maxRows.length ? maxRows[0].quote_number : 0;
  return Math.max((maxNum || 0) + 1, start);
}


// حارس الصلاحيات: الحسابات المقيّدة ممنوعة من الكتابة على المخزون والأجور والإعدادات.
// المنع هنا (طبقة البيانات) مو بالواجهة فقط — أي مسار يوصل للدالة ينمنع.
// نقرأ المستخدم من الجلسة المخزّنة محلياً (بلا طلب شبكة) — أسرع ويشتغل حتى لو الشبكة متذبذبة،
// ومع رجوع لـgetUser إذا الجلسة ماكو بالذاكرة لأي سبب.
// المستخدم الحالي: **الجلسة المحلية أولاً**. `getSession()` تقرأ من التخزين بلا
// شبكة، بينما `getUser()` تنادي خادم المصادقة — وبتلفون على شبكة ضعيفة ممكن
// يبقى هذا النداء معلّقاً بلا مهلة (مكتبة سوبابيس ما تحط مهلة افتراضية).
// هذا بالضبط اللي كان يعلّق التصدير من الشاشة الرئيسية: التصدير من صفحة
// «العروض» ما ينادي المصادقة إطلاقاً فيشتغل، والرئيسية تناديها فتعلّق.
// فالفولباك الشبكي صار محروساً بمهلة، وفشله يرجّع null بدل ما يوقف كلشي.
const AUTH_NETWORK_TIMEOUT_MS = 6000;

async function currentUser() {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.user) return data.session.user;
  try {
    const u = await Promise.race([
      supabase.auth.getUser().then((r) => r?.data?.user || null),
      new Promise((resolve) => setTimeout(() => resolve(null), AUTH_NETWORK_TIMEOUT_MS)),
    ]);
    return u || null;
  } catch {
    return null;
  }
}

async function currentUsername() {
  const user = await currentUser();
  return user?.user_metadata?.username || '';
}

// مالك المادة: منو أضافها. ينخزن بـapp_config (بلا تعديل بنية القاعدة) —
// نفس منفذ التوسعة اللي تمشي بيه الصور و`integrated_specs`.
const ownerKey = (id) => `material_owner_${id}`;

async function materialOwner(id) {
  return api.config.get(ownerKey(id));
}

/** يمنع الكتابة على مادة ما يملكها الحساب — الحارس بطبقة البيانات مو بالواجهة */
async function assertCanEditMaterial(id, what = 'هذه المادة') {
  const me = await currentUsername();
  const owner = await materialOwner(id);
  if (!canEditMaterial(me, owner)) {
    throw new Error(
      owner
        ? `${what} أضافها حساب «${owner}» — تعديلها محصور بصاحبها أو بحسابات الإدارة`
        : `${what} من المخزون القديم — حسابك يقدر يعدّل بس المواد اللي يضيفها هو`
    );
  }
}

async function assertCanAddMaterial() {
  if (!canAddMaterial(await currentUsername())) {
    throw new Error('إضافة المواد محصورة بحسابات الإدارة');
  }
}

async function assertCanEdit(what = 'هذه البيانات') {
  if (isRestrictedUser(await currentUsername())) {
    throw new Error(`حسابك للاطلاع فقط — تعديل ${what} محصور بحسابات الإدارة`);
  }
}

// الإعدادات وملف الشركة: للمشرفين حصراً
async function assertAdminSettings(what = 'الإعدادات') {
  if (!canEditSettings(await currentUsername())) {
    throw new Error(`تعديل ${what} محصور بحسابات الإدارة`);
  }
}

// هوية الحساب الحالي بالشكل اللي تفهمه وحدة الملكية (اسم + إيميل للعروض القديمة)
async function currentIdentity() {
  const user = await currentUser();
  return { username: user?.user_metadata?.username || '', email: user?.email || '' };
}

// سجل العروض: الإدارة تشوف عروض الفريق كلها، والبياع يشوف عروضه هو فقط
// (وعروضه = اللي سواها بنفسه + اللي أسندتها له الإدارة بـ«العرض من طرف»).
async function onlyMyQuotes(rows) {
  return visibleQuotes(await currentIdentity(), rows);
}

// **الحارس الحقيقي**: الفلترة بالقائمة تخفي بس، وما تمنع. أي عملية على عرض
// بالمعرّف (فتح، تعديل، حذف، استرجاع، تصدير، مرفق، حالة) تمر من هنا أولاً —
// وإلا كان أي حساب يوصل لأي عرض إذا عرف رقمه.
async function assertQuoteAccess(id, what = 'هذا العرض') {
  const { data: quote } = await supabase.from('quotes').select('id, created_by').eq('id', id).maybeSingle();
  if (!quote) throw new Error('العرض غير موجود');
  if (!canAccessQuote(await currentIdentity(), quote)) throw new Error(accessDeniedMessage(what));
  return quote;
}

// «العرض من طرف»: إسناد العرض لحساب ثاني — صلاحية إدارية حصراً.
// بدونها كان أي حساب يكدر يمرر createdBy ويسند عرضاً لغيره (أو يخفيه عن نفسه).
async function attributedCreator(input) {
  if (!input?.createdBy) return null;
  const { username } = await currentIdentity();
  if (!canAttributeQuote(username)) {
    throw new Error('إسناد العرض لحساب ثاني محصور بحسابات الإدارة');
  }
  return input.createdBy;
}

export const api = {
  materials: {
    async list(category) {
      let q = supabase.from('materials').select('*').order('id');
      if (category) q = q.eq('category', category);
      const { data, error } = await q;
      throwIf(error);
      return withActive(await withIpRating(await withIntegratedKw(data || [])));
    },
    // صورة المنتج لكل مادة — تُستعمل بمنشور الباقات. تنخزن بـapp_config
    // (نفس منفذ التوسعة اللي يمشي بلا تعديل بنية القاعدة).
    async setImage(id, dataUrl) {
      await assertCanEditMaterial(id, 'صورة هذه المادة');
      const { error } = dataUrl
        ? await supabase.from('app_config').upsert({ key: imageKey(id), value: JSON.stringify(dataUrl) })
        : await supabase.from('app_config').delete().eq('key', imageKey(id));
      throwIf(error);
      logActivity(dataUrl ? 'إضافة صورة لمادة' : 'حذف صورة مادة', 'المخزون', {
        'المعرف': id,
        [UNDO]: { kind: 'none', why: 'الصورة تنبدل أو تنشال من نافذة المادة مباشرة' },
      });
      return { ok: true };
    },
    async getImage(id) {
      return api.config.get(imageKey(id));
    },
    // أسماء الماركات الموجودة فعلاً بالمخزون — تغذّي أقسام «البراند» بشاشة العرض.
    // ترجع **مقسّمة على الفئات** لأن كل قسم (لوح · بطارية · انفيرتر · كابينة)
    // يتنتخب لحاله: { panel: [...], battery: [...], inverter: [...], integrated: [...] }
    // وبس المواد المفعّلة (المخفية بالمخزون ما تدخل)، ومرتبة أبجدياً.
    async brands() {
      const materials = await allMaterials();
      const buckets = {};
      for (const c of BRAND_CATEGORIES) buckets[c] = new Map();
      for (const m of materials) {
        const bucket = buckets[m.category];
        if (!bucket || m.active === false) continue;
        const b = String(m.brand || '').trim();
        if (!b) continue;
        const k = b.toLowerCase();
        if (!bucket.has(k)) bucket.set(k, b);
      }
      const out = {};
      for (const c of BRAND_CATEGORIES) out[c] = [...buckets[c].values()].sort((a, b) => a.localeCompare(b, 'ar'));
      return out;
    },
    // مُلّاك كل المواد بنداء واحد — شاشة المخزون تحتاجهم حتى تعرف أي مادة
    // يقدر الحساب الحالي يعدّلها. { [id]: 'اسم الحساب' }
    async owners() {
      const { data, error } = await supabase.from('app_config').select('key,value').like('key', 'material_owner_%');
      throwIf(error);
      const map = {};
      for (const row of data || []) {
        const id = Number(row.key.slice('material_owner_'.length));
        if (!id) continue;
        try {
          map[id] = JSON.parse(row.value);
        } catch { /* قيمة تالفة — نتجاهلها فتبقى المادة بلا مالك */ }
      }
      return map;
    },
    // كل الصور دفعة وحدة — المنشور يحتاج صور عدة مواد بنداء واحد
    async images(ids = null) {
      const { data, error } = await supabase.from('app_config').select('key,value').like('key', 'material_image_%');
      throwIf(error);
      const want = ids ? new Set(ids.map(Number)) : null;
      const out = {};
      for (const row of data || []) {
        const mid = Number(row.key.slice('material_image_'.length));
        if (!Number.isFinite(mid) || (want && !want.has(mid))) continue;
        try { out[mid] = JSON.parse(row.value); } catch { /* قيمة تالفة — نتجاهلها */ }
      }
      return out;
    },
    // الجيك بوكس بصفحة المخزون: المادة المفعّلة تنعرض وتنستعمل بالعروض، والمخفية
    // تبقى بالمخزون بس تختفي من كل مسارات الاستخدام. الحركة تنسجل ولها استرجاع.
    async setActive(id, active) {
      await assertCanEditMaterial(id, 'هذه المادة');
      const before = (await api.config.get(MATERIALS_DISABLED_KEY)) || [];
      const off = new Set(before.map(Number));
      if (active) off.delete(Number(id));
      else off.add(Number(id));
      await setConfigRaw(MATERIALS_DISABLED_KEY, [...off]);  // setActive فحص المادة قبلها
      const { data: m } = await supabase.from('materials').select('full_description').eq('id', id).maybeSingle();
      const name = m?.full_description || `المادة ${id}`;
      logActivity(active ? 'تفعيل مادة بالعروض' : 'إخفاء مادة من العروض', 'المخزون', {
        'المادة': name,
        [UNDO]: {
          kind: 'config', key: MATERIALS_DISABLED_KEY, before,
          label: active ? 'رجّعها مخفية' : 'رجّعها مفعّلة',
          confirm: active ? `إرجاع «${name}» مخفية من العروض` : `إرجاع «${name}» مفعّلة بالعروض`,
        },
      });
      return { ok: true, active };
    },
    async create(data) {
      await assertCanAddMaterial();
      const { data: row, error } = await supabase.from('materials').insert(materialPayload(data)).select().single();
      throwIf(error);
      await saveIntegratedKw(row.id, data);
      await saveIpRating(row.id, data);
      // نسجّل صاحب المادة — عليه تعتمد صلاحية تعديلها لاحقاً
      const me = await currentUsername();
      if (me) {
        try {
          await supabase.from('app_config').upsert({ key: ownerKey(row.id), value: JSON.stringify(me) });
        } catch { /* تسجيل المالك اختياري — فشله ما يمنع إضافة المادة */ }
      }
      logActivity('إضافة مادة', 'المخزون', {
        'المادة': row.full_description, 'السعر': row.price,
        [UNDO]: { kind: 'rowInsert', table: 'materials', id: row.id, config: { key: `integrated_specs_${row.id}` }, label: 'حذف المادة المضافة', confirm: `حذف المادة «${row.full_description}» اللي انضافت بهذه الحركة` },
      });
      return row;
    },
    // درجة الحماية وحدها — بلا ما نعيد كتابة صف المادة كله.
    // تغذّي «إكمال درجات الحماية» بالمخزون: قائمة المواد الناقصة تنملأ سطراً سطراً.
    async setIp(id, value) {
      await assertCanEditMaterial(id, 'درجة الحماية لهذه المادة');
      const { data: m } = await supabase.from('materials').select('full_description').eq('id', id).maybeSingle();
      const before = await api.config.get(ipKey(id));
      await saveIpRating(id, { ip_rating: value });
      const n = parseIp(value);
      logActivity(n == null ? 'حذف درجة الحماية' : 'تحديد درجة الحماية', 'المخزون', {
        'المادة': m?.full_description || id,
        ...(n == null ? {} : { 'درجة الحماية': `IP${String(n).padStart(2, '0')}` }),
        [UNDO]: { kind: 'config', key: ipKey(id), before, label: 'إرجاع درجة الحماية السابقة', confirm: `إرجاع درجة الحماية لـ«${m?.full_description || id}» مثل ما كانت` },
      });
      return { ok: true, ip: n };
    },
    async update(id, data) {
      await assertCanEditMaterial(id, 'هذه المادة');
      // لقطة الصف كامل قبل التعديل — السجل يبيّن شنو تغيّر، والاسترجاع يرجّع كل
      // الأعمدة مثل ما كانت (مو السعر بس)
      const { data: old } = await supabase.from('materials').select('*').eq('id', id).maybeSingle();
      const oldKw = old?.category === 'integrated' ? await api.config.get(`integrated_specs_${id}`) : null;
      const { data: row, error } = await supabase.from('materials').update(materialPayload(data)).eq('id', id).select().single();
      throwIf(error);
      await saveIntegratedKw(id, data);
      await saveIpRating(id, data);
      logActivity('تعديل مادة', 'المخزون', {
        'المادة': row.full_description,
        ...(old && old.price !== row.price ? { 'السعر القديم': old.price, 'السعر الجديد': row.price } : { 'السعر': row.price }),
        [UNDO]: old
          ? { kind: 'rowUpdate', table: 'materials', id, before: old, config: { key: `integrated_specs_${id}`, before: oldKw }, label: 'إرجاع المادة لحالتها السابقة', confirm: `إرجاع «${row.full_description}» لكل قيمها قبل هذا التعديل` }
          : { kind: 'none', why: 'ما انلقطت الحالة السابقة' },
      });
      return row;
    },
    async remove(id) {
      await assertCanEditMaterial(id, 'هذه المادة');
      const { data: old } = await supabase.from('materials').select('*').eq('id', id).maybeSingle();
      const oldKw = old?.category === 'integrated' ? await api.config.get(`integrated_specs_${id}`) : null;
      const { error } = await supabase.from('materials').delete().eq('id', id);
      throwIf(error);
      logActivity('حذف مادة', 'المخزون', old ? {
        'المادة': old.full_description, 'السعر': old.price,
        [UNDO]: { kind: 'rowDelete', table: 'materials', row: old, config: { key: `integrated_specs_${id}`, before: oldKw }, label: 'إرجاع المادة المحذوفة', confirm: `إرجاع المادة «${old.full_description}» للمخزون بنفس تفاصيلها` },
      } : { 'المعرف': id, [UNDO]: { kind: 'none', why: 'المادة ما انلقطت قبل الحذف' } });
      return { ok: true };
    },
    async parseExcel() {
      if (!canImportInventory(await currentUsername())) {
        throw new Error('الاستيراد من إكسل محصور بحسابات الإدارة');
      }
      const file = await pickFile('.xlsx,.xls,.csv');
      if (!file) return { canceled: true };
      const buffer = await readArrayBuffer(file);
      const parsed = excelImport.parseInventoryWorkbook(new Uint8Array(buffer));
      const existing = await allMaterials();
      return {
        canceled: false,
        fileName: file.name,
        rows: excelImport.annotateMatches(existing, parsed.rows),
        labor: parsed.labor,
        warnings: parsed.warnings,
      };
    },
    async importRows({ materials = [], labor = [] }) {
      const me = await currentUsername();
      if (!canImportInventory(me)) {
        throw new Error('الاستيراد من إكسل محصور بحسابات الإدارة');
      }
      // حساب الإضافة: يضيف الجديد بس. أي صف يطابق مادة موجودة ينرفض بسبب واضح
      // بدل ما يحدّثها — وإلا صار الاستيراد باباً خلفياً للمخزون القديم.
      const mayUpdate = canImportUpdates(me);
      const mayLabor = canEditLabor(me);
      const existing = await allMaterials();
      let added = 0;
      let updated = 0;
      // صف يفشل ما يوقف الباقي: كانت الحلقة ترمي بأول خطأ فتضيع كل المواد اللي بعده،
      // والنافذة تبلع الخطأ فما يظهر شي أصلاً. هسه نجمع أسباب الفشل ونرجّعها للعرض.
      const failed = [];
      for (const raw of materials) {
        const normalized = excelImport.normalizeImportedMaterial(raw);
        // درجة الحماية ماكو إلها عمود بالجدول — تنفصل عن حمولة القاعدة وتنخزن
        // بـapp_config، وإلا الإدخال يفشل بـ«column ip_rating does not exist»
        const { ip_rating: importedIp, ...m } = normalized;
        const match = excelImport.findExistingMaterial(existing, m);
        try {
          if (match) {
            if (!mayUpdate) {
              throw new Error('موجودة بالمخزون — حسابك يضيف مواد جديدة بس، والتحديث محصور بالإدارة');
            }
            const { error } = await supabase.from('materials').update({ ...m, updated_at: new Date().toISOString() }).eq('id', match.id);
            throwIf(error);
            if (importedIp != null) await saveIpRating(match.id, { ip_rating: importedIp });
            updated++;
          } else {
            const { data: row, error } = await supabase.from('materials').insert(m).select('id').single();
            throwIf(error);
            if (importedIp != null && row?.id) await saveIpRating(row.id, { ip_rating: importedIp });
            // نفس قاعدة الإضافة اليدوية: المستورِد يملك مادته فيقدر يعدّلها بعدين
            if (me && row?.id) {
              try {
                await supabase.from('app_config').upsert({ key: ownerKey(row.id), value: JSON.stringify(me) });
              } catch { /* تسجيل المالك اختياري */ }
            }
            added++;
          }
        } catch (err) {
          failed.push({ model: m.model || m.full_description, category: m.category, reason: err.message });
        }
      }
      let laborAdded = 0;
      let laborUpdated = 0;
      if (labor.length && mayLabor) {
        const { data: existingLabor } = await supabase.from('labor_tiers').select('*');
        for (const l of labor) {
          const match = (existingLabor || []).find((x) => x.system_amps === l.system_amps);
          try {
            if (match) {
              const { error } = await supabase.from('labor_tiers').update({ price: l.price, note: l.note || null }).eq('id', match.id);
              throwIf(error);
              laborUpdated++;
            } else {
              const { error } = await supabase.from('labor_tiers').insert({ system_amps: l.system_amps, price: l.price, note: l.note || null });
              throwIf(error);
              laborAdded++;
            }
          } catch (err) {
            failed.push({ model: `أجور عمل ${l.system_amps} أمبير`, category: 'labor', reason: err.message });
          }
        }
      }
      logActivity('استيراد إكسل للمخزون', 'المخزون', {
        'مواد مضافة': added, 'مواد محدثة': updated, 'أجور مضافة': laborAdded, 'أجور محدثة': laborUpdated,
        ...(failed.length ? { 'صفوف فشلت': failed.length, 'سبب أول فشل': failed[0].reason } : {}),
        [UNDO]: { kind: 'none', why: 'الاستيراد يمس صفوفاً كثيرة دفعة واحدة — ما ينرجع بضغطة' },
      });
      return { added, updated, laborAdded, laborUpdated, failed };
    },
    async downloadTemplate() {
      const XLSX = await import('xlsx');
      const wb = excelImport.buildTemplateWorkbook();
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'قالب_المخزون.xlsx';
      a.click();
      URL.revokeObjectURL(a.href);
      return { canceled: false };
    },
  },

  laborTiers: {
    async list() {
      const { data, error } = await supabase.from('labor_tiers').select('*').order('system_amps');
      throwIf(error);
      return data || [];
    },
    async create(data) {
      await assertCanEdit('أجور العمل');
      const { data: row, error } = await supabase.from('labor_tiers').insert({ system_amps: data.system_amps, price: data.price, note: data.note || null }).select().single();
      throwIf(error);
      logActivity('إضافة أجور عمل', 'المخزون', {
        'الحجم (أمبير)': row.system_amps, 'السعر': row.price,
        [UNDO]: { kind: 'rowInsert', table: 'labor_tiers', id: row.id, label: 'حذف الأجور المضافة', confirm: `حذف أجور العمل لحجم ${row.system_amps} أمبير اللي انضافت بهذه الحركة` },
      });
      return row;
    },
    async update(id, data) {
      await assertCanEdit('أجور العمل');
      const { data: old } = await supabase.from('labor_tiers').select('*').eq('id', id).maybeSingle();
      const { data: row, error } = await supabase.from('labor_tiers').update({ system_amps: data.system_amps, price: data.price, note: data.note || null }).eq('id', id).select().single();
      throwIf(error);
      logActivity('تعديل أجور عمل', 'المخزون', {
        'الحجم (أمبير)': row.system_amps,
        ...(old && old.price !== row.price ? { 'السعر القديم': old.price, 'السعر الجديد': row.price } : { 'السعر': row.price }),
        [UNDO]: old
          ? { kind: 'rowUpdate', table: 'labor_tiers', id, before: old, label: 'إرجاع الأجور لحالتها السابقة', confirm: `إرجاع أجور حجم ${row.system_amps} أمبير لقيمها قبل هذا التعديل` }
          : { kind: 'none', why: 'ما انلقطت الحالة السابقة' },
      });
      return row;
    },
    async remove(id) {
      await assertCanEdit('أجور العمل');
      const { data: old } = await supabase.from('labor_tiers').select('*').eq('id', id).maybeSingle();
      const { error } = await supabase.from('labor_tiers').delete().eq('id', id);
      throwIf(error);
      logActivity('حذف أجور عمل', 'المخزون', old ? {
        'الحجم (أمبير)': old.system_amps, 'السعر': old.price,
        [UNDO]: { kind: 'rowDelete', table: 'labor_tiers', row: old, label: 'إرجاع الأجور المحذوفة', confirm: `إرجاع أجور حجم ${old.system_amps} أمبير` },
      } : { 'المعرف': id, [UNDO]: { kind: 'none', why: 'الصف ما انلقط قبل الحذف' } });
      return { ok: true };
    },
  },

  quotes: {
    // إعدادات التقسيط المصرفي المشتركة (نسبة الفائدة كمعامل ضرب + عدد الأشهر) —
    // تتعدل من صفحة الإعدادات وتنسحب تلقائياً على كل عرض مؤشر عليه التقسيط
    // خطتا التقسيط: التقسيط عبر مصرف النهرين، أو مبادرة البنك المركزي.
    // كل خطة نسبتها وأشهرها من الإعدادات المشتركة — والقيم هنا احتياط إذا ما انحفظت بعد.
    async _installment(input) {
      if (!input.installment) return null;
      const plan = ['cbi', 'ahli'].includes(input.installmentPlan) ? input.installmentPlan : 'company';
      // **لكل مصرف نسبته وأشهره**. كان الأهلي يستعير إعداد النهرين، فيطلع عرضه
      // بـ35% بدل نسبته هو — عرض 464 طلع 14,034,600 بدل ≈12,995,000، والبياع
      // ما عنده وين يغيّرها لأن الإعدادات ما بيها قسم للأهلي أصلاً.
      const key = { cbi: 'installment_cbi', ahli: 'installment_ahli' }[plan] || 'installment';
      const fallback = {
        cbi: { rate: 1.26, months: 84 },    // مبادرة البنك المركزي: 26% لسبع سنوات
        ahli: { rate: 1.25, months: 84 },   // المصرف الأهلي العراقي: 25% لسبع سنوات
      }[plan] || { rate: 1.35, months: 60 };  // مصرف النهرين
      const cfg = await api.config.get(key);
      // نسبة وأشهر خاصة بهذا العرض تتقدّم على الإعدادات العامة — حتى يقسّط على
      // أي مصرف بنسبته بلا ما يغيّر الإعدادات المشتركة لكل الفريق
      const ownRate = Number(input.installmentRate);
      const ownMonths = Number(input.installmentMonths);
      return {
        enabled: true,
        plan,
        label: installmentPlanLabel(plan),
        rate: ownRate > 0 ? ownRate : (Number(cfg?.rate) > 0 ? Number(cfg.rate) : fallback.rate),
        months: ownMonths > 0 ? ownMonths : (Number(cfg?.months) > 0 ? Number(cfg.months) : fallback.months),
      };
    },
    // وسائط بناء العرض — نقطة واحدة يستعملها الجميع (المعاينة، الحفظ، تصدير PDF).
    // كانت كل نقطة تبنيها بيدها، فنسي التصدير نوع المنظومة والأعداد المثبتة وطلع
    // ملف PDF مختلف كلياً عن اللي يشوفه البياع بالشاشة.
    // ownerHint = صاحب العرض المخزون (بمسار التعديل) — الزيادة المخفية تتبع
    // **صاحب العرض** مو اللي يفتحه، وإلا مجموع عرض قديم ينزل 10% لمجرد إن
    // حساباً إدارياً فتحه للتعديل، ويرتفع لو فتحه صاحبه — والمجموع يتذبذب
    // بلا سبب ظاهر للزبون.
    async _draftArgs(input, ownerHint = null) {
      const owner = (await attributedCreator(input)) || ownerHint || (await currentUsername());
      return {
        hiddenMarkupPercent: hiddenMarkupPercentFor(owner),
        tier: input.tier,
        overrides: input.overrides || {},
        cableMeters: input.cableMeters || {},
        secondarySelections: input.secondarySelections || null,
        adjustments: await this._adjustments(input),
        extraUnits: input.extraUnits || null,
        unitCounts: input.unitCounts || null,
        systemType: input.systemType || null,
      };
    },
    async _adjustments(input) {
      return { ...(input.adjustments || {}), installment: await this._installment(input) };
    },
    async _options(input) {
      const [materials, { data: laborTiers }, { data: settingsRow }] = await Promise.all([
        allMaterials(),
        supabase.from('labor_tiers').select('*'),
        supabase.from('settings').select('*').eq('id', 1).single(),
      ]);
      // فلتر البراند: كل قسم بماركته المختارة لحاله (لوح · بطارية · انفيرتر ·
      // كابينة)، والأقسام بلا اختيار تبقى مفتوحة. المواد الثانوية والأجور ما
      // تنفلتر إطلاقاً — أغلبها بلا ماركة وحذفها يكسر العرض.
      // الماركات المنتخبة تنقصّ على نوع المنظومة أولاً حتى ما يبقى فلتر مخفي
      // على قسم أصلاً مو داخل بالعرض.
      const active = materials.filter((m) => m.active !== false);
      const picked = pruneBrandPick(normalizeBrandPick(input), input.systemType);
      const filtered = filterMaterialsByBrands(active, picked);

      return quoteService.buildOptions({
        // المواد المخفية (بلا جيك بوكس) ما تدخل محرك التسعير إطلاقاً: لا اختيار
        // تلقائي ولا قوائم تبديل يدوي ولا مواد ثانوية
        materials: filtered,
        laborTiers: laborTiers || [],
        settingsRow,
        roofAreaM2: input.roofAreaM2,
        ampDay: input.ampDay,
        ampNight: input.ampNight,
        nightSupplyHours: input.nightSupplyHours,
        // معاملات البطاريات صارت خاصية بالعرض مو إعداداً مشتركاً: الجديد بلا معامل،
        // والمحفوظ قبل الإلغاء يمرّر معاملاته المخزونة فيرجع بنفس بطارياته
        batteryFactors: batteryFactorsOf(input),
        // معامل أمان الألواح يجي مع العرض: الجديد 1.25، والمحفوظ قبل القاعدة 1
        panelSafetyFactor: panelSafetyFactorOf(input),
      });
    },
    async preview(input) {
      const options = await this._options(input);
      const draft = quoteService.buildQuoteDraft(options, await this._draftArgs(input));
      return {
        options: {
          systemAmps: options.systemAmps,
          nightSupplyHours: options.nightSupplyHours,
          labor: options.labor,
          secondary: options.secondary,
          batteryTiers: options.batteryTiers,
          inverterTiers: options.inverterTiers,
          integratedMaterials: options.integratedMaterials,
        },
        draft,
      };
    },
    // حالات العروض (عادي/متابعة/مستعجل/مكتمل + ملاحظات) — مفتاح quote_status_<id> بجدول app_config
    async statuses() {
      const { data, error } = await supabase.from('app_config').select('key,value').like('key', 'quote_status_%');
      throwIf(error);
      const map = {};
      for (const row of data || []) {
        const id = Number(row.key.slice('quote_status_'.length));
        if (!id) continue;
        try {
          const v = JSON.parse(row.value);
          if (v && v.level) map[id] = { level: v.level, note: v.note || '' };
        } catch {
          /* قيمة تالفة — نتجاهلها ويبقى العرض بالحالة الافتراضية */
        }
      }
      return map;
    },
    async setStatus(id, status) {
      await assertQuoteAccess(id, 'حالة هذا العرض');
      const { data: q } = await supabase.from('quotes').select('quote_number, client_name').eq('id', id).maybeSingle();
      const beforeStatus = await api.config.get(`quote_status_${id}`);
      logActivity('تغيير حالة عرض', 'العروض', {
        'رقم العرض': q?.quote_number ?? id, 'العميل': q?.client_name || '-', 'الحالة': status.level, ...(status.note ? { 'ملاحظة': status.note } : {}),
        [UNDO]: { kind: 'config', key: `quote_status_${id}`, before: beforeStatus, label: 'إرجاع الحالة السابقة', confirm: `إرجاع حالة العرض ${q?.quote_number ?? id} لما كانت عليه` },
      });
      return api.config.set(`quote_status_${id}`, { level: status.level, note: status.note || '' });
    },
    // أسماء كل من سبق وأنشأ عرضاً — تغذي قائمة «العرض من طرف» تلقائياً بدون قائمة ثابتة.
    // للإدارة فقط: هي وحدها اللي تسند العروض، وأسماء الفريق ما تنعرض لغيرها.
    async creators() {
      if (!canAttributeQuote((await currentIdentity()).username)) return [];
      const { data, error } = await supabase.from('quotes').select('created_by');
      throwIf(error);
      return [...new Set((data || []).map((r) => r.created_by).filter(Boolean))];
    },
    // كشف تكرار العرض: هل يوجد عرض محفوظ بنفس اسم العميل ورقم الموبايل؟
    // فحص حي أثناء الكتابة: هل اكو عرض سابق لنفس الاسم أو نفس رقم الهاتف؟
    // المطابقة محلية ومرنة: الأرقام تقارن كأرقام فقط (نتجاهل المسافات والرموز ونحول
    // الأرقام العربية)، وتنطبق حتى لو المكتوب جزء من بداية الرقم المخزن أو العكس؛
    // والأسماء تتطابق مع تجاهل فروقات الهمزة والمسافات. نستثني المحذوفة.
    async findClientMatch({ clientName, clientPhone }) {
      const toDigits = (s) =>
        String(s || '')
          .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
          .replace(/\D/g, '');
      const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا');
      const digits = toDigits(clientPhone);
      const name = normName(clientName);
      if (name.length < 3 && digits.length < 8) return null;

      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number, client_name, client_phone, created_at, total_price, deleted_at')
        .order('id', { ascending: false })
        .limit(1000);
      throwIf(error);
      return (
        (data || []).find((q) => {
          if (q.deleted_at) return false;
          const qDigits = toDigits(q.client_phone);
          const phoneHit =
            digits.length >= 8 &&
            qDigits.length >= 8 &&
            (qDigits === digits || qDigits.startsWith(digits) || digits.startsWith(qDigits));
          const nameHit = name.length >= 3 && normName(q.client_name) === name;
          return phoneHit || nameHit;
        }) || null
      );
    },
    async findDuplicate({ clientName, clientPhone }) {
      if (!clientName && !clientPhone) return null;
      let q = supabase.from('quotes').select('id, quote_number, created_at, total_price').order('id', { ascending: false }).limit(1);
      if (clientName) q = q.eq('client_name', clientName);
      if (clientPhone) q = q.eq('client_phone', clientPhone);
      const { data, error } = await q;
      throwIf(error);
      return data && data.length ? data[0] : null;
    },
    // نسبة الزيادة/الخصم تنحفظ لكل عرض بجدول app_config (مفتاح quote_adj_<id>)
    // حتى ترجع بوضع التعديل حتى لو كانت الزيادة موزعة (مخفية) بدون سطر ظاهر
    async _saveAdjustments(quoteId, adjustments, extraUnits, secondarySelections, input = {}) {
      const counts = input.unitCounts && Object.keys(input.unitCounts).length ? input.unitCounts : null;
      const a = adjustments || {};
      const x = extraUnits || {};
      const hasExtra = ['panel', 'battery', 'inverter', 'integrated'].some((k) => (Number(x[k]) || 0) !== 0);
      // الاختيارات الثانوية الخام (بكمياتها اليدوية) تنحفظ هم — ذاكرة العرض الكاملة
      const sel = secondarySelections && Object.keys(secondarySelections).length > 0 ? secondarySelections : null;
      // نوع المنظومة واختيار الكابينة المتكاملة جزء من ذاكرة العرض — بدونهما العرض
      // المحفوظ يرجع بنوع «كاملة» عند التعديل وتضيع الكابينة
      const systemType = input.systemType || null;
      // ماركات الأقسام المنتخبة (لوح · بطارية · انفيرتر · كابينة) — بدونها يرجع
      // العرض المحفوظ بكل الماركات وتتبدل مواده عند إعادة الفتح
      const picked = pruneBrandPick(normalizeBrandPick(input), systemType);
      // اللقطة تنكتب بكل عرض بلا استثناء: معامل أمان الألواح لازم ينحفظ حتى مع
      // العرض البسيط (بلا زيادة ولا خصم ولا براند) — بدونه العرض يرجع «قديماً»
      // عند فتحه، ينحسب بمعامل 1، ويتبدّل عدد ألواحه.
      try {
        await api.config.set(`quote_adj_${quoteId}`, {
          // ذاكرة المواد الثانوية كما أدخلها البياع — فتح التعديل يرجعها حرفياً
          secondarySelections: sel,
          markupPercent: Number(a.markupPercent) || 0,
          markupMode: a.markupMode === 'distributed' ? 'distributed' : 'visible',
          discountPercent: Number(a.discountPercent) || 0,
          // معامل أمان الألواح وقت الحفظ — بدونه إعادة فتح العرض تعيد حسابه
          // بالمعامل الحالي ويتبدّل عدد ألواحه. العروض المحفوظة قبل القاعدة
          // ماكو عندها هذا المفتاح، فتنقرأ بـ1 (بلا معامل) وتبقى مثل ما هي.
          panelSafetyFactor: panelSafetyFactorOf(input),
          // معاملات البطاريات وقت الحفظ — بنفس منطق معامل الألواح. العروض
          // المحفوظة قبل الإلغاء ماكو عندها هذا المفتاح، فتنقرأ بالمعاملات
          // القديمة وتبقى مثل ما هي.
          batteryFactors: batteryFactorsOf(input),
          // ماركة كل قسم لحاله. `brand` القديم ينحفظ هم للتوافق مع أي قارئ قديم
          // (كان يعني الانفيرتر والبطارية بس) — والقراءة تعتمد `brands` أولاً.
          brands: picked,
          brand: (picked.battery && picked.battery === picked.inverter) ? picked.battery : null,
          // لقطة نسبة الفائدة والأشهر والخطة وقت الحفظ — تغيير الإعدادات لاحقاً لا يغير العروض المحفوظة.
          // `plan` كان ناقصاً فكل عرض محفوظ يرجع باسم «مصرف النهرين» حتى لو انحفظ بمبادرة البنك المركزي.
          // `distributed` يميّز العروض الجديدة (الفائدة داخل أسعار البنود) عن القديمة (بنود بسعر الكاش) —
          // بدونه إعادة الطباعة تضرب الفائدة مرتين.
          installment: a.installment?.enabled
            ? {
              enabled: true,
              plan: a.installment.plan === 'cbi' ? 'cbi' : 'company',
              rate: Number(a.installment.rate) || 1.35,
              months: Number(a.installment.months) || 60,
              // النسبة ما عادت تتوزع على أسعار البنود — `total_price` هو سعر
              // الكاش، ومجموع التقسيط ينحسب بضربه بالنسبة. العروض المحفوظة
              // بفترة التوزيع عدها `distributed: true` وتبقى على حسابها.
              distributed: false,
              // قرار البياع: هل يشوف الزبون المبلغ الكلي بالملف؟ ينحفظ مع العرض
              // حتى إعادة الطباعة بعد شهر تطلع بنفس الشكل بلا ما ينضبط من جديد
            }
            : null,
          // الزيادة/النقصان اليدوي بالوحدات — يرجع بوضع التعديل
          extraUnits: hasExtra
            ? { panel: Number(x.panel) || 0, battery: Number(x.battery) || 0, inverter: Number(x.inverter) || 0, integrated: Number(x.integrated) || 0 }
            : null,
          systemType,
          // الأعداد اللي ثبّتها البياع بيده — ترجع كما هي عند فتح العرض للتعديل
          unitCounts: counts,
        });
      } catch {
        /* جدول app_config اختياري — فشله لا يمنع حفظ العرض نفسه */
      }
    },
    // ── رفع عرض جاهز انعمل خارج البرنامج (PDF/إكسل/وورد/صورة) ──────────────
    // ينضاف كسجل بقائمة العروض برقم عرض حقيقي من نفس التسلسل، والملف ينخزن
    // بعمودي المرفقات الموجودين — بلا أي جدول ولا عمود جديد.
    // بلا بنود ولا ملاحظات: هو ملف جاهز مو عرض مبني من مواد، ولهذا نسجّل رقمه
    // بقائمة «العروض المرفوعة» حتى الواجهة تميّزه وتعطيه أزراراً مناسبة.
    UPLOADED_KEY: 'quote_uploaded_ids',
    async uploadedIds() {
      const ids = await api.config.get(this.UPLOADED_KEY);
      return Array.isArray(ids) ? ids : [];
    },
    async createUploaded(input) {
      const file = input.file;
      if (!file?.data) throw new Error('ما اخترت ملف العرض');
      const quote_number = await nextQuoteNumber();
      const user = await currentUser();

      const { data: quote, error } = await supabase.from('quotes').insert({
        quote_number,
        client_name: input.clientName || null,
        client_phone: input.clientPhone || null,
        location: input.location || null,
        roof_area_m2: 0,
        required_amp_day: 0,
        required_amp_night: 0,
        night_supply_hours: 0,
        selected_tier: 'economy',
        total_price: Math.round(Number(input.totalPrice) || 0),
        created_by: (await attributedCreator(input)) || user?.user_metadata?.username || user?.email || null,
        attachment_name: file.name,
        attachment_data: file.data,
      }).select().single();
      throwIf(error);

      // تسجيل الرقم بقائمة المرفوعة — فشل التسجيل ما يلغي العرض نفسه
      try {
        const ids = await this.uploadedIds();
        await api.config.set(this.UPLOADED_KEY, [...new Set([...ids, quote.id])]);
      } catch {
        /* app_config اختياري — العرض محفوظ على أي حال */
      }

      logActivity('رفع عرض جاهز', 'العروض', {
        'رقم العرض': quote.quote_number,
        'العميل': quote.client_name || '-',
        'المجموع': quote.total_price,
        'الملف': file.name,
        [UNDO]: { kind: 'quoteSoftDelete', id: quote.id, label: 'إلغاء الرفع', confirm: `نقل العرض المرفوع ${quote.quote_number} لسلة المحذوفات` },
      });
      return quote;
    },
    async save(input) {
      const options = await this._options(input);
      const draft = quoteService.buildQuoteDraft(options, await this._draftArgs(input));
      const { data: profile } = await supabase.from('company_profile').select('notes_default').eq('id', 1).single();
      const defaultNotes = Array.isArray(profile?.notes_default) ? profile.notes_default : JSON.parse(profile?.notes_default || '[]');
      // إزالة التكرار: فتح العرض للتعديل يرجّع ملاحظاته المحفوظة **وهي أصلاً تحتوي**
      // ملاحظات الضمان من الحفظة السابقة — فبلا Set تتراكم نسخة بكل تعديل
      const notes = [...new Set([...(input.notes || defaultNotes), ...draft.warrantyNotes])];
      const quote_number = await nextQuoteNumber();
      const user = await currentUser();

      const { data: quote, error } = await supabase.from('quotes').insert({
        quote_number,
        client_name: input.clientName || null,
        client_phone: input.clientPhone || null,
        location: input.location || null,
        roof_area_m2: input.roofAreaM2,
        required_amp_day: input.ampDay,
        required_amp_night: input.ampNight,
        night_supply_hours: options.nightSupplyHours,
        selected_tier: input.tier,
        total_price: draft.total,
        // «العرض من طرف»: الإدارة تكدر تسند العرض لموظف آخر — وإلا اسم الحساب الحافظ
        created_by: (await attributedCreator(input)) || user?.user_metadata?.username || user?.email || null,
      }).select().single();
      throwIf(error);

      const itemsPayload = draft.items.map((item, idx) => ({
        quote_id: quote.id,
        material_id: item.material_id,
        description_snapshot: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        sort_order: idx,
      }));
      throwIf((await supabase.from('quote_items').insert(itemsPayload)).error);

      const notesPayload = notes.map((note_text, idx) => ({ quote_id: quote.id, note_text, sort_order: idx }));
      if (notesPayload.length) throwIf((await supabase.from('quote_notes').insert(notesPayload)).error);

      await this._saveAdjustments(quote.id, await this._adjustments(input), input.extraUnits, input.secondarySelections, { systemType: input.systemType, overrides: input.overrides, unitCounts: input.unitCounts });
      logActivity('حفظ عرض جديد', 'العروض', {
        'رقم العرض': quote.quote_number, 'العميل': quote.client_name || '-', 'المجموع': quote.total_price,
        ...(input.createdBy ? { 'من طرف': input.createdBy } : {}),
        [UNDO]: { kind: 'quoteSoftDelete', id: quote.id, label: 'إلغاء الحفظ', confirm: `نقل العرض ${quote.quote_number} لسلة المحذوفات (يبقى قابلاً للاسترجاع من السلة)` },
      });
      return quote;
    },
    // تحديث عرض محفوظ بمدخلات جديدة: نفس الرقم وتاريخ الإنشاء والمرفق، وبنود وملاحظات جديدة
    async update(id, input) {
      await assertQuoteAccess(id, 'هذا العرض');
      // لقطة كاملة قبل أي كتابة — للسجل (تغيّر المجموع وتحويل المنشئ) وللاسترجاع:
      // الصف والبنود والملاحظات ونِسَب العرض. أعمدة المرفق مستثناة عمداً (base64 ضخم)
      // والتعديل أصلاً ما يمسها.
      const { data: before } = await supabase.from('quotes').select('*').eq('id', id).maybeSingle();
      const [{ data: beforeItems }, { data: beforeNotes }, beforeAdj] = await Promise.all([
        supabase.from('quote_items').select('*').eq('quote_id', id).order('sort_order'),
        supabase.from('quote_notes').select('*').eq('quote_id', id).order('sort_order'),
        api.config.get(`quote_adj_${id}`).catch(() => null),
      ]);
      const snapshot = before ? {
        kind: 'quoteRestore',
        id,
        quote: {
          client_name: before.client_name, client_phone: before.client_phone, location: before.location,
          roof_area_m2: before.roof_area_m2, required_amp_day: before.required_amp_day,
          required_amp_night: before.required_amp_night, night_supply_hours: before.night_supply_hours,
          selected_tier: before.selected_tier, total_price: before.total_price, created_by: before.created_by,
        },
        items: (beforeItems || []).map(({ id: _i, quote_id: _q, ...cols }) => cols),
        notes: (beforeNotes || []).map(({ id: _i, quote_id: _q, ...cols }) => cols),
        adj: beforeAdj || null,
        label: 'إرجاع العرض قبل التعديل',
        confirm: `إرجاع العرض ${before.quote_number} ببنوده وملاحظاته ونِسَبه مثل ما كانت قبل هذا التعديل`,
      } : { kind: 'none', why: 'ما انلقطت حالة العرض قبل التعديل' };
      const assigned = await attributedCreator(input);
      const options = await this._options(input);
      const draft = quoteService.buildQuoteDraft(options, await this._draftArgs(input, before?.created_by));
      const notes = [...new Set([...(input.notes || []), ...draft.warrantyNotes])];

      const { data: quote, error } = await supabase
        .from('quotes')
        .update({
          client_name: input.clientName || null,
          client_phone: input.clientPhone || null,
          location: input.location || null,
          roof_area_m2: input.roofAreaM2,
          required_amp_day: input.ampDay,
          required_amp_night: input.ampNight,
          night_supply_hours: options.nightSupplyHours,
          selected_tier: input.tier,
          total_price: draft.total,
          // تغيير الإسناد فقط إذا انطى اسم صريح (وبصلاحية إدارية) — وإلا يبقى
          // المنشئ الأصلي بلا مساس، حتى لو اللي يعدّل حساب ثاني
          ...(assigned ? { created_by: assigned } : {}),
        })
        .eq('id', id)
        .select()
        .single();
      throwIf(error);

      throwIf((await supabase.from('quote_items').delete().eq('quote_id', id)).error);
      throwIf((await supabase.from('quote_notes').delete().eq('quote_id', id)).error);

      const itemsPayload = draft.items.map((item, idx) => ({
        quote_id: id,
        material_id: item.material_id,
        description_snapshot: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        sort_order: idx,
      }));
      throwIf((await supabase.from('quote_items').insert(itemsPayload)).error);
      const notesPayload = notes.map((note_text, idx) => ({ quote_id: id, note_text, sort_order: idx }));
      if (notesPayload.length) throwIf((await supabase.from('quote_notes').insert(notesPayload)).error);

      await this._saveAdjustments(id, await this._adjustments(input), input.extraUnits, input.secondarySelections, { systemType: input.systemType, overrides: input.overrides, unitCounts: input.unitCounts });
      const transferred = assigned && before?.created_by && assigned !== before.created_by;
      logActivity(transferred ? 'تعديل عرض + تحويل الحساب' : 'تعديل عرض', 'العروض', {
        'رقم العرض': quote.quote_number, 'العميل': quote.client_name || '-',
        ...(before && before.total_price !== quote.total_price
          ? { 'المجموع القديم': before.total_price, 'المجموع الجديد': quote.total_price }
          : { 'المجموع': quote.total_price }),
        ...(transferred ? { 'من حساب': before.created_by, 'إلى حساب': assigned } : {}),
        [UNDO]: snapshot,
      });
      return quote;
    },
    async list() {
      const { data, error } = await supabase.from('quotes').select('*').order('id', { ascending: false });
      throwIf(error);
      // نستثني المحذوفة (سلة المهملات) — الفلترة محلية حتى تشتغل حتى قبل إضافة العمود
      return onlyMyQuotes((data || []).filter((q) => !q.deleted_at));
    },
    // سلة المحذوفات: آخر أسبوع فقط، مع تنظيف نهائي تلقائي للأقدم من 7 أيام
    async listDeleted() {
      const { data, error } = await supabase.from('quotes').select('*').order('id', { ascending: false });
      throwIf(error);
      const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
      const deleted = (data || []).filter((q) => q.deleted_at);
      const expired = deleted.filter((q) => new Date(q.deleted_at).getTime() < weekAgo);
      if (expired.length) {
        // البنود والملاحظات تنحذف تلقائياً معها (on delete cascade)
        supabase.from('quotes').delete().in('id', expired.map((q) => q.id)).then(() => {});
      }
      // البياع يشوف محذوفاته هو فقط — والتنظيف التلقائي للأسبوع يبقى على مستوى الجدول
      return onlyMyQuotes(deleted.filter((q) => new Date(q.deleted_at).getTime() >= weekAgo));
    },
    // تفريغ السلة نهائياً: حذف كل المحذوفات فوراً بلا انتظار الأسبوع.
    // يمس عروض الفريق كله — فالصلاحية إدارية بالقاعدة مو بالواجهة بس.
    async purgeDeleted() {
      if (!canAttributeQuote((await currentIdentity()).username)) {
        throw new Error('تفريغ سلة المحذوفات محصور بحسابات الإدارة');
      }
      const { data, error: selError } = await supabase.from('quotes').select('id, quote_number').not('deleted_at', 'is', null);
      throwIf(selError);
      const ids = (data || []).map((q) => q.id);
      if (ids.length) {
        // البنود والملاحظات تنحذف تلقائياً (on delete cascade)
        const { error } = await supabase.from('quotes').delete().in('id', ids);
        throwIf(error);
      }
      logActivity('تفريغ سلة المحذوفات نهائياً', 'العروض', {
        'عدد العروض': ids.length,
        'الأرقام': (data || []).map((q) => q.quote_number).join('، ') || '-',
        [UNDO]: { kind: 'none', why: 'حذف نهائي من القاعدة — ما ينرجع' },
      });
      return { count: ids.length };
    },
    async restore(id) {
      await assertQuoteAccess(id, 'هذا العرض');
      const { error } = await supabase.from('quotes').update({ deleted_at: null, deleted_by: null }).eq('id', id);
      throwIf(error);
      const { data: q } = await supabase.from('quotes').select('quote_number, client_name').eq('id', id).maybeSingle();
      logActivity('استرجاع عرض من سلة المحذوفات', 'العروض', {
        'رقم العرض': q?.quote_number ?? id, 'العميل': q?.client_name || '-',
        [UNDO]: { kind: 'quoteSoftDelete', id, label: 'رجّعه للسلة', confirm: `إرجاع العرض ${q?.quote_number ?? id} لسلة المحذوفات` },
      });
      return { ok: true };
    },
    // إرفاق ملف تصميم (صورة أو PDF) بالعرض — يخزن base64 ويتصدر مع ملف العرض
    async setAttachment(id, { name, data }) {
      await assertQuoteAccess(id, 'هذا العرض');
      const { error } = await supabase.from('quotes').update({ attachment_name: name, attachment_data: data }).eq('id', id);
      throwIf(error);
      const { data: q } = await supabase.from('quotes').select('quote_number').eq('id', id).maybeSingle();
      // المرفق base64 وممكن يكون ميغابايتات — ما ننزله باللقطة، فالحركة غير قابلة للاسترداد
      logActivity('إرفاق تصميم بعرض', 'العروض', {
        'رقم العرض': q?.quote_number ?? id, 'الملف': name,
        [UNDO]: { kind: 'none', why: 'ملف المرفق كبير — يُشال يدوياً من صفحة العروض' },
      });
      return { ok: true };
    },
    async removeAttachment(id) {
      await assertQuoteAccess(id, 'هذا العرض');
      const { data: q } = await supabase.from('quotes').select('quote_number, attachment_name').eq('id', id).maybeSingle();
      const { error } = await supabase.from('quotes').update({ attachment_name: null, attachment_data: null }).eq('id', id);
      throwIf(error);
      logActivity('حذف مرفق عرض', 'العروض', {
        'رقم العرض': q?.quote_number ?? id, ...(q?.attachment_name ? { 'الملف': q.attachment_name } : {}),
        [UNDO]: { kind: 'none', why: 'ملف المرفق انمسح من القاعدة — يُرفع من جديد' },
      });
      return { ok: true };
    },
    async get(id) {
      await assertQuoteAccess(id, 'هذا العرض');
      const { data: quote } = await supabase.from('quotes').select('*').eq('id', id).single();
      if (!quote) return null;
      const [{ data: items }, { data: notes }] = await Promise.all([
        supabase.from('quote_items').select('*').eq('quote_id', id).order('sort_order'),
        supabase.from('quote_notes').select('*').eq('quote_id', id).order('sort_order'),
      ]);
      return { quote, items: items || [], notes: notes || [] };
    },
    async remove(id) {
      await assertQuoteAccess(id, 'هذا العرض');
      // حذف ناعم: يروح لسلة المحذوفات مع تسجيل منو حذفه، ويمكن استرداده خلال أسبوع
      const user = await currentUser();
      const username = user?.user_metadata?.username || user?.email || 'غير معروف';
      const { data: q } = await supabase.from('quotes').select('quote_number, client_name, total_price').eq('id', id).maybeSingle();
      const { error } = await supabase
        .from('quotes')
        .update({ deleted_at: new Date().toISOString(), deleted_by: username })
        .eq('id', id);
      throwIf(error);
      logActivity('حذف عرض (لسلة المحذوفات)', 'العروض', {
        'رقم العرض': q?.quote_number ?? id, 'العميل': q?.client_name || '-', 'المجموع': q?.total_price ?? '-',
        [UNDO]: { kind: 'quoteUndelete', id, label: 'إرجاع العرض', confirm: `إرجاع العرض ${q?.quote_number ?? id} من سلة المحذوفات` },
      });
      return { ok: true };
    },
    async exportPdf(id) {
      await assertQuoteAccess(id, 'هذا العرض');
      const { data: quote } = await supabase.from('quotes').select('*').eq('id', id).single();
      if (!quote) throw new Error('العرض غير موجود');
      const [{ data: items }, { data: notes }, { data: company }, savedAdj] = await Promise.all([
        supabase.from('quote_items').select('*').eq('quote_id', id).order('sort_order'),
        supabase.from('quote_notes').select('*').eq('quote_id', id).order('sort_order'),
        supabase.from('company_profile').select('*').eq('id', 1).single(),
        api.config.get(`quote_adj_${id}`).catch(() => null),
      ]);
      // التقسيط انحفظ مع العرض بنسبته وأشهره وقت الحفظ — نعيد حسابه من مجموع العرض
      // نوع المنظومة المحفوظ يغذي تسمية العرض بالفاتورة («منظومة سستم متكامل»)
      if (savedAdj?.systemType) quote.system_type = savedAdj.systemType;
      let installment = null;
      const inst = savedAdj?.installment;
      if (inst?.enabled && Number(inst.rate) > 0) {
        const rate = Number(inst.rate);
        const months = Math.max(1, Math.round(Number(inst.months) || 60));
        // العروض الجديدة: الفائدة موزّعة داخل أسعار البنود، فـ`total_price` **هو**
        // مجموع التقسيط — ضربه بالنسبة مرة ثانية يحسب الفائدة مرتين.
        // العروض المحفوظة قبل هذا التغيير بنودها بسعر الكاش، فتبقى على حسابها القديم.
        const distributed = inst.distributed === true;
        const totalWithInterest = distributed ? quote.total_price : Math.round(quote.total_price * rate);
        const plan = inst.plan === 'cbi' ? 'cbi' : 'company';
        installment = {
          rate, months, totalWithInterest,
          monthly: Math.round(totalWithInterest / months),
          plan, label: installmentPlanLabel(plan),
          cashTotal: distributed ? Math.round(quote.total_price / rate) : quote.total_price,
        };
      }
      // قدرة المنظومة لعرض محفوظ: تُعاد من بنوده (عدد وسعة البطاريات والانفيرترات)
      // وأمبيريته وإعدادات النظام — بنفس معادلة المعاينة الحية (calc.capabilityOf)
      let capability = null;
      let integrated = null;   // بيانات الكابينة لصفحة الغلاف — تنمرر صراحةً بلا تخمين من النص
      let panelCount = null;   // عدد الألواح من فئة المادة — مو من مطابقة كلمات الوصف
      try {
        const [materials, { data: settingsRow }] = await Promise.all([
          allMaterials(),
          supabase.from('settings').select('*').eq('id', 1).single(),
        ]);
        const byId = new Map((materials || []).map((m) => [m.id, m]));
        const sumOf = (cat) => (items || []).reduce((acc, it) => {
          const mat = it.material_id != null ? byId.get(it.material_id) : null;
          if (!mat || mat.category !== cat) return acc;
          return { units: acc.units + Number(it.quantity || 0), cap: mat.watt_or_capacity || acc.cap };
        }, { units: 0, cap: 0 });
        const bat = sumOf('battery');
        const inv = sumOf('inverter');
        const V = settingsRow?.system_voltage || 220;
        // الكابينة المتكاملة: نتعرّف عليها من **فئة المادة** مو من نص الوصف —
        // الاعتماد على الوصف كان يفشل إذا البياع كتب وصفاً بكلمات مختلفة
        const cabLine = (items || []).find((it) => {
          const mat = it.material_id != null ? byId.get(it.material_id) : null;
          return mat && mat.category === 'integrated';
        });
        const cabMat = cabLine ? byId.get(cabLine.material_id) : null;
        if (cabMat) {
          integrated = {
            units: Math.max(1, Math.round(Number(cabLine.quantity) || 1)),
            kwh: Number(cabMat.watt_or_capacity) || 0,
            kw: Number(cabMat.integrated_kw) || 0,
          };
        }
        panelCount = (items || []).reduce((acc, it) => {
          const mat = it.material_id != null ? byId.get(it.material_id) : null;
          return mat && mat.category === 'panel' ? acc + (Number(it.quantity) || 0) : acc;
        }, 0);
        const dod = settingsRow?.dod ?? 0.9;
        capability = integrated
          ? {
              // بالسستم المتكامل: القدرة من الكابينة نفسها بنفس معادلة المعاينة الحية
              ...calc.integratedCapability({
                units: integrated.units, kwh: integrated.kwh, kw: integrated.kw,
                nightLoadKw: ((quote.required_amp_night || 0) * V) / 1000,
                dod, systemVoltage: V,
              }),
              ampNight: quote.required_amp_night || 0,
              ampDay: quote.required_amp_day || 0,
            }
          : {
              ...calc.capabilityOf({
                batteryUnits: bat.units, batteryKwh: bat.cap,
                inverterUnits: inv.units, inverterW: inv.cap,
                ampNight: quote.required_amp_night || 0,
                systemVoltage: V, dod,
                inverterSafetyFactor: settingsRow?.inverter_safety_factor ?? 1,
              }),
              ampNight: quote.required_amp_night || 0,
              ampDay: quote.required_amp_day || 0,
              batteries: bat.units,
              inverters: inv.units,
            };
      } catch {
        /* تعذر حساب القدرة — صفحة التصميم تنطبع بلا بطاقات القدرة */
      }
      logActivity('تصدير PDF لعرض محفوظ', 'العروض', {
        'رقم العرض': quote.quote_number, 'العميل': quote.client_name || '-',
        [UNDO]: { kind: 'none', why: 'تصدير ملف — ماكو شي تغيّر بالبرنامج حتى يُسترجع' },
      });
      return exportInvoicePdf({
        installment,
        capability,
        integrated,
        panelCount,
        quote,
        items: (items || []).map((i) => ({ ...i, description: i.description_snapshot })),
        notes: (notes || []).map((n) => n.note_text),
        company,
        // الملف ينزل باسم الزبون — البياع يرسله بالواتساب بلا ما يعيد تسميته
        fileName: quoteFileName(quote.client_name, quote.quote_number),
        attachment: quote.attachment_data ? { name: quote.attachment_name, data: quote.attachment_data } : null,
      });
    },
    async exportDraftPdf(input) {
      const options = await netStep('قراءة المخزون والإعدادات', this._options(input));
      const draft = quoteService.buildQuoteDraft(options, await this._draftArgs(input));
      const { data: company } = await netStep(
        'قراءة ملف الشركة',
        supabase.from('company_profile').select('*').eq('id', 1).single(),
      );
      const defaultNotes = Array.isArray(company?.notes_default) ? company.notes_default : JSON.parse(company?.notes_default || '[]');
      // إزالة التكرار: فتح العرض للتعديل يرجّع ملاحظاته المحفوظة **وهي أصلاً تحتوي**
      // ملاحظات الضمان من الحفظة السابقة — فبلا Set تتراكم نسخة بكل تعديل
      const notes = [...new Set([...(input.notes || defaultNotes), ...draft.warrantyNotes])];
      // رقم العرض التسلسلي للموظفين فقط — الزبون (Google) يطلع ملفه بدون رقم
      const pdfUser = await currentUser();
      const isStaffUser = String(pdfUser?.email || '').endsWith('@biladauto.local');
      const pseudoQuote = {
        quote_number: isStaffUser ? await netStep('حجز رقم العرض', nextQuoteNumber()) : '—',
        client_name: input.clientName,
        client_phone: input.clientPhone,
        location: input.location,
        created_at: new Date().toISOString(),
        total_price: draft.total,
        required_amp_day: input.ampDay,
        required_amp_night: input.ampNight,
        // نوع المنظومة يمشي مع الملف — بدونه صفحة الغلاف ترسم ستركجر بدل الكابينة
        system_type: input.systemType || null,
      };
      // الكابينة المختارة (إن وُجدت) — تنمرر صراحةً لصفحة الغلاف
      const cabMat = draft.integrated?.chosenId
        ? (options.integratedMaterials || []).find((m) => m.id === draft.integrated.chosenId)
        : null;
      const integratedInfo = cabMat
        ? { units: draft.integrated.units, kwh: Number(cabMat.watt_or_capacity) || 0, kw: Number(cabMat.integrated_kw) || 0 }
        : null;
      // ملف راح للزبون وما انحفظ بالبرنامج — ننزّل **كل مدخلاته** بالسجل حتى نكدر
      // نرجّعه للمحرر أو نحفظه لاحقاً. الشكل هو نفسه اللي تنتجه buildEditPrefill.
      logActivity('تصدير PDF معاينة (بلا حفظ)', 'العروض', {
        'العميل': input.clientName || '-', 'المجموع': draft.total,
        ...(input.clientPhone ? { 'الهاتف': input.clientPhone } : {}),
        [DRAFT]: input,
        [UNDO]: { kind: 'none', why: 'تصدير ملف — ماكو شي تغيّر بالبرنامج حتى يُسترجع' },
      });
      return exportInvoicePdf({
        quote: pseudoQuote, items: draft.items, notes, company, installment: draft.installment,
        // كان كل المعاينات تنزل بنفس الاسم وتدعس على بعضها
        fileName: quoteFileName(input.clientName, pseudoQuote.quote_number),
        integrated: integratedInfo,
        panelCount: draft.counts?.panel ?? null,
        // تفاصيل قدرة المنظومة تنطبع بصفحة التصميم — نفس اللي يشوفه البياع بالمعاينة
        capability: {
          ...(draft.capability || {}),
          ampNight: Number(input.ampNight) || 0,
          ampDay: Number(input.ampDay) || 0,
          batteries: draft.counts?.battery || 0,
          inverters: draft.counts?.inverter || 0,
        },
      });
    },
  },

  // جهات تواصل المبيعات — تسجيلات زوار الموقع (Google + هاتف)؛ القراءة للموظفين حسب RLS
  leads: {
    async list() {
      const { data, error } = await supabase.from('leads').select('*').order('id', { ascending: false }).limit(500);
      throwIf(error);
      return data || [];
    },
    async remove(id) {
      const { data: old } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
      const { error } = await supabase.from('leads').delete().eq('id', id);
      throwIf(error);
      logActivity('حذف جهة تواصل زائر', 'الطلبات', old ? {
        'الاسم': old.full_name || '-', 'الهاتف': old.phone || '-',
        [UNDO]: { kind: 'rowDelete', table: 'leads', row: old, label: 'إرجاع جهة التواصل', confirm: `إرجاع جهة التواصل «${old.full_name || old.phone || id}»` },
      } : { 'المعرف': id, [UNDO]: { kind: 'none', why: 'الصف ما انلقط قبل الحذف' } });
      return { ok: true };
    },
  },

  // طلبات عروض الزبائن من الحاسبة العامة — طلب واحد لكل حساب (الجديد يحدّث القديم)،
  // والموظفون يقرأون الكل والمشرفون يحذفون
  quoteRequests: {
    async create(payload) {
      const { data: existing } = await supabase.from('quote_requests').select('id').eq('user_id', payload.user_id).limit(1);
      const updated = existing && existing.length > 0;
      const { error } = await supabase.from('quote_requests').upsert(payload, { onConflict: 'user_id' });
      throwIf(error);
      return { ok: true, updated };
    },
    async list() {
      const { data, error } = await supabase.from('quote_requests').select('*').order('id', { ascending: false }).limit(500);
      throwIf(error);
      return data || [];
    },
    async remove(id) {
      const { data: old } = await supabase.from('quote_requests').select('*').eq('id', id).maybeSingle();
      const { error } = await supabase.from('quote_requests').delete().eq('id', id);
      throwIf(error);
      logActivity('حذف طلب عرض زبون', 'الطلبات', old ? {
        'الاسم': old.full_name || '-', 'الهاتف': old.phone || '-',
        [UNDO]: { kind: 'rowDelete', table: 'quote_requests', row: old, label: 'إرجاع الطلب', confirm: `إرجاع طلب «${old.full_name || old.phone || id}»` },
      } : { 'المعرف': id, [UNDO]: { kind: 'none', why: 'الصف ما انلقط قبل الحذف' } });
      return { ok: true };
    },
  },

  // سجل الحركات — القراءة محصورة بحساب المشرف أحمد عبر RLS (غيره يستلم قائمة فارغة)
  history: {
    async list(limit = 400) {
      const { data, error } = await supabase.from('activity_log').select('*').order('id', { ascending: false }).limit(limit);
      throwIf(error);
      return data || [];
    },
  },

  // إعدادات مشتركة خفيفة (key/value بجدول app_config) — مثل الثانوية الافتراضية الدائمة
  // ── تفضيل محرك التصدير (يخص الحساب لا الجهاز) ───────────────────────────
  exportPref: {
    /** يقرأ تفضيل الحساب ويحطّه بالوحدة — ينندى عند بدء الجلسة */
    async load() {
      const me = await currentUsername();
      if (!me) { applyExportMethod(null); return null; }
      const v = await api.config.get(exportPrefKey(me));
      applyExportMethod(typeof v === 'string' ? v : v?.method);
      return getExportMethod();
    },

    async set(value) {
      const me = await currentUsername();
      if (!me) throw new Error('لازم تكون داخلاً بحساب');
      setExportMethod(value);              // فوري بالشاشة
      const before = await api.config.get(exportPrefKey(me));
      await api.config.set(exportPrefKey(me), getExportMethod());
      logActivity('تبديل محرك التصدير', 'الإعدادات', {
        'المحرك': getExportMethod(),
        [UNDO]: {
          kind: 'config', key: exportPrefKey(me), before,
          label: 'إرجاع المحرك السابق',
          confirm: 'إرجاع محرك التصدير لاختيارك السابق',
        },
      });
      return getExportMethod();
    },
  },

  // ── الحسابات والصلاحيات ─────────────────────────────────────────────────
  staff: {
    /** يحمّل السجل ويحطّه بطبقة الصلاحيات — ينندى مرة وحدة عند بدء الجلسة */
    async load() {
      const roles = parseRoles(await api.config.get(STAFF_ROLES_KEY));
      applyStaffRoles(roles);
      return roles;
    },

    async list() {
      return parseRoles(await api.config.get(STAFF_ROLES_KEY));
    },

    /** يحفظ صفوف الشاشة كسجل — الحارس بـassertCanWriteConfig */
    async save(rows) {
      const before = await api.config.get(STAFF_ROLES_KEY);
      const roles = serializeRoles(rows);
      await api.config.set(STAFF_ROLES_KEY, roles);
      applyStaffRoles(parseRoles(roles));
      logActivity('تعديل صلاحيات الحسابات', 'الإعدادات', {
        'عدد الحسابات': Object.keys(roles).length,
        [UNDO]: {
          kind: 'config', key: STAFF_ROLES_KEY, before,
          label: 'إرجاع الصلاحيات السابقة',
          confirm: 'إرجاع صلاحيات كل الحسابات مثل ما كانت قبل هذا التعديل',
        },
      });
      return roles;
    },

    /**
     * ينشئ حساب موظف.
     *
     * **بعميل ثانٍ منفصل عمداً**: `signUp` يبدّل جلسة العميل اللي ينناديه —
     * يعني المشرف اللي ينشئ الحساب يطلع من حسابه ويدخل بحساب الموظف الجديد.
     * العميل الثاني بلا حفظ جلسة وبمخزن خاص، فجلسة المشرف ما تنلمس أصلاً.
     *
     * يشتغل بلا أي مفتاح سري لأن تأكيد الإيميل مطفي بإعدادات المشروع —
     * الحساب ينخلق مؤكداً وجاهزاً للدخول فوراً.
     */
    async create({ username, code }) {
      if (!canEditSettings(await currentUsername())) {
        throw new Error('إنشاء الحسابات محصور بحسابات الإدارة');
      }
      const name = String(username || '').trim().replace(/\s+/g, ' ');
      if (!name) throw new Error('اكتب اسم المستخدم');
      if (String(code || '').length < 6) throw new Error('الرمز 6 أحرف على الأقل');

      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const tmp = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'biladauto-signup-tmp' },
      });
      const { data, error } = await tmp.auth.signUp({
        email: usernameToEmail(name),
        password: code,
        options: { data: { username: name } },
      });
      if (error) {
        throw new Error(/registered|exists/i.test(error.message)
          ? `الاسم «${name}» موجود مسبقاً — اختر اسماً ثانياً`
          : 'تعذر إنشاء الحساب: ' + error.message);
      }
      // الجلسة المؤقتة تنقفل فوراً — ما نخليها حيّة بذاكرة المتصفح
      try { await tmp.auth.signOut({ scope: 'local' }); } catch { /* مؤقتة أصلاً */ }

      logActivity('إنشاء حساب موظف', 'الإعدادات', {
        'الحساب': name,
        // حذف حساب يحتاج مفتاح الخدمة، وحطّه بالتطبيق يفتح القاعدة كلها —
        // فالاسترجاع يصير بحذف الحساب من لوحة Supabase
        [UNDO]: { kind: 'none', why: 'حذف الحسابات يصير من لوحة Supabase — التطبيق ينشئ ولا يحذف' },
      });
      return { ok: true, username: name, confirmed: !!data?.user?.confirmed_at || !!data?.session };
    },

    /**
     * سطر SQL يبدّل رمز حساب.
     *
     * تبديل رمز حساب **ثانٍ** مستحيل من المتصفح: `updateUser` يبدّل رمز
     * الحساب الحالي وحده، وتبديل رمز غيره يحتاج مفتاح الخدمة — وحطّه
     * بالتطبيق يعني أي واحد يفتح الكود يملك القاعدة كلها. فنطلّع الأمر
     * جاهزاً ينلصق بمحرر SQL بدل ما نفتح هذا الباب.
     */
    resetCodeSql(username, code) {
      const mail = usernameToEmail(String(username || '').trim().replace(/\s+/g, ' ')).toLowerCase();
      const safe = String(code || '').replace(/'/g, "''");
      return `update auth.users\n`
        + `set encrypted_password = extensions.crypt('${safe}', extensions.gen_salt('bf')),\n`
        + `    updated_at = now()\n`
        + `where email = '${mail}';`;
    },
  },

  config: {
    async get(key) {
      try {
        const { data } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle();
        return data && data.value != null ? JSON.parse(data.value) : null;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      await assertCanWriteConfig(key);
      // القيمة القديمة تنقرأ قبل الكتابة — بيها يرجع الإعداد لحاله بضغطة من السجل
      const before = isInternalConfigKey(key) ? null : await this.get(key);
      await setConfigRaw(key, value);
      // نسجل الإعدادات المشتركة فقط — المفاتيح الداخلية لها تسجيلها الخاص بمكان الاستدعاء
      if (!isInternalConfigKey(key)) {
        const labels = {
          secondary_defaults: 'القائمة الافتراضية للمواد الثانوية',
          installment: 'إعدادات التقسيط عبر مصرف النهرين',
        };
        const label = labels[key] || key;
        logActivity('تعديل إعداد مشترك', 'الإعدادات', {
          'الإعداد': label,
          [UNDO]: { kind: 'config', key, before, label: 'إرجاع الإعداد السابق', confirm: `إرجاع «${label}» لقيمته قبل هذا التعديل` },
        });
      }
      return { ok: true };
    },
  },

  settings: {
    async get() {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
      throwIf(error);
      return data;
    },
    async update(data) {
      await assertAdminSettings('الإعدادات');
      const payload = { ...data };
      delete payload.id;
      const { data: old } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      const { data: row, error } = await supabase.from('settings').update(payload).eq('id', 1).select().single();
      throwIf(error);
      // نسجل فقط الحقول اللي تغيرت فعلاً بقيمها القديمة والجديدة
      const changed = {};
      for (const k of Object.keys(payload)) {
        if (old && String(old[k]) !== String(row[k])) changed[k] = `${old[k]} ← ${row[k]}`;
      }
      if (Object.keys(changed).length) {
        logActivity('تعديل إعدادات الحساب', 'الإعدادات', {
          ...changed,
          [UNDO]: old
            ? { kind: 'rowUpdate', table: 'settings', id: 1, before: old, label: 'إرجاع الإعدادات السابقة', confirm: 'إرجاع كل قيم الإعدادات لما كانت عليه قبل هذا التعديل' }
            : { kind: 'none', why: 'ما انلقطت الإعدادات السابقة' },
        });
      }
      return row;
    },
  },

  company: {
    async get() {
      const { data, error } = await supabase.from('company_profile').select('*').eq('id', 1).single();
      throwIf(error);
      const notes = Array.isArray(data.notes_default) ? data.notes_default : JSON.parse(data.notes_default || '[]');
      return { ...data, notes_default: notes, logo_data: data.logo_path && data.logo_path.startsWith('data:') ? data.logo_path : null };
    },
    async update(data) {
      await assertAdminSettings('ملف الشركة');
      const { data: old } = await supabase.from('company_profile').select('*').eq('id', 1).maybeSingle();
      const { data: row, error } = await supabase.from('company_profile').update({
        company_name: data.company_name,
        company_name_en: data.company_name_en,
        email: data.email,
        phone1: data.phone1,
        phone2: data.phone2,
        manager_name: data.manager_name,
        logo_path: data.logo_path,
        notes_default: data.notes_default || [],
      }).eq('id', 1).select().single();
      throwIf(error);
      logActivity('تعديل ملف الشركة', 'الإعدادات', {
        'الاسم': row.company_name,
        [UNDO]: old
          ? { kind: 'rowUpdate', table: 'company_profile', id: 1, before: old, label: 'إرجاع ملف الشركة', confirm: 'إرجاع بيانات الشركة (الاسم والهواتف والشعار والملاحظات) لما كانت عليه' }
          : { kind: 'none', why: 'ما انلقط ملف الشركة السابق' },
      });
      return { ...row, notes_default: Array.isArray(row.notes_default) ? row.notes_default : JSON.parse(row.notes_default || '[]') };
    },
    async pickLogo() {
      const file = await pickFile('image/png,image/jpeg');
      if (!file) return null;
      return readDataUrl(file);
    },
  },
};
