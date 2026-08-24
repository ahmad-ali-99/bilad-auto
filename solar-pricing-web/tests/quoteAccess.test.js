import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canAccessQuote, visibleQuotes, ownsQuote, canAttributeQuote, ownerOf } from '../src/lib/quoteAccess.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dataApi = fs.readFileSync(path.join(HERE, '../src/lib/dataApi.js'), 'utf8');
// أسماء مثل remove/get مكررة بأقسام ثانية (المواد، الطلبات) — نقص قسم العروض وحده
const quotesSection = dataApi.slice(dataApi.indexOf('\n  quotes: {'), dataApi.indexOf('\n  config: {'));

const ahmad = { username: 'أحمد', email: 'a@biladauto.local' };   // إدارة
const hawraa = { username: 'حوراء', email: 'h@biladauto.local' }; // إدارة
const bakr = { username: 'بكر', email: 'b@biladauto.local' };     // حساب ثانوي
const laith = { username: 'ليث كرادة', email: 'l@biladauto.local' };

const q = (created_by) => ({ id: 1, created_by });

describe('ملكية العروض — منو يشوف ومنو يعدّل', () => {
  it('الحساب الثانوي يملك العروض اللي سواها بنفسه', () => {
    expect(canAccessQuote(bakr, q('بكر'))).toBe(true);
    expect(ownerOf(q('بكر'))).toBe('بكر');
  });

  it('الحساب الثانوي ما يوصل لعروض حساب ثاني', () => {
    expect(canAccessQuote(bakr, q('ليث كرادة'))).toBe(false);
    expect(canAccessQuote(bakr, q('أحمد'))).toBe(false);
  });

  it('العرض اللي تسنده الإدارة لحساب يروح له فعلاً — يشوفه ويعدّله', () => {
    // أحمد سوّى العرض واختار «العرض من طرف: بكر»
    const assigned = q('بكر');
    expect(canAccessQuote(bakr, assigned)).toBe(true);
    // ويبقى مفتوحاً لحساب المدير معه
    expect(canAccessQuote(ahmad, assigned)).toBe(true);
  });

  it('حسابات الإدارة كلها توصل لكل العروض', () => {
    for (const admin of [ahmad, hawraa]) {
      expect(canAccessQuote(admin, q('بكر'))).toBe(true);
      expect(canAccessQuote(admin, q('ليث كرادة'))).toBe(true);
      expect(canAccessQuote(admin, q('حوراء'))).toBe(true);
    }
  });

  it('عروض الحسابات الثانوية تطلع للإدارة مثل ما تطلع لأصحابها', () => {
    const rows = [q('بكر'), q('ليث كرادة'), q('أحمد')];
    expect(visibleQuotes(ahmad, rows)).toHaveLength(3);
    expect(visibleQuotes(bakr, rows).map(ownerOf)).toEqual(['بكر']);
    expect(visibleQuotes(laith, rows).map(ownerOf)).toEqual(['ليث كرادة']);
  });

  it('المطابقة متسامحة مع الهمزة والمسافات المكررة', () => {
    expect(ownsQuote({ username: 'احمد' }, q('أحمد'))).toBe(true);
    expect(ownsQuote({ username: 'ليث  كرادة' }, q('ليث كرادة'))).toBe(true);
  });

  it('العروض القديمة المحفوظة بالإيميل تبقى لصاحبها', () => {
    expect(canAccessQuote(bakr, q('b@biladauto.local'))).toBe(true);
    expect(canAccessQuote(laith, q('b@biladauto.local'))).toBe(false);
  });

  it('عرض بلا مالك ما ينفتح لحساب ثانوي — وتبقى الإدارة توصله', () => {
    expect(canAccessQuote(bakr, q(null))).toBe(false);
    expect(canAccessQuote(ahmad, q(null))).toBe(true);
  });

  it('الإسناد لحساب ثاني صلاحية إدارية — مو لكل حساب', () => {
    expect(canAttributeQuote('أحمد')).toBe(true);
    expect(canAttributeQuote('حوراء')).toBe(true);
    expect(canAttributeQuote('حيدر')).toBe(true);
    expect(canAttributeQuote('بكر')).toBe(false);
    expect(canAttributeQuote('')).toBe(false);
  });
});

