import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const svg = fs.readFileSync(path.join(HERE, '../src/lib/svgRender.js'), 'utf8');
const pdf = fs.readFileSync(path.join(HERE, '../src/lib/pdfExport.js'), 'utf8');
const h2c = fs.readFileSync(path.join(HERE, '../node_modules/html2canvas/dist/html2canvas.esm.js'), 'utf8');

// سبب وجود المحرك الخفيف: html2canvas ينسخ المستند بـiframe وينتظر ثلاثة
// انتظارات **بلا سقف زمني**، وواحد منهن يشتغل بمحرك سفاري حصراً.
describe('ليش محرك بديل أصلاً — الانتظارات المفتوحة بـhtml2canvas', () => {
  it('انتظار تحميل الـiframe بلا سقف ولا رفض', () => {
    const at = h2c.indexOf('var iframeLoader =');
    const body = h2c.slice(at, at + 700);
    expect(body).toContain('cloneWindow.onload = iframe.onload');
    expect(body).not.toMatch(/setTimeout\([^)]*reject/);
  });

  it('انتظار `fonts.ready` جوّا النسخة بلا سقف', () => {
    expect(h2c).toContain('documentClone.fonts.ready');
  });

  it('وانتظار الصور يشتغل بمحرك سفاري حصراً — ولذلك العطل بجهاز واحد', () => {
    const at = h2c.indexOf('imagesReady(documentClone)');
    expect(at).toBeGreaterThan(-1);
    const before = h2c.slice(at - 300, at);
    expect(before).toContain('AppleWebKit');
  });
});

describe('المحرك الخفيف — SVG foreignObject', () => {
  it('نداء تحميل صورة واحد، وإله سقف زمني صريح', () => {
    expect(svg).toContain('function loadImage');
    expect(svg).toContain('IMAGE_LIMIT_MS');
    const fn = svg.slice(svg.indexOf('function loadImage'));
    expect(fn.slice(0, 400)).toMatch(/setTimeout\(\(\) => reject/);
  });

  it('الخط ينضم base64 داخل الـSVG — بدونه تتكسر الحروف العربية', () => {
    expect(svg).toContain('data:font/woff2;base64,');
    expect(svg).toContain('unicode-range');
    // الأوزان الأربعة المستعملة بالصفحات، بالشريحتين العربية واللاتينية
    for (const w of [400, 600, 700, 800]) {
      expect(svg).toContain(`arabic${w}`);
      expect(svg).toContain(`latin${w}`);
    }
  });

  it('التحويل لـbase64 على دفعات — ملف 15 كيلو بنداء واحد يفجّر المكدس', () => {
    const fn = svg.slice(svg.indexOf('function toBase64'));
    expect(fn.slice(0, 400)).toMatch(/i \+= 8192/);
  });

  it('الترميز ينبني من الـDOM بـXMLSerializer مو من نص HTML', () => {
    // foreignObject يتطلب XHTML صحيحاً — السيريالايزر يقفل الوسوم ويهرب الرموز
    expect(svg).toContain('new XMLSerializer().serializeToString(clone)');
    expect(svg).toContain("clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')");
  });

  it('ستايل الصفحة يمشي وياها — بدونه تطلع نصاً عارياً', () => {
    expect(svg).toContain('querySelectorAll(\':scope > style, style\')');
    expect(svg).toContain('pageCss');
  });

  it('وقاعدة box-sizing تنتقل كذلك — بدونها الورقة تطفح وينقص طرفها', () => {
    expect(svg).toContain("const RESET_CSS = '*{box-sizing:border-box;}'");
  });

  it('الصور تنرسم فوق الرسم — سفاري ما يرسم img جوّا foreignObject', () => {
    expect(svg).toContain('const overlays = []');
    expect(svg).toContain('ctx.drawImage(src, dx * scale, dy * scale, dw * scale, dh * scale)');
    // ومكانها محسوب نسبةً للورقة مو للشاشة
    expect(svg).toContain('x: box.left - rect.left');
    expect(svg).toContain('y: box.top - rect.top');
  });

  it('object-fit محسوب مثل المتصفح — contain وcover مو مطّ', () => {
    const fn = svg.slice(svg.indexOf('function fitBox'));
    expect(fn.slice(0, 500)).toContain("fit === 'cover'");
    expect(fn.slice(0, 500)).toContain('Math.min(w / natW, h / natH)');
  });

  it('ننتظر الصور تخلص قبل القياس — الصورة غير المحمّلة ارتفاعها صفر', () => {
    expect(svg).toContain('function imagesSettled');
    const fn = svg.slice(svg.indexOf('export async function renderElementToCanvas'));
    const wait = fn.indexOf('await imagesSettled');
    const measure = fn.indexOf('getBoundingClientRect()');
    expect(wait).toBeGreaterThan(-1);
    expect(wait).toBeLessThan(measure);
    // وبسقف — هذا الفرق عن html2canvas
    expect(svg).toContain('imagesSettled(el, IMAGE_LIMIT_MS)');
  });

  it('صورة ما انحملت ما تفشّل التصدير كله', () => {
    const fn = pdf.length && svg.slice(svg.indexOf('for (const o of overlays)'));
    expect(fn).toContain('continue;');
  });
});

describe('اختيار المحرك', () => {
  it('المسار واحد للاثنين — الفرق بالرسم بس، والملف والمشاركة نفسها', () => {
    expect(pdf).toContain('async function renderSheet');
    const fn = pdf.slice(pdf.indexOf('async function renderSheet'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('prefersSvgRender()');
    expect(body).toContain("import('./svgRender.js')");
    expect(body).toContain('html2canvas(el,');
  });

  it('المحرك الخفيف يتحمّل ديناميكياً — ما يثقل فتح التطبيق', () => {
    expect(pdf).not.toMatch(/^import .*svgRender/m);
    expect(pdf).toContain("await withStep(\n      `تحميل محرك الرسم الخفيف`,\n      import('./svgRender.js')");
  });

  it('صفحتا الفاتورة والتصميم تمران بنفس الدالة', () => {
    expect(pdf).toContain("renderSheet('رسم صفحة الفاتورة', sheet)");
    expect(pdf).toContain("renderSheet('رسم صفحة التصميم', el)");
  });
});
