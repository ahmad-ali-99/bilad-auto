import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, '..', p), 'utf8');
const styles = read('src/styles.css');
const app = read('src/App.jsx');

const blockOf = (sel, from = 0) => {
  const i = styles.indexOf(`${sel} {`, from);
  return i < 0 ? '' : styles.slice(i, styles.indexOf('}', i));
};

// «اكو واجهات محتوى فوق محتوى ثاني» — الأشرطة الثابتة كانت تنطبع فوق النص
describe('ماكو محتوى فوق محتوى', () => {
  it('شريط الإجراءات خلفيته صلبة — الشفافية كانت تخلي النص يبان من تحته', () => {
    const bar = blockOf('.action-bar');
    expect(bar).toMatch(/background: #fff/);
    expect(bar, 'أي شفافية ترجّع تداخل النص').not.toMatch(/rgba\(255, 255, 255, 0\.\d+\)/);
  });

  it('أزرار شريط التنقل تنكمش — بلا min-width:0 يطفح الشريط برّا الشاشة', () => {
    const btn = blockOf('.mobile-bottomnav button');
    expect(btn).toMatch(/min-width: 0/);
    expect(btn).toMatch(/flex: 1/);
  });

  it('تسمية التبويب ما تكسر سطرين ولا تمدّ الزر', () => {
    const label = blockOf('.mobile-bottomnav button > span:last-child');
    expect(label).toMatch(/white-space: nowrap/);
    expect(label).toMatch(/overflow: hidden/);
    expect(label).toMatch(/text-overflow: ellipsis/);
  });

  // ترتيب الكاسكيد: قاعدة 700px تجي قبل قواعد الشاشات الأضيق وإلا تتقدّم عليها
  it('قواعد الشاشات الضيقة بعد قاعدة 700px بالملف', () => {
    const wide = styles.indexOf('@media (max-width: 700px)');
    const narrow = styles.indexOf('@media (max-width: 480px)');
    const tiny = styles.indexOf('@media (max-width: 380px)');
    expect(wide).toBeGreaterThan(-1);
    expect(narrow, 'قاعدة 480px لازم بعد 700px').toBeGreaterThan(wide);
    expect(tiny, 'قاعدة 380px لازم بعد 480px').toBeGreaterThan(narrow);
  });

  // ثمانية تبويبات بحساب أحمد: عرض + العروض + طلبات + مخزون + إعدادات + باقات + حركات + مساعد
  it('تسميات التبويبات قصيرة — الطويلة كانت تنقصّ بالتلفون', () => {
    const labels = [...app.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThanOrEqual(6);
    for (const l of labels) {
      expect(l.length, `«${l}» طويلة على شريط التنقل`).toBeLessThanOrEqual(8);
    }
  });
});

// وضع «نهارية بلا بطاريات» كان يرسم حقل «أمبير مطلوب نهاراً» مرتين (كتلتان
// شرطاهما يتحققان سوية) — حقلان بنفس الاسم مربوطان بنفس الحالة.
describe('حقول متطلبات المنظومة ما تتكرر', () => {
  const src = fs.readFileSync(path.join(HERE, '../src/pages/QuoteBuilder.jsx'), 'utf8');
  it('حقل أمبير النهار مرسوم مرة وحدة بس', () => {
    const hits = [...src.matchAll(/<label>أمبير مطلوب نهاراً<\/label>/g)];
    expect(hits.length, 'حقل أمبير النهار متكرر بالواجهة').toBe(1);
  });
  it('وشرطه واحد: يظهر بكل نوع عدا الأوف جرد', () => {
    expect(src).not.toContain('{isDayOnly && (\n            <div className={fieldClass(\'ampDay\')}>');
  });
});

// واجهة البراند كانت تاخذ ثلث الشاشة (چيبات عمودية بارتفاع كبير × ثلاثة أقسام).
// التصميم المضغوط: كل قسم سطر واحد — عنوان جنبه صف يتمرّر أفقياً.
describe('كتلة البراند مضغوطة', () => {
  it('القسم شبكة سطر واحد: عنوان + صف', () => {
    const sec = blockOf('.brand-section');
    expect(sec).toMatch(/display:\s*grid/);
    expect(sec).toMatch(/grid-template-columns:\s*88px/);
    expect(sec).toMatch(/align-items:\s*center/);
  });
  it('الچيب أفقي مو عمودي', () => {
    const chip = blockOf('.brand-chip');
    expect(chip).toMatch(/flex-direction:\s*row/);
    expect(chip).not.toMatch(/min-width:\s*92px/);
  });
  it('بالتلفون العنوان يطلع فوق الصف بدل ما ينضغط', () => {
    expect(styles).toMatch(/@media \(max-width: 560px\) \{\s*\.brand-section \{ grid-template-columns: 1fr;/);
  });
  it('الصف يتمرّر أفقياً — ما يكسر الشاشة', () => {
    expect(blockOf('.brand-row')).toMatch(/overflow-x:\s*auto/);
  });
});
