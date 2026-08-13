// استرداد الحركات + تصنيفها — قلب صفحة «🕓 الحركات».
//
// المشكلة: السجل كان يقول **إن الشي صار** بس ما يخزّن القيمة القديمة كاملة، فلو
// موظف غيّر سعر مادة أو حذفها أو عدّل عرضاً محفوظاً ما نكدر نرجّع شي.
// الحل بلا أي DDL: عمود `details` أصلاً JSON حر — فنخزّن اللقطة داخله بمفاتيح
// محجوزة تبدي بـ«__» والواجهة تتجاهلها بالعرض.
import { supabase } from './supabase.js';

export const UNDO = '__undo';       // لقطة الاسترجاع
export const DRAFT = '__draft';     // مدخلات عرض صُدِّر بلا حفظ
export const UNDONE = '__undoneId'; // معرّف الحركة اللي انسترجعت
export const CAT = '__cat';         // فئة الحركة الأصلية (بسجل الاسترجاع)

// المفاتيح المحجوزة ما تنعرض بعمود التفاصيل
export const isReservedKey = (k) => String(k).startsWith('__');

// ── الفئات ──────────────────────────────────────────────────────────────────
export const CATEGORIES = [
  { key: 'all', label: 'الكل', icon: '📋' },
  { key: 'inventory', label: 'تعديل مخزون', icon: '📦' },
  { key: 'price', label: 'تحديث سعر', icon: '💵' },
  { key: 'quoteNew', label: 'إنشاء عرض', icon: '🆕' },
  { key: 'quoteEdit', label: 'تعديل عرض', icon: '✏️' },
  { key: 'export', label: 'تصدير', icon: '📄' },
  { key: 'delete', label: 'حذف', icon: '🗑️' },
  { key: 'settings', label: 'إعدادات', icon: '⚙️' },
  { key: 'other', label: 'أخرى', icon: '•' },
];

const CATEGORY_BY_ACTION = {
  'إضافة مادة': 'inventory',
  'تعديل مادة': 'inventory',
  'إضافة أجور عمل': 'inventory',
  'تعديل أجور عمل': 'inventory',
  'استيراد إكسل للمخزون': 'inventory',
  'تفعيل مادة بالعروض': 'inventory',
  'إخفاء مادة من العروض': 'inventory',

  'حفظ عرض جديد': 'quoteNew',
  'رفع عرض جاهز': 'quoteNew',

  'تعديل عرض': 'quoteEdit',
  'تعديل عرض + تحويل الحساب': 'quoteEdit',
  'تغيير حالة عرض': 'quoteEdit',
  'إرفاق تصميم بعرض': 'quoteEdit',
  'استرجاع عرض من سلة المحذوفات': 'quoteEdit',

  'تصدير PDF لعرض محفوظ': 'export',
  'تصدير PDF معاينة (بلا حفظ)': 'export',

  'حذف عرض (لسلة المحذوفات)': 'delete',
  'حذف مادة': 'delete',
  'حذف أجور عمل': 'delete',
  'حذف مرفق عرض': 'delete',
  'حذف جهة تواصل زائر': 'delete',
  'حذف طلب عرض زبون': 'delete',
  'تفريغ سلة المحذوفات نهائياً': 'delete',

  'تعديل إعدادات الحساب': 'settings',
  'تعديل إعداد مشترك': 'settings',
  'تعديل ملف الشركة': 'settings',
};

// فئة الحركة: تغيير السعر يتقدم على «تعديل مخزون» لأنه أهم شي يتراقب.
// حركة الاسترجاع تاخذ فئة الحركة الأصلية حتى تبقى مع أختها بنفس الفلتر.
// أي حركة جديدة تنضاف مستقبلاً بلا تصنيف تطيح على «أخرى» بدل ما تختفي.
export function categoryOf(action, details) {
  const d = details && typeof details === 'object' ? details : {};
  if (d[CAT]) return d[CAT];
  if ('السعر القديم' in d) return 'price';
  if (CATEGORY_BY_ACTION[action]) return CATEGORY_BY_ACTION[action];
  if (String(action || '').startsWith('حذف')) return 'delete';
  return 'other';
}

