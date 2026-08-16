import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, '..', p), 'utf8');

const modal = read('src/components/ImportPreviewModal.jsx');
const dataApi = read('src/lib/dataApi.js');
const saveErrors = read('src/lib/saveErrors.js');
const materialModal = read('src/components/MaterialFormModal.jsx');

// جسم importRows
const importRows = dataApi.slice(dataApi.indexOf('async importRows('), dataApi.indexOf('async downloadTemplate('));

describe('استيراد الإكسل: الفشل يظهر للبياع ما يروح صامتاً', () => {
  it('handleImport عليه catch يعرض الخطأ — مو try/finally يبلعه', () => {
    const fn = modal.slice(modal.indexOf('async function handleImport()'));
    const body = fn.slice(0, fn.indexOf('\n  }'));
    expect(body, 'ماكو catch — الخطأ راح يروح للكونسول بس').toMatch(/\}\s*catch\s*\(/);
    expect(body).toMatch(/setImportError\(humanizeSaveError\(/);
  });

  it('رسالة الخطأ تنعرض فعلاً بالنافذة', () => {
    expect(modal).toMatch(/\{importError && \(/);
    expect(modal).toMatch(/ما انحفظ الاستيراد/);
  });

  it('صف يفشل ما يوقف باقي الصفوف — الأسباب تنجمع وترجع', () => {
    expect(importRows).toMatch(/const failed = \[\]/);
    // الحفظ داخل try/catch جوّا الحلقة
    expect(importRows).toMatch(/for \(const raw of materials\)[\s\S]*?try \{[\s\S]*?\} catch \(err\) \{[\s\S]*?failed\.push/);
    expect(importRows).toMatch(/return \{ added, updated, laborAdded, laborUpdated, failed \}/);
  });

  it('شاشة النتيجة تكول «فشلت» إذا اكو صفوف ما انحفظت — مو «تم بنجاح» وهي ناقصة', () => {
    expect(modal).toMatch(/result\.failed && result\.failed\.length > 0 \?/);
    expect(modal).toMatch(/ما انحفظت \{result\.failed\.length\} مادة/);
  });

  it('ترجمة أخطاء القاعدة مشتركة بين نافذة المادة ونافذة الاستيراد', () => {
    expect(saveErrors).toMatch(/export function humanizeSaveError/);
    for (const [f, src] of [['ImportPreviewModal', modal], ['MaterialFormModal', materialModal]]) {
      expect(src, `${f} لازم يستورد الدالة المشتركة`).toMatch(/import \{ humanizeSaveError \} from '\.\.\/lib\/saveErrors\.js'/);
      expect(src, `${f}: ماكو نسخة محلية ثانية من الدالة`).not.toMatch(/function humanizeSaveError/);
    }
    // الحالات اللي لازم تنترجم
    for (const k of ['row-level security', 'check constraint', 'failed to fetch']) {
      expect(saveErrors.toLowerCase()).toContain(k);
    }
  });
});
