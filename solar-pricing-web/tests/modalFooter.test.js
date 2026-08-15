import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, '..', p), 'utf8');

const styles = read('src/styles.css');
const portal = read('src/components/ModalPortal.jsx');
const MODALS = [
  'src/components/SecondaryPickerModal.jsx',
  'src/components/MaterialFormModal.jsx',
  'src/components/ImportPreviewModal.jsx',
];

describe('أزرار الحفظ بالنوافذ المنبثقة تبقى ظاهرة بالموبايل', () => {
  it('كل نافذة تنرسم على body — الأب بـoverflow كان يحصر الغطاء ويخلي شريط التنقل فوقه', () => {
    expect(portal).toMatch(/createPortal\(children, document\.body\)/);
    for (const f of MODALS) {
      const src = read(f);
      expect(src, `${f}: لازم يستورد ModalPortal`).toMatch(/import ModalPortal from '\.\/ModalPortal\.jsx'/);
      // كل غطاء ملفوف — عدد <ModalPortal> = عدد modal-overlay
      const overlays = (src.match(/className="modal-overlay"/g) || []).length;
      const opens = (src.match(/<ModalPortal>/g) || []).length;
      const closes = (src.match(/<\/ModalPortal>/g) || []).length;
      expect(overlays, `${f}: ماكو غطاء`).toBeGreaterThan(0);
      expect(opens, `${f}: ${overlays} غطاء مقابل ${opens} بورتال`).toBe(overlays);
      expect(closes, `${f}: بورتال مفتوح بلا إغلاق`).toBe(opens);
    }
  });

  it('صف الأزرار بكل نافذة عليه modal-footer', () => {
    for (const f of MODALS) {
      expect(read(f), `${f}: صف الأزرار بلا modal-footer`).toMatch(/className="toolbar modal-footer"/);
    }
  });

  it('modal-footer ملتصق بأسفل النافذة', () => {
    const block = styles.slice(styles.indexOf('.modal-footer {'));
    const body = block.slice(0, block.indexOf('}'));
    expect(body).toMatch(/position: sticky/);
    expect(body).toMatch(/bottom: 0/);
    expect(body, 'خلفية صلبة حتى ما يشفّ الجدول تحته').toMatch(/background: #fff/);
  });

  it('ارتفاعات النوافذ بـdvh — vh بسفاري الآيفون أكبر من المرئي فينزل أسفلها تحت الحافة', () => {
    expect(styles).toMatch(/\.modal \{[\s\S]*?max-height: 88dvh/);
    expect(styles).toMatch(/\.modal-overlay \{[\s\S]*?height: 100dvh/);
    expect(styles).toMatch(/\.modal-max \{[\s\S]*?max-height: 93dvh/);
    expect(styles, 'نسخة الموبايل هم بـdvh').toMatch(/\.modal, \.modal-wide \{ max-height: 86vh; max-height: 88dvh/);
  });
});
