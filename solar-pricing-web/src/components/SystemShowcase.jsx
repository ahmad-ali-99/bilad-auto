// عرض تفاعلي ثلاثي الأبعاد — فيلا عصرية مطابقة لواجهة بيت المستخدم (أبيض + رمادي
// غامق + شريط خشبي)، بشارع وأرصفة وأعمدة إنارة وبيوت جيران، وحديقة بعشب يتمايل
// بالرياح خلف سياج أبيض ببوابة حديد. الداخل مؤثث (كنب، سفرة، مطبخ، غرف نوم،
// سبلتات تبريد) ويبين عند التقريب لأن الجدران تصير شفافة. الألواح فوق السطح
// وغرفة السطح (البيتونة) بيها انفرترات وبطاريات هويمايلز بعدد العرض، ودرج داخلي.
// شمس/قمر بفضاء الـ3D يتحركان بشريط الوقت: نهاراً توليد وشحن، ليلاً تنطفي
// الألواح وتشتعل إنارة البيت والشارع وتغذّي البطارية البيت.
import React, { useEffect, useRef, useState } from 'react';
import { splitStructures } from '../lib/structureDiagram.js';

const fmtTime = (h) => {
  const day2 = h >= 24 && h < 30;
  const t = ((h % 24) + 24) % 24;
  const hh = Math.floor(t);
  const mm = Math.round((t - hh) * 60);
  const period = hh < 12 ? 'صباحاً' : hh < 17 ? 'عصراً' : hh < 19 ? 'مغرباً' : 'مساءً';
  let h12 = hh % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}${day2 ? ' — اليوم الثاني' : ''}`;
};

export default function SystemShowcase({
  panels = 0, batteries = 0, inverters = 1,
  nightHours = null, dayAmps = null, ampDay = 0, ampNight = 0, onClose,
}) {
  const mountRef = useRef(null);
  const rafRef = useRef(0);
  const timeRef = useRef(13);
  const [timeLabel, setTimeLabel] = useState(fmtTime(13));

  useEffect(() => {
    let disposed = false;
    let renderer, controls, ro;
    const disp = [];

    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const mount = mountRef.current;
      if (disposed || !mount) return;
      const track = (o) => { disp.push(o); return o; };
      const W = () => mount.clientWidth || 900;
      const H = () => mount.clientHeight || 650;
      const lerpC = (a, b, t) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
      const windU = { value: 0 };
      const B = (w, h, d) => track(new THREE.BoxGeometry(w, h, d));
      const M = (opt) => track(new THREE.MeshStandardMaterial(opt));

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xbfe3ff);

      // ======== لوحة خامات موحّدة (مطابقة لصورة الواجهة) ========
      const fadeMats = [];   // جدران خارجية تختفي عند الزوم
      const fadeMat = (opt) => { const m = M({ ...opt, transparent: true }); fadeMats.push(m); return m; };
      const whiteWall = fadeMat({ color: 0xf4f4f0, roughness: 0.92 });
      const charcoal  = fadeMat({ color: 0x4a4f52, roughness: 0.85 });
      const charcoalDark = fadeMat({ color: 0x3a3f42, roughness: 0.85 });
      const innerWall = fadeMat({ color: 0xefe9df, roughness: 0.95 });
      const slabMat   = fadeMat({ color: 0xd9d4cb, roughness: 0.95 });
      const glassMat  = M({ color: 0x1d2b36, roughness: 0.12, metalness: 0.4, emissive: 0xffc97a, emissiveIntensity: 0.04 });
      const frameMat  = M({ color: 0x22262a, roughness: 0.5, metalness: 0.4 });
      const woodSlat  = M({ color: 0xb5713d, roughness: 0.75 });
      const floorWood = M({ color: 0xc9a876, roughness: 0.85 });
      const floorTile = M({ color: 0xe3ded4, roughness: 0.9 });
      const metalGray = M({ color: 0x8a929c, roughness: 0.5, metalness: 0.7 });
      const concrete  = M({ color: 0xdfe2e6, roughness: 0.9 });
      const windowsGlow = []; // زجاج يضوي ليلاً
      const ceilGlow = [];    // سقوف داخلية دافئة ليلاً
      const acLeds = [];      // مؤشرات السبلت

      // ======== الألواح (نفس قاعدة الغلاف) ========
      const panelTexture = () => {
        const c = document.createElement('canvas'); c.width = 128; c.height = 256;
        const g = c.getContext('2d');
        const grd = g.createLinearGradient(0, 0, 128, 256);
        grd.addColorStop(0, '#5570c0'); grd.addColorStop(0.5, '#3a55a0'); grd.addColorStop(1, '#2c4180');
        g.fillStyle = grd; g.fillRect(0, 0, 128, 256);
        g.strokeStyle = 'rgba(180,200,240,0.6)'; g.lineWidth = 2;
        for (let i = 1; i < 6; i++) { const x = (i / 6) * 128; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
        for (let j = 1; j < 12; j++) { const y = (j / 12) * 256; g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
        g.strokeStyle = 'rgba(8,20,45,0.9)'; g.lineWidth = 6; g.strokeRect(0, 0, 128, 256);
        const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
      };
      const PANEL_W = 1.05, TIER_L = 1.1, TILT = THREE.MathUtils.degToRad(22);
      const LEG = 0.38, LIFT = 0.75, GAPS = 1.0, POST = 0.055;
      const panelBase = M({ map: track(panelTexture()), roughness: 0.32, metalness: 0.12, emissive: 0x24406e, emissiveIntensity: 0 });
      const panelSurfaces = [];
      const buildStructure = (cols, baseH) => {
        const grp = new THREE.Group();
        const w = cols * PANEL_W, slope = 2 * TIER_L;
        const dz = slope * Math.cos(TILT), dy = slope * Math.sin(TILT), backH = baseH + dy;
        const mat = panelBase.clone(); mat.map = panelBase.map.clone();
        mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(cols, 2); mat.map.needsUpdate = true; track(mat); track(mat.map);
        const surf = new THREE.Mesh(B(w, 0.05, slope), mat);
        surf.castShadow = true; surf.receiveShadow = true;
        surf.position.set(w / 2, (baseH + backH) / 2, dz / 2); surf.rotation.x = -TILT;
        grp.add(surf); panelSurfaces.push(mat);
        const legF = B(POST, baseH, POST), legB2 = B(POST, backH, POST), footG = B(0.24, 0.12, 0.24);
        for (let c = 0; c <= cols; c++) {
          const x = c * PANEL_W;
          const fl = new THREE.Mesh(legF, metalGray); fl.position.set(x, baseH / 2, 0); grp.add(fl);
          const bl = new THREE.Mesh(legB2, metalGray); bl.position.set(x, backH / 2, dz); grp.add(bl);
          const f1 = new THREE.Mesh(footG, concrete); f1.position.set(x, 0.06, 0); grp.add(f1);
          const f2 = new THREE.Mesh(footG, concrete); f2.position.set(x, 0.06, dz); grp.add(f2);
        }
        grp.userData = { w, dz }; return grp;
      };

      // ======== إضاءة عامة ========
      const sunLight = new THREE.DirectionalLight(0xfff2d8, 2.6);
      sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048);
      Object.assign(sunLight.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 0.5, far: 120 });
      scene.add(sunLight);
      const hemi = track(new THREE.HemisphereLight(0xdff0ff, 0xc7b490, 0.7)); scene.add(hemi);
      const amb = track(new THREE.AmbientLight(0xfff4e2, 0.34)); scene.add(amb);
      const fillL = track(new THREE.DirectionalLight(0xfff0d8, 0.45)); fillL.position.set(8, 6, -10); scene.add(fillL);
      const sunBall = new THREE.Mesh(track(new THREE.SphereGeometry(1.0, 24, 24)), track(new THREE.MeshBasicMaterial({ color: 0xffd451 })));
      const sunGlow = new THREE.Mesh(track(new THREE.SphereGeometry(1.9, 24, 24)), track(new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.28 })));
      const moonBall = new THREE.Mesh(track(new THREE.SphereGeometry(0.7, 20, 20)), track(new THREE.MeshBasicMaterial({ color: 0xe8efff })));
      scene.add(sunBall, sunGlow, moonBall);

      // ======== أبعاد الموقع ========
      // البيت: واجهة على −z. عرض 10م، عمق 12م، طابقان 3م + سطح.
      const FLOOR = 3.0, HW = 10, HD = 12, HH = FLOOR * 2;
      const LOT_FRONT = 6;      // حديقة/مدخل أمام البيت
      const WALL_Z = -HD / 2 - LOT_FRONT;   // خط السياج
      const SIDEWALK = 2, ROAD_W = 9;

      // ======== أرضيات الموقع والشارع ========
      const groundAll = new THREE.Mesh(track(new THREE.PlaneGeometry(140, 140)), M({ color: 0xd8d0c0, roughness: 1 }));
      groundAll.rotation.x = -Math.PI / 2; groundAll.position.y = -0.02; groundAll.receiveShadow = true; scene.add(groundAll);
      // ساحة البيت (بلاط فاتح داخل السياج)
      const lot = new THREE.Mesh(track(new THREE.PlaneGeometry(HW + 8, HD + LOT_FRONT + 4)), M({ color: 0xe8e2d6, roughness: 0.95 }));
      lot.rotation.x = -Math.PI / 2; lot.position.set(0, 0, -LOT_FRONT / 2 + 1); lot.receiveShadow = true; scene.add(lot);
      // رصيف أمام السياج
      const walk = new THREE.Mesh(track(new THREE.PlaneGeometry(60, SIDEWALK)), M({ color: 0xcfc9bd, roughness: 0.95 }));
      walk.rotation.x = -Math.PI / 2; walk.position.set(0, 0.005, WALL_Z - SIDEWALK / 2 - 0.1); walk.receiveShadow = true; scene.add(walk);
      // الشارع (اسفلت + خط متقطع)
      const road = new THREE.Mesh(track(new THREE.PlaneGeometry(60, ROAD_W)), M({ color: 0x3c4043, roughness: 0.95 }));
      road.rotation.x = -Math.PI / 2; road.position.set(0, 0.004, WALL_Z - SIDEWALK - ROAD_W / 2 - 0.1); road.receiveShadow = true; scene.add(road);
      const dashGeo = B(1.4, 0.012, 0.16); const dashMat = M({ color: 0xe8e8e0, roughness: 0.8 });
      for (let x = -28; x <= 28; x += 3.2) { const d = new THREE.Mesh(dashGeo, dashMat); d.position.set(x, 0.012, WALL_Z - SIDEWALK - ROAD_W / 2 - 0.1); scene.add(d); }
      // رصيف مقابل
      const walk2 = new THREE.Mesh(track(new THREE.PlaneGeometry(60, SIDEWALK)), M({ color: 0xcfc9bd, roughness: 0.95 }));
      walk2.rotation.x = -Math.PI / 2; walk2.position.set(0, 0.005, WALL_Z - SIDEWALK - ROAD_W - SIDEWALK / 2 - 0.1); walk2.receiveShadow = true; scene.add(walk2);

      // ======== السياج الأبيض + لوحة الشركات + بوابة حديد ========
      const wallH = 1.7;
      const fenceFront1 = new THREE.Mesh(B(HW + 8 - 3.4, wallH, 0.22), whiteWall); // يترك فتحة البوابة يمين
      fenceFront1.position.set(-1.7, wallH / 2, WALL_Z); fenceFront1.castShadow = true; scene.add(fenceFront1);
      const gateW = 3.2;
      const fenceSideL = new THREE.Mesh(B(0.22, wallH, HD + LOT_FRONT + 3), whiteWall);
      fenceSideL.position.set(-(HW + 8) / 2, wallH / 2, -LOT_FRONT / 2 + 0.6); scene.add(fenceSideL);
      const fenceSideR = fenceSideL.clone(); fenceSideR.position.x = (HW + 8) / 2; scene.add(fenceSideR);
      // لوحة الشركات الرمادية وسط السياج (مثل الصورة) بلويحات بيض صغيرة
      const board = new THREE.Mesh(B(3.6, 1.15, 0.06), charcoal); board.position.set(0.4, 0.95, WALL_Z - 0.15); scene.add(board);
      const plaqueGeo = B(0.62, 0.4, 0.02); const plaqueMat = M({ color: 0xf6f6f2, roughness: 0.6 });
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
        const p = new THREE.Mesh(plaqueGeo, plaqueMat);
        p.position.set(0.4 - 1.32 + c * 0.88, 0.95 + 0.28 - r * 0.55, WALL_Z - 0.19); scene.add(p);
      }
      // بوابة حديد بقضبان عمودية (مدخل السيارة يمين)
      const gateX = (HW + 8) / 2 - gateW / 2 - 0.3;
      const gateFrame = new THREE.Mesh(B(gateW, wallH, 0.08), track(new THREE.MeshStandardMaterial({ color: 0x6a6f74, roughness: 0.5, metalness: 0.6, transparent: true, opacity: 0.25 })));
      gateFrame.position.set(gateX, wallH / 2, WALL_Z); scene.add(gateFrame);
      const barGeo = B(0.05, wallH - 0.15, 0.05);
      for (let i = 0; i < 12; i++) { const bar = new THREE.Mesh(barGeo, metalGray); bar.position.set(gateX - gateW / 2 + 0.2 + i * (gateW - 0.4) / 11, wallH / 2, WALL_Z); scene.add(bar); }

      // ======== البيت — الواجهة مثل الصورة ========
      const house = new THREE.Group();
      // كتلة بيضاء رئيسية
      const mainMass = new THREE.Mesh(B(HW, HH, HD), whiteWall);
      mainMass.position.y = HH / 2; mainMass.castShadow = true; mainMass.receiveShadow = true; house.add(mainMass);
      // برج الدرج (يسار الواجهة) رمادي غامق أعلى من السطح
      const towerW = 2.4, towerH = HH + 1.6;
      const tower = new THREE.Mesh(B(towerW, towerH, 3), charcoalDark);
      tower.position.set(-HW / 2 + towerW / 2, towerH / 2, -HD / 2 + 1.5); tower.castShadow = true; house.add(tower);
      // رفوف بيض على البرج مع نباتات متدلية (مثل الصورة)
      const ledgeGeo = B(towerW + 0.15, 0.18, 0.5);
      const plantMat = M({ color: 0x3f8b3a, roughness: 0.9 });
      [2.2, 4.4].forEach((ly) => {
        const ledge = new THREE.Mesh(ledgeGeo, whiteWall); ledge.position.set(-HW / 2 + towerW / 2, ly, -HD / 2 - 0.28); house.add(ledge);
        for (let i = 0; i < 4; i++) {
          const pl = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.16, 1)), plantMat);
          pl.scale.set(1, 1.6, 1); pl.position.set(-HW / 2 + 0.5 + i * 0.5, ly - 0.28, -HD / 2 - 0.3); house.add(pl);
        }
      });
      // قسم البلكونة الرمادي الغامق بالطابق العلوي (يمين الواجهة) — غاطس
      const balcW = 5.4, balcH = FLOOR, balcX = HW / 2 - balcW / 2 - 0.6;
      const balcBack = new THREE.Mesh(B(balcW, balcH, 0.15), charcoal);
      balcBack.position.set(balcX, FLOOR + balcH / 2, -HD / 2 + 1.1); house.add(balcBack);
      // زجاج البلكونة خلفي
      const balcGlass = new THREE.Mesh(B(balcW - 0.5, balcH - 0.9, 0.05), glassMat.clone());
      track(balcGlass.material); windowsGlow.push(balcGlass.material);
      balcGlass.position.set(balcX, FLOOR + balcH / 2 + 0.2, -HD / 2 + 1.02); house.add(balcGlass);
      // ستارة البلكونة (بانل غامق) + شريطان أبيضان أفقيان مثل الصورة
      const balcRail = new THREE.Mesh(B(balcW, 1.0, 0.1), charcoalDark);
      balcRail.position.set(balcX, FLOOR + 0.55, -HD / 2 + 0.35); house.add(balcRail);
      const stripGeo = B(balcW + 1.2, 0.16, 0.06);
      [FLOOR + 1.15, FLOOR + 2.2].forEach((sy) => { const s = new THREE.Mesh(stripGeo, whiteWall); s.position.set(balcX - 0.2, sy, -HD / 2 - 0.02); house.add(s); });
      // شريط خشبي عمودي (يمين البلكونة)
      const slatGrp = new THREE.Group();
      for (let i = 0; i < 7; i++) { const sl = new THREE.Mesh(B(0.09, FLOOR - 0.3, 0.09), woodSlat); sl.position.set(i * 0.14, 0, 0); slatGrp.add(sl); }
      slatGrp.position.set(HW / 2 - 1.1, FLOOR + FLOOR / 2, -HD / 2 - 0.06); house.add(slatGrp);
      // شبابيك أرضية بإطار غامق: شباك كبير يمين + متوسط وسط
      const mkWin = (x, y, w, h, z, host = house) => {
        const fr = new THREE.Mesh(B(w + 0.14, h + 0.14, 0.08), frameMat); fr.position.set(x, y, z); host.add(fr);
        const gm = glassMat.clone(); track(gm); windowsGlow.push(gm);
        const gl = new THREE.Mesh(B(w, h, 0.05), gm); gl.position.set(x, y, z - 0.025); host.add(gl);
      };
      mkWin(HW / 2 - 2.2, 1.55, 2.6, 1.7, -HD / 2 - 0.03);
      mkWin(0.2, 1.55, 1.5, 1.5, -HD / 2 - 0.03);
      // شباك برج الدرج (غامق عمودي)
      mkWin(-HW / 2 + towerW / 2, 3.4, 1.1, 2.2, -HD / 2 - 0.03);
      // باب المدخل (بين البرج والوسط)
      const door = new THREE.Mesh(B(1.1, 2.2, 0.08), track(new THREE.MeshStandardMaterial({ color: 0x2d2620, roughness: 0.55 })));
      door.position.set(-HW / 2 + towerW + 0.9, 1.1, -HD / 2 - 0.03); house.add(door);
      // شبابيك جانبية للطابقين
      [[-HW / 2 - 0.03, HD * 0.05, Math.PI / 2], [HW / 2 + 0.03, HD * 0.05, -Math.PI / 2]].forEach(([sx, sz, ry]) => {
        [1.55, FLOOR + 1.55].forEach((sy) => {
          const g2 = new THREE.Group();
          const fr = new THREE.Mesh(B(1.7, 1.44, 0.08), frameMat); g2.add(fr);
          const gm = glassMat.clone(); track(gm); windowsGlow.push(gm);
          const gl = new THREE.Mesh(B(1.56, 1.3, 0.05), gm); gl.position.z = -0.02; g2.add(gl);
          g2.position.set(sx, sy, sz); g2.rotation.y = ry; house.add(g2);
        });
      });
      // سقف الطابقين + دروة السطح
      const roofSlab = new THREE.Mesh(B(HW + 0.15, 0.15, HD + 0.15), slabMat);
      roofSlab.position.y = HH + 0.075; roofSlab.receiveShadow = true; house.add(roofSlab);
      const parH = 0.55;
      const parX = B(HW + 0.15, parH, 0.12), parZ = B(0.12, parH, HD + 0.15);
      [[0, HD / 2], [0, -HD / 2]].forEach(([px, pz]) => { const p = new THREE.Mesh(parX, whiteWall); p.position.set(px, HH + parH / 2 + 0.15, pz); house.add(p); });
      [[HW / 2, 0], [-HW / 2, 0]].forEach(([px, pz]) => { const p = new THREE.Mesh(parZ, whiteWall); p.position.set(px, HH + parH / 2 + 0.15, pz); house.add(p); });
      scene.add(house);

      // ======== الداخل المؤثث (يبين عند الشفافية) ========
      const interior = new THREE.Group();
      // أرضيات الطابقين
      const f0 = new THREE.Mesh(B(HW - 0.4, 0.1, HD - 0.4), floorTile); f0.position.y = 0.05; interior.add(f0);
      const f1s = new THREE.Mesh(B(HW - 0.4, 0.12, HD - 0.4), slabMat); f1s.position.y = FLOOR; interior.add(f1s);
      const f1f = new THREE.Mesh(B(HW - 0.5, 0.04, HD - 0.5), floorWood); f1f.position.y = FLOOR + 0.08; interior.add(f1f);
      // أسقف مضيئة دافئة (تشتعل ليلاً)
      [FLOOR - 0.08, HH - 0.08].forEach((cy) => {
        const cm = M({ color: 0xfdf6e8, roughness: 0.9, emissive: 0xffd9a0, emissiveIntensity: 0.02 });
        ceilGlow.push(cm);
        const c = new THREE.Mesh(B(HW - 0.6, 0.04, HD - 0.6), cm); c.position.y = cy; interior.add(c);
      });
      // جدران تقسيم داخلية خفيفة (صالة/مطبخ/غرفة حسب المخطط)
      const part1 = new THREE.Mesh(B(0.1, FLOOR - 0.2, HD * 0.55), innerWall); part1.position.set(HW * 0.13, FLOOR / 2, HD * 0.18); interior.add(part1);
      const part2 = new THREE.Mesh(B(HW * 0.45, FLOOR - 0.2, 0.1), innerWall); part2.position.set(-HW * 0.24, FLOOR / 2, HD * 0.12); interior.add(part2);
      const part3 = new THREE.Mesh(B(0.1, FLOOR - 0.2, HD * 0.5), innerWall); part3.position.set(0, FLOOR + FLOOR / 2, HD * 0.2); interior.add(part3);
      // ---- صالة (كنب L كريمي + سجادة + طاولة + جدار تلفزيون) مثل الصور ----
      const sofaMat = M({ color: 0xdcd2bf, roughness: 0.9 });
      const rug = new THREE.Mesh(B(3.4, 0.03, 2.4), M({ color: 0xb9aa90, roughness: 0.95 })); rug.position.set(-HW * 0.2, 0.12, -HD * 0.16); interior.add(rug);
      const sofa1 = new THREE.Mesh(B(2.6, 0.65, 0.9), sofaMat); sofa1.position.set(-HW * 0.2, 0.45, -HD * 0.16 - 1.0); interior.add(sofa1);
      const sofaBack1 = new THREE.Mesh(B(2.6, 0.5, 0.2), sofaMat); sofaBack1.position.set(-HW * 0.2, 0.95, -HD * 0.16 - 1.35); interior.add(sofaBack1);
      const sofa2 = new THREE.Mesh(B(0.9, 0.65, 1.9), sofaMat); sofa2.position.set(-HW * 0.2 - 1.6, 0.45, -HD * 0.16); interior.add(sofa2);
      const coffee = new THREE.Mesh(B(1.0, 0.35, 0.6), M({ color: 0x7a5c3a, roughness: 0.7 })); coffee.position.set(-HW * 0.2, 0.3, -HD * 0.16); interior.add(coffee);
      // جدار تلفزيون غامق + شاشة
      const tvWall = new THREE.Mesh(B(2.8, 2.2, 0.08), M({ color: 0x584c3e, roughness: 0.8 })); tvWall.position.set(-HW * 0.2, 1.25, -HD * 0.16 + 1.7); interior.add(tvWall);
      const tvm = M({ color: 0x0a0a0a, roughness: 0.3, emissive: 0x223344, emissiveIntensity: 0.15 });
      const tv = new THREE.Mesh(B(1.6, 0.9, 0.05), tvm); tv.position.set(-HW * 0.2, 1.35, -HD * 0.16 + 1.62); interior.add(tv);
      // ---- سفرة خشب + كراسي ----
      const dinT = new THREE.Mesh(B(1.9, 0.08, 1.0), M({ color: 0x9c6f42, roughness: 0.6 })); dinT.position.set(HW * 0.28, 0.78, -HD * 0.05); interior.add(dinT);
      const dinLegG = B(0.07, 0.72, 0.07); const chairG = B(0.42, 0.5, 0.42); const chairM = M({ color: 0x6e5137, roughness: 0.8 });
      [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]].forEach(([dx, dz]) => { const l = new THREE.Mesh(dinLegG, chairM); l.position.set(HW * 0.28 + dx, 0.38, -HD * 0.05 + dz); interior.add(l); });
      [[-0.55, -0.85], [0.35, -0.85], [-0.55, 0.75], [0.35, 0.75], [-1.2, 0], [1.15, 0]].forEach(([dx, dz]) => { const c = new THREE.Mesh(chairG, chairM); c.position.set(HW * 0.28 + dx, 0.25, -HD * 0.05 + dz); interior.add(c); });
      // ---- مطبخ (كاونتر + خزائن) بالخلف ----
      const counter = new THREE.Mesh(B(HW * 0.42, 0.9, 0.65), M({ color: 0x8d9296, roughness: 0.5, metalness: 0.2 })); counter.position.set(HW * 0.24, 0.45, HD * 0.38); interior.add(counter);
      const cabinets = new THREE.Mesh(B(HW * 0.42, 0.7, 0.35), M({ color: 0x5a5f63, roughness: 0.6 })); cabinets.position.set(HW * 0.24, 1.9, HD * 0.44); interior.add(cabinets);
      // ---- غرف النوم فوق (سريران + دولاب) ----
      const bedM = M({ color: 0xcbb7a0, roughness: 0.9 }); const headM = M({ color: 0x6e5137, roughness: 0.8 });
      const mkBed = (x, z) => {
        const bed = new THREE.Mesh(B(1.6, 0.45, 2.1), bedM); bed.position.set(x, FLOOR + 0.35, z); interior.add(bed);
        const head = new THREE.Mesh(B(1.7, 0.9, 0.12), headM); head.position.set(x, FLOOR + 0.65, z + 1.08); interior.add(head);
        const pil = new THREE.Mesh(B(1.3, 0.14, 0.4), M({ color: 0xf3ede2, roughness: 0.9 })); pil.position.set(x, FLOOR + 0.63, z + 0.72); interior.add(pil);
      };
      mkBed(-HW * 0.24, HD * 0.26); mkBed(HW * 0.26, HD * 0.26);
      const ward = new THREE.Mesh(B(2.0, 2.2, 0.6), M({ color: 0x7c623f, roughness: 0.7 }));
      ward.position.set(0.2, FLOOR + 1.2, HD * 0.42); interior.add(ward);

      // ======== سبلتات تبريد (وحدات داخلية + كومبرسرات) ========
      const acBodyM = M({ color: 0xf7f8f9, roughness: 0.4 });
      const mkAC = (x, y, z, ry = 0) => {
        const g = new THREE.Group();
        const bodyAC = new THREE.Mesh(B(1.0, 0.32, 0.24), acBodyM); g.add(bodyAC);
        const vent = new THREE.Mesh(B(0.9, 0.05, 0.02), M({ color: 0xb9bec2, roughness: 0.6 })); vent.position.set(0, -0.12, -0.12); g.add(vent);
        const ledm = M({ color: 0x27c96b, emissive: 0x27c96b, emissiveIntensity: 0.8 }); acLeds.push(ledm);
        const led = new THREE.Mesh(track(new THREE.SphereGeometry(0.02, 8, 8)), ledm); led.position.set(0.4, -0.08, -0.13); g.add(led);
        g.position.set(x, y, z); g.rotation.y = ry; interior.add(g);
      };
      mkAC(-HW * 0.2, 2.5, -HD * 0.16 + 1.55, Math.PI);      // صالة
      mkAC(HW * 0.28, 2.5, HD * 0.3);                        // سفرة/مطبخ
      mkAC(-HW * 0.24, FLOOR + 2.5, HD * 0.26 + 1.0, Math.PI); // نوم 1
      mkAC(HW * 0.26, FLOOR + 2.5, HD * 0.26 + 1.0, Math.PI);  // نوم 2
      // كومبرسرات على الجدار الجانبي
      const condM = M({ color: 0xd9dcdf, roughness: 0.5 });
      [[HW / 2 + 0.35, 1.0], [HW / 2 + 0.35, 2.2]].forEach(([cx, cy]) => {
        const cd = new THREE.Mesh(B(0.85, 0.6, 0.32), condM); cd.position.set(cx, cy, HD * 0.1); cd.rotation.y = Math.PI / 2; scene.add(cd);
        const fan = new THREE.Mesh(track(new THREE.CircleGeometry(0.2, 20)), M({ color: 0x4a4f52, roughness: 0.6 })); fan.position.set(cx + 0.17, cy, HD * 0.1); fan.rotation.y = Math.PI / 2; scene.add(fan);
      });

      // ======== الدرج الداخلي (أرضي → أول → سطح) داخل البرج ========
      const stairMat = M({ color: 0xcbb79a, roughness: 0.9 });
      const stX = -HW / 2 + towerW / 2;
      for (let fl = 0; fl < 2; fl++) {
        const steps = 12, sh = FLOOR / steps, run = 0.24;
        for (let i = 0; i < steps; i++) {
          const st = new THREE.Mesh(B(1.3, sh, run), stairMat);
          st.position.set(stX, fl * FLOOR + sh * (i + 0.5), -HD / 2 + 0.7 + i * run);
          interior.add(st);
        }
      }
      scene.add(interior);

      // ======== غرفة السطح (بيتونة) بأجهزة هويمايلز ========
      const roomW = 3.6, roomD = 2.8, roomH = 2.4;
      const roomX = -HW / 2 + towerW / 2 + 0.4, roomZ = HD / 2 - roomD / 2 - 0.6;
      const room = new THREE.Group();
      const rWall = fadeMat({ color: 0xf0ebdf, roughness: 0.95 });
      const rb = new THREE.Mesh(B(roomW, roomH, 0.1), rWall); rb.position.set(0, roomH / 2, roomD / 2); room.add(rb);
      const rl = new THREE.Mesh(B(0.1, roomH, roomD), rWall); rl.position.set(-roomW / 2, roomH / 2, 0); room.add(rl);
      const rr = new THREE.Mesh(B(0.1, roomH, roomD), rWall); rr.position.set(roomW / 2, roomH / 2, 0); room.add(rr);
      const rt = new THREE.Mesh(B(roomW + 0.2, 0.12, roomD + 0.2), slabMat); rt.position.set(0, roomH + 0.06, 0); rt.castShadow = true; room.add(rt);
      const rg = new THREE.Mesh(B(roomW - 0.2, roomH - 0.3, 0.04), track(new THREE.MeshStandardMaterial({ color: 0x1c2a38, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.25 })));
      rg.position.set(0, roomH / 2, -roomD / 2); room.add(rg);
      const rf = new THREE.Mesh(B(roomW, 0.06, roomD), M({ color: 0xb9b2a4, roughness: 1 })); rf.position.set(0, 0.03, 0); room.add(rf);
      // انفرترات هويمايلز على الجدار الخلفي (أبيض + غطاء سفلي + مفتاح أحمر + حلقة LED)
      const invLed = [];
      const invCount = Math.max(1, inverters);
      const invWhiteM = M({ color: 0xf7f8f9, roughness: 0.42, metalness: 0.06 });
      const redM = M({ color: 0xd23b34, roughness: 0.5 });
      let invAnchor = null;
      const spanInv = Math.min(roomW - 0.6, invCount * 0.55);
      for (let i = 0; i < invCount; i++) {
        const ix = invCount === 1 ? 0 : -spanInv / 2 + (i * spanInv) / (invCount - 1);
        const iy = 1.55, iz = roomD / 2 - 0.13;
        const bd = new THREE.Mesh(B(0.44, 0.68, 0.17), invWhiteM); bd.position.set(ix, iy, iz); room.add(bd);
        const cov = new THREE.Mesh(B(0.44, 0.2, 0.18), invWhiteM); cov.position.set(ix, iy - 0.35, iz); room.add(cov);
        const sw = new THREE.Mesh(track(new THREE.CylinderGeometry(0.032, 0.032, 0.06, 10)), redM); sw.rotation.x = Math.PI / 2; sw.position.set(ix - 0.25, iy - 0.3, iz - 0.02); room.add(sw);
        const ringM = track(new THREE.MeshBasicMaterial({ color: 0x36e07a, side: THREE.DoubleSide })); invLed.push(ringM);
        const ring = new THREE.Mesh(track(new THREE.RingGeometry(0.035, 0.055, 18)), ringM); ring.position.set(ix, iy + 0.05, iz - 0.095); room.add(ring);
        if (i === 0) invAnchor = new THREE.Vector3(ix, iy, iz);
      }
      // بطاريات هويمايلز أبراج نحيلة على الأرض
      const chargeBars = [];
      let batAnchor = null;
      const batCount = Math.max(0, batteries);
      if (batCount > 0) {
        const bw = 0.36, bd2 = 0.2, bh = 1.15, bgap = 0.08;
        const cols = Math.min(batCount, Math.floor((roomW - 0.4) / (bw + bgap)) || 1);
        const rows = Math.ceil(batCount / cols);
        for (let i = 0; i < batCount; i++) {
          const r = Math.floor(i / cols), c = i % cols;
          const rowN = Math.min(cols, batCount - r * cols);
          const x0 = -(rowN * bw + (rowN - 1) * bgap) / 2 + bw / 2;
          const x = x0 + c * (bw + bgap);
          const z = -roomD / 2 + 0.5 + r * (bd2 + 0.25);
          const tw = new THREE.Mesh(B(bw, bh, bd2), invWhiteM); tw.position.set(x, bh / 2 + 0.06, z); room.add(tw);
          const fullH = bh - 0.24, bottom = 0.2;
          const bm = M({ color: 0x2fe06a, emissive: 0x2fe06a, emissiveIntensity: 0.85 });
          const bar = new THREE.Mesh(B(bw - 0.16, fullH, 0.02), bm);
          bar.position.set(x, bottom, z - bd2 / 2 - 0.012); bar.scale.y = 0.05; bar.userData = { bottom, fullH }; room.add(bar); chargeBars.push(bar);
          if (i === 0) batAnchor = new THREE.Vector3(x, bh * 0.6, z);
        }
      }
      room.position.set(roomX, HH + 0.15, roomZ);
      scene.add(room);
      const invWorld = invAnchor ? invAnchor.clone().add(room.position) : new THREE.Vector3(roomX, HH + 1.5, roomZ);
      const batWorld = batAnchor ? batAnchor.clone().add(room.position) : null;

      // ======== الألواح فوق السطح ========
      const structsGroup = new THREE.Group();
      const structs = splitStructures(panels);
      let pMaxW = 0, pDepth = 0, panelFront = null;
      structs.forEach((s, i) => {
        const g = buildStructure(s.cols, LEG + i * LIFT);
        const off = i * (2 * TIER_L * Math.cos(TILT) + GAPS);
        g.position.set(-s.cols * PANEL_W / 2, 0, off); structsGroup.add(g);
        pMaxW = Math.max(pMaxW, s.cols * PANEL_W); pDepth = off + g.userData.dz;
        if (i === 0) panelFront = new THREE.Vector3(0, LEG, off);
      });
      structsGroup.position.set(1.2, HH + 0.16, -HD / 2 + 0.9);
      scene.add(structsGroup);

      // ======== الحديقة: عشب متمايل + أشجار + ممر ========
      const lawn = new THREE.Mesh(track(new THREE.PlaneGeometry(HW + 4, LOT_FRONT - 0.8)), M({ color: 0x4f8f43, roughness: 1 }));
      lawn.rotation.x = -Math.PI / 2; lawn.position.set(-2, 0.01, -HD / 2 - LOT_FRONT / 2 + 0.3); lawn.receiveShadow = true; scene.add(lawn);
      // ممر مبلط للمدخل + درايف للكراج
      const path = new THREE.Mesh(track(new THREE.PlaneGeometry(1.4, LOT_FRONT)), M({ color: 0xd6cfc2, roughness: 0.9 }));
      path.rotation.x = -Math.PI / 2; path.position.set(-HW / 2 + towerW + 0.9, 0.02, -HD / 2 - LOT_FRONT / 2); scene.add(path);
      const drive = new THREE.Mesh(track(new THREE.PlaneGeometry(3.2, LOT_FRONT)), M({ color: 0x9a9a9a, roughness: 0.9 }));
      drive.rotation.x = -Math.PI / 2; drive.position.set(gateX, 0.02, -HD / 2 - LOT_FRONT / 2); drive.receiveShadow = true; scene.add(drive);
      // عشب متمايل
      const bladeGeo = track(new THREE.ConeGeometry(0.028, 0.32, 4, 1)); bladeGeo.translate(0, 0.16, 0);
      const grassMat = M({ color: 0x57a244, roughness: 1 });
      grassMat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = windU;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float ph = instanceMatrix[3].x * 0.8 + instanceMatrix[3].z * 0.6;
           float sway = sin(uTime * 1.7 + ph) * 0.15 + sin(uTime * 3.3 + ph * 1.7) * 0.05;
           transformed.x += sway * position.y;`
        );
      };
      const grassN = 1600;
      const grass = new THREE.InstancedMesh(bladeGeo, grassMat, grassN);
      const dum = new THREE.Object3D(); let gi = 0;
      for (let k = 0; k < grassN; k++) {
        const gx = -2 + (Math.random() - 0.5) * (HW + 3.6);
        const gz = -HD / 2 - LOT_FRONT / 2 + 0.3 + (Math.random() - 0.5) * (LOT_FRONT - 1.2);
        if (gx > gateX - 2 && gx < gateX + 2) continue;           // درايف
        if (gx > -HW / 2 + towerW + 0.1 && gx < -HW / 2 + towerW + 1.7) continue; // ممر
        dum.position.set(gx, 0, gz); dum.rotation.y = Math.random() * Math.PI;
        const s = 0.75 + Math.random() * 0.7; dum.scale.set(s, 0.8 + Math.random() * 0.7, s);
        dum.updateMatrix(); grass.setMatrixAt(gi++, dum.matrix);
      }
      grass.count = gi; grass.instanceMatrix.needsUpdate = true; scene.add(grass);
      // أشجار وشجيرات
      const trunkM = M({ color: 0x6b4a2c, roughness: 0.9 }); const leafM = M({ color: 0x3f8b3a, roughness: 0.9 });
      const mkTree = (x, z, sc = 1) => {
        const tg = new THREE.Group();
        const tr = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.13, 1.2, 8)), trunkM); tr.position.y = 0.6; tr.castShadow = true; tg.add(tr);
        [[0, 1.45, 0.5], [0.3, 1.65, 0.4], [-0.3, 1.7, 0.4], [0, 2.0, 0.36]].forEach(([dx, dy, r]) => {
          const c = new THREE.Mesh(track(new THREE.IcosahedronGeometry(r, 1)), leafM); c.position.set(dx, dy, 0); c.castShadow = true; tg.add(c);
        });
        tg.position.set(x, 0, z); tg.scale.setScalar(sc); scene.add(tg);
      };
      mkTree(-HW / 2 - 2.2, -HD / 2 - 2, 1.05);
      mkTree(-HW / 2 + 1.4, -HD / 2 - LOT_FRONT + 1.2, 0.85);
      const shrubG = track(new THREE.IcosahedronGeometry(0.3, 1));
      for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(shrubG, leafM); s.position.set(-HW / 2 + 1 + i * 1.4, 0.28, WALL_Z + 0.65); s.scale.y = 1.2; scene.add(s); }

      // ======== سيارة على الدرايف ========
      const car = new THREE.Group();
      const carPaint = M({ color: 0x8e9aa5, roughness: 0.35, metalness: 0.5 });
      const cb1 = new THREE.Mesh(B(1.75, 0.5, 4.0), carPaint); cb1.position.y = 0.55; cb1.castShadow = true; car.add(cb1);
      const cb2 = new THREE.Mesh(B(1.6, 0.48, 2.2), carPaint); cb2.position.set(0, 1.0, -0.2); cb2.castShadow = true; car.add(cb2);
      const glassM2 = M({ color: 0x18242e, roughness: 0.2, metalness: 0.4 });
      const cw1 = new THREE.Mesh(B(1.5, 0.36, 0.06), glassM2); cw1.position.set(0, 1.0, 0.95); car.add(cw1);
      const wheelG = track(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18)); const wheelM = M({ color: 0x121212, roughness: 0.7 });
      [[0.82, 1.35], [-0.82, 1.35], [0.82, -1.35], [-0.82, -1.35]].forEach(([wx, wz]) => { const w2 = new THREE.Mesh(wheelG, wheelM); w2.rotation.z = Math.PI / 2; w2.position.set(wx, 0.34, wz); car.add(w2); });
      car.position.set(gateX, 0, -HD / 2 - 2.6); car.rotation.y = Math.PI / 2 * 0 + 0; scene.add(car);

      // ======== أعمدة إنارة الشارع (فانوس مثل الصورة) ========
      const lampGlow = [];
      const mkLamp = (x, z) => {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 10)), M({ color: 0x24282c, roughness: 0.5, metalness: 0.6 }));
        pole.position.y = 2.1; pole.castShadow = true; g.add(pole);
        const cap = new THREE.Mesh(track(new THREE.ConeGeometry(0.28, 0.3, 12)), M({ color: 0x24282c, roughness: 0.5 })); cap.position.y = 4.35; g.add(cap);
        const bulbM = M({ color: 0xfff1c8, emissive: 0xffd57a, emissiveIntensity: 0.05, roughness: 0.3 }); lampGlow.push(bulbM);
        const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.17, 14, 14)), bulbM); bulb.position.y = 4.12; g.add(bulb);
        g.position.set(x, 0, z); scene.add(g);
      };
      mkLamp(3.4, WALL_Z - 0.9); mkLamp(-9, WALL_Z - 0.9); mkLamp(14, WALL_Z - 0.9);
      mkLamp(-2, WALL_Z - SIDEWALK - ROAD_W - 1.2);

      // ======== بيوت الجيران (كتل عصرية متنوعة) ========
      const mkNeighbor = (x, z, w, h, d, tone, ry = 0) => {
        const g = new THREE.Group();
        const bodyM = M({ color: tone, roughness: 0.9 });
        const bd = new THREE.Mesh(B(w, h, d), bodyM); bd.position.y = h / 2; bd.castShadow = true; bd.receiveShadow = true; g.add(bd);
        const acc = new THREE.Mesh(B(w * 0.3, h + 0.5, 0.2), M({ color: 0x4a4f52, roughness: 0.85 }));
        acc.position.set(-w * 0.25, (h + 0.5) / 2, d / 2 + 0.05); g.add(acc);
        const wg = B(1.2, 1.1, 0.06);
        for (let r = 0; r < Math.floor(h / 3); r++) for (let c = 0; c < 2; c++) {
          const wm = glassMat.clone(); track(wm); windowsGlow.push(wm);
          const win = new THREE.Mesh(wg, wm); win.position.set(w * 0.12 + c * 1.8, 1.6 + r * 3, d / 2 + 0.04); g.add(win);
        }
        g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
      };
      mkNeighbor(-16.5, -HD / 2 + 2, 9, 6.4, 11, 0xefe9dc);
      mkNeighbor(16.5, -HD / 2 + 2, 9, 6.2, 11, 0xe7ddc9);
      mkNeighbor(-12, WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 6, 9, 6, 10, 0xf1ece1, Math.PI);
      mkNeighbor(1, WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 6, 8, 5.6, 10, 0xe3dbcb, Math.PI);
      mkNeighbor(13.5, WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 6, 9, 6.6, 10, 0xece4d4, Math.PI);

      // ======== الأسلاك والنبضات ========
      const wires = [];
      const addWire = (a, b, mid, role, colorHex) => {
        const m = mid || new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.5, 0));
        const curve = new THREE.CatmullRomCurve3([a, m, b]);
        const tube = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 44, 0.02, 8, false)), M({ color: 0x222a33, roughness: 0.6 })); scene.add(tube);
        const mat = track(new THREE.MeshBasicMaterial({ color: colorHex })); const geo = track(new THREE.SphereGeometry(0.06, 12, 12)); const pulses = [];
        for (let k = 0; k < 4; k++) { const p = new THREE.Mesh(geo, mat); scene.add(p); pulses.push({ mesh: p, off: k / 4 }); }
        wires.push({ curve, pulses, mat, role, speed: 0.22 });
      };
      if (structs.length && panelFront) {
        const pw = panelFront.clone().add(structsGroup.position);
        addWire(pw, invWorld.clone().add(new THREE.Vector3(0, 0.3, -0.1)), new THREE.Vector3((pw.x + invWorld.x) / 2, HH + 1.2, (pw.z + invWorld.z) / 2), 'gen', 0x66ccff);
      }
      if (batWorld) addWire(invWorld.clone(), batWorld.clone(), new THREE.Vector3((invWorld.x + batWorld.x) / 2, HH + 0.8, invWorld.z - 0.3), 'store', 0x2fe06a);
      const housePoint = new THREE.Vector3(0, FLOOR - 0.3, HD * 0.1);
      addWire(invWorld.clone(), housePoint, new THREE.Vector3(invWorld.x + 0.5, HH * 0.6, HD * 0.25), 'load', 0xffcf66);

      // ======== كاميرا وتحكم ========
      const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 600);
      // زاوية افتتاحية: من الشارع قدّام البيت — تعرض الواجهة والسياج والبوابة والجيران
      camera.position.set(9, 6.5, WALL_Z - SIDEWALK - ROAD_W - 4);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(W(), H()); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.appendChild(renderer.domElement);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.dampingFactor = 0.08;
      controls.autoRotate = true; controls.autoRotateSpeed = 0.4;
      controls.minDistance = 2.5; controls.maxDistance = 70;
      controls.minPolarAngle = 0.15; controls.maxPolarAngle = Math.PI / 2 - 0.02;
      controls.target.set(0, 3.4, -1);
      controls.addEventListener('start', () => { controls.autoRotate = false; });
      controls.update();

      // ======== دورة اليوم ========
      const skyDay = new THREE.Color(0xbfe3ff), skySet = new THREE.Color(0xffb066), skyNight = new THREE.Color(0x0c1526);
      const R = 46, Rh = 40;
      const clock = new THREE.Clock();
      const animate = () => {
        if (disposed) return;
        rafRef.current = requestAnimationFrame(animate);
        const et = clock.getElapsedTime();
        windU.value = et;
        const t = ((timeRef.current % 24) + 24) % 24;
        const dayAngle = ((t - 6) / 12) * Math.PI;
        const sinE = Math.sin(dayAngle);
        const isDay = sinE > 0.015; const inten = Math.max(0, sinE);

        // الشمس بقوس فوك الشارع (قدّام البيت حتى الواجهة مضاءة) والقمر مقابلها
        sunBall.position.set(Math.cos(dayAngle) * R, sinE * Rh, -HD / 2 - 10 - 0.2 * R);
        sunGlow.position.copy(sunBall.position); sunLight.position.copy(sunBall.position);
        sunLight.intensity = 0.15 + inten * 2.6;
        sunBall.visible = sunBall.position.y > -1; sunGlow.visible = sunBall.visible;
        moonBall.position.set(-Math.cos(dayAngle) * R * 0.9, Math.max(0.25, -sinE) * Rh * 0.9, -HD / 2 - 18);
        moonBall.visible = !isDay;

        const sky = isDay ? lerpC(skySet, skyDay, inten * 1.6) : skyNight;
        scene.background.copy(sky);
        hemi.intensity = isDay ? 0.32 + inten * 0.55 : 0.2;
        amb.intensity = isDay ? 0.24 + inten * 0.18 : 0.15;
        fillL.intensity = isDay ? 0.45 : 0.1;

        // إنارة: شبابيك + أسقف داخلية + فوانيس الشارع + مؤشرات السبلت
        const winI = isDay ? 0.04 : 1.0;
        windowsGlow.forEach((m) => { m.emissiveIntensity = winI; });
        ceilGlow.forEach((m) => { m.emissiveIntensity = isDay ? 0.02 : 0.85; });
        lampGlow.forEach((m) => { m.emissiveIntensity = isDay ? 0.05 : 1.6; });
        acLeds.forEach((m) => { m.emissiveIntensity = isDay ? 0.35 : 0.9; });
        const pGlow = isDay ? 0.03 + inten * 0.08 : 0;
        panelSurfaces.forEach((m) => { m.emissiveIntensity = pGlow; });

        // شفافية الجدران عند التقريب
        const dist = camera.position.distanceTo(controls.target);
        const op = Math.max(0.14, Math.min(1, (dist - 7) / 12));
        fadeMats.forEach((m) => { m.opacity = op; });

        // تدفق الطاقة
        for (const w2 of wires) {
          let active = true, reverse = false, col = null;
          if (w2.role === 'gen') { active = isDay; col = 0x66ccff; }
          else if (w2.role === 'store') { if (isDay) col = 0x2fe06a; else { reverse = true; col = 0xffa83a; } }
          else if (w2.role === 'load') col = isDay ? 0xffcf66 : 0xffa83a;
          if (col != null) w2.mat.color.setHex(col);
          for (const p of w2.pulses) {
            p.mesh.visible = active; if (!active) continue;
            let u = (et * w2.speed + p.off) % 1; if (reverse) u = 1 - u;
            w2.curve.getPointAt(u, p.mesh.position);
          }
        }
        // شحن/تفريغ البطاريات
        let soc; if (isDay) soc = 0.35 + 0.6 * ((t - 6) / 12); else { const nf = t < 6 ? (t + 6) / 12 : (t - 18) / 12; soc = 0.92 - 0.5 * Math.min(1, nf); }
        soc = Math.max(0.1, Math.min(1, soc));
        chargeBars.forEach((bar, i) => {
          const v = Math.max(0.06, Math.min(1, soc + ((i % 3) - 1) * 0.04));
          bar.scale.y = v; bar.position.y = bar.userData.bottom + (bar.userData.fullH * v) / 2;
          bar.material.color.setHex(isDay ? 0x2fe06a : 0xffb14a);
          bar.material.emissive.setHex(isDay ? 0x2fe06a : 0xffb14a);
        });
        invLed.forEach((m2) => { m2.color.setHex(isDay ? 0x36e07a : 0xffb14a); });

        controls.update(); renderer.render(scene, camera);
      };
      animate();
      ro = new ResizeObserver(() => { if (!renderer) return; renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); });
      ro.observe(mount);
    })();

    return () => {
      disposed = true; cancelAnimationFrame(rafRef.current);
      try { ro && ro.disconnect(); } catch { /* noop */ }
      try { controls && controls.dispose(); } catch { /* noop */ }
      if (renderer) { renderer.dispose(); renderer.domElement && renderer.domElement.remove(); }
      disp.forEach((o) => { try { o.dispose && o.dispose(); } catch { /* noop */ } });
    };
  }, [panels, batteries, inverters]);

  const onTime = (e) => { const v = Number(e.target.value); timeRef.current = v; setTimeLabel(fmtTime(v)); };
  const chips = [
    panels > 0 && ['☀️', 'الألواح', `${panels} لوح`],
    ['🔌', 'الانفرتر', `${Math.max(1, inverters)}`],
    batteries > 0 && ['🔋', 'البطاريات', `${batteries}`],
    nightHours != null && ampNight > 0 && ['🕐', 'تجهيز ليلي', `~${nightHours} ساعة`],
    dayAmps != null && ampDay > 0 && ['⚡', 'نهاراً', `~${dayAmps} أمبير`],
  ].filter(Boolean);

  return (
    <div className="showcase-overlay" dir="rtl">
      <div className="showcase-canvas" ref={mountRef} />
      <div className="showcase-topbar">
        <div className="showcase-title">منظومتك الشمسية — عرض تفاعلي</div>
        <button className="showcase-close" onClick={onClose} title="إغلاق">✕</button>
      </div>
      <div className="showcase-hud">
        {chips.map((c, i) => (<div className="showcase-chip" key={i}><span className="ic">{c[0]}</span><span className="lb">{c[1]}</span><b className="vl">{c[2]}</b></div>))}
      </div>
      <div className="showcase-timebar">
        <span className="tclock">🕐 {timeLabel}</span>
        <span className="tend">🌅</span>
        <input type="range" min={6} max={30} step={0.25} defaultValue={13} onInput={onTime} onChange={onTime} />
        <span className="tend">🌙</span>
      </div>
      <div className="showcase-hint">🖱️ اسحب للتدوير • قرّب بعجلة الماوس (تصير الجدران شفافة ويبين الأثاث والأجهزة) • حرّك الشريط لوقت اليوم</div>
    </div>
  );
}
