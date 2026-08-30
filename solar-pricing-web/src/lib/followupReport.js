// تقرير متابعة اليوم: «شنو اشتغلت عليه اليوم» — العروض اللي البياع غيّر
// حالتها أو ملاحظتها بيوم معيّن، مرتّبة بالوقت، جاهزة تنرسل للإدارة بإكسل.
//
// المصدر هو **حالات العروض نفسها** (quote_status_<id> بجدول app_config) لأنها
// مقروءة لكل حساب. سجل الحركات (activity_log) فيه تاريخ أدق لكنه محصور
// بالإدارة عبر RLS، فالبياع ما يقدر يبني منه تقريره.

export const STATUS_LABELS = {
  normal: 'عادي',
  follow: 'قيد المتابعة',
  urgent: 'مستعجل',
  done: 'مكتمل',
};

/** مفتاح اليوم المحلي (YYYY-MM-DD) — المقارنة محلية لا بتوقيت UTC، وإلا
 *  شغل المساء ينحسب على يوم الأمس أو بكرة حسب فرق التوقيت. */
export function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** الوقت بصيغة 24 ساعة (08:15) — التقرير يبيّن «من أي ساعة لأي ساعة اشتغل» */
export function timeOf(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').toLowerCase();

/**
 * صفوف التقرير: كل عرض تغيّرت حالته بهذا اليوم.
 * `username` فارغ = كل الحسابات (للإدارة). العروض اللي حالتها محفوظة بلا
 * وقت (قبل إضافة الطابع الزمني) تُستثنى — ما نقدر ننسبها ليوم معيّن.
 */
export function followupRows({ quotes = [], statuses = {}, username = null, day = new Date() } = {}) {
  const want = dayKey(day);
  const who = username ? norm(username) : null;
  const byId = new Map((quotes || []).map((q) => [q.id, q]));
  const rows = [];
  for (const [id, st] of Object.entries(statuses || {})) {
    if (!st?.at || dayKey(st.at) !== want) continue;
    if (who && norm(st.by) !== who) continue;
    const q = byId.get(Number(id));
    if (!q) continue;                       // عرض محذوف أو خارج صلاحية الحساب
    rows.push({
      time: timeOf(st.at),
      at: st.at,
      quoteNumber: q.quote_number,
      client: q.client_name || '-',
      phone: q.client_phone || '',
      location: q.location || '',
      status: STATUS_LABELS[st.level] || st.level,
      level: st.level,
      note: st.note || '',
      total: Number(q.total_price) || 0,
      by: st.by || '',
      createdBy: q.created_by || '',
    });
  }
  return rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** ملخّص سطر واحد: كم عرضاً، ومن أي ساعة لأي ساعة، وتوزيع الحالات */
export function followupSummary(rows) {
  if (!rows.length) return { count: 0, from: '', to: '', byStatus: {} };
  const byStatus = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  return { count: rows.length, from: rows[0].time, to: rows[rows.length - 1].time, byStatus };
}

/** اسم الملف: يحمل الحساب واليوم حتى الإدارة تعرف مصدره بلا ما تفتحه */
export function followupFileName(username, day = new Date()) {
  const safe = String(username || 'الفريق').trim().replace(/[\\/:*?"<>|]/g, '-');
  return `متابعة ${safe} ${dayKey(day)}.xlsx`;
}

/** مصفوفة الصفوف كما تنكتب بالإكسل — الرأس عربي وواضح للإدارة */
export function followupSheet(rows, { username, day = new Date() } = {}) {
  const head = ['الوقت', 'رقم العرض', 'العميل', 'الهاتف', 'الموقع', 'الحالة', 'الملاحظة', 'المجموع (د.ع)'];
  const body = rows.map((r) => [r.time, r.quoteNumber, r.client, r.phone, r.location, r.status, r.note, r.total]);
  const s = followupSummary(rows);
  return [
    [`تقرير متابعة — ${username || 'الفريق'}`],
    [`التاريخ: ${dayKey(day)}`, '', `عدد العروض: ${s.count}`, '', s.count ? `من ${s.from} إلى ${s.to}` : ''],
    [],
    head,
    ...body,
  ];
}
