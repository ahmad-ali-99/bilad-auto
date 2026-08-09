// فلترة العروض حسب الحساب المنشئ — منطق نقي (بلا React وبلا قاعدة بيانات) حتى ينختبر.
// المشرف يشوف عروض الفريق كلها، وهذا الملف يخليه يختار منو الحسابات اللي تظهر
// بدل ما تنعرض كلها سوية وتصير لخبطة.

// نفس تطبيع الأسماء المستعمل بالصلاحيات: مسافات الأطراف، المسافات المتعددة،
// الهمزة، والألف المقصورة — حتى «أحمد» و«احمد» و«احمد » كلها اسم واحد.
export function normName(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي');
}

// أسماء الحسابات الموجودة فعلاً بالعروض المحمّلة + عدد عروض كل حساب.
// مرتبة تنازلياً بعدد العروض (الأكثر نشاطاً أول) — بلا استعلام إضافي لقاعدة البيانات.
export function creatorsOf(quotes) {
  const map = new Map();
  for (const q of quotes || []) {
    const raw = q?.created_by;
    if (!raw) continue;
    const key = normName(raw);
    if (!key) continue;
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else map.set(key, { key, name: String(raw).trim(), count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'));
}

// الفلترة نفسها: `selected` مصفوفة أسماء مختارة.
// null أو مصفوفة فاضية = «الكل» (ما نخفي شي) — أأمن من إخفاء كل العروض بالغلط.
export function filterByCreators(quotes, selected) {
  const list = quotes || [];
  if (!selected || selected.length === 0) return list;
  const wanted = new Set(selected.map(normName).filter(Boolean));
  if (wanted.size === 0) return list;
  return list.filter((q) => wanted.has(normName(q?.created_by)));
}
