// شعارات الماركات — يشتغل مع أي ماركة بالمخزون بلا إعداد.
//
// المنطق: كل ماركة تدوّر ملف شعار بمجلد `public/brands/` باسمها المبسّط
// (مثلاً «JA Solar» → `ja-solar.png`). إذا الملف موجود ينعرض الشعار الرسمي،
// وإذا مو موجود تنعرض علامة مولّدة من اسم الماركة نفسها (حروفها الأولى بلون
// ثابت مشتق من الاسم) — فما تبقى ولا ماركة بلا هوية بصرية.
//
// شلون تضيف شعاراً رسمياً؟ حطّ الملف بـ`public/brands/` بالاسم المبسّط،
// وبأي امتداد من: svg · png · webp · jpg. يظهر فوراً بلا تعديل كود.

export const LOGO_DIR = 'brands';
export const LOGO_EXTS = ['svg', 'png', 'webp', 'jpg'];

/** اسم الماركة → اسم ملف مبسّط: حروف ولاتينية صغيرة وشرطات */
export function brandSlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** مسارات الشعار المحتملة بالترتيب — المكوّن يجرّبها وحدة وحدة */
export function brandLogoCandidates(name, base = '/') {
  const slug = brandSlug(name);
  if (!slug) return [];
  const root = `${base}${LOGO_DIR}/`;
  return LOGO_EXTS.map((ext) => `${root}${slug}.${ext}`);
}

/** الحروف اللي تنعرض بالعلامة المولّدة: أول حرف من أول كلمتين */
export function brandInitials(name) {
  const words = String(name || '').trim().split(/[\s\-_]+/).filter(Boolean);
  if (words.length === 0) return '؟';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// لون ثابت لكل اسم — نفس الماركة تاخذ نفس اللون بكل مكان وبكل جهاز.
// hue من مجموع حروف الاسم، وثبات بالإشباع والإضاءة حتى يبقى مقروءاً على أبيض.
export function brandColor(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return { bg: `hsl(${h} 62% 94%)`, fg: `hsl(${h} 58% 32%)`, line: `hsl(${h} 45% 78%)` };
}
