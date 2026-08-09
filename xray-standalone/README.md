# الإكس راي — ملفات مستقلة للتعديل

## الملفات
- `xray.html` — الهيكل + كود الكشّاف
- `xray.css` — كل الأنماط
- `images/` — ضع الصور هنا

## التشغيل محلياً
افتح `xray.html` مباشرة بالمتصفح، أو:
```
python3 -m http.server 3000
```
ثم افتح http://localhost:3000/xray.html

## الصور المطلوبة
| الملف | الوصف |
|---|---|
| `images/rooftops.jpg` | الطبقة 1 — السقوف |
| `images/xray.jpg` | الطبقة 2 — الدواخل |

⚠️ **لازم نفس الأبعاد بالضبط.**

## أهم الإعدادات

### حجم الكشّاف — في `xray.css`
```css
--spot-size:        190px;  /* اللابتوب */
--spot-size-tablet: 150px;
--spot-size-mobile: 110px;
--spot-feather:     24px;   /* نعومة الحافة */
```

### نقاط البيوت — في `xray.html`
```js
waypoints: [
  { x: 22, y: 28 },   // x = من اليسار % | y = من فوق %
  ...
]
```

### سرعة الحركة — في `xray.html`
```js
lerpDesktop:  0.08,   // نعومة تتبّع الماوس
lerpMobile:   0.02,   // سرعة الحركة التلقائية
pauseAtHouse: 1800,   // وقفة عند كل بيت (ms)
```

## الدمج في ووردبريس
انسخ من `<section class="hero">` حتى `</section>` + كود `<script>` إلى **Custom HTML block**،
وأضف محتوى `xray.css` في: **تخصيص ← CSS إضافي**.
