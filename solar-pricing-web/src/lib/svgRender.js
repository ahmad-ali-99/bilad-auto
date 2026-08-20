// محرك رسم بديل: SVG foreignObject بدل html2canvas.
//
// ═══ ليش موجود ═══
// `html2canvas` يشتغل بطريقة ثقيلة: ينسخ الصفحة كلها بـiframe مخفي، ينتظر
// حدث تحميل الـiframe، ثم ينتظر `fonts.ready` **داخل** النسخة، ثم ينتظر كل
// الصور. الثلاثة انتظارات **بلا أي سقف زمني** بمصدر المكتبة (نسخة 1.4.1)،
// وواحد منهن يشتغل **بمحرك سفاري حصراً**:
//     if (!/(AppleWebKit)/g.test(navigator.userAgent)) return ...;
//     await imagesReady(documentClone);
// فإذا واحد منهن ما انحل — الرسم يعلّق للأبد، وهذا اللي صار بجهاز المستخدم
// (آيفون، وبكل المتصفحات عنده لأنهن كلهن على محرك سفاري) بينما أندرويد
// وبقية الأجهزة تشتغل طبيعي.
//
// ═══ البديل ═══
// المتصفح نفسه يعرف يرسم HTML — نخليه يرسمه: نحط الـHTML داخل <foreignObject>
// بملف SVG، ونحمّله كصورة عادية، ونرسمه بالكانفاس. ماكو iframe ولا نسخة
// مستند ولا انتظار خطوط داخلية — نداء تحميل صورة واحد، وإله سقف زمني.
//
// شرطان لازمان حتى يشتغل بسفاري:
//   1) **الخط ينضم داخل الـSVG بصيغة base64**. صورة الـSVG معزولة تماماً:
//      ما تشوف خطوط الصفحة ولا أي مورد خارجي — بدون التضمين يطلع النص بخط
//      النظام وتتكسر الحروف العربية.
//   2) **الترميز لازم يكون XHTML صحيحاً**. لذلك ننسخ من الـDOM الحي
//      بـXMLSerializer بدل ما نمرر نص HTML: هو يقفل الوسوم ويهرب الرموز.
//
// مقيس بمحرك سفاري الحقيقي (WebKit 26.5): تحميل الصورة 80 ملي ثانية،
// والكانفاس غير ملوّث فـtoDataURL يشتغل عادي.
import arabic400 from '@fontsource/cairo/files/cairo-arabic-400-normal.woff2?url';
import arabic600 from '@fontsource/cairo/files/cairo-arabic-600-normal.woff2?url';
import arabic700 from '@fontsource/cairo/files/cairo-arabic-700-normal.woff2?url';
import arabic800 from '@fontsource/cairo/files/cairo-arabic-800-normal.woff2?url';
import latin400 from '@fontsource/cairo/files/cairo-latin-400-normal.woff2?url';
import latin600 from '@fontsource/cairo/files/cairo-latin-600-normal.woff2?url';
import latin700 from '@fontsource/cairo/files/cairo-latin-700-normal.woff2?url';
import latin800 from '@fontsource/cairo/files/cairo-latin-800-normal.woff2?url';

// نفس مدَيات fontsource — الشريحة العربية والشريحة اللاتينية (للأرقام والرموز)
const AR_RANGE = 'U+0600-06FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE80-FEFC';
const LT_RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

const FACES = [
  { url: arabic400, weight: 400, range: AR_RANGE },
  { url: arabic600, weight: 600, range: AR_RANGE },
  { url: arabic700, weight: 700, range: AR_RANGE },
  { url: arabic800, weight: 800, range: AR_RANGE },
  { url: latin400, weight: 400, range: LT_RANGE },
  { url: latin600, weight: 600, range: LT_RANGE },
  { url: latin700, weight: 700, range: LT_RANGE },
  { url: latin800, weight: 800, range: LT_RANGE },
];

const IMAGE_LIMIT_MS = 20000;
let fontCssCache = null;

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  // على دفعات — `String.fromCharCode(...بايتات)` بملف 15 كيلو يفجّر حجم المكدس
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

