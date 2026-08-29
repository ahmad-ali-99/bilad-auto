import { describe, it, expect } from 'vitest';
import {
  panelAmpsFor, panelsRequired, selectInverterTiers,
  PANEL_AMPS_PER_WATT, PANEL_AMPS_REF_VOLTAGE, PANEL_REAL_YIELD,
  DEFAULT_CHARGE_PANELS_PER_BATTERY, PV_OVERSIZE_RATIO,
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

describe('الممتاز يغطي حدّ الألواح بلا وحدات زيادة', () => {
  const call = (panelArrayW) => selectInverterTiers(INV, 105, 20, SET(230), panelArrayW, 105);

  it('يغطي حدّ الألواح بأقرب قدرة للمطلوب', () => {
    // مصفوفة 66 لوح × 650 = 42.9kW ← طلب الألواح = 42.9 ÷ 1.3 = 33kW.
    // **الأقرب للمطلوب يفوز**: 2×20kW = 40kW (1.21×) أقرب من 1×50kW (1.52×،
    // فوق السقف) — قرار المستخدم «ما يتجاوزها، تكون قريبة جداً أو متساوية».
    const t = call(66 * 650);
    const totalW = (c) => c.units * c.material.watt_or_capacity;
    expect(totalW(t.premium)).toBeGreaterThanOrEqual((66 * 650) / PV_OVERSIZE_RATIO);
    expect(totalW(t.premium)).toBeLessThan(50000);
    // وكل المستويات على نفس القدرة — الفرق بالسعر
    expect(totalW(t.economy)).toBe(totalW(t.premium));
  });

  // **هامش الممتاز 1.3 انشال** مع إلغاء التقييم بالـIP: التحجيم صار واحداً بكل
  // المستويات — بالكيلوواطية اللي يحتاجها الزبون بس، بلا تكبير خاص بالممتاز.
  it('وبلا ألواح يغطي الحمل نفسه — ماكو هامش تكبير', () => {
    const loadW = 105 * 230 * 1.25;
    const premium = call(0).premium;
    expect(premium.units * premium.material.watt_or_capacity).toBeGreaterThanOrEqual(loadW);
  });

  it('وسماحية تحميل الألواح 1.3 باقية — هاي غير هامش الممتاز', () => {
    expect(PV_OVERSIZE_RATIO).toBe(1.3);
  });
});

