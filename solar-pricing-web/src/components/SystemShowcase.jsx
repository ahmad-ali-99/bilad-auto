// عرض تفاعلي ثلاثي الأبعاد للمنظومة على بيت عراقي — يبهر الزبون:
// • الألواح فوق سطح البيت (نفس شكل الغلاف)، والانفرتر+البطاريات داخل بيتونة جنب البيت.
// • شمس ثابتة بفضاء الـ3D تتحرك بقوس حسب شريط الوقت (صباح → صباح اليوم الثاني).
// • نهاراً: الألواح تولّد → تغذّي البيت وتشحن البطارية. ليلاً: التوليد ينقطع،
//   البطارية تغذّي أجهزة البيت وإنارته تشتعل، والظلال والإنارة على الألواح تتغير.
// • تدوير + زوم بالماوس (OrbitControls). three.js يُحمّل عند الفتح فقط.
import React, { useEffect, useRef, useState } from 'react';
import { splitStructures } from '../lib/structureDiagram.js';

const fmtTime = (h) => {
  const day2 = h >= 30 ? false : h >= 24;
  const t = ((h % 24) + 24) % 24;
  let hh = Math.floor(t);
  const mm = Math.round((t - hh) * 60);
  const period = hh < 12 ? 'صباحاً' : hh < 17 ? 'عصراً' : hh < 19 ? 'مغرباً' : 'مساءً';
  let h12 = hh % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}${day2 ? ' — اليوم الثاني' : ''}`;
};

export default function SystemShowcase({
  panels = 0,
  batteries = 0,
  inverters = 1,
  nightHours = null,
  dayAmps = null,
  ampDay = 0,
  ampNight = 0,
  onClose,
}) {
  const mountRef = useRef(null);
  const rafRef = useRef(0);
  const timeRef = useRef(12); // ساعة اليوم (6..30)
  const [timeLabel, setTimeLabel] = useState(fmtTime(12));

  useEffect(() => {
    let disposed = false;
    let renderer;
    let controls;
    let ro;
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

      // ===== خامات =====
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
      const PANEL_W = 1.05, TIER_L = 1.2, TILT = THREE.MathUtils.degToRad(24);
      const ROOF_H = 3.0, LEG = 0.45, LIFT = 0.85, GAP = 1.15, POST = 0.06, FOOT = 0.28;
      const panelMat = track(new THREE.MeshStandardMaterial({ map: track(panelTexture()), roughness: 0.32, metalness: 0.12, emissive: 0x24406e, emissiveIntensity: 0.0 }));
      const metalMat = track(new THREE.MeshStandardMaterial({ color: 0x8a929c, roughness: 0.5, metalness: 0.7 }));
      const concreteMat = track(new THREE.MeshStandardMaterial({ color: 0xdfe2e6, roughness: 0.9 }));
      const panelSurfaces = [];

      const buildStructure = (cols, baseH) => {
        const grp = new THREE.Group();
        const w = cols * PANEL_W, slope = 2 * TIER_L;
        const dz = slope * Math.cos(TILT), dy = slope * Math.sin(TILT), backH = baseH + dy;
        const surfGeo = track(new THREE.BoxGeometry(w, 0.05, slope));
        const mat = panelMat.clone(); mat.map = panelMat.map.clone();
        mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(cols, 2); mat.map.needsUpdate = true;
        track(mat); track(mat.map);
        const surf = new THREE.Mesh(surfGeo, mat);
        surf.castShadow = true; surf.receiveShadow = true;
        surf.position.set(w / 2, (baseH + backH) / 2, dz / 2); surf.rotation.x = -TILT;
        grp.add(surf); panelSurfaces.push(mat);
        const legF = track(new THREE.BoxGeometry(POST, baseH, POST));
        const legB = track(new THREE.BoxGeometry(POST, backH, POST));
        const footGeo = track(new THREE.BoxGeometry(FOOT, 0.16, FOOT));
        for (let c = 0; c <= cols; c++) {
          const x = c * PANEL_W;
          const fl = new THREE.Mesh(legF, metalMat); fl.position.set(x, baseH / 2, 0); fl.castShadow = true; grp.add(fl);
          const bl = new THREE.Mesh(legB, metalMat); bl.position.set(x, backH / 2, dz); bl.castShadow = true; grp.add(bl);
          const f1 = new THREE.Mesh(footGeo, concreteMat); f1.position.set(x, 0.08, 0); f1.receiveShadow = true; grp.add(f1);
          const f2 = new THREE.Mesh(footGeo, concreteMat); f2.position.set(x, 0.08, dz); f2.receiveShadow = true; grp.add(f2);
        }
        grp.userData = { w, dz };
        return grp;
      };

      // ===== المشهد =====
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xbfe3ff);

      const sunLight = new THREE.DirectionalLight(0xfff2d8, 2.6);
      sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048);
      Object.assign(sunLight.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 0.5, far: 80 });
      scene.add(sunLight);
      const hemi = new THREE.HemisphereLight(0xcfe6ff, 0xbcae94, 0.8); scene.add(hemi);
      const amb = new THREE.AmbientLight(0xffffff, 0.32); scene.add(amb);

      // شمس + هالة (جسم ثابت بفضاء الـ3D)
      const sunBall = new THREE.Mesh(track(new THREE.SphereGeometry(0.85, 24, 24)), track(new THREE.MeshBasicMaterial({ color: 0xffd451 })));
      const sunGlow = new THREE.Mesh(track(new THREE.SphereGeometry(1.5, 24, 24)), track(new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.3 })));
      scene.add(sunBall); scene.add(sunGlow);
      const moonBall = new THREE.Mesh(track(new THREE.SphereGeometry(0.6, 20, 20)), track(new THREE.MeshBasicMaterial({ color: 0xdfe8ff })));
      scene.add(moonBall);

      // ===== الألواح (متدرّجة مثل الغلاف) =====
      const structsGroup = new THREE.Group();
      const structs = splitStructures(panels);
      let pMaxW = 0, pDepth = 0, panelFront = null;
      structs.forEach((s, i) => {
        const g = buildStructure(s.cols, LEG + i * LIFT);
        const off = i * (2 * TIER_L * Math.cos(TILT) + GAP);
        g.position.set(-s.cols * PANEL_W / 2, 0, off);
        structsGroup.add(g);
        pMaxW = Math.max(pMaxW, s.cols * PANEL_W); pDepth = off + g.userData.dz;
        if (i === 0) panelFront = new THREE.Vector3(0, LEG, off);
      });

      // ===== البيت العراقي (يتحجّم ليسع الألواح) =====
      const houseW = Math.max(6, pMaxW + 2.2);
      const houseD = Math.max(5, pDepth + 2.2);
      const wallMat = track(new THREE.MeshStandardMaterial({ color: 0xe4d4b4, roughness: 0.95 }));
      const trimMat = track(new THREE.MeshStandardMaterial({ color: 0xcdb890, roughness: 0.9 }));
      const winMat = track(new THREE.MeshStandardMaterial({ color: 0x2a3550, emissive: 0xffd27a, emissiveIntensity: 0.05, roughness: 0.3, metalness: 0.2 }));
      const windows = [];
      const house = new THREE.Group();
      const body = new THREE.Mesh(track(new THREE.BoxGeometry(houseW, ROOF_H, houseD)), wallMat);
      body.position.y = ROOF_H / 2; body.castShadow = true; body.receiveShadow = true; house.add(body);
      // سطح + دربزين (parapet)
      const roof = new THREE.Mesh(track(new THREE.BoxGeometry(houseW + 0.1, 0.12, houseD + 0.1)), trimMat);
      roof.position.y = ROOF_H + 0.06; roof.receiveShadow = true; house.add(roof);
      const parH = 0.4, parT = 0.14;
      const parGeoX = track(new THREE.BoxGeometry(houseW + 0.1, parH, parT));
      const parGeoZ = track(new THREE.BoxGeometry(parT, parH, houseD + 0.1));
      [[0, (houseD) / 2], [0, -(houseD) / 2]].forEach(([x, z]) => { const m = new THREE.Mesh(parGeoX, trimMat); m.position.set(x, ROOF_H + parH / 2 + 0.1, z); house.add(m); });
      [[(houseW) / 2, 0], [-(houseW) / 2, 0]].forEach(([x, z]) => { const m = new THREE.Mesh(parGeoZ, trimMat); m.position.set(x, ROOF_H + parH / 2 + 0.1, z); house.add(m); });
      // خزان ماء أسود على السطح (لمسة عراقية)
      const tank = new THREE.Mesh(track(new THREE.CylinderGeometry(0.32, 0.32, 0.6, 16)), track(new THREE.MeshStandardMaterial({ color: 0x1f2733, roughness: 0.7 })));
      tank.position.set(houseW / 2 - 0.7, ROOF_H + 0.4, -houseD / 2 + 0.7); tank.castShadow = true; house.add(tank);
      // باب + شبابيك على الواجهة الأمامية (−z)
      const zf = -houseD / 2 - 0.01;
      const door = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 1.9, 0.06)), track(new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.7 })));
      door.position.set(-houseW / 2 + 1.2, 0.95, zf); house.add(door);
      const winGeo = track(new THREE.BoxGeometry(0.9, 0.9, 0.06));
      for (const wx of [0.3, houseW / 2 - 1.1]) {
        const win = new THREE.Mesh(winGeo, winMat.clone()); track(win.material);
        win.position.set(wx, 1.5, zf); house.add(win); windows.push(win.material);
        const win2 = new THREE.Mesh(winGeo, win.material); win2.position.set(-wx, 1.5, zf); house.add(win2);
      }
      scene.add(house);

      // الألواح فوق السطح، بالمنتصف
      structsGroup.position.set(0, ROOF_H + 0.12, -pDepth / 2);
      scene.add(structsGroup);

      // ===== البيتونة (غرفة الأجهزة) — ملحق جنب البيت، واجهتها مفتوحة تبين الأجهزة =====
      const roomW = 2.6, roomD = 2.0, roomH = 2.4;
      const room = new THREE.Group();
      const roomX = houseW / 2 + roomW / 2 + 0.05; // على يمين البيت
      const rWall = track(new THREE.MeshStandardMaterial({ color: 0xdccbaa, roughness: 0.95 }));
      // ثلاثة جدران + سقف (الواجهة الأمامية −z مفتوحة)
      const back = new THREE.Mesh(track(new THREE.BoxGeometry(roomW, roomH, 0.1)), rWall); back.position.set(0, roomH / 2, roomD / 2); back.receiveShadow = true; room.add(back);
      const sideL = new THREE.Mesh(track(new THREE.BoxGeometry(0.1, roomH, roomD)), rWall); sideL.position.set(-roomW / 2, roomH / 2, 0); room.add(sideL);
      const sideR = new THREE.Mesh(track(new THREE.BoxGeometry(0.1, roomH, roomD)), rWall); sideR.position.set(roomW / 2, roomH / 2, 0); room.add(sideR);
      const rtop = new THREE.Mesh(track(new THREE.BoxGeometry(roomW + 0.1, 0.1, roomD + 0.1)), trimMat); rtop.position.set(0, roomH + 0.05, 0); rtop.castShadow = true; room.add(rtop);
      const rfloor = new THREE.Mesh(track(new THREE.BoxGeometry(roomW, 0.06, roomD)), track(new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 1 }))); rfloor.position.set(0, 0.03, 0); rfloor.receiveShadow = true; room.add(rfloor);

      // انفرتر معلّق على الجدار الخلفي (يمين) + بطاريات على الأرض (يسار)
      const invLed = [];
      const invCount = Math.max(1, inverters);
      const invBody = track(new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.5, metalness: 0.2 }));
      const invFace = track(new THREE.MeshStandardMaterial({ color: 0x24405f, roughness: 0.4, metalness: 0.3, emissive: 0x0a1a30, emissiveIntensity: 0.5 }));
      const invGeo = track(new THREE.BoxGeometry(0.46, 0.66, 0.16));
      let invAnchor = null;
      for (let i = 0; i < invCount; i++) {
        const b = new THREE.Mesh(invGeo, [invBody, invBody, invBody, invBody, invFace, invBody]); b.castShadow = true;
        const ix = 0.55 - i * 0.55, iy = 1.5, iz = roomD / 2 - 0.14;
        b.position.set(ix, iy, iz); room.add(b);
        const led = new THREE.Mesh(track(new THREE.SphereGeometry(0.03, 10, 10)), track(new THREE.MeshStandardMaterial({ color: 0x36e07a, emissive: 0x36e07a, emissiveIntensity: 1.2 })));
        led.position.set(ix, iy + 0.24, iz - 0.16); room.add(led); invLed.push(led);
        if (i === 0) invAnchor = new THREE.Vector3(ix, iy, iz);
      }

      const chargeBars = [];
      let batAnchor = null;
      const batCount = Math.max(0, batteries);
      if (batCount > 0) {
        const cabW = 0.7, cellH = 0.24, cols = Math.min(batCount, 4), rows = Math.ceil(batCount / cols);
        const cabH = rows * (cellH + 0.05) + 0.14, cabD = 0.42;
        const cabX = -roomW / 2 + cabW / 2 + 0.18, cabZ = roomD / 2 - cabD / 2 - 0.05;
        const cab = new THREE.Mesh(track(new THREE.BoxGeometry(cabW + 0.08, cabH + 0.08, cabD + 0.06)), track(new THREE.MeshStandardMaterial({ color: 0x33414f, roughness: 0.55, metalness: 0.35 })));
        cab.position.set(cabX, cabH / 2, cabZ); cab.castShadow = true; room.add(cab);
        const cellGeo = track(new THREE.BoxGeometry(cabW / cols - 0.05, cellH, 0.03));
        const barGeo = track(new THREE.BoxGeometry(cabW / cols - 0.11, cellH - 0.08, 0.02));
        for (let b = 0; b < batCount; b++) {
          const r = Math.floor(b / cols), c = b % cols;
          const x = cabX - cabW / 2 + (c + 0.5) * (cabW / cols);
          const yBase = 0.14 + r * (cellH + 0.05);
          const y = yBase + cellH / 2;
          const zf2 = cabZ - cabD / 2 - 0.02;
          const cell = new THREE.Mesh(cellGeo, track(new THREE.MeshStandardMaterial({ color: 0x11202e, roughness: 0.4 }))); cell.position.set(x, y, zf2); room.add(cell);
          const fullH = cellH - 0.08, bottom = y - cellH / 2 + 0.04;
          const bar = new THREE.Mesh(barGeo, track(new THREE.MeshStandardMaterial({ color: 0x2fe06a, emissive: 0x2fe06a, emissiveIntensity: 0.9 })));
          bar.position.set(x, bottom, zf2 - 0.02); bar.scale.y = 0.05; bar.userData = { bottom, fullH }; room.add(bar); chargeBars.push(bar);
        }
        batAnchor = new THREE.Vector3(cabX, cabH * 0.6, cabZ - cabD / 2);
      }
      room.position.set(roomX, 0, -houseD / 2 + roomD / 2 + 0.4); // ملاصقة للواجهة الأمامية
      scene.add(room);

      // مواضع عالمية للأجهزة (للأسلاك)
      const invWorld = invAnchor ? invAnchor.clone().add(room.position) : new THREE.Vector3(roomX, 1.5, 0);
      const batWorld = batAnchor ? batAnchor.clone().add(room.position) : null;

      // ===== أرضية =====
      const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(120, 120)), track(new THREE.MeshStandardMaterial({ color: 0xdad2c2, roughness: 1 })));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

      // ===== الأسلاك + النبضات =====
      const wires = [];
      const addWire = (a, b, mid, role, colorHex) => {
        const m = mid || new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.5, 0));
        const curve = new THREE.CatmullRomCurve3([a, m, b]);
        const tube = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 44, 0.018, 8, false)), track(new THREE.MeshStandardMaterial({ color: 0x222a33, roughness: 0.6 })));
        scene.add(tube);
        const mat = track(new THREE.MeshBasicMaterial({ color: colorHex }));
        const pulses = [];
        const geo = track(new THREE.SphereGeometry(0.055, 12, 12));
        for (let k = 0; k < 4; k++) { const p = new THREE.Mesh(geo, mat); scene.add(p); pulses.push({ mesh: p, off: k / 4 }); }
        const entry = { curve, pulses, mat, role, speed: 0.22 };
        wires.push(entry); return entry;
      };
      // الألواح ← الانفرتر (توليد)
      let genWire = null;
      if (structs.length && panelFront) {
        const pw = panelFront.clone().add(structsGroup.position);
        genWire = addWire(pw, invWorld.clone().add(new THREE.Vector3(0, 0.3, -0.1)), new THREE.Vector3((pw.x + invWorld.x) / 2, ROOF_H + 0.2, (pw.z + invWorld.z) / 2 - 0.6), 'gen', 0x66ccff);
      }
      // الانفرتر ↔ البطارية (شحن نهاراً / تفريغ ليلاً)
      let storeWire = null;
      if (batWorld) storeWire = addWire(invWorld.clone(), batWorld.clone(), new THREE.Vector3((invWorld.x + batWorld.x) / 2, 0.9, invWorld.z - 0.3), 'store', 0x2fe06a);
      // الانفرتر ← البيت (أحمال دائمة)
      const houseLoad = new THREE.Vector3(-houseW / 2 + 0.3, 1.5, -houseD / 2 - 0.05);
      const loadWire = addWire(invWorld.clone(), houseLoad, new THREE.Vector3((invWorld.x + houseLoad.x) / 2, 1.9, -houseD / 2 - 0.4), 'load', 0xffcf66);

      // ===== كاميرا + تحكم =====
      const camera = new THREE.PerspectiveCamera(46, W() / H(), 0.1, 400);
      const frame = Math.max(houseW, houseD) + pDepth + 8;
      camera.position.set(frame * 0.42, frame * 0.38, -frame * 0.62);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(W(), H());
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.dampingFactor = 0.08;
      controls.autoRotate = true; controls.autoRotateSpeed = 0.55;
      controls.minDistance = 6; controls.maxDistance = frame * 2.2;
      controls.minPolarAngle = 0.2; controls.maxPolarAngle = Math.PI / 2 - 0.03;
      controls.target.set(0, ROOF_H * 0.6, 0);
      controls.addEventListener('start', () => { controls.autoRotate = false; });
      controls.update();

      // ألوان السماء
      const skyDay = new THREE.Color(0xbfe3ff), skySet = new THREE.Color(0xffb066), skyNight = new THREE.Color(0x0e1830);
      const R = frame * 1.15, Rh = frame * 0.82;
      const clock = new THREE.Clock();

      const animate = () => {
        if (disposed) return;
        rafRef.current = requestAnimationFrame(animate);
        const et = clock.getElapsedTime();
        const t = ((timeRef.current % 24) + 24) % 24;
        const dayAngle = ((t - 6) / 12) * Math.PI; // 0 عند 6ص، π عند 6م
        const sinE = Math.sin(dayAngle);
        const isDay = sinE > 0.015;
        const intensity = Math.max(0, sinE);

        // الشمس بقوس ثابت بالفضاء
        sunBall.position.set(Math.cos(dayAngle) * R, sinE * Rh, 0.28 * R);
        sunGlow.position.copy(sunBall.position);
        sunLight.position.copy(sunBall.position);
        sunLight.intensity = 0.15 + intensity * 2.7;
        sunBall.visible = sunBall.position.y > -0.5;
        sunGlow.visible = sunBall.visible;
        // القمر ليلاً (مقابل الشمس)
        moonBall.position.set(-Math.cos(dayAngle) * R * 0.9, Math.max(0.2, -sinE) * Rh * 0.8, 0.24 * R);
        moonBall.visible = !isDay;

        // سماء + إضاءة محيطة
        const sky = isDay ? lerpC(skySet, skyDay, intensity * 1.6) : skyNight;
        scene.background.copy(sky);
        hemi.intensity = isDay ? 0.35 + intensity * 0.6 : 0.18;
        amb.intensity = isDay ? 0.25 + intensity * 0.2 : 0.14;

        // إنارة البيت ليلاً + وهج بسيط على الألواح نهاراً (الخيال/الانعكاس)
        const winI = isDay ? 0.05 : 1.0;
        windows.forEach((m) => { m.emissiveIntensity = winI; });
        const panelGlow = isDay ? 0.05 + intensity * 0.28 : 0.0;
        panelSurfaces.forEach((m) => { m.emissiveIntensity = panelGlow; });

        // تدفّق الطاقة
        for (const w of wires) {
          let active = true, reverse = false, col = null;
          if (w.role === 'gen') { active = isDay; col = 0x66ccff; }
          else if (w.role === 'store') {
            if (isDay) { reverse = false; col = 0x2fe06a; } // شحن: انفرتر ← بطارية
            else { reverse = true; col = 0xffa83a; }        // تفريغ: بطارية ← انفرتر
          } else if (w.role === 'load') { col = isDay ? 0xffcf66 : 0xffa83a; }
          if (col != null) w.mat.color.setHex(col);
          for (const p of w.pulses) {
            p.mesh.visible = active;
            if (!active) continue;
            let u = (et * w.speed + p.off) % 1; if (reverse) u = 1 - u;
            w.curve.getPointAt(u, p.mesh.position);
          }
        }

        // شحن/تفريغ البطارية حسب الوقت
        let soc;
        if (isDay) soc = 0.35 + 0.6 * ((t - 6) / 12);
        else { const nf = t < 6 ? (t + 6) / 12 : (t - 18) / 12; soc = 0.92 - 0.5 * Math.min(1, nf); }
        soc = Math.max(0.1, Math.min(1, soc));
        chargeBars.forEach((bar, i) => {
          const v = Math.max(0.06, Math.min(1, soc + ((i % 3) - 1) * 0.04));
          bar.scale.y = v; bar.position.y = bar.userData.bottom + (bar.userData.fullH * v) / 2;
          bar.material.color.setHex(isDay ? 0x2fe06a : 0xffb14a);
          bar.material.emissive.setHex(isDay ? 0x2fe06a : 0xffb14a);
        });
        invLed.forEach((led, i) => { led.material.emissiveIntensity = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(et * 3 + i)); });

        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      ro = new ResizeObserver(() => { if (!renderer) return; renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); });
      ro.observe(mount);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
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
        {chips.map((c, i) => (
          <div className="showcase-chip" key={i}><span className="ic">{c[0]}</span><span className="lb">{c[1]}</span><b className="vl">{c[2]}</b></div>
        ))}
      </div>
      <div className="showcase-timebar">
        <span className="tclock">🕐 {timeLabel}</span>
        <span className="tend">🌅</span>
        <input type="range" min={6} max={30} step={0.25} defaultValue={12} onInput={onTime} onChange={onTime} />
        <span className="tend">🌙</span>
      </div>
      <div className="showcase-hint">🖱️ اسحب لتدوير المنظومة • عجلة الماوس للتقريب • حرّك الشريط لتغيير وقت اليوم</div>
    </div>
  );
}
