import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/pages/QuoteBuilder.jsx', import.meta.url), 'utf8');

// حارس ضد الخطأ اللي طيّح التطبيق كله: `const` تنستعمل قبل تعريفها بجسم
// المكوّن = منطقة ميتة زمنياً = ReferenceError بكل رندر = صفحة بيضاء.
// المكوّن طويل، والحالة الجديدة تنكتب بسهولة تحت أول استعمال إلها.
describe('ماكو حالة تُستعمل قبل تعريفها', () => {
  const body = src.slice(src.indexOf('export default function QuoteBuilder'));

  const states = [...body.matchAll(/const \[(\w+), set\w+\] = useState/g)]
    .map((m) => ({ name: m[1], at: m.index }));

  it(`فحص ${states.length} حالة`, () => {
    const late = [];
    for (const { name, at } of states) {
      // أول ظهور للاسم بعد بداية المكوّن — لازم ما يسبق تعريفه
      const re = new RegExp(`\\b${name}\\b`, 'g');
      let m, first = null;
      while ((m = re.exec(body))) {
        // نتجاهل الظهور داخل سطر التعريف نفسه
        if (m.index >= at && m.index <= at + 60) continue;
        first = m.index; break;
      }
      if (first != null && first < at) {
        late.push(`${name}: يُستعمل عند ${first} ويتعرّف عند ${at}`);
      }
    }
    expect(late, 'حالات بمنطقة ميتة زمنياً').toEqual([]);
  });

  it('bankRound بالذات يتعرّف مع بقية حالات التقسيط', () => {
    const decl = body.indexOf('const [bankRound');
    const inst = body.indexOf('const [installment,');
    expect(decl).toBeGreaterThan(-1);
    expect(Math.abs(decl - inst)).toBeLessThan(2500);
  });
});
