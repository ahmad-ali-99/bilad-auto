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

      // ===== الأرض: حقول محاصيل بكل مكان — والساحة الترابية لاحقاً بگد المنظومة فقط =====
      const cropBase = cropT.clone(); track(cropBase); cropBase.repeat.set(20, 20); cropBase.needsUpdate = true;
      scene.add(mesh(track(new THREE.PlaneGeometry(600, 600)), M({ map: cropBase, roughness: 1 }), 0, -0.02, 0, false).rotateX(-Math.PI / 2));

      // ===== مصفوفة الألواح الأرضية — بعدد ألواح العرض الحقيقي =====
      const structs = splitStructures(panels);
      const PW = 1.15, PL = 2.3, TILT = THREE.MathUtils.degToRad(27);
      const metal = M({ color: 0x9aa2ab, roughness: 0.45, metalness: 0.8 });
      const concrete = M({ color: 0xd8d8d4, roughness: 0.95 });
      const panelMat = M({ map: panelT, roughness: 0.28, metalness: 0.25 });
      const sinT = Math.sin(TILT), cosT = Math.cos(TILT);
      const legTop = 1.0; // ارتفاع الحافة الأمامية
      const backZ = 0.15 + 2 * PL * cosT;
      const backH = legTop + 2 * PL * sinT;
      let az = 0;
      let placed = 0; // عدّاد الألواح المرسومة — يطابق عدد ألواح العرض بالضبط
      const arrayGrp = new THREE.Group();
      structs.forEach((s) => {
        const W = s.cols * PW;
        const g = new THREE.Group();
        // كل لوح قطعة مستقلة بإطارها — العدد المرسوم = عدد العرض حرفياً (والفردي مسموح)
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < s.cols; c++) {
            if (placed >= panels) break;
            const sc = (r + 0.5) * PL;
            const p = mesh(B(PW - 0.08, 0.06, PL - 0.08), panelMat, (c + 0.5) * PW, legTop + sc * sinT, 0.15 + sc * cosT);
            p.rotation.x = -TILT;
            g.add(p);
            placed++;
          }
        }
        // أرجل وصبّات كل عمودين + عمود النهاية، وعارضتان تربطان الأرجل
        const xs = new Set();
        for (let c = 0; c <= s.cols; c += 2) xs.add(Math.min(c * PW, W));
        xs.add(W);
        xs.forEach((x) => {
          g.add(mesh(B(0.09, legTop, 0.09), metal, x, legTop / 2, 0.15));
          g.add(mesh(B(0.09, backH, 0.09), metal, x, backH / 2, backZ));
          g.add(mesh(B(0.42, 0.3, 0.42), concrete, x, 0.15, 0.15));
          g.add(mesh(B(0.42, 0.3, 0.42), concrete, x, 0.15, backZ));
        });
        g.add(mesh(B(W, 0.07, 0.07), metal, W / 2, legTop, 0.15));
        g.add(mesh(B(W, 0.07, 0.07), metal, W / 2, backH, backZ));
        g.position.set(-W / 2, 0, az);
        arrayGrp.add(g);
        az += 2 * PL * cosT + 2.6; // ممر بين الصفوف
      });
      const arrDepth = az - 2.6 + backZ; // العمق الفعلي المستخدم
      arrayGrp.position.z = -arrDepth / 2;
      scene.add(arrayGrp);

      // سياج ضيّق حول المصفوفة (هامش ~1.2م): أعمدة رفيعة + 3 قضبان أفقية
      const fenceMat = M({ color: 0x8f979e, roughness: 0.5, metalness: 0.8 });
      const maxW = Math.max(...structs.map((s) => s.cols * PW), 8) + 2.4;
      const fenceD = arrDepth + 2.4;
      const fz0 = -fenceD / 2, fz1 = fenceD / 2;

      // الساحة الترابية بگد المنظومة فقط: المصفوفة المسيّجة + شريط المعدات شرقها
      const padW = maxW + 13, padD = fenceD + 7;
      const pad = mesh(track(new THREE.PlaneGeometry(padW, padD)), M({ map: dirtT, roughness: 1 }), 2.5, 0.02, 0, false);
      pad.rotateX(-Math.PI / 2);
      scene.add(pad);
      const rail = (w, d, x, z) => [0.55, 1.05, 1.55].forEach((y) => scene.add(mesh(B(w || 0.05, 0.05, d || 0.05), fenceMat, x, y, z)));
      rail(maxW, 0, 0, fz0); rail(maxW, 0, 0, fz1);
      rail(0, fenceD, -maxW / 2, 0); rail(0, fenceD, maxW / 2, 0);
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
          // تأرجح بالجهة الجنوبية — وجه الألواح الأزرق والساقية دائماً بالكادر
          const a = Math.PI + Math.sin(clock.elapsedTime * 0.1) * 0.8;
          camera.position.set(Math.sin(a) * 46, 15, Math.cos(a) * 46);
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
