import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as calc from '../src/lib/calc.js';
import {
  parseIp, formatIp, ipOf, hasIp, ipKey, isIpKey, materialIdFromIpKey, IP_MIN, IP_MAX,
} from '../src/lib/materialSpecs.js';
import { canDiscount } from '../src/lib/permissions.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, '..', p), 'utf8');
const dataApi = read('src/lib/dataApi.js');
const form = read('src/components/MaterialFormModal.jsx');
const excel = read('src/lib/excelImport.js');
const builder = read('src/pages/QuoteBuilder.jsx');
const calcSrc = read('src/lib/calc.js');

describe('حقل درجة الحماية', () => {
  it('يقرأ أي شكل يكتبه البياع', () => {
    expect(parseIp('IP65')).toBe(65);
    expect(parseIp('ايبي 21')).toBe(21);
    expect(parseIp(65)).toBe(65);
    expect(parseIp('ip-54')).toBe(54);
    expect(parseIp('0')).toBe(0);
  });

  it('يرفض الغلط بدل ما ياخذ رقماً عشوائياً', () => {
    expect(parseIp('99'), 'فوق المدى').toBe(null);
    expect(parseIp('IP65 موديل 2024'), 'أكثر من رقمين').toBe(null);
    expect(parseIp('غير معروف')).toBe(null);
    expect(parseIp('')).toBe(null);
    expect(parseIp(null)).toBe(null);
  });

  it('المدى معرّف ومعقول', () => {
    expect(IP_MIN).toBe(0);
    expect(IP_MAX).toBe(69);
    expect(parseIp(IP_MAX)).toBe(IP_MAX);
    expect(parseIp(IP_MAX + 1)).toBe(null);
  });

  it('العرض بصيغة IP مع صفر بادئ', () => {
    expect(formatIp(5)).toBe('IP05');
    expect(formatIp(65)).toBe('IP65');
    expect(formatIp('')).toBe(null);
  });

  it('الحقل الصريح يتقدم على نص الوصف', () => {
    expect(ipOf({ ip_rating: 21, full_description: 'انفيرتر IP65' })).toBe(21);
  });

  it('الوصف فولباك للمواد القديمة', () => {
    expect(ipOf({ full_description: 'انفيرتر هجين IP65' })).toBe(65);
    expect(ipOf({ model: 'X', full_description: 'انفيرتر' })).toBe(null);
    expect(hasIp({ full_description: 'انفيرتر' })).toBe(false);
  });

  it('مفتاح التخزين ذهاباً وإياباً', () => {
    expect(ipKey(42)).toBe('material_ip_42');
    expect(isIpKey('material_ip_42')).toBe(true);
    expect(isIpKey('material_image_42')).toBe(false);
    expect(materialIdFromIpKey('material_ip_42')).toBe(42);
  });
});

describe('الـIP يقرر مستوى الانفيرتر — مو السعر', () => {
  const S = { systemVoltage: 220, inverterSafetyFactor: 1.25 };
  const inv = (id, ip, kw, price) => ({
    id, category: 'inverter', brand: 'Deye', model: `D${kw}K`,
    full_description: 'انفيرتر', ip_rating: ip, watt_or_capacity: kw * 1000, price,
  });

  it('ثلاث درجات ← ثلاثة مستويات بالترتيب', () => {
    const t = calc.selectInverterTiers([inv(1, 21, 12, 3000000), inv(2, 51, 12, 1000000), inv(3, 65, 12, 2000000)], 20, 20, S, 0, 20);
    expect(t.economy.material.ip_rating, 'الاقتصادي = أدنى IP').toBe(21);
    expect(t.standard.material.ip_rating, 'المتوسط = الوسط').toBe(51);
    expect(t.premium.material.ip_rating, 'الممتاز = أعلى IP').toBe(65);
  });

  it('السعر ما يقلب الترتيب: الأغلى بأدنى IP يبقى اقتصادياً', () => {
    // IP21 بسعر 3 مليون وIP65 بسعر مليون — المواصفة تقرر لا السعر
    const t = calc.selectInverterTiers([inv(1, 21, 12, 3000000), inv(2, 65, 12, 1000000)], 20, 20, S, 0, 20);
    expect(t.economy.material.ip_rating).toBe(21);
    expect(t.premium.material.ip_rating).toBe(65);
    expect(t.economy.totalPrice).toBeGreaterThan(t.premium.totalPrice);
  });

  it('IP65 وIP66 درجتان مختلفتان — ماكو سقف يوحّدهن', () => {
    expect(calcSrc).not.toContain('STANDARD_IP_CAP');
    const t = calc.selectInverterTiers([inv(1, 65, 12, 1000000), inv(2, 66, 12, 900000)], 20, 20, S, 0, 20);
    expect(t.economy.material.ip_rating).toBe(65);
    expect(t.premium.material.ip_rating).toBe(66);
  });

  it('الأرقام مو مثبتة بالكود — أي درجة جديدة تدخل السلّم لحالها', () => {
    const t = calc.selectInverterTiers([inv(1, 54, 12, 1000000), inv(2, 68, 12, 1200000)], 20, 20, S, 0, 20);
    expect(t.economy.material.ip_rating).toBe(54);
    expect(t.premium.material.ip_rating).toBe(68);
  });

  it('مادة بلا IP تنحسب بأدنى درجة', () => {
    const noIp = { id: 9, category: 'inverter', brand: 'X', model: 'N', full_description: 'انفيرتر', watt_or_capacity: 12000, price: 1000000 };
    const t = calc.selectInverterTiers([noIp, inv(2, 65, 12, 900000)], 20, 20, S, 0, 20);
    expect(t.economy.material.id, 'اللي بلا IP = الأدنى').toBe(9);
  });

  it('درجة عالية بجهاز صغير ما تخطف الممتاز بتسع وحدات', () => {
    // 150 أمبير: جهاز IP66 بقدرة 6kW يحتاج ~9 وحدات — يطلع من السلّم
    const small66 = inv(1, 66, 6, 900000);
    const big65 = inv(2, 65, 50, 6300000);
    const t = calc.selectInverterTiers([small66, big65], 150, 150, S, 0, 150);
    expect(t.premium.units).toBeLessThanOrEqual(2);
    expect(t.premium.material.id).toBe(2);
  });
});