// الفلترة بالقائمة تخفي بس. لو نقطة الوصول بالمعرّف بقت مفتوحة، أي حساب يوصل
// لأي عرض إذا عرف رقمه (رابط، أو أداة المساعد) — فالحارس لازم يكون بـdataApi.
describe('الحارس عند نقطة الوصول مو بالواجهة', () => {
  const guarded = ['get', 'update', 'remove', 'restore', 'exportPdf', 'setAttachment', 'removeAttachment', 'setStatus'];
  for (const fn of guarded) {
    it(`${fn}() تمر بـassertQuoteAccess قبل أي قراءة أو كتابة`, () => {
      const at = quotesSection.indexOf(`    async ${fn}(`);
      expect(at, `ما لقيت الدالة ${fn}`).toBeGreaterThan(-1);
      const body = quotesSection.slice(at, at + 900);
      const guard = body.indexOf('assertQuoteAccess');
      expect(guard, `${fn}() بلا حارس`).toBeGreaterThan(-1);
      // الحارس أول شي: قبل أي نداء على supabase
      const firstDb = body.indexOf('supabase.from');
      expect(guard).toBeLessThan(firstDb === -1 ? Infinity : firstDb);
    });
  }

  it('assertQuoteAccess ترمي رسالة واضحة وما تكتفي بإرجاع false', () => {
    expect(dataApi).toContain('async function assertQuoteAccess');
    expect(dataApi).toContain('throw new Error(accessDeniedMessage(what))');
    expect(dataApi).toContain("throw new Error('العرض غير موجود')");
  });

  it('إسناد العرض لحساب ثاني ينمنع بالقاعدة لا بإخفاء القائمة', () => {
    expect(dataApi).toContain('async function attributedCreator');
    expect(dataApi).toContain("throw new Error('إسناد العرض لحساب ثاني محصور بحسابات الإدارة')");
    // ولا موضع يكتب created_by من المدخل رأساً بلا حارس
    expect(dataApi).not.toMatch(/created_by: input\.createdBy/);
    expect(dataApi).not.toMatch(/\{ created_by: input\.createdBy \}/);
  });

  it('تفريغ سلة المحذوفات يمس عروض الفريق — فالصلاحية إدارية بالقاعدة', () => {
    const at = quotesSection.indexOf('    async purgeDeleted(');
    const body = quotesSection.slice(at, at + 500);
    expect(body).toContain("throw new Error('تفريغ سلة المحذوفات محصور بحسابات الإدارة')");
  });

  it('قائمة الأسماء ما تنعرض لغير الإدارة', () => {
    const at = quotesSection.indexOf('    async creators(');
    const body = quotesSection.slice(at, at + 400);
    expect(body).toContain('canAttributeQuote');
    expect(body).toContain('return [];');
  });

  it('القائمة والسلة تمران بوحدة الملكية الواحدة', () => {
    expect(dataApi).toContain('return visibleQuotes(await currentIdentity(), rows)');
    expect(dataApi).not.toContain('canViewQuotes');
  });
});

describe('توحيد التاء المربوطة بملكية العروض', () => {
  it('صاحب العرض يفتح عرضه مهما انكتب اسمه بالتاء أو الهاء', () => {
    const q = { id: 1, created_by: 'حسين انوار المدينة' };
    expect(canAccessQuote({ username: 'حسين انوار المدينه' }, q)).toBe(true);
    expect(canAccessQuote({ username: 'حسين انوار المدينة' }, q)).toBe(true);
  });

  it('وما ينفتح لاسم ثاني', () => {
    const q = { id: 1, created_by: 'حسين انوار المدينة' };
    expect(canAccessQuote({ username: 'براء' }, q)).toBe(false);
  });
});
