import { describe, it, expect } from 'vitest';
import {
  computeRequirements,
  panelsByLoadFor,
  panelsByRoofFor,
  systemAmpSize,
  pickLaborTier,
  classifyTiers,
  selectPanelTiers,
  selectBatteryTiers,
  selectInverterTiers,
} from '../electron/lib/calc.js';

const DEFAULT_SETTINGS = {
  systemVoltage: 220,
  peakSunHours: 5.5,
  systemEfficiency: 0.8,
  inverterSafetyFactor: 1.25,
  dod: 0.9,
  nightCoverageHours: 8,
  panelAreaM2: 2.7,
};

describe('computeRequirements - مثال مرجعي 15 أمبير نهار / 15 أمبير ليل', () => {
  const req = computeRequirements({ ampDay: 15, ampNight: 15, ...DEFAULT_SETTINGS });

  it('يحسب الأحمال بالواط بشكل صحيح', () => {
    expect(req.dayLoadW).toBe(3300);
    expect(req.nightLoadW).toBe(3300);
  });

  it('سعة البطارية المطلوبة تؤدي لبطاريتين 16kWh (مطابق للفاتورة المرجعية)', () => {
    expect(req.batteryCapacityKwhNeeded).toBeCloseTo(29.33, 1);
    const units = Math.ceil(req.batteryCapacityKwhNeeded / 16);
    expect(units).toBe(2);
  });

  it('قدرة الانفيرتر المطلوبة تؤدي لانفيرتر 6kW واحد (مطابق للفاتورة المرجعية)', () => {
    expect(req.inverterCapacityW).toBeCloseTo(4125, 0);
    const units = Math.ceil(req.inverterCapacityW / 6000);
    expect(units).toBe(1);
  });

  it('عدد الألواح بدون قيد مساحة (سطح كبير) = 18 لوح 650 واط حسب المعادلة الحرفية', () => {
    const panelsByLoad = panelsByLoadFor(req.dayEnergyWh, 650, DEFAULT_SETTINGS);
    expect(panelsByLoad).toBe(18);
  });

  it('عند تحديد مساحة سطح ~28م² (كما بالفاتورة المرجعية) يصير العدد النهائي 10 ألواح بسبب قيد المساحة', () => {
    const panelsByLoad = panelsByLoadFor(req.dayEnergyWh, 650, DEFAULT_SETTINGS);
    const panelsByRoof = panelsByRoofFor(28, DEFAULT_SETTINGS.panelAreaM2);
    expect(panelsByRoof).toBe(10);
    const finalCount = Math.min(panelsByLoad, panelsByRoof);
    expect(finalCount).toBe(10);
    expect(panelsByRoof < panelsByLoad).toBe(true); // roof_limited_warning = true
  });
});

describe('systemAmpSize و pickLaborTier', () => {
  it('يختار الأكبر بين أمبير النهار والليل', () => {
    expect(systemAmpSize(15, 20)).toBe(20);
    expect(systemAmpSize(25, 10)).toBe(25);
  });

  const tiers = [
    { system_amps: 10, price: 300000 },
    { system_amps: 15, price: 550000 },
    { system_amps: 20, price: 750000 },
  ];

  it('يختار أقرب حجم أكبر أو يساوي المطلوب', () => {
    expect(pickLaborTier(tiers, 15).price).toBe(550000);
    expect(pickLaborTier(tiers, 12).price).toBe(550000);
    expect(pickLaborTier(tiers, 20).price).toBe(750000);
  });

  it('يرجع null إذا الحجم أكبر من كل التعريفات المتوفرة', () => {
    expect(pickLaborTier(tiers, 30)).toBeNull();
  });
});

describe('classifyTiers', () => {
  it('يرجع insufficient=true عند عدم وجود توليفات', () => {
    expect(classifyTiers([]).insufficient).toBe(true);
  });

  it('يرجع singleOption=true عند وجود توليفة واحدة فقط', () => {
    const result = classifyTiers([{ totalPrice: 100 }]);
    expect(result.singleOption).toBe(true);
    expect(result.economy).toBe(result.premium);
  });

  it('يرتب اقتصادي/متوسط/ممتاز بشكل صحيح مع عدة توليفات', () => {
    const combos = [{ totalPrice: 500 }, { totalPrice: 100 }, { totalPrice: 900 }, { totalPrice: 300 }];
    const result = classifyTiers(combos);
    expect(result.economy.totalPrice).toBe(100);
    expect(result.premium.totalPrice).toBe(900);
    expect(result.standard.totalPrice).toBe(500); // أقرب لمنتصف المدى (100+900)/2=500
  });
});

describe('اختيار المواد حسب المخزون - فلترة صارمة', () => {
  const requirements = computeRequirements({ ampDay: 15, ampNight: 15, ...DEFAULT_SETTINGS });

  it('يستبعد الألواح غير الكافية بالمخزون رغم كفايتها بالقدرة', () => {
    const panels = [
      { id: 1, watt_or_capacity: 650, price: 185000, quantity_stock: 5 }, // يحتاج 10 لكن المخزون 5 فقط -> يستبعد
      { id: 2, watt_or_capacity: 650, price: 200000, quantity_stock: 20 },
    ];
    const result = selectPanelTiers(panels, requirements, 28, DEFAULT_SETTINGS);
    expect(result.singleOption).toBe(true);
    expect(result.economy.material.id).toBe(2);
  });

  it('تنبيه عدم كفاية المخزون عندما لا توجد أي مادة صالحة', () => {
    const batteries = [{ id: 1, watt_or_capacity: 16, price: 2750000, quantity_stock: 1 }];
    const result = selectBatteryTiers(batteries, requirements);
    expect(result.insufficient).toBe(true);
  });

  it('اختيار الانفيرتر يعمل مع عدة خيارات (اقتصادي/متوسط/ممتاز)', () => {
    const inverters = [
      { id: 1, watt_or_capacity: 6000, price: 650000, quantity_stock: 5 },
      { id: 2, watt_or_capacity: 8000, price: 900000, quantity_stock: 5 },
      { id: 3, watt_or_capacity: 5000, price: 500000, quantity_stock: 5 },
    ];
    const result = selectInverterTiers(inverters, requirements);
    expect(result.economy.material.id).toBe(3);
    expect(result.premium.material.id).toBe(2);
  });
});
