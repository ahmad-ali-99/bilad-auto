import { describe, it, expect } from 'vitest';
import {
  panelAmpsFor, panelsRequired, selectInverterTiers,
  PANEL_AMPS_PER_WATT, PANEL_AMPS_REF_VOLTAGE, PREMIUM_INVERTER_HEADROOM, PV_OVERSIZE_RATIO,
} from '../src/lib/calc.js';

const SET = (v = 220) => ({
  systemVoltage: v, dod: 0.9, inverterSafetyFactor: 1.25,
  chargePanelsPerBattery: 1.5, panelSafetyFactor: 1.25,
});
const INV = [6, 10, 16, 20, 30, 50].map((k, i) => ({
  id: i + 1, category: 'inverter', model: `Deye ${k}kW`, full_description: `انفيرتر ${k} كيلو`,
  watt_or_capacity: k * 1000, price: k * 240000,
}));

describe('أمبير اللوح يتبع فولتية النظام', () => {
  it('على 220 فولت الرقم يبقى 2.18 للوح 650 — ماكو تغيير بالسلوك القديم', () => {
    expect(panelAmpsFor(650, 220)).toBeCloseTo(650 * PANEL_AMPS_PER_WATT, 10);
    expect(panelAmpsFor(650, 220)).toBeCloseTo(2.18, 10);
    expect(PANEL_AMPS_REF_VOLTAGE).toBe(220);
  });

  it('الفولتية الافتراضية = فولتية المرجع، فالاستدعاء بلا فولتية ما ينكسر', () => {
    expect(panelAmpsFor(650)).toBeCloseTo(panelAmpsFor(650, 220), 10);
  });

  it('نص الفولتية = ضعف الأمبير: اللوح نفسه ينطي أمبير أكثر بفولتية أوطأ', () => {
    expect(panelAmpsFor(650, 110)).toBeCloseTo(2 * panelAmpsFor(650, 220), 10);
  });

  it('عدد ألواح التغذية ينزل بفولتية أوطأ بدل ما يبقى ثابتاً', () => {
    const at220 = panelsRequired(105, 0, SET(220), 650).feedPanels;
    const at48 = panelsRequired(105, 0, SET(48), 650).feedPanels;
    // نفس الأمبير على 48 فولت = حِمل أصغر بكثير، فالألواح لازم تقل — قبل الإصلاح
    // كانت تطلع نفس العدد بالضبط وتجبر انفيرترات إضافية
    expect(at220).toBe(61);
    expect(at48).toBeLessThan(at220);
    expect(at48).toBe(Math.ceil((105 * 1.25) / panelAmpsFor(650, 48)));
  });
});

describe('هامش الممتاز ما يلغي سماحية تحميل الألواح', () => {
  const call = (panelArrayW) => selectInverterTiers(INV, 105, 20, SET(220), panelArrayW, 105);

  it('الممتاز ما يطلب وحدات زيادة لأن الطلب جاي من الألواح', () => {
    // مصفوفة 66 لوح × 650 = 42.9kW ← طلب الألواح = 42.9 ÷ 1.3 = 33kW.
    // قبل الإصلاح: 33 × 1.3 = 42.9kW أي المصفوفة كاملة (DC/AC = 1) — القسمة
    // والضرب يلغون بعض، فيصير الطلب أكبر من اللازم وينخطف انفيرترين.
    const t = call(66 * 650);
    expect(t.premium.units).toBe(1);
    expect(t.premium.units).toBeLessThanOrEqual(t.economy.units);
    // والقدرة المختارة تظل تغطي حدّ الألواح الحقيقي
    expect(t.premium.units * t.premium.material.watt_or_capacity)
      .toBeGreaterThanOrEqual((66 * 650) / PV_OVERSIZE_RATIO);
  });

  it('بلا ألواح الممتاز يبقى ياخذ هامشه فوق الحمل', () => {
    const loadW = 105 * 220 * 1.25;
    const premium = call(0).premium;
    expect(premium.units * premium.material.watt_or_capacity)
      .toBeGreaterThanOrEqual(Math.min(loadW * PREMIUM_INVERTER_HEADROOM, 50000));
  });

  it('الهامش 1.3 مسمّى وثابت', () => {
    expect(PREMIUM_INVERTER_HEADROOM).toBe(1.3);
    expect(PV_OVERSIZE_RATIO).toBe(1.3);
  });
});
