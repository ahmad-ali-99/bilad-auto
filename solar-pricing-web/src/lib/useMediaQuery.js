// كشف مقاس الشاشة بالجافاسكربت — للحالات اللي CSS ما تكفي بيها:
// لمّا نحتاج **نرندر شكلاً مختلفاً كلياً** (بطاقات بدل جدول) مو نخفي أحدهما.
// الإخفاء بالـCSS يعني نبني الاثنين بالـDOM: صندوق تمرير زيادة يلخبط قياس
// fitTables.js، وضِعف الصفوف بمخزون فيه مئات المواد.
import { useEffect, useState } from 'react';

// نفس الحدّ المستعمل بكل `@media` بـstyles.css — مصدر واحد حتى ما ينفصل الرقمان
export const PHONE = '(max-width: 700px)';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches); // تدوير الشاشة أو تغيّر الاستعلام بين الرندر والتأثير
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
