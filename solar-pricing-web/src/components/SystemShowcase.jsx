// عرض تفاعلي ثلاثي الأبعاد للمنظومة على بيت عصري بطابقين — يبهر الزبون:
// • بيت بطابقين + حديقة وعشب يتمايل بالرياح + مدخل ومرأب وسيارة.
// • غرفة على السطح (بيتونة) واجهتها زجاجية، بداخلها انفرترات هويمايلز وبطاريات
//   بعدد العرض، ودرج داخلي يوصل لها. الألواح فوق السطح (نفس شكل الغلاف).
// • شمس/قمر جسمان ثابتان بفضاء الـ3D يتحركان بقوس حسب شريط الوقت.
// • نهاراً: توليد وشحن. ليلاً: التوليد ينقطع، إنارة البيت تشتعل، والبطارية تغذّي البيت.
// • عند التقريب (زوم) تصير جدران البيت شفافة فتبين الأجهزة والدرج بالداخل.
// three.js + OrbitControls يُحمّلان عند الفتح فقط.
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
  const timeRef = useRef(12);
  const [timeLabel, setTimeLabel] = useState(fmtTime(12));

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

      // ===== نسيج اللوح =====
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
      const PANEL_W = 1.05, TIER_L = 1.15, TILT = THREE.MathUtils.degToRad(23);
      const LEG = 0.4, LIFT = 0.8, GAP = 1.05, POST = 0.06, FOOT = 0.26;
      const panelMat = track(new THREE.MeshStandardMaterial({ map: track(panelTexture()), roughness: 0.32, metalness: 0.12, emissive: 0x24406e, emissiveIntensity: 0 }));
      const metalMat = track(new THREE.MeshStandardMaterial({ color: 0x8a929c, roughness: 0.5, metalness: 0.7 }));
      const concreteMat = track(new THREE.MeshStandardMaterial({ color: 0xdfe2e6, roughness: 0.9 }));
      const panelSurfaces = [];
      const buildStructure = (cols, baseH) => {
        const grp = new THREE.Group();
        const w = cols * PANEL_W, slope = 2 * TIER_L;
        const dz = slope * Math.cos(TILT), dy = slope * Math.sin(TILT), backH = baseH + dy;
        const surfGeo = track(new THREE.BoxGeometry(w, 0.05, slope));
        const mat = panelMat.clone(); mat.map = panelMat.map.clone();
        mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(cols, 2); mat.map.needsUpdate = true; track(mat); track(mat.map);
        const surf = new THREE.Mesh(surfGeo, mat); surf.castShadow = true; surf.receiveShadow = true;
        surf.position.set(w / 2, (baseH + backH) / 2, dz / 2); surf.rotation.x = -TILT; grp.add(surf); panelSurfaces.push(mat);
        const legF = track(new THREE.BoxGeometry(POST, baseH, POST)), legB = track(new THREE.BoxGeometry(POST, backH, POST)), footGeo = track(new THREE.BoxGeometry(FOOT, 0.14, FOOT));
        for (let c = 0; c <= cols; c++) {
          const x = c * PANEL_W;
          const fl = new THREE.Mesh(legF, metalMat); fl.position.set(x, baseH / 2, 0); fl.castShadow = true; grp.add(fl);
          const bl = new THREE.Mesh(legB, metalMat); bl.position.set(x, backH / 2, dz); bl.castShadow = true; grp.add(bl);
          const f1 = new THREE.Mesh(footGeo, concreteMat); f1.position.set(x, 0.07, 0); grp.add(f1);
          const f2 = new THREE.Mesh(footGeo, concreteMat); f2.position.set(x, 0.07, dz); grp.add(f2);
        }
        grp.userData = { w, dz }; return grp;
      };

      // ===== المشهد + إضاءة =====
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xbfe3ff);
      const sunLight = new THREE.DirectionalLight(0xfff2d8, 2.6);
      sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048);
      Object.assign(sunLight.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 0.5, far: 90 });
      scene.add(sunLight);
      const hemi = track(new THREE.HemisphereLight(0xdff0ff, 0xc7b490, 0.7)); scene.add(hemi);
      const amb = track(new THREE.AmbientLight(0xfff4e2, 0.34)); scene.add(amb);
      const fill = track(new THREE.DirectionalLight(0xfff0d8, 0.5)); fill.position.set(6, 5, -8); scene.add(fill);
      const sunBall = new THREE.Mesh(track(new THREE.SphereGeometry(0.9, 24, 24)), track(new THREE.MeshBasicMaterial({ color: 0xffd451 })));
      const sunGlow = new THREE.Mesh(track(new THREE.SphereGeometry(1.7, 24, 24)), track(new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.28 })));
      const moonBall = new THREE.Mesh(track(new THREE.SphereGeometry(0.6, 20, 20)), track(new THREE.MeshBasicMaterial({ color: 0xdfe8ff })));
      scene.add(sunBall, sunGlow, moonBall);

      // ===== الألواح =====
      const structsGroup = new THREE.Group();
      const structs = splitStructures(panels);
      let pMaxW = 0, pDepth = 0, panelFront = null;
      structs.forEach((s, i) => {
        const g = buildStructure(s.cols, LEG + i * LIFT);
        const off = i * (2 * TIER_L * Math.cos(TILT) + GAP);
        g.position.set(-s.cols * PANEL_W / 2, 0, off); structsGroup.add(g);
        pMaxW = Math.max(pMaxW, s.cols * PANEL_W); pDepth = off + g.userData.dz;
        if (i === 0) panelFront = new THREE.Vector3(0, LEG, off);
      });

      // ===== البيت العصري بطابقين =====
      const FLOOR = 3.0, HH = FLOOR * 2; // ارتفاع الطابقين
      const houseW = Math.max(8.5, pMaxW + 3.5);
      const houseD = Math.max(7.5, pDepth + 3.5);
      const fadeMats = []; // جدران تصير شفافة عند الزوم
      const mkWall = (hex) => { const m = track(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, transparent: true, opacity: 1 })); fadeMats.push(m); return m; };
      const wallMat = mkWall(0xf6ecd6), wall2Mat = mkWall(0xeaddbf), stoneMat = mkWall(0xa8977c);
      const glassMat = track(new THREE.MeshStandardMaterial({ color: 0x22303f, roughness: 0.15, metalness: 0.35, emissive: 0xffcf7a, emissiveIntensity: 0.05 }));
      const frameMat = track(new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.5 }));
      const windows = [];
      const house = new THREE.Group();
      // كتلتان (طابق أرضي أعرض قليلاً + طابق علوي)
      const g0 = new THREE.Mesh(track(new THREE.BoxGeometry(houseW, FLOOR, houseD)), wallMat); g0.position.y = FLOOR / 2; g0.castShadow = true; g0.receiveShadow = true; house.add(g0);
      const g1 = new THREE.Mesh(track(new THREE.BoxGeometry(houseW * 0.96, FLOOR, houseD * 0.96)), wall2Mat); g1.position.y = FLOOR * 1.5; g1.castShadow = true; g1.receiveShadow = true; house.add(g1);
      // شريط حجري عمودي عند المدخل (لمسة عصرية)
      const stone = new THREE.Mesh(track(new THREE.BoxGeometry(1.4, HH, 0.14)), stoneMat); stone.position.set(-houseW / 2 + 1.6, HH / 2, -houseD / 2 - 0.05); house.add(stone);
      // سطح + دربزين زجاجي
      const roof = new THREE.Mesh(track(new THREE.BoxGeometry(houseW * 0.96 + 0.1, 0.12, houseD * 0.96 + 0.1)), stoneMat); roof.position.y = HH + 0.06; roof.receiveShadow = true; house.add(roof);
      const parGeoX = track(new THREE.BoxGeometry(houseW * 0.96, 0.5, 0.08));
      const parGeoZ = track(new THREE.BoxGeometry(0.08, 0.5, houseD * 0.96));
      const glassPar = track(new THREE.MeshStandardMaterial({ color: 0x9fd0ff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35 }));
      [[0, houseD * 0.48], [0, -houseD * 0.48]].forEach(([x, z]) => { const m = new THREE.Mesh(parGeoX, glassPar); m.position.set(x, HH + 0.35, z); house.add(m); });
      [[houseW * 0.48, 0], [-houseW * 0.48, 0]].forEach(([x, z]) => { const m = new THREE.Mesh(parGeoZ, glassPar); m.position.set(x, HH + 0.35, z); house.add(m); });
      // شبابيك واجهة كبيرة (زجاج بإطار) على الواجهة الأمامية −z
      const zf = -houseD / 2 - 0.02;
      const addWindow = (x, y, w, h, z = zf) => {
        const fr = new THREE.Mesh(track(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.06)), frameMat); fr.position.set(x, y, z); house.add(fr);
        const gm = glassMat.clone(); track(gm); const gl = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, 0.04)), gm); gl.position.set(x, y, z - 0.02); house.add(gl); windows.push(gm);
      };
      addWindow(houseW * 0.16, 1.6, 2.4, 1.8); // شباك أرضي كبير
      addWindow(-houseW * 0.28, 1.5, 1.2, 1.4);
      addWindow(houseW * 0.16, FLOOR + 1.6, 2.2, 1.6); // طابق علوي
      addWindow(-houseW * 0.28, FLOOR + 1.6, 1.6, 1.6);
      // باب المدخل
      const door = new THREE.Mesh(track(new THREE.BoxGeometry(1.0, 2.1, 0.06)), track(new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.6 }))); door.position.set(-houseW / 2 + 1.6, 1.05, zf); house.add(door);
      // باب المرأب (يمين الواجهة)
      const garage = new THREE.Mesh(track(new THREE.BoxGeometry(2.6, 2.1, 0.06)), track(new THREE.MeshStandardMaterial({ color: 0xbfc4c9, roughness: 0.5, metalness: 0.3 }))); garage.position.set(houseW / 2 - 1.9, 1.05, zf); house.add(garage);
      scene.add(house);

      // ===== درج داخلي (يبين عند الشفافية) =====
      const stairMat = track(new THREE.MeshStandardMaterial({ color: 0xcbb79a, roughness: 0.9 }));
      const stairs = new THREE.Group();
      const steps = 16, stepH = HH / steps, stepRun = 0.28;
      for (let i = 0; i < steps; i++) {
        const st = new THREE.Mesh(track(new THREE.BoxGeometry(1.2, stepH, stepRun)), stairMat);
        st.position.set(houseW / 2 - 1.6, stepH * (i + 0.5), -houseD / 2 + 1.2 + i * stepRun); stairs.add(st);
      }
      scene.add(stairs);

      // ===== غرفة السطح (بيتونة) بواجهة زجاجية — تحوي الأجهزة =====
      const roomW = Math.min(3.4, houseW * 0.45), roomD = 2.6, roomH = 2.5;
      const roomX = -houseW * 0.2, roomZ = houseD * 0.2;
      const room = new THREE.Group();
      const rWall = mkWall(0xeae2d4);
      const rBack = new THREE.Mesh(track(new THREE.BoxGeometry(roomW, roomH, 0.1)), rWall); rBack.position.set(0, roomH / 2, roomD / 2); room.add(rBack);
      const rSideL = new THREE.Mesh(track(new THREE.BoxGeometry(0.1, roomH, roomD)), rWall); rSideL.position.set(-roomW / 2, roomH / 2, 0); room.add(rSideL);
      const rSideR = new THREE.Mesh(track(new THREE.BoxGeometry(0.1, roomH, roomD)), rWall); rSideR.position.set(roomW / 2, roomH / 2, 0); room.add(rSideR);
      const rTop = new THREE.Mesh(track(new THREE.BoxGeometry(roomW + 0.16, 0.12, roomD + 0.16)), stoneMat); rTop.position.set(0, roomH + 0.06, 0); rTop.castShadow = true; room.add(rTop);
      // واجهة زجاجية أمامية (−z) شفافة تبين الأجهزة
      const rGlass = new THREE.Mesh(track(new THREE.BoxGeometry(roomW - 0.1, roomH - 0.3, 0.04)), track(new THREE.MeshStandardMaterial({ color: 0x1c2a38, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.28 }))); rGlass.position.set(0, roomH / 2, -roomD / 2); room.add(rGlass);
      const rFloor = new THREE.Mesh(track(new THREE.BoxGeometry(roomW, 0.06, roomD)), track(new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 1 }))); rFloor.position.set(0, 0.03, 0); rFloor.receiveShadow = true; room.add(rFloor);

      // انفرترات هويمايلز (بعدد العرض) على الجدار الخلفي
      const invLed = [];
      const invCount = Math.max(1, inverters);
      const invWhite = track(new THREE.MeshStandardMaterial({ color: 0xf6f7f8, roughness: 0.45, metalness: 0.08 }));
      const invGeo = track(new THREE.BoxGeometry(0.42, 0.66, 0.16));
      const invCoverGeo = track(new THREE.BoxGeometry(0.42, 0.2, 0.17));
      const redMat = track(new THREE.MeshStandardMaterial({ color: 0xd23b34, roughness: 0.5 }));
      let invAnchor = null;
      const invSpan = Math.min(roomW - 0.4, invCount * 0.5);
      for (let i = 0; i < invCount; i++) {
        const ix = -invSpan / 2 + (invCount === 1 ? invSpan / 2 : (i * invSpan) / (invCount - 1));
        const iy = 1.55, iz = roomD / 2 - 0.12;
        const b = new THREE.Mesh(invGeo, invWhite); b.position.set(ix, iy, iz); b.castShadow = true; room.add(b);
        const cover = new THREE.Mesh(invCoverGeo, invWhite); cover.position.set(ix, iy - 0.34, iz); room.add(cover); // غطاء الأسلاك السفلي
        const sw = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10)), redMat); sw.rotation.x = Math.PI / 2; sw.position.set(ix - 0.24, iy - 0.28, iz - 0.02); room.add(sw); // مفتاح أحمر
        const led = new THREE.Mesh(track(new THREE.RingGeometry(0.03, 0.05, 16)), track(new THREE.MeshBasicMaterial({ color: 0x36e07a, side: THREE.DoubleSide }))); led.position.set(ix, iy + 0.02, iz - 0.09); room.add(led); invLed.push(led.material);
        if (i === 0) invAnchor = new THREE.Vector3(ix, iy, iz);
      }
      // بطاريات هويمايلز (أبراج نحيلة بعدد العرض) على الأرض
      const chargeBars = [];
      let batAnchor = null;
      const batCount = Math.max(0, batteries);
      const batWhite = track(new THREE.MeshStandardMaterial({ color: 0xf3f4f5, roughness: 0.4, metalness: 0.05 }));
      if (batCount > 0) {
        const bw = 0.34, bd = 0.18, bh = 1.15, gap = 0.06;
        const totalW = batCount * bw + (batCount - 1) * gap;
        const startX = -Math.min(totalW, roomW - 0.5) / 2 + bw / 2;
        const stepX = batCount > 1 ? Math.min(bw + gap, (roomW - 0.5 - bw) / (batCount - 1)) : 0;
        const bz = -roomD / 2 + 0.55;
        for (let i = 0; i < batCount; i++) {
          const x = startX + i * stepX;
          const tower = new THREE.Mesh(track(new THREE.BoxGeometry(bw, bh, bd)), batWhite); tower.position.set(x, bh / 2 + 0.05, bz); tower.castShadow = true; room.add(tower);
          const foot1 = new THREE.Mesh(track(new THREE.BoxGeometry(bw, 0.05, 0.04)), invWhite); foot1.position.set(x, 0.03, bz + bd / 2 - 0.02); room.add(foot1);
          // شريط شحن مضيء على الجهة الأمامية
          const fullH = bh - 0.2, bottom = 0.15;
          const bar = new THREE.Mesh(track(new THREE.BoxGeometry(bw - 0.14, fullH, 0.02)), track(new THREE.MeshStandardMaterial({ color: 0x2fe06a, emissive: 0x2fe06a, emissiveIntensity: 0.85 })));
          bar.position.set(x, bottom, bz - bd / 2 - 0.01); bar.scale.y = 0.05; bar.userData = { bottom, fullH }; room.add(bar); chargeBars.push(bar);
          if (i === 0) batAnchor = new THREE.Vector3(x, bh * 0.6, bz);
        }
      }
      room.position.set(roomX, HH + 0.12, roomZ);
      scene.add(room);
      const invWorld = invAnchor ? invAnchor.clone().add(room.position) : new THREE.Vector3(roomX, HH + 1.5, roomZ);
      const batWorld = batAnchor ? batAnchor.clone().add(room.position) : null;

      // الألواح فوق السطح (الجهة الأمامية من الروم)
      structsGroup.position.set(houseW * 0.12, HH + 0.12, -pDepth / 2 - 0.3);
      scene.add(structsGroup);

      // ===== الحديقة: أرضية + ممر + عشب متمايل + أشجار + سيارة =====
      const lawnMat = track(new THREE.MeshStandardMaterial({ color: 0x4f8f43, roughness: 1 }));
      const siteHalf = Math.max(houseW, houseD) * 0.9 + 6;
      const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(siteHalf * 2 + 30, siteHalf * 2 + 30)), track(new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 1 })));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
      // مرج أمامي
      const lawn = new THREE.Mesh(track(new THREE.PlaneGeometry(houseW + 6, 6)), lawnMat);
      lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, 0.01, -houseD / 2 - 4); lawn.receiveShadow = true; scene.add(lawn);
      // ممر مبلّط للمرأب
      const drive = new THREE.Mesh(track(new THREE.PlaneGeometry(3, 6)), track(new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.9 })));
      drive.rotation.x = -Math.PI / 2; drive.position.set(houseW / 2 - 1.9, 0.02, -houseD / 2 - 3); scene.add(drive);

      // عشب متمايل (InstancedMesh + شادر رياح)
      const bladeGeo = track(new THREE.ConeGeometry(0.03, 0.34, 4, 1, false));
      bladeGeo.translate(0, 0.17, 0);
      const grassMat = track(new THREE.MeshStandardMaterial({ color: 0x57a244, roughness: 1 }));
      grassMat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = windU;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.6;
           float sway = sin(uTime * 1.6 + ph) * 0.16 + sin(uTime * 3.1 + ph) * 0.05;
           transformed.x += sway * position.y;`
        );
      };
      const grassCount = 1400;
      const grass = new THREE.InstancedMesh(bladeGeo, grassMat, grassCount);
      grass.castShadow = false; grass.receiveShadow = false;
      const dummy = new THREE.Object3D();
      const lawnW = houseW + 5.6, lawnD = 5.6, lawnCZ = -houseD / 2 - 4;
      let gi = 0;
      for (let k = 0; k < grassCount; k++) {
        const gx = (Math.random() - 0.5) * lawnW;
        const gz = lawnCZ + (Math.random() - 0.5) * lawnD;
        // نتجنب الممر
        if (gx > houseW / 2 - 3.4 && gx < houseW / 2 - 0.4) continue;
        dummy.position.set(gx, 0, gz);
        dummy.rotation.y = Math.random() * Math.PI;
        const s = 0.7 + Math.random() * 0.8; dummy.scale.set(s, 0.8 + Math.random() * 0.7, s);
        dummy.updateMatrix(); grass.setMatrixAt(gi++, dummy.matrix);
      }
      grass.count = gi; grass.instanceMatrix.needsUpdate = true; scene.add(grass);

      // أشجار (جذع + كتل خضراء)
      const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 }));
      const leafMat = track(new THREE.MeshStandardMaterial({ color: 0x3f8b3a, roughness: 0.9 }));
      const mkTree = (x, z, sc = 1) => {
        const tg = new THREE.Group();
        const tr = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.14, 1.1, 8)), trunkMat); tr.position.y = 0.55; tr.castShadow = true; tg.add(tr);
        [[0, 1.3, 0.55], [0.28, 1.5, 0.42], [-0.26, 1.55, 0.42], [0, 1.85, 0.4]].forEach(([dx, dy, r]) => { const c = new THREE.Mesh(track(new THREE.IcosahedronGeometry(r, 1)), leafMat); c.position.set(dx, dy, 0); c.castShadow = true; tg.add(c); });
        tg.position.set(x, 0, z); tg.scale.setScalar(sc); scene.add(tg);
      };
      mkTree(-houseW / 2 - 1.6, -houseD / 2 - 2.2, 1.1);
      mkTree(-houseW / 2 - 2.4, -houseD / 2 - 5, 0.9);
      mkTree(houseW / 2 + 1.8, -houseD / 2 - 5, 1.0);

      // سيارة بسيطة بالمرأب
      const car = new THREE.Group();
      const carBody = track(new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.4, metalness: 0.4 }));
      const b1 = new THREE.Mesh(track(new THREE.BoxGeometry(1.7, 0.5, 3.6)), carBody); b1.position.y = 0.55; b1.castShadow = true; car.add(b1);
      const b2 = new THREE.Mesh(track(new THREE.BoxGeometry(1.5, 0.5, 1.9)), carBody); b2.position.set(0, 0.95, -0.1); b2.castShadow = true; car.add(b2);
      const wheelGeo = track(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16)); const wheelMat = track(new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7 }));
      [[0.8, 1.2], [-0.8, 1.2], [0.8, -1.2], [-0.8, -1.2]].forEach(([wx, wz]) => { const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.32, wz); car.add(w); });
      car.position.set(houseW / 2 - 1.9, 0, -houseD / 2 - 3); car.rotation.y = 0; scene.add(car);

      // ===== الأسلاك + النبضات =====
      const wires = [];
      const addWire = (a, b, mid, role, colorHex) => {
        const m = mid || new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.5, 0));
        const curve = new THREE.CatmullRomCurve3([a, m, b]);
        const tube = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 44, 0.02, 8, false)), track(new THREE.MeshStandardMaterial({ color: 0x222a33, roughness: 0.6 }))); scene.add(tube);
        const mat = track(new THREE.MeshBasicMaterial({ color: colorHex })); const geo = track(new THREE.SphereGeometry(0.06, 12, 12)); const pulses = [];
        for (let k = 0; k < 4; k++) { const p = new THREE.Mesh(geo, mat); scene.add(p); pulses.push({ mesh: p, off: k / 4 }); }
        wires.push({ curve, pulses, mat, role, speed: 0.22 });
      };
      if (structs.length && panelFront) {
        const pw = panelFront.clone().add(structsGroup.position);
        addWire(pw, invWorld.clone().add(new THREE.Vector3(0, 0.3, -0.1)), new THREE.Vector3((pw.x + invWorld.x) / 2, HH + 0.5, (pw.z + invWorld.z) / 2), 'gen', 0x66ccff);
      }
      if (batWorld) addWire(invWorld.clone(), batWorld.clone(), new THREE.Vector3((invWorld.x + batWorld.x) / 2, HH + 0.7, invWorld.z - 0.2), 'store', 0x2fe06a);
      const houseLoad = new THREE.Vector3(-houseW / 2 + 1.6, FLOOR + 1.6, -houseD / 2 - 0.05);
      addWire(invWorld.clone(), houseLoad, new THREE.Vector3((invWorld.x + houseLoad.x) / 2, HH * 0.7, roomZ - houseD * 0.3), 'load', 0xffcf66);

      // ===== كاميرا + تحكم =====
      const camera = new THREE.PerspectiveCamera(46, W() / H(), 0.1, 500);
      const frame = Math.max(houseW, houseD) + pDepth + 12;
      camera.position.set(frame * 0.42, frame * 0.4, -frame * 0.6);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(W(), H()); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.appendChild(renderer.domElement);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.dampingFactor = 0.08; controls.autoRotate = true; controls.autoRotateSpeed = 0.5;
      controls.minDistance = 3; controls.maxDistance = frame * 2.2; controls.minPolarAngle = 0.15; controls.maxPolarAngle = Math.PI / 2 - 0.02;
      controls.target.set(0, HH * 0.55, 0);
      controls.addEventListener('start', () => { controls.autoRotate = false; });
      controls.update();

      const skyDay = new THREE.Color(0xbfe3ff), skySet = new THREE.Color(0xffb066), skyNight = new THREE.Color(0x0e1830);
      const R = frame * 1.05, Rh = frame * 0.95;
      const clock = new THREE.Clock();
      const fadeThreshold = frame * 0.5;

      const animate = () => {
        if (disposed) return;
        rafRef.current = requestAnimationFrame(animate);
        const et = clock.getElapsedTime();
        windU.value = et;
        const t = ((timeRef.current % 24) + 24) % 24;
        const dayAngle = ((t - 6) / 12) * Math.PI;
        const sinE = Math.sin(dayAngle);
        const isDay = sinE > 0.015; const intensity = Math.max(0, sinE);

        sunBall.position.set(Math.cos(dayAngle) * R, sinE * Rh, 0.32 * R);
        sunGlow.position.copy(sunBall.position); sunLight.position.copy(sunBall.position);
        sunLight.intensity = 0.15 + intensity * 2.7;
        sunBall.visible = sunBall.position.y > -1; sunGlow.visible = sunBall.visible;
        moonBall.position.set(-Math.cos(dayAngle) * R * 0.85, Math.max(0.25, -sinE) * Rh * 0.85, 0.28 * R);
        moonBall.visible = !isDay;

        const sky = isDay ? lerpC(skySet, skyDay, intensity * 1.6) : skyNight;
        scene.background.copy(sky);
        hemi.intensity = isDay ? 0.35 + intensity * 0.6 : 0.2;
        amb.intensity = isDay ? 0.24 + intensity * 0.2 : 0.14;
        const winI = isDay ? 0.05 : 1.0; windows.forEach((m) => { m.emissiveIntensity = winI; });
        const panelGlow = isDay ? 0.03 + intensity * 0.09 : 0; panelSurfaces.forEach((m) => { m.emissiveIntensity = panelGlow; });

        // شفافية الجدران عند التقريب
        const dist = camera.position.distanceTo(controls.target);
        const op = Math.max(0.18, Math.min(1, (dist - frame * 0.22) / (fadeThreshold - frame * 0.22)));
        fadeMats.forEach((m) => { m.opacity = op; });

        // تدفّق الطاقة
        for (const w of wires) {
          let active = true, reverse = false, col = null;
          if (w.role === 'gen') { active = isDay; col = 0x66ccff; }
          else if (w.role === 'store') { if (isDay) col = 0x2fe06a; else { reverse = true; col = 0xffa83a; } }
          else if (w.role === 'load') col = isDay ? 0xffcf66 : 0xffa83a;
          if (col != null) w.mat.color.setHex(col);
          for (const p of w.pulses) { p.mesh.visible = active; if (!active) continue; let u = (et * w.speed + p.off) % 1; if (reverse) u = 1 - u; w.curve.getPointAt(u, p.mesh.position); }
        }
        let soc; if (isDay) soc = 0.35 + 0.6 * ((t - 6) / 12); else { const nf = t < 6 ? (t + 6) / 12 : (t - 18) / 12; soc = 0.92 - 0.5 * Math.min(1, nf); }
        soc = Math.max(0.1, Math.min(1, soc));
        chargeBars.forEach((bar, i) => { const v = Math.max(0.06, Math.min(1, soc + ((i % 3) - 1) * 0.04)); bar.scale.y = v; bar.position.y = bar.userData.bottom + (bar.userData.fullH * v) / 2; bar.material.color.setHex(isDay ? 0x2fe06a : 0xffb14a); bar.material.emissive.setHex(isDay ? 0x2fe06a : 0xffb14a); });
        invLed.forEach((m, i) => { m.color.setHex(isDay ? 0x36e07a : 0xffb14a); });

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
        <input type="range" min={6} max={30} step={0.25} defaultValue={12} onInput={onTime} onChange={onTime} />
        <span className="tend">🌙</span>
      </div>
      <div className="showcase-hint">🖱️ اسحب للتدوير • قرّب بعجلة الماوس (تصير الجدران شفافة وتبين الأجهزة) • حرّك الشريط لوقت اليوم</div>
    </div>
  );
}
