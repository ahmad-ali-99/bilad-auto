import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/pages/Inventory.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

describe('المخزون: بطاقات بكل المقاسات', () => {
  it('الجدول انشال كلياً — ماكو مسار ثاني للعرض', () => {
    expect(src).not.toContain('data-table');
    expect(src).not.toContain('table-scroll');
    expect(src).not.toContain('<thead>');
    expect(src).not.toContain('<tbody>');
  });

  it('وانشال معه فحص الجوال — ما عاد أكو شكلان يتفرقان', () => {
    expect(src).not.toContain('isPhone');
    expect(src).not.toContain('useMediaQuery');
  });

  it('البطاقات هي المسار الوحيد', () => {
    expect(src).toContain('className="inv-cards"');
    expect((src.match(/<MaterialCard/g) || []).length).toBe(1);
  });
});

describe('الشبكة تتبع العرض بلا ميديا كويري', () => {
  it('auto-fill مع minmax — عمود بالجوال وأعمدة بالحاسوب', () => {
    expect(css).toMatch(/\.inv-cards \{[\s\S]{0,200}grid-template-columns: repeat\(auto-fill, minmax\(320px, 1fr\)\)/);
  });

  it('وبالجوال عمود واحد صريح', () => {
    expect(css).toMatch(/@media \(max-width: 560px\) \{ \.inv-cards \{ grid-template-columns: 1fr/);
  });
});

describe('كل مادة تبان منفصلة لا صفاً بقائمة', () => {
  it('شريط علوي وظل وحد أوضح', () => {
    expect(css).toMatch(/\.inv-card::before \{[\s\S]{0,220}height: 3px/);
    expect(css).toMatch(/\.inv-card \{[\s\S]{0,400}box-shadow: 0 2px 6px/);
  });

  it('والمخفية يتغيّر لون شريطها فتنميّز بنظرة', () => {
    expect(css).toContain('.inv-card-off::before');
  });
});