// ── وصف الاسترجاع ────────────────────────────────────────────────────────────
// يرجع {can, label, why} — الواجهة تعرض زراً أو سبباً رمادياً بلا ما تعرف التفاصيل.
export function undoInfo(entry) {
  const u = entry?.details?.[UNDO];
  if (!u || !u.kind) {
    return { can: false, why: 'غير قابل للاسترداد — حركة قديمة (قبل تفعيل الميزة)' };
  }
  if (u.kind === 'none') return { can: false, why: u.why || 'غير قابل للاسترداد' };
  return { can: true, label: u.label || 'استرجاع', confirm: u.confirm || u.label || 'استرجاع هذه الحركة' };
}

export const hasDraft = (entry) => !!entry?.details?.[DRAFT];

// معرّفات الحركات اللي انسترجعت — تنستخرج من سجلات الاسترجاع نفسها،
// بلا أي UPDATE على activity_log (يعني بلا تغيير صلاحيات RLS)
export function undoneIds(rows) {
  const s = new Set();
  for (const r of rows || []) {
    const id = r?.details?.[UNDONE];
    if (id != null) s.add(Number(id));
  }
  return s;
}

// ── تنفيذ الاسترجاع ─────────────────────────────────────────────────────────
function fail(error) {
  if (error) throw new Error(error.message || 'تعذر الاسترجاع');
}

async function setConfig(key, value) {
  if (value == null) {
    fail((await supabase.from('app_config').delete().eq('key', key)).error);
    return;
  }
  fail((await supabase.from('app_config').upsert({ key, value: JSON.stringify(value) })).error);
}

export async function applyUndo(entry) {
  const u = entry?.details?.[UNDO];
  if (!u || !u.kind || u.kind === 'none') throw new Error('هذه الحركة غير قابلة للاسترداد');

  switch (u.kind) {
    // إضافة صف → حذفه
    case 'rowInsert':
      fail((await supabase.from(u.table).delete().eq('id', u.id)).error);
      if (u.config) await setConfig(u.config.key, null);
      break;

    // تعديل صف → إرجاع كل أعمدته مثل ما كانت (مو السعر بس)
    case 'rowUpdate': {
      const { id, ...cols } = u.before || {};
      fail((await supabase.from(u.table).update(cols).eq('id', u.id)).error);
      if (u.config) await setConfig(u.config.key, u.config.before);
      break;
    }

    // حذف صف → إعادة إدراجه بنفس المعرّف
    case 'rowDelete':
      fail((await supabase.from(u.table).insert(u.row)).error);
      if (u.config) await setConfig(u.config.key, u.config.before);
      break;

    // إعداد key/value → إرجاع قيمته القديمة (أو مسحه إذا ما كان موجوداً)
    case 'config':
      await setConfig(u.key, u.before);
      break;

    // حفظ عرض جديد → يروح لسلة المحذوفات (يبقى قابلاً للاسترجاع من السلة)
    case 'quoteSoftDelete':
      fail((await supabase.from('quotes')
        .update({ deleted_at: new Date().toISOString(), deleted_by: 'استرجاع من السجل' })
        .eq('id', u.id)).error);
      break;

    // حذف عرض → يرجع من السلة
    case 'quoteUndelete':
      fail((await supabase.from('quotes').update({ deleted_at: null, deleted_by: null }).eq('id', u.id)).error);
      break;

    // تعديل عرض → إعادة كتابة الصف والبنود والملاحظات ونِسَبه مثل ما كانت بالضبط
    case 'quoteRestore': {
      const { id, quote, items, notes, adj } = u;
      fail((await supabase.from('quotes').update(quote).eq('id', id)).error);
      fail((await supabase.from('quote_items').delete().eq('quote_id', id)).error);
      fail((await supabase.from('quote_notes').delete().eq('quote_id', id)).error);
      if (items?.length) fail((await supabase.from('quote_items').insert(items.map((i) => ({ ...i, quote_id: id })))).error);
      if (notes?.length) fail((await supabase.from('quote_notes').insert(notes.map((n) => ({ ...n, quote_id: id })))).error);
      await setConfig(`quote_adj_${id}`, adj ?? null);
      break;
    }

    default:
      throw new Error('نوع استرجاع غير معروف: ' + u.kind);
  }
  return { ok: true };
}
