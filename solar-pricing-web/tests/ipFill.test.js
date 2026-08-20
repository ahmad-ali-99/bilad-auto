import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasIp, parseIp } from '../src/lib/materialSpecs.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(HERE, '../src/pages/Inventory.jsx'), 'utf8');
const dataApi = fs.readFileSync(path.join(HERE, '../src/lib/dataApi.js'), 'utf8');
const css = fs.readFileSync(path.join(HERE, '../src/styles.css'), 'utf8');

// طلب المستخدم بالحرف: «ابدي و اطلب مني ايبي بالمخزون **للكل**».
// الشارة بكل سطر تبيّن الناقص بس ما تطلب شي — يحتاج يفتّش صف صف وتبويب تبويب.
describe('لوحة إكمال درجات الحماية بالمخزون', () => {
  it('اللوحة موجودة وتنعرض قبل التبويبات', () => {
    expect(page).toContain('function IpFillPanel');
    const panel = page.indexOf('<IpFillPanel');
    const tabs = page.indexOf('<div className="tabs">');
    expect(panel).toBeGreaterThan(-1);
    expect(panel).toBeLessThan(tabs);
  });

  it('تشتغل على كل المخزون مو على التبويب الحالي', () => {
    // list() بلا فئة = كل المواد
    expect(page).toContain('window.api.materials.list().then(setAllMaterials)');
    expect(page).toContain('materials={allMaterials}');
  });

  it('ما تعرض إلا المواد اللي يحق للحساب يعدّلها', () => {
    const fn = page.slice(page.indexOf('function IpFillPanel'));
    expect(fn.slice(0, 1500)).toContain('!hasIp(m) && canEditOne(m)');
    expect(page).toContain('canEditOne={mayEdit}');
  });

  it('تختفي كلياً إذا ماكو ناقص', () => {
    const fn = page.slice(page.indexOf('function IpFillPanel'));
    expect(fn.slice(0, 1500)).toContain('if (!missing.length) return null;');
  });

  it('الفئات اللي تدخل بالمستويات أول، والثانوية آخر شي', () => {
    const groups = page.slice(page.indexOf('const IP_GROUPS'), page.indexOf('const IP_GROUPS') + 400);
    const order = [...groups.matchAll(/key: '(\w+)'/g)].map((m) => m[1]);
    expect(order).toEqual(['inverter', 'battery', 'panel', 'integrated', 'secondary']);
  });

  it('القيمة الغلط توقف الحفظ كله — ما ننحفظ نصّها ونترك الباقي', () => {
    const fn = page.slice(page.indexOf('async function saveAll'));
    const body = fn.slice(0, fn.indexOf('\n  }'));
    const check = body.indexOf('if (bad.length)');
    const loop = body.indexOf('for (const [id, v] of filled)');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(loop);
    expect(body).toContain('IP_RANGE_ERROR');
  });

  it('تقبل كل أشكال الإدخال — 65 و IP65 و ايبي 65', () => {
    for (const v of ['65', 'IP65', 'ip 65', 'ايبي 65']) expect(parseIp(v)).toBe(65);
    expect(parseIp('21')).toBe(21);
    // وبرّا المدى تنرفض بدل ما تنحفظ غلط
    expect(parseIp('999')).toBeNull();
    expect(parseIp('70')).toBeNull();
  });

  it('العدّ بالعربي الصحيح — مو «3 مادة» ولا «1 مادة»', () => {
    const fn = new Function(`${page.slice(page.indexOf('function countMaterials'), page.indexOf('// ترتيب الفئات'))}; return countMaterials;`)();
    expect(fn(1)).toBe('مادة وحدة');
    expect(fn(2)).toBe('مادتين');
    expect(fn(3)).toBe('3 مواد');
    expect(fn(10)).toBe('10 مواد');
    expect(fn(11)).toBe('11 مادة');
  });

  it('setIp تحفظ درجة الحماية وحدها بلا ما تعيد كتابة صف المادة', () => {
    const at = dataApi.indexOf('    async setIp(');
    expect(at).toBeGreaterThan(-1);
    const body = dataApi.slice(at, at + 900);
    expect(body).toContain("assertCanEditMaterial(id, 'درجة الحماية لهذه المادة')");
    expect(body).toContain('saveIpRating(id, { ip_rating: value })');
    // ماكو تحديث لجدول المواد نفسه
    expect(body).not.toContain("from('materials').update");
    // وتنسجل بالحركات مع لقطة استرجاع
    expect(body).toContain('logActivity');
    expect(body).toContain("kind: 'config', key: ipKey(id), before");
  });

  it('المادة اللي عندها IP بوصفها ما تنعد ناقصة', () => {
    expect(hasIp({ ip_rating: 65 })).toBe(true);
    expect(hasIp({ full_description: 'انفيرتر هجين IP65' })).toBe(true);
    expect(hasIp({ full_description: 'انفيرتر هجين 6 كيلو' })).toBe(false);
  });

  it('التلفون: الحقل ينزل بسطر كامل بدل ما ينضغط', () => {
    expect(css).toContain('.ip-fill-row');
    const mq = css.slice(css.indexOf('@media (max-width: 430px)', css.indexOf('.ip-fill')));
    expect(mq.slice(0, 200)).toContain('.ip-fill-row input { width: 100%; }');
  });
});
