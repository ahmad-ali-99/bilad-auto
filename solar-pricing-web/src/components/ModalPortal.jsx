import { createPortal } from 'react-dom';

// كل النوافذ المنبثقة تنرسم على `body` مباشرة — نفس سبب `AnchoredPopup`:
//
// النوافذ كانت تنرندر داخل `.mobile-content` اللي عليه `overflow-y: auto` و
// `-webkit-overflow-scrolling: touch`. بسفاري الآيفون هذي الحاوية تصير **الكتلة
// الحاضنة** لأحفادها بـ`position: fixed` — يعني الغطاء ما يغطي الشاشة، بل ينحصر
// بمربع المحتوى، وشريط التنقل السفلي يبقى فوقه. والنافذة بـ`max-height` محسوبة
// بـ`vh` (بحجم الشاشة الكاملة) تطلع أطول من مربع المحتوى، فأسفلها — وبالضبط صف
// أزرار الحفظ — ينزل تحت شريط التنقل وما ينضغط أبداً.
//
// مقاس بمحاكاة سلوك الآيفون: زر «اعتماد كافتراضي دائم» كان
// `clickable: false, coveredBy: "شريط التنقل"`.
//
// بالرسم على `body` ماكو أب يقص ولا يعيد ربط الـfixed — الغطاء يغطي الشاشة كاملة.
export default function ModalPortal({ children }) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}
