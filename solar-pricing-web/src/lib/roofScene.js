// يبني المشهد الكامل من معطيات الموقع: يحلّ التوزيع ثم يرسمه بالكاميرا المستخرجة.
import { solveLayout } from './roofLayout.js';
import { makeCamera, boxFaces, panelFace, assemble, REF } from './roofRender.js';

const SLAB = 0.35, PAR_H = 0.60, PAR_T = 0.22;
const BEAM = 0.16, COL = 0.15, PLATE = 0.03;

/**
 * @param {object} site الأبعاد والعوائق والهيكل واللوح
 * @param {'iso'|'under'} view زاوية النظر
 */
export function buildRoofScene(site, view = 'iso') {
  const {
    roofWidth: RW, roofDepth: RD, obstacles = [], canopyZ = 0,
    panelLong = 2.382, panelShort = 1.134, frontFoot = 0.30, backFoot = 1.10,
    latitude = 32.5, maxPanels = Infinity, scale = 46, strokeWidth = 1.1,
    elevationDeg,
  } = site;

  const below = view === 'under';
  const clearZ = canopyZ > 0 ? canopyZ - BEAM : 0;
  const layout = solveLayout({
    roofWidth: RW, roofDepth: RD, obstacles, canopyClearZ: clearZ,
    panelLong, panelShort, frontFoot, backFoot, latitude, maxPanels,
  });
  if (!layout.tilt) return { svg: '', layout };

  // من تحت: نقلب المحور الرأسي حتى نشوف بطون الألواح والجسور
  const el = elevationDeg > 0 ? elevationDeg : REF.elevationDeg;
  const cam = makeCamera({ scale, elevationDeg: below ? -el : el });
  const sw = strokeWidth;
  const items = [];
  const push = (arr) => { for (const f of arr) items.push(f); };

  // ── البلاطة والسياج (تنشال بمنظور «من تحت» — تحجب المشهد بلا فائدة)
  if (!below) {
    push(boxFaces(cam, { x: -PAR_T, y: -PAR_T, z: -SLAB, w: RW + 2 * PAR_T, d: RD + 2 * PAR_T, h: SLAB }, REF.structure, sw));
    for (const p of [
      { x: -PAR_T, y: -PAR_T, w: RW + 2 * PAR_T, d: PAR_T }, { x: -PAR_T, y: RD, w: RW + 2 * PAR_T, d: PAR_T },
      { x: -PAR_T, y: -PAR_T, w: PAR_T, d: RD + 2 * PAR_T }, { x: RW, y: -PAR_T, w: PAR_T, d: RD + 2 * PAR_T },
    ]) push(boxFaces(cam, { ...p, z: 0, h: PAR_H }, '#c9ced3', sw));
  }

  // ── العوائق
  for (const o of obstacles) {
    push(boxFaces(cam, { x: o.x, y: o.y, z: 0, w: o.w, d: o.d, h: o.h }, o.colour || '#cfd6d5', sw, below));
  }

  // ── الهيكل: أعمدة على صفائح قاعدة (بلا صبّات) + جسور
  if (canopyZ > 0) {
    const gx = [0.15, RW * 0.34, RW * 0.67, RW - 0.15];
    const gy = [0.30, RD * 0.32, RD * 0.66, RD - 0.30];
    const ground = (x, y) => {
      const hit = obstacles.find((o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.d && o.h < canopyZ);
      return hit ? hit.h : 0;
    };
    for (const cx of gx) for (const cy of gy) {
      const g = ground(cx, cy);
      push(boxFaces(cam, { x: cx - 0.15, y: cy - 0.15, z: g, w: 0.30, d: 0.30, h: PLATE }, '#dde1e5', sw, below));
      push(boxFaces(cam, { x: cx - COL / 2, y: cy - COL / 2, z: g + PLATE, w: COL, d: COL, h: canopyZ - BEAM - g - PLATE }, REF.structure, sw, below));
    }
    for (const by of gy) push(boxFaces(cam, { x: 0, y: by - BEAM / 2, z: canopyZ - BEAM, w: RW, d: BEAM, h: BEAM }, REF.structure, sw, below));
    for (const bx of gx) push(boxFaces(cam, { x: bx - BEAM / 2, y: gy[0], z: canopyZ - BEAM, w: BEAM, d: gy[gy.length - 1] - gy[0], h: BEAM }, REF.structure, sw, below));
  }

  // ── الألواح
  const baseZ = canopyZ + frontFoot;
  const step = panelShort + 0.02;
  for (const r of layout.rows) {
    for (let i = 0; i < r.count; i++) {
      const xa = r.x0 + i * step;
      items.push(panelFace(cam, {
        xa, xb: xa + panelShort, yFront: r.yFront, yBack: r.yBack,
        zFront: baseZ, zBack: baseZ + layout.tilt.rise,
      }, sw, below));
    }
    // قوائم التثبيت
    for (let i = 0; i <= r.count; i += 2) {
      const px = Math.min(r.x0 + i * step, r.x0 + r.span);
      for (const [yy, hh] of [[r.yFront, baseZ], [r.yBack, baseZ + layout.tilt.rise]]) {
        const a = cam.project(px, yy, canopyZ), b = cam.project(px, yy, hh);
        items.push({ key: cam.depth(px, yy, (canopyZ + hh) / 2),
          svg: `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${REF.structure}" stroke-width="${sw * 2}" stroke-linecap="round"/>` });
      }
    }
  }

  const top = canopyZ + backFoot + 0.3;
  const bounds = [];
  for (const x of [-PAR_T, RW + PAR_T]) for (const y of [-PAR_T, RD + PAR_T]) for (const z of [-SLAB, top]) bounds.push([x, y, z]);
  return { svg: assemble(items, cam, bounds), layout };
}
