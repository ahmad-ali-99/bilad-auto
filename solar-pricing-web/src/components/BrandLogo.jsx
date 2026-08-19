import React, { useState } from 'react';
import { brandLogoCandidates, brandInitials, brandColor } from '../lib/brandLogos.js';

/**
 * شعار الماركة: يجرّب ملفات `public/brands/<الاسم>.svg|png|webp|jpg` بالترتيب،
 * وإذا ماكو ولا واحد ينزل لعلامة مولّدة من الاسم — فما تبقى ماركة بلا شعار.
 */
export default function BrandLogo({ name, size = 34 }) {
  const base = import.meta.env.BASE_URL || '/';
  const candidates = brandLogoCandidates(name, base);
  const [at, setAt] = useState(0);
  const failed = at >= candidates.length;
  const c = brandColor(name);

  if (failed) {
    return (
      <span
        className="brand-mark"
        style={{ width: size, height: size, background: c.bg, color: c.fg, borderColor: c.line }}
        aria-hidden="true"
      >
        {brandInitials(name)}
      </span>
    );
  }

  return (
    <img
      className="brand-mark-img"
      style={{ width: size, height: size }}
      src={candidates[at]}
      alt=""
      loading="lazy"
      // كل امتداد يفشل نجرّب اللي بعده، وآخرها العلامة المولّدة
      onError={() => setAt((i) => i + 1)}
    />
  );
}
