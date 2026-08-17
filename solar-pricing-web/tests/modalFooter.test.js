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

  // كان `position: sticky` فوق محتوى يتمرّر تحته، فيغطّي حقولاً كاملة أثناء التمرير.
  // صار عموداً مرناً: الجسم يتمرّر بمساحته وصف الأزرار بمساحته — بلا أي تقاطع.
  it('النافذة عمود مرن: جسم يتمرّر وصف أزرار ثابت، بلا تغطية', () => {
    const blockOf = (sel) => {
      const b = styles.slice(styles.indexOf(`${sel} {`));
      return b.slice(0, b.indexOf('}'));
    };
    const modal = blockOf('.modal');
    expect(modal).toMatch(/display: flex/);
    expect(modal).toMatch(/flex-direction: column/);
    expect(modal, 'التمرير بالجسم — النافذة نفسها ما تتمرّر').toMatch(/overflow: hidden/);

    const body = blockOf('.modal-body');
    expect(body).toMatch(/overflow-y: auto/);
    expect(body, 'بلا min-height:0 ما ينكمش العنصر المرن ويطلع الفوتر برّا').toMatch(/min-height: 0/);

    const footer = blockOf('.modal-footer');
    expect(footer).toMatch(/flex: 0 0 auto/);
    expect(footer, 'خلفية صلبة حتى ما يشفّ الجدول تحته').toMatch(/background: #fff/);
    expect(footer, 'ماكو sticky بعد — الفوتر ما يغطي المحتوى').not.toMatch(/position: sticky/);
  });

  it('جسم قابل للتمرير بكل نافذة، والنموذج يورّث العمود المرن', () => {
    for (const f of [...MODALS, 'src/components/PackagesModal.jsx']) {
      const src = read(f);
      const bodies = (src.match(/className="modal-body"/g) || []).length;
      const footers = (src.match(/className="toolbar modal-footer"/g) || []).length;
      expect(bodies, `${f}: كل صف أزرار لازم فوقه جسم يتمرّر`).toBe(footers);
    }
    expect(styles, 'صف الأزرار داخل <form> — بلا هذا ما يتمرّر جسم نموذج المادة')
      .toMatch(/\.modal > form \{[\s\S]*?flex-direction: column/);
  });

  // كان الضغط برّا النافذة يغلقها ويضيّع التعديلات وسط الكتابة
  it('الضغط برّا النافذة ما يغلقها — الإغلاق بالأزرار بس', () => {
    for (const f of [...MODALS, 'src/components/PackagesModal.jsx']) {
      const src = read(f);
      expect(src, `${f}: الغطاء لازم يكون بلا onClick`).not.toMatch(/className="modal-overlay" onClick/);
      expect(src, `${f}: ما عاد يحتاج stopPropagation`).not.toMatch(/stopPropagation/);
      expect(src, `${f}: لازم يبقى زر إغلاق صريح`).toMatch(/إغلاق|إلغاء|>\s*تم\s*</);
    }
  });

  it('ارتفاعات النوافذ بـdvh — vh بسفاري الآيفون أكبر من المرئي فينزل أسفلها تحت الحافة', () => {
    expect(styles).toMatch(/\.modal \{[\s\S]*?max-height: 88dvh/);
    expect(styles).toMatch(/\.modal-overlay \{[\s\S]*?height: 100dvh/);
    expect(styles).toMatch(/\.modal-max \{[\s\S]*?max-height: 93dvh/);
    expect(styles, 'نسخة الموبايل هم بـdvh').toMatch(/\.modal, \.modal-wide \{ max-height: 86vh; max-height: 88dvh/);
  });
});
