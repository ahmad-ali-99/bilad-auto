import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as calc from '../src/lib/calc.js';
import {
  parseIp, formatIp, ipOf, hasIp, ipKey, isIpKey, materialIdFromIpKey, IP_MIN, IP_MAX,
} from '../src/lib/materialSpecs.js';
import { canPriceAdjust } from '../src/lib/permissions.js';

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

// ═══ الـIP انشال من التقييم ═══════════════════════════════════════════════
// قرار المستخدم: «فقرة التقييم على الايبي الغيها من الأساس كلها بالبرنامج».
// الحقل نفسه باقٍ بالمخزون وبالاستيراد وبوصف العرض — بس ما يقرر مستوى.
describe('درجة الحماية ما تقرر مستوى أبداً', () => {
  const S = { systemVoltage: 220, inverterSafetyFactor: 1.25 };
  const inv = (id, ip, kw, price) => ({
    id, category: 'inverter', brand: 'Deye', model: `D${kw}K`,
    full_description: 'انفيرتر', ip_rating: ip, watt_or_capacity: kw * 1000, price,
  });

  it('**الاقتصادي هو الأرخص** حتى لو IP عالي، والممتاز مو أعلى IP', () => {
    // IP21 غالي (3م) وIP65 رخيص (1م): بالقاعدة القديمة كان IP21 اقتصادياً
    const t = calc.selectInverterTiers([inv(1, 21, 12, 3000000), inv(2, 65, 12, 1000000)], 20, 20, S, 0, 20);
    expect(t.economy.material.price, 'الاقتصادي = الأرخص').toBe(1000000);
    expect(t.economy.material.ip_rating).toBe(65);
  });

  it('وتغيير الـIP وحده ما يغيّر ولا اختيار', () => {
    const mk = (ips) => calc.selectInverterTiers(
      [inv(1, ips[0], 12, 1000000), inv(2, ips[1], 12, 2000000), inv(3, ips[2], 12, 3000000)], 20, 20, S, 0, 20);
    const a = mk([21, 51, 65]);
    const b = mk([65, 21, 51]);       // نفس الأسعار، IP مقلوب
    for (const tier of ['economy', 'standard', 'premium'])
      expect(a[tier].material.id, tier).toBe(b[tier].material.id);
  });

  it('وماكو أثر للـIP بمحرك الحساب أصلاً', () => {
    expect(calcSrc).not.toContain('ipRatingOf');
    expect(calcSrc).not.toContain('ipOf');
    expect(calcSrc).not.toContain('atGrade');
    expect(calcSrc).not.toContain('batterySpecOf');
  });
});

describe('المستويات بالسعر وحده', () => {
  const S = { systemVoltage: 220, inverterSafetyFactor: 1.25 };
  const inv = (id, brand, model, kw, price) => ({
    id, category: 'inverter', brand, model, full_description: 'انفيرتر',
    watt_or_capacity: kw * 1000, price,
  });

  it('الأرخص ← الوسط ← والممتاز هويمايلز', () => {
    const t = calc.selectInverterTiers([
      inv(1, 'Deye', 'D12K', 12, 1000000),
      inv(2, 'Growatt', 'G12K', 12, 2000000),
      inv(3, 'hoymiles', 'HYS-12.0LV', 12, 3000000),
    ], 20, 20, S, 0, 20);
    expect(t.economy.material.price).toBe(1000000);
    expect(t.standard.material.price).toBe(2000000);
    expect(t.premium.material.brand, 'الممتاز هويمايلز').toBe('hoymiles');
  });

  it('**الممتاز هويمايلز حتى لو أرخص واحد بالقائمة**', () => {
    const t = calc.selectInverterTiers([
      inv(1, 'hoymiles', 'HYS-12.0LV', 12, 900000),
      inv(2, 'Deye', 'D12K', 12, 2000000),
      inv(3, 'Growatt', 'G12K', 12, 3000000),
    ], 20, 20, S, 0, 20);
    expect(t.premium.material.brand).toBe('hoymiles');
  });

  it('وينلكط بالموديل بعد — HIS/HYS/HIT بلا اسم الماركة', () => {
    const t = calc.selectInverterTiers([
      inv(1, 'Deye', 'D12K', 12, 1000000),
      inv(2, '', 'HIT-20.0L-G3S', 12, 2500000),
    ], 20, 20, S, 0, 20);
    expect(t.premium.material.model).toBe('HIT-20.0L-G3S');
  });

  it('وبلا هويمايلز بالمخزون ياخذ الأعلى سعراً بلا كسر', () => {
    const t = calc.selectInverterTiers([
      inv(1, 'Deye', 'D12K', 12, 1000000),
      inv(2, 'Growatt', 'G12K', 12, 3000000),
    ], 20, 20, S, 0, 20);
    expect(t.premium).toBeTruthy();
    expect(t.premium.material.brand).toBe('Growatt');
  });

  // **بأي أمبيرية**: كان الممتاز محصوراً بهويمايلز تحت 120 أمبير بس
  it('وهويمايلز تنطبق بالأحجام الكبيرة بعد — ماكو سقف 120 أمبير', () => {
    const t = calc.selectInverterTiers([
      inv(1, 'Deye', 'D50K', 50, 6000000),
      inv(2, 'hoymiles', 'HIT-50.0L', 50, 9000000),
    ], 150, 150, S, 0, 150);
    expect(t.premium.material.brand).toBe('hoymiles');
    expect(calcSrc).not.toContain('HOYMILES_MAX_AMPS');
  });
});

