// حلّال توزيع الألواح على السطح — رياضيات صرفة، بلا رسم ولا DOM.
//
// يجاوب على سؤال واحد: عندي سطح بأبعاده، وعليه عوائق بارتفاعاتها، وهيكل
// بارتفاع معيّن، وألواح بمقاسها وقدمَي تثبيتها — وين تنحط الصفوف وكم لوح يدخل؟
//
// القواعد كلها مشتقّة مو مفروضة:
//   • الميلان يجي من فرق القدمين مو من رقم مكتوب.
//   • المسافة بين الصفوف تجي من ظل أقصر يوم بالسنة بخط عرض الموقع.
//   • العائق يبطل عائقاً إذا الهيكل يعلو فوقه.

// أوطأ ارتفاع للشمس ظهراً (الانقلاب الشتوي) بخط عرض معيّن
export function winterNoonAltitude(latitude) {
  return 90 - Math.abs(latitude) - 23.45;
}

/** زاوية الميلان من ارتفاع القدمين — القدم الخلفية أعلى من الأمامية */
export function tiltFromFeet(panelLong, frontFoot, backFoot) {
  const rise = backFoot - frontFoot;
  if (!(panelLong > 0) || !(rise > 0) || rise >= panelLong) return null;
  return {
    rise,
    tiltDeg: (Math.asin(rise / panelLong) * 180) / Math.PI,
    projection: Math.sqrt(panelLong * panelLong - rise * rise),
  };
}

/**
 * المسافة بين الصفوف حتى ما يظلل الصف الأمامي اللي وراه.
 * = إسقاط اللوح الأفقي + طول ظله بأوطأ شمس بالسنة.
 */
export function rowPitch({ rise, projection }, latitude, roundTo = 0.05) {
  const alt = (winterNoonAltitude(latitude) * Math.PI) / 180;
  if (!(alt > 0)) return null;
  const shadow = rise / Math.tan(alt);
  const need = projection + shadow;
  return { shadow, need, pitch: Math.ceil(need / roundTo) * roundTo };
}

/**
 * العوائق اللي تبقى عوائق فعلاً. الهيكل إذا علا فوق العائق ما عاد يقطع الصف.
 * @param {number} clearZ منسوب أوطأ نقطة بالهيكل (أسفل الجسور)
 */
export function activeObstacles(obstacles, clearZ) {
  if (!(clearZ > 0)) return obstacles || [];
  return (obstacles || []).filter((o) => Number(o.h) > clearZ);
}

/** المدى الحر بالعرض عند شريط عمقه [yb, yf] بعد استبعاد العوائق */
export function freeSpanAt(roofWidth, obstacles, yb, yf) {
  // العائق يقطع الشريط إذا تداخل معه بالعمق
  const blockers = (obstacles || [])
    .filter((o) => o.y < yf && o.y + o.d > yb)
    .map((o) => [o.x, o.x + o.w])
    .sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cursor = 0;
  for (const [a, b] of blockers) {
    if (a > cursor) gaps.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < roofWidth) gaps.push([cursor, roofWidth]);
  // نرجّع أوسع فجوة — الصف الواحد ما ينقسم على فجوتين بهيكل واحد
  return gaps.reduce((best, g) => (g[1] - g[0] > best[1] - best[0] ? g : best), [0, 0]);
}

/**
 * يوزّع الصفوف من الحافة الجنوبية شمالاً.
 * @returns {{rows: Array, total: number, tilt: object, pitch: object}}
 */
export function solveLayout({
  roofWidth, roofDepth, obstacles = [], canopyClearZ = 0,
  panelLong, panelShort, gap = 0.02, frontFoot, backFoot,
  latitude = 32.5, southSetback = 0.30, maxPanels = Infinity,
}) {
  const tilt = tiltFromFeet(panelLong, frontFoot, backFoot);
  if (!tilt) return { rows: [], total: 0, tilt: null, pitch: null };
  const pitch = rowPitch(tilt, latitude);
  const active = activeObstacles(obstacles, canopyClearZ);
  const step = panelShort + gap;

  const rows = [];
  let total = 0;
  let yf = roofDepth - southSetback;
  while (yf - tilt.projection >= 0 && total < maxPanels) {
    const yb = yf - tilt.projection;
    const [a, b] = freeSpanAt(roofWidth, active, yb, yf);
    const width = b - a;
    let n = Math.floor((width + gap) / step);
    if (n > 0) {
      if (total + n > maxPanels) n = maxPanels - total;
      const span = n * step - gap;
      rows.push({ yFront: yf, yBack: yb, x0: a + (width - span) / 2, count: n, span, margin: width - span });
      total += n;
    }
    yf -= pitch.pitch;
  }
  return { rows, total, tilt, pitch, obstacles: active };
}