describe('البطاريات: الـIP إذا اختلف، وإلا بلا سلّم', () => {
  const S = { systemVoltage: 220, dod: 0.9 };
  const bat = (id, kwh, price, ip) => ({
    id, category: 'battery', brand: 'Deye', model: `B${kwh}`,
    full_description: 'بطارية', watt_or_capacity: kwh, price, ...(ip == null ? {} : { ip_rating: ip }),
  });
  const F = { factors: { economy: 0.9, standard: 0.85, premium: 1.25 } };

  it('IP مختلف ← يقرر الدرجة', () => {
    const t = calc.selectBatteryTiers([bat(1, 16, 3000000, 54), bat(2, 16, 2000000, 65)], 10, 8, S, F);
    expect(t.economy.material.ip_rating).toBe(54);
    expect(t.premium.material.ip_rating).toBe(65);
  });

  it('بلا اختلاف IP: السعة ما تصير سلّماً — الاقتصادي ما يطلع أغلى', () => {
    // 1×16kWh بمليونين مقابل 2×8kWh بـ2.4 مليون — لازم ياخذ الوحدة الكبيرة
    const t = calc.selectBatteryTiers([bat(1, 16, 2000000), bat(2, 8, 1200000)], 5, 8, S, F);
    expect(t.economy.material.id).toBe(1);
    expect(t.economy.units).toBe(1);
  });
});

describe('الألواح: الواطية هي المواصفة', () => {
  const S = { chargePanelsPerBattery: 1.5 };
  const panel = (id, w, price) => ({ id, category: 'panel', model: `P${w}`, watt_or_capacity: w, price });

  it('الاقتصادي أدنى واطية والممتاز أعلاها', () => {
    const t = calc.selectPanelTiers([panel(1, 550, 165000), panel(2, 620, 175000), panel(3, 700, 230000)], 15, 2, S, 'economy');
    expect(t.economy.material.watt_or_capacity).toBe(550);
    expect(t.premium.material.watt_or_capacity).toBe(700);
  });
});

describe('الـIP موصول بكل المسارات', () => {
  it('ينخزن بـapp_config وينلحق بكل المواد', () => {
    expect(dataApi).toContain('async function saveIpRating');
    expect(dataApi).toContain('async function withIpRating');
    expect(dataApi).toContain('withActive(await withIpRating(await withIntegratedKw(data || [])))');
  });
  it('ما ينرسل عمود ip_rating للقاعدة — ماكو عمود إله', () => {
    // حمولة القاعدة تعدّد الأعمدة صراحةً، والاستيراد يفصله قبل الإدخال
    expect(dataApi).toContain('const { ip_rating: importedIp, ...m } = normalized;');
    const payload = dataApi.slice(dataApi.indexOf('function materialPayload'));
    expect(payload.slice(0, payload.indexOf('\n}'))).not.toContain('ip_rating');
  });
  it('حقل بنافذة المخزون مثل القدرة', () => {
    expect(form).toContain('درجة الحماية IP');
    expect(form).toContain("set('ip_rating', e.target.value)");
    expect(form).toContain('parseIp(form.ip_rating) == null');
  });
  it('عمود بالإكسل وبالقالب', () => {
    expect(excel).toContain("ip_rating: ['درجة الحماية'");
    expect(excel).toContain("'درجة الحماية', 'السعر'");
    expect(excel).toContain("ip_rating: parseIp(get('ip_rating'))");
  });
  it('مفتاح داخلي — ما ينسجل كتعديل إعداد مشترك', () => {
    expect(dataApi).toContain('isIpKey(key)');
  });
});

describe('الخصم لحساب بكر', () => {
  it('بكر والمشرفون', () => {
    expect(canDiscount('بكر')).toBe(true);
    expect(canDiscount(' بكر ')).toBe(true);
    expect(canDiscount('أحمد')).toBe(true);
    expect(canDiscount('احمد')).toBe(true);
  });
  it('المشرفات الأخريات عندهن الصلاحية أصلاً', () => {
    // حوراء وحيدر مشرفان (ADMIN_USERS) — الخصم عندهم من الأول
    for (const u of ['حوراء', 'حيدر']) expect(canDiscount(u), u).toBe(true);
  });
  it('الحسابات المقيّدة لا', () => {
    for (const u of ['علي سبتي', 'ليث كرادة', '']) {
      expect(canDiscount(u), u || '(فارغ)').toBe(false);
    }
  });
  it('الشاشة تعتمد الصلاحية مو الإشراف', () => {
    expect(builder).toContain('setMayDiscount(canDiscount(n))');
    expect(builder).toContain('discountPercent: mayDiscount ? Number(discountPercent) || 0 : 0,');
    expect(builder).toContain('{(isAdmin || mayDiscount) && (');
  });
  it('الزيادة تبقى للمشرفين', () => {
    expect(builder).toContain('markupPercent: isAdmin ? Number(markupPercent) || 0 : 0,');
  });
});
