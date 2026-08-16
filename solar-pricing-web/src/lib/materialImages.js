// صور المنتجات لكل مادة — تُخزن بـapp_config بمفتاح `material_image_<id>`.
//
// ليش app_config مو عمود بجدول materials: هذا هو نفس المنفذ اللي تمشي بيه كل
// التوسعات بلا تعديل بنية القاعدة (`materials_disabled` و`integrated_specs_<id>`
// و`quote_adj_<id>`) — فما يحتاج المستخدم يشغّل أي كويري ترحيل بقاعدته.
//
// الصورة تُضغط بالمتصفح قبل الحفظ: القاعدة مو مخزن صور، وصورة كاميرا خام (4 ميغا)
// تكسر الصف وتثقّل كل جلب للمخزون. 520 بكسل بأطول ضلع + JPEG 0.72 تعطي ~30 كيلوبايت
// وهي أوسع من أي مقاس يظهر بيه المنتج بالمنشور (150 بكسل بدقة 2×).
export const IMAGE_KEY_PREFIX = 'material_image_';
export const MAX_EDGE = 520;
export const QUALITY = 0.72;
// سقف أمان: أي ناتج أكبر من هذا يُرفض بدل ما يُحشر بالقاعدة
export const MAX_BYTES = 220 * 1024;

export function imageKey(materialId) {
  return `${IMAGE_KEY_PREFIX}${materialId}`;
}

// هل هذا المفتاح صورة مادة؟ — يستعمله سجل الحركات حتى ما يسجّلها «تعديل إعداد مشترك»
export function isImageKey(key) {
  return typeof key === 'string' && key.startsWith(IMAGE_KEY_PREFIX);
}

export function materialIdFromKey(key) {
  if (!isImageKey(key)) return null;
  const n = Number(key.slice(IMAGE_KEY_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

// ملف صورة → data URL مضغوط. يرمي رسالة عربية واضحة إذا الملف مو صورة أو طلع كبيراً.
export function compressImageFile(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) {
      reject(new Error('الملف المختار مو صورة'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      // خلفية بيضاء: صور PNG الشفافة تطلع سوداء بالـJPEG بلاها
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
      if (bytes > MAX_BYTES) {
        reject(new Error(`الصورة كبيرة حتى بعد الضغط (${Math.round(bytes / 1024)} كيلوبايت) — اختر صورة أصغر`));
        return;
      }
      resolve({ dataUrl, width: w, height: h, bytes });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('ما انقرأت الصورة — جرّب صيغة ثانية (JPG أو PNG)'));
    };
    img.src = url;
  });
}
