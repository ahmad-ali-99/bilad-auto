import { describe, it, expect } from 'vitest';
import {
  panelAmpsFor,
  batteriesRequired,
  panelsRequired,
  requiredRoofArea,
  inverterCapacityRequired,
  systemAmpSize,
  pickLaborTier,
  classifyTiers,
  selectPanelTiers,
  selectBatteryTiers,
  selectInverterTiers,
} from '../electron/lib/calc.js';

const DEFAULT_SETTINGS = {
  systemVoltage: 220,
  inverterSafetyFactor: 1.25,
  dod: 0.9,
  panelAreaM2: 2.7,
  chargePanelsPerBattery: 1.5,
};

describe('القاعدة المرجعية: منظومة 15 أمبير نهار/ليل، 8 ساعات تجهيز، لوح 650 وبطارية 16kWh', () => {
  it('عدد البطاريات = 2 (طاقة الليل 3300×8=26.4kWh ÷ 0.9 ÷ 16)', () => {
    expect(batteriesRequired(15, 8, DEFAULT_SETTINGS, 16)).toBe(2);
  });

  it('ألواح التغذية = ceil(15 ÷ 2.18) = 7', () => {
    const { feedPanels } = panelsRequired(15, 2, DEFAULT_SETTINGS, 650);
    expect(feedPanels).toBe(7);
  });

  it('ألواح الشحن = ceil(2 بطارية × 1.5) = 3', () => {
    const { chargePanels } = panelsRequired(15, 2, DEFAULT_SETTINGS, 650);
    expect(chargePanels).toBe(3);
  });

  it('عدد الألواح النهائي = 10 (مطابق للفاتورة المرجعية الفعلية)', () => {
    const { total } = panelsRequired(15, 2, DEFAULT_SETTINGS, 650);
    expect(total).toBe(10);
  });

  it('المساحة المطلوبة لـ10 ألواح = 27 م²', () => {
    expect(requiredRoofArea(10, DEFAULT_SETTINGS)).toBeCloseTo(27, 5);
  });

  it('الانفيرتر المطلوب 4125 واط → وحدة 6kW واحدة', () => {
    const w = inverterCapacityRequired(15, 15, DEFAULT_SETTINGS);
    expect(w).toBeCloseTo(4125, 0);
    expect(Math.ceil(w / 6000)).toBe(1);
  });

});

describe('ساعات التجهيز المتغيرة بالعرض', () => {
  it('4 ساعات تجهيز → بطارية واحدة تكفي', () => {
    expect(batteriesRequired(15, 4, DEFAULT_SETTINGS, 16)).toBe(1);
  });

  it('12 ساعة تجهيز → 3 بطاريات', () => {
    expect(batteriesRequired(15, 12, DEFAULT_SETTINGS, 16)).toBe(3);
  });
});

describe('تدرج أمبير اللوح مع الواطية (النسبة ثابتة بالكود: 2.18 لكل 650 واط)', () => {
  it('لوح 650 واط = 2.18 أمبير بالضبط', () => {
    expect(panelAmpsFor(650)).toBeCloseTo(2.18, 5);
  });

  it('لوح 550 واط يعطي أمبير أقل نسبياً وعدد ألواح تغذية أكثر', () => {
    expect(panelAmpsFor(550)).toBeCloseTo(2.18 * 550 / 650, 5);
    const { feedPanels } = panelsRequired(15, 0, DEFAULT_SETTINGS, 550);
    expect(feedPanels).toBe(9); // 15 ÷ 1.844 = 8.13 → 9
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

describe('اختيار المواد - فلترة صارمة على المخزون', () => {
  it('يستبعد الألواح غير الكافية بالمخزون رغم كفايتها بالقدرة', () => {
    const panels = [
      { id: 1, watt_or_capacity: 650, price: 185000, quantity_stock: 5 }, // يحتاج 10 لكن المخزون 5 → يستبعد
      { id: 2, watt_or_capacity: 650, price: 200000, quantity_stock: 20 },
    ];
    const result = selectPanelTiers(panels, 15, 2, DEFAULT_SETTINGS);
    expect(result.singleOption).toBe(true);
    expect(result.economy.material.id).toBe(2);
    expect(result.economy.units).toBe(10);
  });

  it('تنبيه عدم كفاية المخزون عندما لا توجد أي بطارية صالحة', () => {
    const batteries = [{ id: 1, watt_or_capacity: 16, price: 2750000, quantity_stock: 1 }];
    const result = selectBatteryTiers(batteries, 15, 8, DEFAULT_SETTINGS);
    expect(result.insufficient).toBe(true);
  });

  it('اختيار الانفيرتر يعمل مع عدة خيارات (اقتصادي/متوسط/ممتاز)', () => {
    const inverters = [
      { id: 1, watt_or_capacity: 6000, price: 650000, quantity_stock: 5 },
      { id: 2, watt_or_capacity: 8000, price: 900000, quantity_stock: 5 },
      { id: 3, watt_or_capacity: 5000, price: 500000, quantity_stock: 5 },
    ];
    const result = selectInverterTiers(inverters, 15, 15, DEFAULT_SETTINGS);
    expect(result.economy.material.id).toBe(3);
    expect(result.premium.material.id).toBe(2);
  });
});
