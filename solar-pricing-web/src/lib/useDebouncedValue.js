import { useState, useEffect } from 'react';

// قيمة متأخرة: ترجع آخر قيمة بعد ما يهدأ التغيير `delay` ملي ثانية.
// تستعملها كل شاشة تحسب حساباً ثقيلاً مع كل ضغطة زر (شاشة العرض، عرض الزبون،
// منشور الباقات) — كانت منسوخة بكل ملف على حدة.
export function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default useDebouncedValue;
