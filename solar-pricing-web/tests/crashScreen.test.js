import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
const cs = fs.readFileSync(new URL('../src/components/CrashScreen.jsx', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

describe('ماكو صفحة بيضاء بعد اليوم', () => {
  it('الحاجز يلف التطبيق كله من الجذر', () => {
    expect(main).toMatch(/<CrashScreen>[\s\S]*<App \/>[\s\S]*<\/CrashScreen>/);
  });

  it('حاجز حقيقي: getDerivedStateFromError + componentDidCatch', () => {
    expect(cs).toContain('static getDerivedStateFromError');
    expect(cs).toContain('componentDidCatch');
  });

  it('يعرض زر إصلاح يمسح المخزن ويعيد التحميل', () => {
    expect(cs).toContain('إصلاح وتحديث الآن');
    expect(cs).toContain('r.unregister()');
    expect(cs).toContain('caches.delete(k)');
    expect(cs).toContain('window.location.reload');
  });

  it('الإصلاح الذاتي مرة وحدة بالجلسة — بلا حلقة إعادة تحميل', () => {
    expect(cs).toContain("sessionStorage.getItem('crash-healed')");
    expect(cs).toContain("sessionStorage.setItem('crash-healed'");
  });
});

describe('النسخة الجديدة تنزل فوراً لا بالفتحة الجاية', () => {
  it('إعادة تحميل عند استلام سيرفس وركر جديد، بحارس ضد الحلقة', () => {
    expect(main).toContain("addEventListener('controllerchange'");
    expect(main).toContain('const hadController = !!navigator.serviceWorker.controller');
    expect(main).toMatch(/if \(!hadController \|\| reloaded\) return;/);
  });
});
