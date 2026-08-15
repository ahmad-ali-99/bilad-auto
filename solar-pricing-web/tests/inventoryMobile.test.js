import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const inventory = fs.readFileSync(path.join(HERE, '../src/pages/Inventory.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(HERE, '../src/styles.css'), 'utf8');
const hook = fs.readFileSync(path.join(HERE, '../src/lib/useMediaQuery.js'), 'utf8');

// جسم بطاقة المادة — شكل الموبايل
const card = inventory.slice(inventory.indexOf('function MaterialCard('), inventory.indexOf('export default function Inventory'));

describe('المخزون بالموبايل: بطاقات مو جدول بثمانية أعمدة', () => {
  it('البطاقة تحمل السعر وأزرار التعديل والحذف والتأشير — كلها كانت برّا الشاشة بالجدول', () => {
    expect(card).toMatch(/inv-card-price/);
    expect(card).toMatch(/Number\(m\.price\)\.toLocaleString/);
    expect(card, 'زر تعديل').toMatch(/onEdit\(m\)/);
    expect(card, 'زر حذف').toMatch(/onDelete\(m\.id\)/);
    expect(card, 'جيك بوكس بالعروض').toMatch(/type="checkbox"[\s\S]{0,200}onToggle\(m\)/);
  });

  it('مسار الموبايل بلا صندوق تمرير داخلي — الصفحة تتمرر عادي فتوصل لآخر مادة', () => {
    const branch = inventory.slice(inventory.indexOf('{isPhone ? ('), inventory.indexOf('<div className="table-scroll">'));
    expect(branch).toMatch(/inv-cards/);
    expect(branch, 'ماكو table-scroll بمسار الموبايل').not.toMatch(/table-scroll/);
    // الجدول باقٍ للكومبيوتر
    expect(inventory).toMatch(/<div className="table-scroll">/);
  });

  it('البطاقات تعيد استعمال منطق الصفحة نفسه — ماكو نسخة ثانية من الفلترة أو الحفظ', () => {
    const branch = inventory.slice(inventory.indexOf('{isPhone ? ('), inventory.indexOf('<div className="table-scroll">'));
    expect(branch).toMatch(/filtered\.map/);
    expect(branch).toMatch(/onToggle=\{toggleActive\}/);
    expect(branch).toMatch(/onEdit=\{openEditForm\}/);
    expect(branch).toMatch(/onDelete=\{handleDelete\}/);
  });

  it('حدّ الموبايل مصدر واحد يطابق الـmedia queries بالتنسيقات', () => {
    expect(hook).toMatch(/export const PHONE = '\(max-width: 700px\)'/);
    expect(inventory).toMatch(/useMediaQuery\(PHONE\)/);
    expect(styles).toMatch(/@media \(max-width: 700px\)/);
  });

  it('أهداف اللمس بالبطاقة ٤٠ بكسل على الأقل', () => {
    const block = styles.slice(styles.indexOf('.inv-cards {'), styles.indexOf('/* لمسات موبايل جدية */'));
    expect(block).toMatch(/\.inv-card-check \{[\s\S]*height: 40px/);
    expect(block).toMatch(/\.inv-card-btns \.btn \{ min-height: 40px/);
  });
});
