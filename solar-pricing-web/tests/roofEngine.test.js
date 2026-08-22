import { describe, it, expect } from 'vitest';
import {
  winterNoonAltitude, tiltFromFeet, rowPitch, activeObstacles, freeSpanAt, solveLayout,
} from '../src/lib/roofLayout.js';
import { makeCamera, REF } from '../src/lib/roofRender.js';
import { buildRoofScene } from '../src/lib/roofScene.js';

const SITE = {
  roofWidth: 14.4, roofDepth: 13.6,
  panelLong: 2.382, panelShort: 1.134, frontFoot: 0.30, backFoot: 1.10, latitude: 32.5,
};
const OBS = [
  { name: 'بيتونة', x: 0, y: 0, w: 4.8, d: 8.8, h: 3.0 },
  { name: 'مولد', x: 12, y: 0, w: 2.4, d: 4.0, h: 1.8 },
];

// كل رقم بالمحرك مشتق مو مفروض — والفحص يثبّت الاشتقاق نفسه
describe('حلّال التوزيع: الأرقام تُشتق ولا تُفرض', () => {
  it('الميلان يجي من فرق القدمين', () => {
    const t = tiltFromFeet(2.382, 0.30, 1.10);
    expect(t.rise).toBeCloseTo(0.80, 3);
    expect(t.tiltDeg).toBeCloseTo(19.6, 1);
    expect(t.projection).toBeCloseTo(2.244, 3);
  });

  it('قدم خلفية غير صالحة تُرفض بدل ما تنتج زاوية وهمية', () => {
    expect(tiltFromFeet(2.382, 1.10, 0.30)).toBeNull();   // الخلفية أوطأ
    expect(tiltFromFeet(2.382, 0.30, 3.00)).toBeNull();   // الفرق أطول من اللوح
  });

  it('المسافة بين الصفوف تجي من ظل الانقلاب الشتوي', () => {
    expect(winterNoonAltitude(32.5)).toBeCloseTo(34.05, 2);
    const p = rowPitch(tiltFromFeet(2.382, 0.30, 1.10), 32.5);
    expect(p.shadow).toBeCloseTo(1.184, 2);
    expect(p.need).toBeCloseTo(3.428, 2);
    expect(p.pitch).toBeCloseTo(3.45, 2);
  });

  it('خط عرض أعلى = شمس أوطأ = ظل أطول = مسافة أوسع', () => {
    const t = tiltFromFeet(2.382, 0.30, 1.10);
    expect(rowPitch(t, 45).pitch).toBeGreaterThan(rowPitch(t, 32.5).pitch);
  });

  it('العائق يبطل عائقاً إذا الهيكل علا فوقه', () => {
    expect(activeObstacles(OBS, 0)).toHaveLength(2);
    expect(activeObstacles(OBS, 1.86).map((o) => o.name)).toEqual(['بيتونة']);
    expect(activeObstacles(OBS, 3.04)).toHaveLength(0);
  });

  it('المدى الحر يرجّع أوسع فجوة — الصف الواحد ما ينقسم', () => {
    expect(freeSpanAt(14.4, OBS, 0.7, 3.0)).toEqual([4.8, 12]);   // البيتونة والمولد
    expect(freeSpanAt(14.4, OBS, 4.2, 6.4)).toEqual([4.8, 14.4]); // البيتونة فقط
    expect(freeSpanAt(14.4, OBS, 11.0, 13.3)).toEqual([0, 14.4]); // ماكو عائق
  });

  it('السيناريوهات الثلاثة تطلع بالأرقام اللي انحسبت يدوياً', () => {
    const run = (clear) => solveLayout({ ...SITE, obstacles: OBS, canopyClearZ: clear });
    expect(run(0).rows.map((r) => r.count)).toEqual([12, 8, 8, 6]);
    expect(run(0).total).toBe(34);
    expect(run(1.86).total).toBe(36);
    expect(run(3.04).rows.map((r) => r.count)).toEqual([12, 12, 12, 12]);
    expect(run(3.04).total).toBe(48);
  });

  it('كل صف يبقى داخل السطح وبهامش غير سالب', () => {
    for (const r of solveLayout({ ...SITE, obstacles: OBS, canopyClearZ: 3.04 }).rows) {
      expect(r.yBack).toBeGreaterThanOrEqual(0);
      expect(r.yFront).toBeLessThanOrEqual(SITE.roofDepth);
      expect(r.margin).toBeGreaterThanOrEqual(0);
      expect(r.x0).toBeGreaterThanOrEqual(0);
    }
  });

  it('سقف العدد يُحترم — ما يزيد عن المطلوب', () => {
    expect(solveLayout({ ...SITE, obstacles: OBS, canopyClearZ: 3.04, maxPanels: 34 }).total).toBe(34);
  });
});

