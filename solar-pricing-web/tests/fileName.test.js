import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { quoteFileName } from '../src/lib/pdfExport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe('اسم ملف العرض المُصدَّر', () => {
  it('اسم الزبون + رقم العرض', () => {
    expect(quoteFileName('حسين نعمة', 204)).toBe('حسين نعمة - 204.pdf');
    expect(quoteFileName('حسين نعمة', '204')).toBe('حسين نعمة - 204.pdf');
  });

  it('بلا اسم زبون يرجع لرقم العرض', () => {
    expect(quoteFileName('', 204)).toBe('عرض سعر 204.pdf');
    expect(quoteFileName(null, 204)).toBe('عرض سعر 204.pdf');
    expect(quoteFileName(undefined, 204)).toBe('عرض سعر 204.pdf');
  });

  it('بلا اسم وبلا رقم (معاينة الزبون) يرجع للاسم العام', () => {
    expect(quoteFileName('', null)).toBe('عرض سعر معاينة.pdf');
    expect(quoteFileName('', '—')).toBe('عرض سعر معاينة.pdf');
  });

  it('الزبون (Google) رقمه «—» فما ينضاف للاسم', () => {
    expect(quoteFileName('حسين نعمة', '—')).toBe('حسين نعمة.pdf');
  });

  it('المحارف الممنوعة بنظام الملفات تنشال', () => {
    expect(quoteFileName('حسين/نعمة', 204)).toBe('حسين نعمة - 204.pdf');
    expect(quoteFileName('أبو علي: الرمادي', 12)).toBe('أبو علي الرمادي - 12.pdf');
    expect(quoteFileName('a\\b*c?d"e<f>g|h', 1)).toBe('a b c d e f g h - 1.pdf');
  });

  it('المسافات المتعددة والأطراف تنضبط', () => {
    expect(quoteFileName('   حسين    نعمة   ', 204)).toBe('حسين نعمة - 204.pdf');
  });

  it('النقطة والمسافة بالنهاية تنقص (ويندوز يرفضها)', () => {
    expect(quoteFileName('حسين نعمة...', 204)).toBe('حسين نعمة - 204.pdf');
    expect(quoteFileName('شركة م.م.', 7)).toBe('شركة م.م - 7.pdf');
  });

  it('الاسم الطويل ينقص لحد آمن', () => {
    const out = quoteFileName('أ'.repeat(200), 204);
    expect(out.length).toBeLessThanOrEqual(80 + ' - 204.pdf'.length);
    expect(out.endsWith(' - 204.pdf')).toBe(true);
  });

  it('اسم رموز فقط يعتبر فارغاً', () => {
    expect(quoteFileName('///', 204)).toBe('عرض سعر 204.pdf');
    expect(quoteFileName('   ', 204)).toBe('عرض سعر 204.pdf');
  });

  it('دائماً ينتهي بـ.pdf وما بيه محرف ممنوع', () => {
    for (const n of ['حسين', '', '///', 'a:b', 'أ'.repeat(120)]) {
      const out = quoteFileName(n, 5);
      expect(out.endsWith('.pdf')).toBe(true);
      expect(/[\\/:*?"<>|]/.test(out)).toBe(false);
    }
  });
});

// حارس بنيوي: أي نقطة تصدير جديدة لازم تمرّ بالدالة — نفس صنف الخلل اللي تكرر سابقاً
// (بيانات تنمرر بمسار وتنتنسى بمسار ثاني)
describe('ماكو اسم ملف منصوص بالإيد', () => {
  it('dataApi.js يبني كل أسماء ملفات العروض عبر quoteFileName', () => {
    const src = fs.readFileSync(path.join(HERE, '../src/lib/dataApi.js'), 'utf8');
    const calls = [...src.matchAll(/fileName:\s*([^,\n]+)/g)].map((m) => m[1].trim());
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const hardcoded = calls.filter((c) => !c.startsWith('quoteFileName(') && !c.startsWith('file.name'));
    expect(hardcoded, 'أسماء ملفات منصوصة بالإيد: ' + hardcoded.join(' · ')).toEqual([]);
  });
});
