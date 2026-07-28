// مساحة «منظومة مضخة الماء الزراعية» — عرض فني 3D يفهم أرقام العرض:
// حقل زراعي بصفوف محاصيل، مصفوفة ألواح أرضية بعدد ألواح العرض الحقيقي على هياكل
// مائلة، كابينة انفيرتر المضخة (VFD)، رأس بئر ومضخة، ماء يتدفق بساقية ري متحركة.
// نفس لغة العرض الهندسي: خامات إجرائية + ACES + ضباب + شمس بظلال ناعمة.
import React, { useEffect, useRef, useState } from 'react';
import { splitStructures } from '../lib/structureDiagram.js';

export default function PumpShowcase({ panels = 0, inverters = 1, ampDay = 0, onClose }) {
  const mountRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let renderer, controls, raf = 0;
    const disp = [];

    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const mount = mountRef.current;
      if (disposed || !mount) return;
      const track = (o) => { disp.push(o); return o; };
      const B = (w, h, d) => track(new THREE.BoxGeometry(w, h, d));
      const M = (opt) => track(new THREE.MeshStandardMaterial(opt));
      const mesh = (g, m, x = 0, y = 0, z = 0, shadow = true) => {
        const o = new THREE.Mesh(g, m);
        o.position.set(x, y, z);
        o.castShadow = shadow; o.receiveShadow = true;
        return o;
      };

      // ===== نسيج إجرائي =====
      const canvasTex = (draw, s = 256) => {
        const c = document.createElement('canvas'); c.width = c.height = s;
        draw(c.getContext('2d'), s);
        const t = track(new THREE.CanvasTexture(c));
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      const noise = (g, s, amp) => {
        const img = g.getImageData(0, 0, s, s); const d = img.data;
        for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        g.putImageData(img, 0, 0);
      };
      // تربة الحقل بصفوف محاصيل خضر
      const cropT = canvasTex((g, s) => {
        g.fillStyle = '#8f7a55'; g.fillRect(0, 0, s, s); noise(g, s, 16);
        for (let y = 6; y < s; y += 40) {
          g.fillStyle = '#4c7c3c'; g.fillRect(0, y, s, 24);
          g.fillStyle = '#568c44';
          for (let x = 0; x < s; x += 11) g.fillRect(x + ((y / 40) % 2) * 5, y + 3, 7, 18);
        }
        noise(g, s, 10);
      }, 512);
      cropT.repeat.set(7, 7);
      const dirtT = canvasTex((g, s) => { g.fillStyle = '#c9b48e'; g.fillRect(0, 0, s, s); noise(g, s, 26); });
      dirtT.repeat.set(8, 8);
      const panelT = canvasTex((g, s) => {
        const grd = g.createLinearGradient(0, 0, s, s);
        grd.addColorStop(0, '#4d68b8'); grd.addColorStop(0.55, '#2e4894'); grd.addColorStop(1, '#22356e');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(190,208,245,0.7)'; g.lineWidth = 3;
        for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo((i / 6) * s, 0); g.lineTo((i / 6) * s, s); g.stroke(); }
        for (let j = 1; j < 12; j++) { g.beginPath(); g.moveTo(0, (j / 12) * s); g.lineTo(s, (j / 12) * s); g.stroke(); }
        g.strokeStyle = 'rgba(10,18,40,0.95)'; g.lineWidth = 10; g.strokeRect(0, 0, s, s);
      });
      const waterT = canvasTex((g, s) => {
        g.fillStyle = '#2f6f9e'; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(220,240,255,0.5)'; g.lineWidth = 3;
        for (let y = 8; y < s; y += 22) {
          g.beginPath();
          for (let x = 0; x <= s; x += 8) { const yy = y + Math.sin((x / s) * Math.PI * 4) * 4; x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy); }
          g.stroke();
        }
      });
      waterT.repeat.set(1, 8);

      // ===== المشهد والسماء =====
      const scene = new THREE.Scene();
      const skyT = canvasTex((g, s) => {
        const grd = g.createLinearGradient(0, 0, 0, s);
        grd.addColorStop(0, '#6fa8dd'); grd.addColorStop(0.6, '#a8c8e8'); grd.addColorStop(1, '#e8e2c8');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
      }, 512);
      scene.background = skyT;
      scene.fog = new THREE.Fog(0xdfe0c2, 70, 260);

      const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 600);
      camera.position.set(30, 16, 42);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      mount.appendChild(renderer.domElement);
      const resize = () => {
        const w = mount.clientWidth || 900, h = mount.clientHeight || 650;
        camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
      };
      resize();
      const ro = new ResizeObserver(resize); ro.observe(mount);

      const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
      sun.position.set(-45, 55, 25);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 5, far: 160 });
      scene.add(sun);
      scene.add(new THREE.HemisphereLight(0xcfe2ff, 0xb9a878, 0.85));
      scene.add(new THREE.AmbientLight(0xffffff, 0.22));

      // ===== الأرض: ساحة ترابية للمصفوفة + حقول محاصيل حواليها =====
      scene.add(mesh(track(new THREE.PlaneGeometry(600, 600)), M({ map: dirtT, roughness: 1 }), 0, -0.02, 0, false).rotateX(-Math.PI / 2));
      const field = (x, z, w, d) => {
        const m = mesh(track(new THREE.PlaneGeometry(w, d)), M({ map: cropT, roughness: 1 }), x, 0.02, z, false);
        m.rotateX(-Math.PI / 2);
        scene.add(m);
      };
      field(0, -60, 210, 108); // الحقل الرئيسي گدام المصفوفة (يُروى من الساقية)
      field(-98, 20, 85, 150);
      field(98, 20, 85, 150);
      field(0, 68, 210, 85); // حقل خلف ساحة المصفوفة — التراب يبقى ساحة عمل فقط

      // ===== مصفوفة الألواح الأرضية — بعدد ألواح العرض الحقيقي =====
      const structs = splitStructures(panels);
      const PW = 1.15, PL = 2.3, TILT = THREE.MathUtils.degToRad(27);
      const metal = M({ color: 0x9aa2ab, roughness: 0.45, metalness: 0.8 });
      const concrete = M({ color: 0xd8d8d4, roughness: 0.95 });
      const panelMat = M({ map: panelT, roughness: 0.28, metalness: 0.25 });
      let az = 0;
      const arrayGrp = new THREE.Group();
      structs.forEach((s) => {
        const W = s.cols * PW;
        const g = new THREE.Group();
        const surf = mesh(B(W, 0.09, PL * 2), panelMat, W / 2, 0, PL * Math.cos(TILT));
        const mm = panelMat.clone(); track(mm); mm.map = rep(panelT, s.cols, 2);
        surf.material = mm;
        surf.position.y = 1.1 + PL * Math.sin(TILT);
        surf.rotation.x = -TILT;
        g.add(surf);
        for (let c = 0; c <= s.cols; c++) {
          const x = c * PW;
          g.add(mesh(B(0.09, 1.15, 0.09), metal, x, 0.575, 0.15));
          g.add(mesh(B(0.09, 1.15 + 2 * PL * Math.sin(TILT), 0.09), metal, x, (1.15 + 2 * PL * Math.sin(TILT)) / 2, 0.15 + 2 * PL * Math.cos(TILT) * 0.92));
          g.add(mesh(B(0.42, 0.3, 0.42), concrete, x, 0.15, 0.15));
          g.add(mesh(B(0.42, 0.3, 0.42), concrete, x, 0.15, 0.15 + 2 * PL * Math.cos(TILT) * 0.92));
        }
        g.position.set(-W / 2, 0, az);
        arrayGrp.add(g);
        az += PL * 2 * Math.cos(TILT) + 2.6; // ممر بين الصفوف
      });
      arrayGrp.position.z = -az / 2 + 4;
      scene.add(arrayGrp);
      function rep(t, x, y) { const c = t.clone(); track(c); c.repeat.set(x, y); c.needsUpdate = true; return c; }

      // سياج حول المصفوفة: أعمدة رفيعة + 3 قضبان أفقية (مو كتل صلدة)
      const fenceMat = M({ color: 0x8f979e, roughness: 0.5, metalness: 0.8 });
      const maxW = Math.max(...structs.map((s) => s.cols * PW), 8) + 6;
      const fenceD = az + 6;
      const fz0 = -fenceD / 2 + 1, fz1 = fenceD / 2 + 1;
      const rail = (w, d, x, z) => [0.55, 1.05, 1.55].forEach((y) => scene.add(mesh(B(w || 0.05, 0.05, d || 0.05), fenceMat, x, y, z)));
      rail(maxW, 0, 0, fz0); rail(maxW, 0, 0, fz1);
      rail(0, fenceD, -maxW / 2, 1); rail(0, fenceD, maxW / 2, 1);
      for (let fx = -maxW / 2; fx <= maxW / 2 + 0.01; fx += maxW / Math.round(maxW / 3)) {
        scene.add(mesh(B(0.07, 1.65, 0.07), fenceMat, fx, 0.825, fz0));
        scene.add(mesh(B(0.07, 1.65, 0.07), fenceMat, fx, 0.825, fz1));
      }
      for (let fz = fz0; fz <= fz1 + 0.01; fz += fenceD / Math.round(fenceD / 3)) {
        scene.add(mesh(B(0.07, 1.65, 0.07), fenceMat, -maxW / 2, 0.825, fz));
        scene.add(mesh(B(0.07, 1.65, 0.07), fenceMat, maxW / 2, 0.825, fz));
      }

      // ===== كابينة انفيرتر المضخة (VFD) =====
      const vfdGrp = new THREE.Group();
      vfdGrp.position.set(maxW / 2 + 5, 0, 6);
      vfdGrp.add(mesh(B(2.6, 0.25, 1.6), concrete, 0, 0.125, 0));
      const cab = mesh(B(1.5, 2, 0.8), M({ color: 0xe8e9ec, roughness: 0.4, metalness: 0.35 }), 0, 1.25, 0);
      vfdGrp.add(cab);
      vfdGrp.add(mesh(B(0.9, 0.5, 0.03), M({ color: 0x101820, emissive: 0x2e86ff, emissiveIntensity: 0.9 }), 0, 1.6, 0.42, false));
      vfdGrp.add(mesh(B(1.5, 0.12, 0.95), M({ color: 0x4a4f52, roughness: 0.7 }), 0, 2.31, 0));
      scene.add(vfdGrp);

      // ===== رأس البئر + المضخة + أنبوب + ساقية الري =====
      const pumpGrp = new THREE.Group();
      pumpGrp.position.set(maxW / 2 + 5, 0, -4);
      pumpGrp.add(mesh(track(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 24)), concrete, 0, 0.25, 0));
      pumpGrp.add(mesh(track(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 20)), M({ color: 0x2563b0, roughness: 0.35, metalness: 0.6 }), 0, 0.95, 0));
      const pipeMat = M({ color: 0x8f979e, roughness: 0.4, metalness: 0.75 });
      const pipe1 = mesh(track(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 14)), pipeMat, 0, 1.2, -1.8);
      pipe1.rotation.x = Math.PI / 2;
      pumpGrp.add(pipe1);
      scene.add(pumpGrp);

      // ساقية ري كونكريتية تمشي للحقل الرئيسي وبيها ماء متحرك
      // الساقية نص مغطوسة بالأرض بكونكريت ترابي هادئ — والماء ظاهر فوقها
      const chLen = 70;
      const chX = maxW / 2 + 5, chZ0 = -5.8;
      const chGrp = new THREE.Group();
      chGrp.position.set(chX, 0, chZ0);
      const chConcrete = M({ color: 0xc4bfb2, roughness: 0.95 });
      chGrp.add(mesh(B(1.5, 0.3, chLen), chConcrete, 0, 0.15, -chLen / 2));
      const waterMat = M({ map: waterT, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.95, color: 0x7db8e0 });
      chGrp.add(mesh(B(1.1, 0.05, chLen - 0.5), waterMat, 0, 0.315, -chLen / 2, false));
      // فوهة تدفق عند رأس الساقية
      chGrp.add(mesh(B(0.5, 0.2, 0.7), M({ map: waterT, transparent: true, opacity: 0.85, color: 0x9fd0ef }), 0, 0.4, 0.2, false));
      scene.add(chGrp); // الساقية تمتد من المضخة باتجاه الحقل الرئيسي

      // ===== وايرات: المصفوفة ← VFD ← المضخة =====
      const wire = (a, b, sag = 0.6, color = 0x23282c) => {
        const mid = a.clone().lerp(b, 0.5); mid.y -= sag;
        const curve = new THREE.CatmullRomCurve3([a, mid, b]);
        const g = track(new THREE.TubeGeometry(curve, 24, 0.035, 6));
        const m = new THREE.Mesh(g, M({ color, roughness: 0.6 }));
        m.castShadow = true;
        scene.add(m);
      };
      wire(new THREE.Vector3(maxW / 2 - 0.5, 1.9, 4), new THREE.Vector3(maxW / 2 + 4.4, 2.1, 6), 0.8, 0xb02a2a);
      wire(new THREE.Vector3(maxW / 2 + 5, 1.1, 5.5), new THREE.Vector3(maxW / 2 + 5, 0.9, -3.6), 0.5);

      // نخلات بعيدة تكسر الأفق (بيلبورد بسيط)
      const palmMat = M({ color: 0x3c6b34, roughness: 1 });
      const trunkMat = M({ color: 0x8a6844, roughness: 1 });
      [[-60, -112], [-22, -126], [35, -118], [70, -108], [-95, -70], [98, -75], [-45, 95], [50, 100], [0, 108]].forEach(([x, z], i) => {
        const t = new THREE.Group();
        const h = 8 + (i % 3) * 1.6;
        t.add(mesh(track(new THREE.CylinderGeometry(0.3, 0.5, h, 8)), trunkMat, 0, h / 2, 0));
        t.add(mesh(track(new THREE.ConeGeometry(3.6, 3.2, 8)), palmMat, 0, h + 1.2, 0));
        t.add(mesh(track(new THREE.ConeGeometry(2.6, 2.2, 7)), palmMat, 0, h + 2.6, 0));
        t.position.set(x, 0, z);
        scene.add(t);
      });

      // ===== تحكم ودوران =====
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 2, -5);
      controls.maxPolarAngle = Math.PI / 2 - 0.04;
      controls.minDistance = 8; controls.maxDistance = 120;
      controls.enableDamping = true;
      let userMoved = false;
      controls.addEventListener('start', () => { userMoved = true; });

      const clock = new THREE.Clock();
      const animate = () => {
        raf = requestAnimationFrame(animate);
        const dt = clock.getDelta();
        waterT.offset.y -= dt * 0.9; // جريان الماء بالساقية
        if (!userMoved) {
          const t = clock.elapsedTime * 0.08;
          camera.position.x = Math.sin(t) * 48;
          camera.position.z = Math.cos(t) * 48;
          camera.position.y = 17;
          camera.lookAt(0, 2, -5);
        }
        controls.update();
        renderer.render(scene, camera);
      };
      animate();
      setReady(true);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      controls?.dispose?.();
      disp.forEach((o) => o.dispose?.());
      if (renderer) {
        renderer.dispose();
        renderer.domElement?.remove();
      }
    };
  }, [panels, inverters]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#0b1524', fontFamily: "'Cairo', sans-serif" }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cfe0f5' }}>
          ⏳ جاري تجهيز المساحة...
        </div>
      )}
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 14, insetInlineStart: 14, zIndex: 3, border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', background: 'rgba(10,20,35,0.72)', color: '#fff', fontFamily: 'inherit' }}
      >
        ✕ إغلاق
      </button>
      <div
        dir="rtl"
        style={{ position: 'absolute', bottom: 0, insetInline: 0, zIndex: 2, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: 'linear-gradient(0deg, rgba(8,16,28,0.85), transparent)', color: '#eaf2ff', textAlign: 'center' }}
      >
        <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>🌾 مساحة منظومة مضخة الماء الزراعية</div>
        <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>
          {panels} لوح شمسي أرضي — {inverters} انفيرتر مضخة (VFD){ampDay ? ` — بسعة ${ampDay} أمبير` : ''} · اسحب للتدوير وقرّب بالأصابع
        </div>
      </div>
    </div>
  );
}