/**
 * قواعد @font-face بالخط مضمَّناً base64. تنجلب مرة وحدة وتنخزن — الملفات
 * أصلاً محمّلة ومخزّنة بذاكرة التطبيق (نفس ملفات fontsource اللي يستعملها
 * التطبيق)، فالجلب فوري وحتى بلا إنترنت.
 */
async function fontFaceCss() {
  if (fontCssCache) return fontCssCache;
  const parts = await Promise.all(
    FACES.map(async ({ url, weight, range }) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`تعذر تحميل الخط: ${url}`);
      const b64 = toBase64(await res.arrayBuffer());
      return `@font-face{font-family:'Cairo';font-style:normal;font-weight:${weight};`
        + `src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${range};}`;
    })
  );
  fontCssCache = parts.join('');
  return fontCssCache;
}

function loadImage(src, ms) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('علقت خطوة: تحميل صورة الصفحة')), ms);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('تعذر رسم الصفحة')); };
    img.src = src;
  });
}

/**
 * ينتظر صور العنصر تخلص تحميلاً — **بسقف زمني**.
 *
 * لازمة قبل القياس: `<img>` ما انحمّلت ارتفاعها صفر، فالقياس يطلع غلط
 * وتنشال الصورة من الرسم (انقاس: صفحة الغلاف طلعت بلا صورة الهيكل أصلاً).
 *
 * html2canvas عندها انتظار مشابه بس **بلا سقف** وبفرع يشتغل بمحرك سفاري
 * حصراً — وهو أحد أسباب التعليق اللي هربنا منه. هنا السقف صريح: الصورة
 * اللي ما تجي بوقتها تنترك ويكمل الملف بلاها.
 */
function imagesSettled(el, ms) {
  const imgs = [...el.querySelectorAll('img')].filter((i) => !i.complete);
  if (!imgs.length) return Promise.resolve();
  return Promise.all(
    imgs.map((img) => new Promise((resolve) => {
      const done = () => { clearTimeout(t); resolve(); };
      const t = setTimeout(resolve, ms);
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }))
  );
}

