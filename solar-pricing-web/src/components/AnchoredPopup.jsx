import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

// نافذة منبثقة مرتبطة بعنصر مرساة (زر/خلية) — تُرسم بـportal على body بـposition: fixed.
//
// المشكلة اللي جابتها: محرر حالة العرض كان `position: absolute` داخل
// `.table-scroll { overflow: auto }`، والعنصر المطلق داخل حاوية overflow **ينقص
// بحدودها** — فأزرار «إغلاق/حفظ» كانت تنقص من حافة الشاشة، وصفوف معينة (الأول
// والأخير) تفتح النافذة بمكان ما يبان. المعالجة القديمة كانت تخمين: «آخر صفين
// يفتحون للأعلى» — ما تعالج القص الأفقي ولا الصف الأول.
//
// هنا الحساب حقيقي: نقيس مستطيل المرساة ومستطيل النافذة، ونحصر النافذة داخل
// الشاشة على المحورين (تنقلب للأعلى إذا ماكو مجال تحت، وتزحف أفقياً عن الحافة).
const MARGIN = 8;

export default function AnchoredPopup({ anchorRef, onClose, closeOnScroll = true, className = '', style, children }) {
  const popRef = useRef(null);
  const [pos, setPos] = useState(null); // null = ما انقاس بعد (نخفيه حتى ما يومض)

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef?.current;
      const pop = popRef.current;
      if (!anchor || !pop) return;
      const a = anchor.getBoundingClientRect();
      const p = pop.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // عمودياً: تحت المرساة، وإذا ما يكفي المجال نقلبها فوقها
      const below = a.bottom + 6;
      const above = a.top - p.height - 6;
      let top = below;
      if (below + p.height > vh - MARGIN && above >= MARGIN) top = above;
      top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - p.height - MARGIN));

      // أفقياً: نحاذي بداية المرساة ثم نحصرها داخل الشاشة
      let left = a.left;
      if (left + p.width > vw - MARGIN) left = vw - p.width - MARGIN;
      left = Math.max(MARGIN, left);

      setPos({ top, left });
    };

    place();
    // إعادة القياس عند تغيّر حجم النافذة أو تغيّر ارتفاع المحتوى (كتابة بالملاحظة)
    const ro = new ResizeObserver(place);
    if (popRef.current) ro.observe(popRef.current);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchorRef, children]);

  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return; // الضغط على المرساة يبدّلها بنفسه
      onClose();
    };
    // التمرير يحرّك المرساة تحت النافذة — نغلقها بدل ما تطفو بمكان غلط
    const onScroll = () => { if (closeOnScroll) onClose(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose, anchorRef, closeOnScroll]);

  return createPortal(
    <div
      ref={popRef}
      className={className}
      style={{
        position: 'fixed',
        top: pos ? pos.top : -9999,
        left: pos ? pos.left : -9999,
        zIndex: 1300,
        visibility: pos ? 'visible' : 'hidden',
        ...style,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