// الكاميرا مستخرَجة من ملفات المرجع (تصديرات سكتش-اب المتجهية) مو مقدَّرة بالعين
describe('محرك الرسم: ثوابت مستخرَجة من ملفات المرجع', () => {
  it('الكاميرا والألوان كما انقاست من الملفات', () => {
    expect(REF.elevationDeg).toBe(14.2);
    expect(REF.azimuthRefDeg).toBe(27.9);
    expect(REF.panelFace).toBe('#303157');
    expect(REF.structure).toBe('#989898');
    expect(REF.stroke).toBe('#000000');   // المرجع ما يستعمل إلا الأسود بالحدود
    expect(REF.strokeRatio).toBe(2);      // 7.2825 ÷ 3.6413
  });

  it('المسقط والعمق متوافقان: الأقرب للناظر يطلع أوطأ بالشاشة', () => {
    const cam = makeCamera({ scale: 1 });
    // نقطتان على نفس x وz، الثانية أقرب (y أكبر)
    const [, y1] = cam.project(0, 0, 0);
    const [, y2] = cam.project(0, 5, 0);
    expect(cam.depth(0, 5, 0)).toBeGreaterThan(cam.depth(0, 0, 0));
    expect(y2).toBeGreaterThan(y1);   // الأقرب أوطأ — بإشارة معكوسة كان يطلع أعلى
  });

  it('الارتفاع بالمشهد يرفع النقطة بالشاشة', () => {
    const cam = makeCamera({ scale: 1 });
    expect(cam.project(0, 0, 3)[1]).toBeLessThan(cam.project(0, 0, 0)[1]);
  });

  it('العنصر الأعلى بنفس الموقع يُرسم بعد اللي تحته', () => {
    const cam = makeCamera({ scale: 1 });
    expect(cam.depth(7, 5, 3.9)).toBeGreaterThan(cam.depth(7, 5, 3.0));
  });
});

describe('تركيب المشهد', () => {
  const site = {
    roofWidth: 14.4, roofDepth: 13.6, canopyZ: 3.20, obstacles: OBS,
  };

  it('يطلع SVG صالح وفيه العدد الصحيح من الألواح', () => {
    const { svg, layout } = buildRoofScene(site, 'iso');
    expect(svg.startsWith('<svg viewBox=')).toBe(true);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
    expect(layout.total).toBe(48);
    const faces = (svg.match(new RegExp(`fill="${REF.panelFace}"`, 'g')) || []).length;
    expect(faces).toBe(48);
  });

  it('منظور «من تحت» يقلب النظر ويعرض ظهر الألواح', () => {
    const { svg } = buildRoofScene(site, 'under');
    expect(svg).not.toContain(`fill="${REF.panelFace}"`);
    expect(svg).toContain('fill="#eef1f5"');
  });

  it('بلا هيكل: العوائق ترجع تقطع الصفوف', () => {
    const { layout } = buildRoofScene({ ...site, canopyZ: 0 }, 'iso');
    expect(layout.total).toBe(34);
  });
});
