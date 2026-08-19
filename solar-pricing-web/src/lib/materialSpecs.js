// درجة الحماية IP لكل مادة — حقل مستقل يُدخل بالمخزون مثل «القدرة أو السعة»،
// مو مستنتَجاً من نص الوصف.
//
// ليش app_config مو عمود بجدول materials: نفس المنفذ اللي تمشي بيه كل التوسعات
// بلا تعديل بنية القاعدة (`materials_disabled` و`integrated_specs_<id>`
// و`material_image_<id>`) — فما يحتاج المستخدم يشغّل أي كويري ترحيل بقاعدته.
//
// الـIP هو اللي يقرر مستوى الانفيرتر (اقتصادي/متوسط/ممتاز) — قرار المستخدم:
// «لتقيس ع سعر، قيس المواصفات». فمادة بلا IP مكتوب تطيح بأدنى درجة، ولهذا
// الشاشة تنبّه على المواد الناقصة حتى تنكمل.
export const IP_KEY_PREFIX = 'material_ip_';

// مدى معقول: IP00 حتى IP69 — أي شي برّا هذا غلط إدخال
export const IP_MIN = 0;
export const IP_MAX = 69;

export function ipKey(materialId) {
  return `${IP_KEY_PREFIX}${materialId}`;
}

export function isIpKey(key) {
  return typeof key === 'string' && key.startsWith(IP_KEY_PREFIX);
}

export function materialIdFromIpKey(key) {
  if (!isIpKey(key)) return null;
  const n = Number(key.slice(IP_KEY_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

// يقرأ رقم الـIP من أي شكل يدخله البياع: 65 · "65" · "IP65" · "ip 65" · "ايبي 65"
export function parseIp(value) {
  if (value == null || value === '') return null;
  // كل الأرقام بالنص سوية: "IP65" و"ايبي 65" و"ip 6 5" كلهن 65. وإذا طلع أكثر من
  // رقمين (مثل "IP65 موديل 2024") نرفض بدل ما ناخذ رقماً غلط بصمت.
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 1 || digits.length > 2) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < IP_MIN || n > IP_MAX) return null;
  return n;
}

// رسالة الخطأ عند إدخال قيمة برّا المدى — نص واحد مشترك بين الشاشة والاستيراد
export const IP_RANGE_ERROR = `درجة الحماية لازم تكون رقماً بين ${IP_MIN} و${IP_MAX} (مثل 21 أو 65)`;

// عرض الـIP للشاشة: 65 → "IP65"، وبلا قيمة → null
export function formatIp(value) {
  const n = parseIp(value);
  return n == null ? null : `IP${String(n).padStart(2, '0')}`;
}

// درجة الحماية من نص المادة — فولباك للمواد القديمة اللي مكتوب IP بوصفها قبل
// ما ينضاف الحقل. الحقل الصريح يتقدم عليه دائماً.
export function ipFromText(material) {
  const text = `${material?.brand || ''} ${material?.model || ''} ${material?.full_description || ''}`;
  const re = /IP\s*-?\s*(\d{2})/gi;
  let best = null;
  let m;
  while ((m = re.exec(text))) {
    const n = Number(m[1]);
    if (n >= IP_MIN && n <= IP_MAX) best = best == null ? n : Math.max(best, n);
  }
  return best;
}

// درجة الحماية المعتمدة للمادة: الحقل الصريح أولاً، وإلا المستنتج من الوصف،
// وإلا null (ماكو IP — تطيح بأدنى درجة ويطلعلها تنبيه بالمخزون).
export function ipOf(material) {
  const explicit = parseIp(material?.ip_rating);
  if (explicit != null) return explicit;
  return ipFromText(material);
}

export function hasIp(material) {
  return ipOf(material) != null;
}
