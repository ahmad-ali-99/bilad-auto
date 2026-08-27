import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const inventory = fs.readFileSync(path.join(HERE, '../src/pages/Inventory.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(HERE, '../src/styles.css'), 'utf8');


// جسم بطاقة المادة — شكل الموبايل
const card = inventory.slice(inventory.indexOf('function MaterialCard('), inventory.indexOf('export default function Inventory'));

// البطاقات صارت المسار الوحيد بكل المقاسات — الجدول انشال، فما عاد أكو
// فرع موبايل يتفحّص. اللي يبقى مهماً: البطاقة تحمل كل شي، وتعيد استعمال
// منطق الصفحة نفسه، وأهداف اللمس تبقى بحجم الإصبع.
describe('المخزون: بطاقة المادة تحمل كل شي كان برّا الشاشة بالجدول', () => {
  it('البطاقة تحمل السعر وأزرار التعديل والحذف والتأشير — كلها كانت برّا الشاشة بالجدول', () => {
    expect(card).toMatch(/inv-card-price/);
    expect(card).toMatch(/Number\(m\.price\)\.toLocaleString/);
    expect(card, 'زر تعديل').toMatch(/onEdit\(m\)/);
    expect(card, 'زر حذف').toMatch(/onDelete\(m\.id\)/);
    expect(card, 'جيك بوكس بالعروض').toMatch(/type="checkbox"[\s\S]{0,200}onToggle\(m\)/);
  });

  it('بلا صندوق تمرير داخلي — الصفحة تتمرر عادي فتوصل لآخر مادة', () => {
    expect(inventory).not.toMatch(/table-scroll/);
    expect(inventory).toMatch(/inv-cards/);
  });

  it('البطاقات تعيد استعمال منطق الصفحة نفسه — ماكو نسخة ثانية من الفلترة أو الحفظ', () => {
    const list = inventory.slice(inventory.indexOf('className="inv-cards"'));
    expect(list).toMatch(/filtered\.map/);
    expect(list).toMatch(/onToggle=\{toggleActive\}/);
    expect(list).toMatch(/onEdit=\{openEditForm\}/);
    expect(list).toMatch(/onDelete=\{handleDelete\}/);
  });

  it('أهداف اللمس بالبطاقة ٤٠ بكسل على الأقل', () => {
    const block = styles.slice(styles.indexOf('.inv-cards {'), styles.indexOf('/* لمسات موبايل جدية */'));
    expect(block).toMatch(/\.inv-card-check \{[\s\S]*height: 40px/);
    expect(block).toMatch(/\.inv-card-btns \.btn \{ min-height: 40px/);
  });
});
