import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, '..', p), 'utf8');
const styles = read('src/styles.css');
const main = read('src/main.jsx');

describe('ماكو ملف تنسيقات يتيم', () => {
  // index.css ما كان مستورداً بأي مكان، فكل ما انكتب بيه ما وصل للبناء
  // أصلاً: صندوق «مبلغ الوصول» وأزرار تنبيه المصرف ومربع اختيار المصرف
  // كانت تشتغل وظيفياً وتطلع بلا تنسيق
  const cssFiles = fs.readdirSync(path.join(HERE, '../src')).filter((f) => f.endsWith('.css'));

  it('كل ملف css بـsrc إما مستورد أو فارغ', () => {
    const imported = new Set(
      [...main.matchAll(/import\s+'\.\/([\w.-]+\.css)'/g)].map((m) => m[1]),
    );
    for (const f of cssFiles) {
      const body = read(`src/${f}`).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (!body) continue;
      expect(imported.has(f), `${f} فيه قواعد بس مو مستورد — القواعد ما توصل للبناء`).toBe(true);
    }
  });

  it('أنماط الميزات الجديدة موجودة بالملف المستورد', () => {
    for (const cls of ['.target-note', '.target-row', '.bank-pick', '.bank-choices', '.staff-manager'])
      expect(styles, cls).toContain(cls);
  });
});

describe('كثافة الواجهة', () => {
  it('الفاصل بين مجموعات الخيارات أكبر من حشوتها — وإلا تنقرا كتلة وحدة', () => {
    const block = styles.slice(styles.indexOf('.opt-group {'), styles.indexOf('.opt-group-title'));
    const margin = Number(/margin-top: (\d+)px/.exec(block)?.[1]);
    const pad = Number(/padding: (\d+)px/.exec(block)?.[1]);
    expect(margin).toBeGreaterThan(pad);
  });

  it('عنوان المجموعة مفصول عن محتواها بخط', () => {
    const t = styles.slice(styles.indexOf('.opt-group-title {'), styles.indexOf('.opt-group .field'));
    expect(t).toMatch(/border-bottom/);
  });

  it('المسافة بين عنوان الحقل وخانته ما عادت ٤ بكسل', () => {
    const f = /\.field \{ display: flex; flex-direction: column; gap: (\d+)px/.exec(styles);
    expect(Number(f[1])).toBeGreaterThanOrEqual(6);
  });

  it('خانات الجوال بهدف لمس معقول — الحشوة مرفوعة مع الخط', () => {
    const phone = styles.slice(styles.indexOf('@media (max-width: 700px)'));
    expect(phone).toMatch(/input\[type=text\][^{]*\{\s*padding: 11px 12px !important/);
  });

  it('حشوة الجوال بالبطاقة والمحتوى مرفوعة عن ١٠/١٢', () => {
    const phone = styles.slice(styles.indexOf('@media (max-width: 700px)'));
    expect(phone).toMatch(/\.card \{ padding: 16px !important/);
    expect(phone).toMatch(/\.mobile-content \{ padding: 14px 14px 10px !important/);
  });
});

describe('كل خانة نصية إلها type صريح', () => {
  // القاعدة الأساسية تستهدف input[type=text|number|tel] — و<input> بلا type
  // ما يطابقها فيطلع بمظهر المتصفح الخام (ارتفاع ٢٢ بكسل بلا حشوة)
  const jsx = ['src/components/StaffManager.jsx', 'src/pages/Login.jsx', 'src/pages/QuoteBuilder.jsx'];
  for (const f of jsx) {
    it(f.split('/').pop(), () => {
      const bare = [...read(f).matchAll(/<input(?![^>]*\btype=)[^>]*>/g)].map((m) => m[0].slice(0, 60));
      expect(bare, 'خانات بلا type').toEqual([]);
    });
  }
});
