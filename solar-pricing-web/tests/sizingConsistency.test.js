import { describe, it, expect } from 'vitest';
import {
  panelAmpsFor, panelsRequired, selectInverterTiers,
  PANEL_AMPS_PER_WATT, PANEL_AMPS_REF_VOLTAGE, PANEL_REAL_YIELD,
  DEFAULT_CHARGE_PANELS_PER_BATTERY, PREMIUM_INVERTER_HEADROOM, PV_OVERSIZE_RATIO,
} from '../src/lib/calc.js';

const SET = (v = 220) => ({
  systemVoltage: v, dod: 0.9, inverterSafetyFactor: 1.25,
  chargePanelsPerBattery: 1, panelSafetyFactor: 1.25,
});
const INV = [6, 10, 16, 20, 30, 50].map((k, i) => ({
  id: i + 1, category: 'inverter', model: `Deye ${k}kW`, full_description: `انفيرتر ${k} كيلو`,
  watt_or_capacity: k * 1000, price: k * 240000,
}));

describe('قاعدة الشركة: الأمبير = (واط × عدد − 25%) ÷ الفولتية', () => {
  it('50 لوح 650 واط على 230 فولت = 106 أمبير — نفس عنوان العرض 426', () => {
    const amps = 50 * panelAmpsFor(650, 230);
    expect(amps).toBeCloseTo((650 * 50 * 0.75) / 230, 6);
    expect(Math.round(amps)).toBe(106);
  });

  it('المعامل 0.75 وفولتية المرجع 230 مثل ما تنحسب باليد', () => {
    expect(PANEL_REAL_YIELD).toBe(0.75);
    expect(PANEL_AMPS_REF_VOLTAGE).toBe(230);
    expect(panelAmpsFor(650, 230)).toBeCloseTo(650 * PANEL_AMPS_PER_WATT, 10);
  });

  it('الفولتية الافتراضية = فولتية المرجع، فالاستدعاء بلا فولتية ما ينكسر', () => {
    expect(panelAmpsFor(650)).toBeCloseTo(panelAmpsFor(650, 230), 10);
  });

  it('نص الفولتية = ضعف الأمبير: اللوح نفسه ينطي أمبير أكثر بفولتية أوطأ', () => {
    expect(panelAmpsFor(650, 115)).toBeCloseTo(2 * panelAmpsFor(650, 230), 10);
  });

  it('عدد ألواح التغذية ينزل بفولتية أوطأ بدل ما يبقى ثابتاً', () => {
    const at230 = panelsRequired(105, 0, SET(230), 650).feedPanels;
    const at48 = panelsRequired(105, 0, SET(48), 650).feedPanels;
    // نفس الأمبير على 48 فولت = حِمل أصغر بكثير، فالألواح لازم تقل — قبل الإصلاح
    // كانت تطلع نفس العدد بالضبط وتجبر انفيرترات إضافية
    expect(at48).toBeLessThan(at230);
    expect(at230).toBe(Math.ceil((105 * 1.25) / panelAmpsFor(650, 230)));
  });

  it('بلا معامل أمان، القاعدة ترجع عدد ألواح العرض 426 بالضبط: 105 أمبير ← 50 لوح', () => {
    const raw = panelsRequired(105, 0, { ...SET(230), panelSafetyFactor: 1 }, 650);
    expect(raw.feedPanels).toBe(50);
  });
});

describe('ألواح الشحن لكل بطارية', () => {
  it('الافتراض لوح واحد لما الإعداد فارغ', () => {
    expect(DEFAULT_CHARGE_PANELS_PER_BATTERY).toBe(1);
    const s = { ...SET(230) }; delete s.chargePanelsPerBattery;
    expect(panelsRequired(0, 4, s, 650).chargePanels).toBe(4);
  });

  it('القيمة المحفوظة بالإعدادات تسبق الافتراض', () => {
    expect(panelsRequired(0, 4, { ...SET(230), chargePanelsPerBattery: 1.5 }, 650).chargePanels).toBe(6);
  });
});

describe('هامش الممتاز ما يلغي سماحية تحميل الألواح', () => {
  const call = (panelArrayW) => selectInverterTiers(INV, 105, 20, SET(230), panelArrayW, 105);

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
    const loadW = 105 * 230 * 1.25;
    const premium = call(0).premium;
    expect(premium.units * premium.material.watt_or_capacity)
      .toBeGreaterThanOrEqual(Math.min(loadW * PREMIUM_INVERTER_HEADROOM, 50000));
  });

  it('الهامش 1.3 مسمّى وثابت', () => {
    expect(PREMIUM_INVERTER_HEADROOM).toBe(1.3);
    expect(PV_OVERSIZE_RATIO).toBe(1.3);
  });
});