describe('التحجيم بالكيلوواطية اللي يحتاجها الزبون بس', () => {
  const S = { systemVoltage: 220, inverterSafetyFactor: 1.25 };
  const inv = (id, brand, kw, price) => ({
    id, category: 'inverter', brand, model: `${brand}${kw}`, full_description: 'انفيرتر',
    watt_or_capacity: kw * 1000, price,
  });

  it('الممتاز ما يكبّر الجهاز: الأصغر اللي يكفي من هويمايلز', () => {
    // 20 أمبير × 220 × 1.25 = 5.5kW — 6kW تكفي بوحدة وحدة
    const t = calc.selectInverterTiers([
      inv(1, 'hoymiles', 6, 2000000),
      inv(2, 'hoymiles', 12, 2600000),
      inv(3, 'hoymiles', 20, 3600000),
    ], 20, 20, S, 0, 20);
    expect(t.premium.material.watt_or_capacity).toBe(6000);
    expect(t.premium.units).toBe(1);
  });

  it('وماكو هامش 1.3 ولا زيادة ألواح للممتاز', () => {
    expect(calcSrc).not.toContain('PREMIUM_INVERTER_HEADROOM');
    expect(calcSrc).not.toContain('PREMIUM_CHARGE_PANEL_FACTOR');
  });

  it('وألواح الممتاز نفس عدد ألواح الاقتصادي — التحجيم واحد', () => {
    const panel = (id, w, price) => ({ id, category: 'panel', model: `P${w}`, watt_or_capacity: w, price });
    const PS = { systemVoltage: 220, systemEfficiency: 0.8, panelAreaM2: 2.7, panelSafetyFactor: 1.25 };
    const eco = calc.selectPanelTiers([panel(1, 550, 165000)], 15, 2, PS, 'economy');
    const pre = calc.selectPanelTiers([panel(1, 550, 165000)], 15, 2, PS, 'premium');
    expect(pre.premium.units).toBe(eco.economy.units);
  });
});

describe('الألواح بالسعر بعد — مو بالواطية', () => {
  const S = { systemVoltage: 220, systemEfficiency: 0.8, panelAreaM2: 2.7, panelSafetyFactor: 1.25 };
  const panel = (id, w, price) => ({ id, category: 'panel', model: `P${w}`, watt_or_capacity: w, price });

  it('الاقتصادي أرخص مجموعاً والممتاز أغلاه', () => {
    const t = calc.selectPanelTiers([panel(1, 550, 165000), panel(2, 620, 175000), panel(3, 700, 230000)], 15, 2, S, 'economy');
    expect(t.economy.totalPrice).toBeLessThanOrEqual(t.standard.totalPrice);
    expect(t.premium.totalPrice).toBeGreaterThanOrEqual(t.standard.totalPrice);
  });

  it('**لوح واطيته أعلى بس مجموعه أرخص يطلع اقتصادياً** — العبرة بالسعر', () => {
    const t = calc.selectPanelTiers([panel(1, 550, 400000), panel(2, 700, 150000)], 15, 2, S, 'economy');
    expect(t.economy.material.watt_or_capacity).toBe(700);
  });
});

describe('الـIP موصول بكل المسارات', () => {
  it('ينخزن بـapp_config وينلحق بكل المواد', () => {
    expect(dataApi).toContain('async function saveIpRating');
    expect(dataApi).toContain('async function withIpRating');
    expect(dataApi).toContain('withActive(await withIpRating(await withIntegratedKw(await withPrivateInventory(data || []))))');
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

describe('الزيادة والخصم لحساب بكر', () => {
  it('بكر والمشرفون', () => {
    expect(canPriceAdjust('بكر')).toBe(true);
    expect(canPriceAdjust(' بكر ')).toBe(true);
    expect(canPriceAdjust('أحمد')).toBe(true);
    expect(canPriceAdjust('احمد')).toBe(true);
  });
  it('المشرفات الأخريات عندهن الصلاحية أصلاً', () => {
    // حوراء وحيدر مشرفان (ADMIN_USERS) — الخصم عندهم من الأول
    for (const u of ['حوراء', 'حيدر']) expect(canPriceAdjust(u), u).toBe(true);
  });
  it('الحسابات المقيّدة لا', () => {
    for (const u of ['علي سبتي', 'ليث كرادة', '']) {
      expect(canPriceAdjust(u), u || '(فارغ)').toBe(false);
    }
  });
  it('الشاشة تعتمد الصلاحية مو الإشراف', () => {
    expect(builder).toContain('setMayPriceAdjust(canPriceAdjust(n))');
    expect(builder).toContain('discountPercent: mayPriceAdjust ? Number(discountPercent) || 0 : 0,');
    expect(builder).toContain('{mayPriceAdjust && (');
  });
  it('الزيادة هي هم بنفس الصلاحية مو بالإشراف', () => {
    expect(builder).toContain('markupPercent: mayPriceAdjust ? Number(markupPercent) || 0 : 0,');
    expect(builder).not.toContain('markupPercent: isAdmin ?');
  });
  it('طريقة الزيادة (علنية/موزعة) متاحة إله هم', () => {
    const block = builder.slice(builder.indexOf('{mayPriceAdjust && ('));
    expect(block.slice(0, block.indexOf('opt-group-title">التقسيط'))).toContain('موزعة على الأسعار');
  });
});
