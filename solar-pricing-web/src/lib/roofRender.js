// محرك توليد مناظير السطح — SVG متجهي، بلا WebGL وبلا مكتبات.
//
// ═══ من وين جاءت الأرقام ═══
// كل ثابت هنا **مُستخرج من ملفات المرجع** اللي زوّدنا بيها المستخدم (تصديرات
// سكتش-اب بصيغة PDF متجهية)، مو مقدَّراً بالعين:
//
//   • فُكّت محتويات الصفحات وانعدّت العمليات: 12,735 مضلع معبّأ و33,536 خط،
//     بلا أي صورة نقطية — يعني متجهات كاملة.
//   • زوايا الأضلاع بالمضلعات الرمادية (السطح والهيكل) طلعت: 7.4° و155.2° و90°.
//     منها انحُلّت الكاميرا: **ارتفاع 14.2° ودوران 27.9°**، والمحور الرأسي عمودي
//     بالشاشة. (الأيزومتري الحقيقي ارتفاعه 35.26° — أستيب بكثير.)
//   • ألوان التعبئة الأكثر تكراراً: وجه اللوح #303157 والهيكل #989898.
//   • الحدود: **أسود صافي حصراً**، بسماكتين 7.2825 و3.6413 — نسبة 2:1 بالضبط،
//     ومتطابقة بالملفات الأربعة.
//
// ملاحظة على الدوران: بملفات المرجع مصفوفة الألواح تميل حول المحور الثاني،
// فدوران الكاميرا 27.9° يخليها تواجه الناظر. مصفوفتنا تتجه **جنوباً** (المحور
// الآخر)، فبنفس الرقم تطلع الألواح شبه جانبية وتختفي. الدوران المكافئ لنا هو
// **مكمّله 62.1°** — نفس الكاميرا بالضبط بس منعكسة على المحورين، فتحافظ على
// مظهر المرجع وتخلي وجوه الألواح ظاهرة.
const REF = {
  elevationDeg: 14.2,
  azimuthDeg: 62.1,
  azimuthRefDeg: 27.9,   // كما هي بالملفات
  panelFace: '#303157',
  structure: '#989898',
  stroke: '#000000',
  strokeRatio: 2,
};

const D2R = Math.PI / 180;

/** كاميرا محورية: تعطي إسقاطاً ومفتاح عمق للترتيب */
export function makeCamera({ elevationDeg = REF.elevationDeg, azimuthDeg = REF.azimuthDeg, scale = 46 } = {}) {
  const th = elevationDeg * D2R;
  const ph = azimuthDeg * D2R;
  const st = Math.sin(th), ct = Math.cos(th);
  const sp = Math.sin(ph), cp = Math.cos(ph);
  return {
    // إحداثيات SVG (المحور y للأسفل). الإشارات لازم توافق دالة العمق تحت:
    // النقطة الأقرب للناظر لازم تطلع **أوطأ** بالشاشة. بإشارة معكوسة كان
    // الأقرب يطلع أعلى، فيتناقض المسقط مع الترتيب وتنرسم الجسور فوق الألواح
    // اللي تحملها، وتنشاف ظهور الألواح بدل وجوهها.
    project(x, y, z) {
      return [(x * cp - y * sp) * scale, (x * sp * st + y * cp * st - z * ct) * scale];
    },
    // البُعد على اتجاه النظر — الأكبر أقرب للناظر. هذا المفتاح الصحيح لخوارزمية
    // الرسّام؛ جمع (x+y+z) الساذج يخلي جسر السقيفة يطلع فوق اللوح اللي يحمله.
    depth(x, y, z) { return x * sp * ct + y * cp * ct + z * st; },
    scale,
  };
}

// تظليل الأوجه حسب اتجاهها — سكتش-اب يفتّح الوجه العلوي ويغمّق الجانبي
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
}
export const FACE_TOP = 1.12, FACE_SIDE_A = 0.86, FACE_SIDE_B = 0.72;

function poly(pts, fill, sw) {
  const d = pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  return `<polygon points="${d}" fill="${fill}" stroke="${REF.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

/**
 * صندوق قائم → ثلاثة أوجه مرئية مع مفاتيح عمقها.
 * @param {boolean} fromBelow منظور من تحت: نشوف الوجه السفلي بدل العلوي
 */
export function boxFaces(cam, { x, y, z, w, d, h }, colour, sw, fromBelow = false) {
  const P = cam.project.bind(cam);
  const x1 = x + w, y1 = y + d, z1 = z + h;
  const zf = fromBelow ? z : z1;
  return [
    { key: cam.depth(x + w / 2, y + d / 2, zf), svg: poly([P(x, y, zf), P(x1, y, zf), P(x1, y1, zf), P(x, y1, zf)], shade(colour, FACE_TOP), sw) },
    { key: cam.depth(x1, y + d / 2, z + h / 2), svg: poly([P(x1, y, z1), P(x1, y1, z1), P(x1, y1, z), P(x1, y, z)], shade(colour, FACE_SIDE_A), sw) },
    { key: cam.depth(x + w / 2, y1, z + h / 2), svg: poly([P(x, y1, z1), P(x1, y1, z1), P(x1, y1, z), P(x, y1, z)], shade(colour, FACE_SIDE_B), sw) },
  ];
}

/** لوح مائل: الحافة الجنوبية أوطأ (yFront) والشمالية أعلى (yBack) */
export function panelFace(cam, { xa, xb, yFront, yBack, zFront, zBack }, sw, fromBelow = false) {
  const P = cam.project.bind(cam);
  const q = [P(xa, yFront, zFront), P(xb, yFront, zFront), P(xb, yBack, zBack), P(xa, yBack, zBack)];
  const fill = fromBelow ? '#eef1f5' : REF.panelFace;
  const parts = [poly(q, fill, sw)];
  if (!fromBelow) {
    // شقّ الخلايا النصفية بالمنتصف + أشرطة عرضية — نفس تفصيل المرجع
    const cx = (xa + xb) / 2;
    const a = P(cx, yFront, zFront), b = P(cx, yBack, zBack);
    parts.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${REF.stroke}" stroke-width="${sw / REF.strokeRatio}" opacity=".55"/>`);
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      const yy = yFront + (yBack - yFront) * t, zz = zFront + (zBack - zFront) * t;
      const p1 = P(xa, yy, zz), p2 = P(xb, yy, zz);
      parts.push(`<line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke="${REF.stroke}" stroke-width="${sw / REF.strokeRatio}" opacity=".45"/>`);
    }
  }
  return { key: cam.depth((xa + xb) / 2, (yFront + yBack) / 2, (zFront + zBack) / 2), svg: parts.join('') };
}

/** يجمع القطع بترتيب الرسّام ويغلّفها بـsvg بحدود محسوبة */
export function assemble(items, cam, bounds, { pad = 46 } = {}) {
  const pts = bounds.map(([x, y, z]) => cam.project(x, y, z));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minx = Math.min(...xs) - pad, maxx = Math.max(...xs) + pad;
  const miny = Math.min(...ys) - pad, maxy = Math.max(...ys) + pad;
  const body = items.slice().sort((a, b) => a.key - b.key).map((i) => i.svg).join('\n');
  return `<svg viewBox="${minx.toFixed(1)} ${miny.toFixed(1)} ${(maxx - minx).toFixed(1)} ${(maxy - miny).toFixed(1)}">\n${body}\n</svg>`;
}

export { REF };