/**
 * يرسم عنصراً موجوداً بالصفحة على كانفاس.
 * @param {HTMLElement} el العنصر المراد رسمه (لازم يكون منضماً للصفحة ومقاسه معروف)
 * @param {{scale?: number, background?: string}} opts
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderElementToCanvas(el, { scale = 2, background = '#ffffff' } = {}) {
  // القياس بعد ما تخلص الصور — قبلها ارتفاعها صفر والتنسيق يطلع غلط
  await imagesSettled(el, IMAGE_LIMIT_MS);
  const rect = el.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);
  if (!width || !height) throw new Error('تعذر قياس الصفحة قبل الرسم');

  // ستايل الصفحة نفسه لازم يمشي وياها. قوالبنا ترجع `<style>…</style>` **جنب**
  // العنصر مو جوّاه، فنسخ العنصر لوحده يطلّع صفحة بلا ألوان ولا جداول ولا مقاسات
  // (انقاس: الفاتورة طلعت نصاً عارياً). نجمع كل `<style>` من الحاضنة ومن داخل
  // العنصر ونحطهن بالـSVG. وماكو حاجة لستايل التطبيق العام — القوالب مكتفية بنفسها.
  const styleHosts = [el.parentElement, el].filter(Boolean);
  const pageCss = [...new Set(styleHosts.flatMap((h) => [...h.querySelectorAll(':scope > style, style')]))]
    .map((n) => n.textContent || '')
    .join('\n');

  // صورة الـSVG معزولة عن ستايل التطبيق العام كذلك — ومنه قاعدة وحدة تفرق:
  // `* { box-sizing: border-box }`. بدونها `.inv-sheet` (عرض 794 + حشوة 26)
  // تصير 846 بكسل فتطفح خارج اللوحة وينقص طرف الورقة (انقاس: الترويسة
  // انقصّت من اليمين). ننقلها معنا، وما ننقل غيرها حتى ما نغيّر شكل الصفحة.
  const RESET_CSS = '*{box-sizing:border-box;}';

  const css = (await fontFaceCss()) + RESET_CSS + pageCss;

  // ننسخ العنصر ونضم عليه فضاء أسماء XHTML — بدونه المتصفح يعتبر المحتوى SVG
  // ويطلع فارغاً. النسخ ضروري حتى ما نلمس العنصر الأصلي بالصفحة.
  const clone = el.cloneNode(true);

  // **الصور تنرسم على حِدة.** محرك سفاري ما يرسم `<img>` جوّا foreignObject
  // لمّا الـSVG نفسه محمَّل كصورة — حتى لو المصدر data: (قيد أمني قديم
  // بـWebKit). انقاس: صفحة الغلاف طلعت بكل نصوصها وبطاقاتها **بلا صورة
  // الهيكل**، وشعار الشركة بالفاتورة يختفي بنفس السبب.
  //
  // الحل: نقيس مكان كل صورة قبل النسخ، نشيلها من النسخة (ونخلي مكانها فارغاً
  // بنفس المقاس حتى ما يتحرك التنسيق)، وبعد ما نرسم الـSVG نرسم الصور فوقه
  // بالكانفاس مباشرة — وهذا يشتغل بكل المحركات.
  const overlays = [];
  const originals = [...el.querySelectorAll('img')];
  const clonedImgs = [...clone.querySelectorAll('img')];
  originals.forEach((img, i) => {
    const box = img.getBoundingClientRect();
    if (!box.width || !box.height || (!img.currentSrc && !img.src)) return;
    overlays.push({
      src: img.currentSrc || img.src,
      x: box.left - rect.left,
      y: box.top - rect.top,
      w: box.width,
      h: box.height,
      fit: getComputedStyle(img).objectFit || 'fill',
    });
    const ph = clonedImgs[i];
    if (ph) {
      // بديل شفاف بنفس المقاس — يحفظ التنسيق بلا ما يرسم شي
      const box2 = document.createElement('span');
      box2.setAttribute('style', `display:inline-block;width:${box.width}px;height:${box.height}px;`);
      ph.replaceWith(box2);
    }
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  // الخط داخل الـSVG اسمه Cairo نفسه، بس الاحتياط: نثبّت العائلة على النسخة
  clone.style.fontFamily = "'Cairo', sans-serif";
  const markup = new XMLSerializer().serializeToString(clone);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<defs><style type="text/css"><![CDATA[${css}]]></style></defs>`
    + `<rect width="100%" height="100%" fill="${background}"/>`
    + `<foreignObject x="0" y="0" width="${width}" height="${height}">${markup}</foreignObject>`
    + `</svg>`;

  const img = await loadImage(
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    IMAGE_LIMIT_MS
  );

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذر إنشاء سطح الرسم');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // الصور فوق الرسم، بنفس مكانها ومقاسها من الصفحة الحيّة
  for (const o of overlays) {
    let src;
    try {
      src = await loadImage(o.src, IMAGE_LIMIT_MS);
    } catch {
      continue; // صورة ما انحملت — نكمل الصفحة بلاها بدل ما يفشل التصدير كله
    }
    const { dx, dy, dw, dh } = fitBox(src.naturalWidth || src.width, src.naturalHeight || src.height, o);
    ctx.drawImage(src, dx * scale, dy * scale, dw * scale, dh * scale);
  }
  return canvas;
}

// نحسب مكان الصورة داخل صندوقها مثل ما يحسبه `object-fit` بالمتصفح
function fitBox(natW, natH, { x, y, w, h, fit }) {
  if (!natW || !natH || fit === 'fill') return { dx: x, dy: y, dw: w, dh: h };
  const ratio = fit === 'cover'
    ? Math.max(w / natW, h / natH)
    : Math.min(w / natW, h / natH); // contain وscale-down وnone تقريباً
  const dw = natW * ratio;
  const dh = natH * ratio;
  return { dx: x + (w - dw) / 2, dy: y + (h - dh) / 2, dw, dh };
}
