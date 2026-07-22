// عرض تفاعلي ثلاثي الأبعاد للمنظومة — يبهر الزبون: ألواح تدور بالماوس، انفرتر،
// بطاريات، ونبضات كهربائية تجري من الشمس ← الألواح ← الانفرتر ← البطاريات (شحن).
// three.js + OrbitControls يُحمّلان ديناميكياً عند الفتح فقط (ما يثقلون الحزمة الرئيسية).
import React, { useEffect, useRef } from 'react';
import { splitStructures } from '../lib/structureDiagram.js';

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

  useEffect(() => {
    let disposed = false;
    let renderer;
    let controls;
    let ro;
    const disposables = [];

    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const mount = mountRef.current;
      if (disposed || !mount) return;

      const track = (obj) => { disposables.push(obj); return obj; };
      const W = () => mount.clientWidth || 800;
      const H = () => mount.clientHeight || 600;

      // نسيج اللوح (خلايا زرقاء)
      const panelTexture = () => {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 256;
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

      const PANEL_W = 1.05, TIER_L = 1.25, TILT = THREE.MathUtils.degToRad(26);
      const FRONT_H = 0.55, LIFT = 0.9, GAP = 1.25, POST = 0.06, FOOT = 0.32;
      const panelMat = track(new THREE.MeshStandardMaterial({ map: track(panelTexture()), roughness: 0.35, metalness: 0.1 }));
      const metalMat = track(new THREE.MeshStandardMaterial({ color: 0x8a929c, roughness: 0.5, metalness: 0.7 }));
      const concreteMat = track(new THREE.MeshStandardMaterial({ color: 0xdfe2e6, roughness: 0.9 }));

      // ستركجر واحد (ألواح مائلة + أرجل + صبّات)
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
        grp.add(surf);
        const legGeoF = track(new THREE.BoxGeometry(POST, baseH, POST));
        const legGeoB = track(new THREE.BoxGeometry(POST, backH, POST));
        const footGeo = track(new THREE.BoxGeometry(FOOT, 0.3, FOOT));
        for (let c = 0; c <= cols; c++) {
          const x = c * PANEL_W;
          const fl = new THREE.Mesh(legGeoF, metalMat); fl.position.set(x, baseH / 2, 0); fl.castShadow = true; grp.add(fl);
          const bl = new THREE.Mesh(legGeoB, metalMat); bl.position.set(x, backH / 2, dz); bl.castShadow = true; grp.add(bl);
          const f1 = new THREE.Mesh(footGeo, concreteMat); f1.position.set(x, 0.15, 0); f1.receiveShadow = true; grp.add(f1);
          const f2 = new THREE.Mesh(footGeo, concreteMat); f2.position.set(x, 0.15, dz); f2.receiveShadow = true; grp.add(f2);
        }
        grp.userData = { w, dz, frontH: baseH };
        return grp;
      };

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xdfeefc);

      // إضاءة
      const sun = new THREE.DirectionalLight(0xfff2d8, 2.3);
      sun.position.set(-3.5, 8.5, -6); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 0.5, far: 60 });
      scene.add(sun);
      scene.add(new THREE.HemisphereLight(0xcfe6ff, 0xbcc3ad, 0.85));
      scene.add(new THREE.AmbientLight(0xffffff, 0.35));

      // (الشمس تُرسم كعنصر CSS بالزاوية — هنا فقط الإضاءة، بلا كرة تقطع المشهد)

      // أرضية
      const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(80, 80)), track(new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 1 })));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

      // بناء الألواح (متدرّجة مثل الـPDF) على الجهة اليسرى
      const structsGroup = new THREE.Group();
      const structs = splitStructures(panels);
      let panelsMaxW = 0, panelsDepth = 0;
      let firstFrontMid = null;
      structs.forEach((s, i) => {
        const g = buildStructure(s.cols, FRONT_H + i * LIFT);
        const depthOffset = i * (2 * TIER_L * Math.cos(TILT) + GAP);
        g.position.set(-s.cols * PANEL_W / 2, 0, depthOffset);
        structsGroup.add(g);
        panelsMaxW = Math.max(panelsMaxW, s.cols * PANEL_W);
        panelsDepth = depthOffset + g.userData.dz;
        if (i === 0) firstFrontMid = new THREE.Vector3(0, FRONT_H, g.position.z);
      });
      structsGroup.position.set(-3.2, 0, -panelsDepth / 2);
      if (structs.length) scene.add(structsGroup);

      // انفرتر(ات) على حامل — يمين الألواح
      const invGroup = new THREE.Group();
      const invBodyMat = track(new THREE.MeshStandardMaterial({ color: 0xf3f5f7, roughness: 0.5, metalness: 0.2 }));
      const invFaceMat = track(new THREE.MeshStandardMaterial({ color: 0x2c4a72, roughness: 0.4, metalness: 0.3, emissive: 0x0a1a30, emissiveIntensity: 0.4 }));
      const invCount = Math.max(1, inverters);
      const invGeo = track(new THREE.BoxGeometry(0.5, 0.72, 0.2));
      const ledMeshes = [];
      for (let i = 0; i < invCount; i++) {
        const body = new THREE.Mesh(invGeo, [invBodyMat, invBodyMat, invBodyMat, invBodyMat, invFaceMat, invBodyMat]);
        body.castShadow = true;
        body.position.set(i * 0.62, 1.0, 0);
        invGroup.add(body);
        // لمبة حالة
        const led = new THREE.Mesh(track(new THREE.SphereGeometry(0.035, 12, 12)), track(new THREE.MeshStandardMaterial({ color: 0x36e07a, emissive: 0x36e07a, emissiveIntensity: 1.2 })));
        led.position.set(i * 0.62, 1.28, 0.11); invGroup.add(led); ledMeshes.push(led);
        // ساق الحامل
        const stand = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.64, 0.05)), metalMat);
        stand.position.set(i * 0.62, 0.32, 0); invGroup.add(stand);
      }
      invGroup.position.set(2.6, 0, 0);
      scene.add(invGroup);
      const invTop = new THREE.Vector3(2.6, 1.36, 0.1);
      const invBase = new THREE.Vector3(2.6 + (invCount - 1) * 0.62 * 0.5, 0.7, 0.1);

      // خزانة بطاريات — يمين الانفرتر، مع مؤشر شحن يمتلئ
      const chargeBars = [];
      let batTop = null;
      const batCount = Math.max(0, batteries);
      if (batCount > 0) {
        const batGroup = new THREE.Group();
        const cabW = 0.7, cellH = 0.26, cols = Math.min(batCount, 5), rows = Math.ceil(batCount / cols);
        const cabH = rows * (cellH + 0.05) + 0.1, cabD = 0.5;
        const cab = new THREE.Mesh(track(new THREE.BoxGeometry(cabW + 0.08, cabH + 0.08, cabD + 0.06)), track(new THREE.MeshStandardMaterial({ color: 0x33414f, roughness: 0.55, metalness: 0.35 })));
        cab.position.set(0, cabH / 2, 0); cab.castShadow = true; cab.receiveShadow = true; batGroup.add(cab);
        const cellGeo = track(new THREE.BoxGeometry(cabW / cols - 0.06, cellH, 0.04));
        const barGeo = track(new THREE.BoxGeometry(cabW / cols - 0.12, cellH - 0.08, 0.02));
        for (let b = 0; b < batCount; b++) {
          const r = Math.floor(b / cols), c = b % cols;
          const x = -cabW / 2 + (c + 0.5) * (cabW / cols);
          const y = 0.12 + r * (cellH + 0.05) + cellH / 2;
          const cell = new THREE.Mesh(cellGeo, track(new THREE.MeshStandardMaterial({ color: 0x11202e, roughness: 0.4 })));
          cell.position.set(x, y, cabD / 2 + 0.01); batGroup.add(cell);
          const fullH = cellH - 0.08;
          const bottom = y - cellH / 2 + 0.04; // قاع الخلية (يمتلئ من الأسفل للأعلى)
          const bar = new THREE.Mesh(barGeo, track(new THREE.MeshStandardMaterial({ color: 0x2fe06a, emissive: 0x2fe06a, emissiveIntensity: 0.9 })));
          bar.position.set(x, bottom, cabD / 2 + 0.03);
          bar.scale.y = 0.05; bar.userData = { bottom, fullH }; batGroup.add(bar); chargeBars.push(bar);
        }
        batGroup.position.set(4.4, 0, 0); scene.add(batGroup);
        batTop = new THREE.Vector3(4.4, cabH, 0.2);
      }

      // أسلاك + نبضات كهربائية على منحنيات
      const wires = [];
      const addWire = (a, b, mid, color) => {
        const m = mid || new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.7, 0));
        const curve = new THREE.CatmullRomCurve3([a, m, b]);
        const tube = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 40, 0.02, 8, false)), track(new THREE.MeshStandardMaterial({ color: 0x222a33, roughness: 0.6 })));
        scene.add(tube);
        const pulses = [];
        const pulseGeo = track(new THREE.SphereGeometry(0.06, 12, 12));
        const pulseMat = track(new THREE.MeshBasicMaterial({ color }));
        for (let k = 0; k < 4; k++) {
          const p = new THREE.Mesh(pulseGeo, pulseMat);
          scene.add(p); pulses.push({ mesh: p, off: k / 4 });
        }
        wires.push({ curve, pulses, speed: 0.22 });
      };

      // الألواح ← الانفرتر (توليد الكهرباء)
      if (structs.length && firstFrontMid) {
        const panelWorld = firstFrontMid.clone().add(structsGroup.position);
        addWire(panelWorld, invTop.clone(), new THREE.Vector3((panelWorld.x + invTop.x) / 2, 0.4, (panelWorld.z + invTop.z) / 2), 0x66ccff);
      }
      // الانفرتر ← البطاريات (نبضات الشحن)
      if (batTop) addWire(invBase.clone(), batTop.clone(), new THREE.Vector3((invBase.x + batTop.x) / 2, batTop.y + 0.5, 0.15), 0x2fe06a);

      // كاميرا + تحكم
      const camera = new THREE.PerspectiveCamera(46, W() / H(), 0.1, 200);
      const frame = Math.max(panelsMaxW + panelsDepth, 8) + 6;
      // الكاميرا بجهة وجوه الألواح (z سالب) حتى يبين الوجه الأزرق بالإطار الافتتاحي
      camera.position.set(frame * 0.5, frame * 0.4, -frame * 0.72);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(W(), H());
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.dampingFactor = 0.08;
      controls.autoRotate = true; controls.autoRotateSpeed = 0.7;
      controls.minDistance = 6; controls.maxDistance = frame * 1.8;
      controls.minPolarAngle = 0.25; controls.maxPolarAngle = Math.PI / 2 - 0.04;
      controls.target.set(0.6, 0.9, 0);
      controls.addEventListener('start', () => { controls.autoRotate = false; });
      controls.update();

      const clock = new THREE.Clock();
      const animate = () => {
        if (disposed) return;
        rafRef.current = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        // نبضات تجري على الأسلاك
        for (const w of wires) {
          for (const p of w.pulses) {
            const u = (t * w.speed + p.off) % 1;
            w.curve.getPointAt(u, p.mesh.position);
          }
        }
        // امتلاء البطاريات (شحن يتكرر) — يمتلئ من الأسفل للأعلى
        const fill = (Math.sin(t * 0.5) * 0.5 + 0.5); // 0..1
        chargeBars.forEach((bar, i) => {
          const local = Math.min(1, Math.max(0.05, fill + (i % 3) * 0.06));
          bar.scale.y = local;
          bar.position.y = bar.userData.bottom + (bar.userData.fullH * local) / 2;
        });
        // وميض لمبات الانفرتر
        ledMeshes.forEach((led, i) => { led.material.emissiveIntensity = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3 + i)); });
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      ro = new ResizeObserver(() => {
        if (!renderer) return;
        renderer.setSize(W(), H());
        camera.aspect = W() / H(); camera.updateProjectionMatrix();
      });
      ro.observe(mount);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      try { ro && ro.disconnect(); } catch { /* noop */ }
      try { controls && controls.dispose(); } catch { /* noop */ }
      if (renderer) {
        renderer.dispose();
        renderer.domElement && renderer.domElement.remove();
      }
      disposables.forEach((o) => { try { o.dispose && o.dispose(); } catch { /* noop */ } });
    };
  }, [panels, batteries, inverters]);

  const chips = [
    panels > 0 && ['☀️', 'الألواح', `${panels} لوح`],
    ['🔌', 'الانفرتر', `${Math.max(1, inverters)}`],
    batteries > 0 && ['🔋', 'البطاريات', `${batteries}`],
    nightHours != null && ampNight > 0 && ['🕐', 'تجهيز ليلي', `~${nightHours} ساعة`],
    dayAmps != null && ampDay > 0 && ['⚡', 'نهاراً', `~${dayAmps} أمبير`],
  ].filter(Boolean);

  return (
    <div className="showcase-overlay" dir="rtl">
      <div className="showcase-sun" />
      <div className="showcase-canvas" ref={mountRef} />
      <div className="showcase-topbar">
        <div className="showcase-title">منظومتك الشمسية — عرض تفاعلي</div>
        <button className="showcase-close" onClick={onClose} title="إغلاق">✕</button>
      </div>
      <div className="showcase-hud">
        {chips.map((c, i) => (
          <div className="showcase-chip" key={i}>
            <span className="ic">{c[0]}</span>
            <span className="lb">{c[1]}</span>
            <b className="vl">{c[2]}</b>
          </div>
        ))}
      </div>
      <div className="showcase-hint">🖱️ اسحب بزر الماوس الأيسر لتدوير المنظومة يمين/يسار</div>
    </div>
  );
}
