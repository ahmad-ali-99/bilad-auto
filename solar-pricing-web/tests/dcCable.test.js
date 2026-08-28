import { describe, it, expect } from 'vitest';
import {
  PANELS_PER_RUN, METERS_PER_RUN, MM4_MAX_WATT,
  dcCableMeters, dcCableSizeFor, cableSizeOf, isDcCable, pickDcCable,
} from '../src/lib/dcCable.js';

describe('الأمتار: كل ٩ ألواح ٥٠ متر، وأي لوح زيادة يفتح ٥٠ جديدة', () => {
  it('الأمثلة اللي حددها المستخدم', () => {
    expect(dcCableMeters(9)).toBe(50);
    expect(dcCableMeters(10)).toBe(100);   // لوح واحد زيادة = ٥٠ أخرى
    expect(dcCableMeters(19)).toBe(150);   // يعبر ١٨ = ٥٠ أخرى
  });

  it('حدود كل شوط', () => {
    expect(dcCableMeters(1)).toBe(50);
    expect(dcCableMeters(8)).toBe(50);
    expect(dcCableMeters(18)).toBe(100);
    expect(dcCableMeters(27)).toBe(150);
    expect(dcCableMeters(28)).toBe(200);
    expect(dcCableMeters(50)).toBe(300);
  });

  it('بلا ألواح بلا كيبل', () => {
    for (const n of [0, -3, null, undefined, '']) expect(dcCableMeters(n)).toBe(0);
  });

  it('الثوابت مكشوفة حتى تتغيّر بمكان واحد', () => {
    expect(PANELS_PER_RUN).toBe(9);
    expect(METERS_PER_RUN).toBe(50);
    expect(MM4_MAX_WATT).toBe(650);
  });
});

describe('المقطع يتبع واطية اللوح', () => {
  it('٦٥٠ وأقل ← ٤ ملم، وأكثر ← ٦ ملم', () => {
    expect(dcCableSizeFor(650)).toBe(4);
    expect(dcCableSizeFor(600)).toBe(4);
    expect(dcCableSizeFor(651)).toBe(6);
    expect(dcCableSizeFor(720)).toBe(6);
  });
});

describe('قراءة المقطع من الوصف', () => {
  const mk = (d, unit = 'متر') => ({ full_description: d, unit });

  it('يقرا الصيغ الشائعة', () => {
    expect(cableSizeOf(mk('كيبلات ناقلة من الألواح بحجم 6 ملم'))).toBe(6);
    expect(cableSizeOf(mk('كيبل 4 مم للألواح'))).toBe(4);
    expect(cableSizeOf(mk('DC cable 6mm'))).toBe(6);
  });

  it('**يرفض صيغة العدد×المقطع**: «4×35 ملم» كيبل حمل مو ٤ ملم', () => {
    expect(cableSizeOf(mk('كيبل للحمل والشحن بحجم 4×35 ملم'))).toBe(null);
    expect(isDcCable(mk('كيبل للحمل والشحن بحجم 4×35 ملم'))).toBe(false);
  });

  it('ويستثني كيبل الحمل والشحن والإيرث', () => {
    for (const d of ['كيبل الشحن 6 ملم', 'كيبل إيرث 16 ملم', 'كيبل حمل 10 ملم'])
      expect(isDcCable(mk(d)), d).toBe(false);
  });

  it('والمواد اللي مو بالمتر مو كيبل ألواح', () => {
    expect(isDcCable(mk('كيبل 6 ملم', 'عدد'))).toBe(false);
  });
});

describe('اختيار الكيبل من المخزون', () => {
  const C = (d) => ({ id: d, full_description: d, unit: 'متر' });
  const stock = [C('كيبلات من الألواح 4 ملم'), C('كيبلات من الألواح 6 ملم'),
    C('كيبل للحمل والشحن 4×35 ملم'), { id: 'x', full_description: 'هيكل', unit: 'عدد' }];

  it('لوح 650 ياخذ ٤ ملم', () => {
    expect(pickDcCable(stock, 650).full_description).toContain('4 ملم');
  });

  it('ولوح أكبر ياخذ ٦ ملم', () => {
    expect(pickDcCable(stock, 720).full_description).toContain('6 ملم');
  });

  it('إذا المقطع المطلوب مو بالمخزون ياخذ أقرب أكبر — النزول عنه غلط هندسي', () => {
    const only6 = [C('كيبل ألواح 6 ملم')];
    expect(pickDcCable(only6, 650).full_description).toContain('6 ملم');
    const only4 = [C('كيبل ألواح 4 ملم')];
    expect(pickDcCable(only4, 720)).toBe(null);   // ما ننزل لمقطع أصغر
  });

  it('وماكو كيبل ألواح بالمخزون = null بلا كسر', () => {
    expect(pickDcCable([{ id: 1, full_description: 'هيكل', unit: 'عدد' }], 650)).toBe(null);
    expect(pickDcCable([], 650)).toBe(null);
    expect(pickDcCable(null, 650)).toBe(null);
  });
});
