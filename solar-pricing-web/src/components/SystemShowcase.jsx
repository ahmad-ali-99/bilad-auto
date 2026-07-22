// عرض تفاعلي 3D بجودة سينمائية (مستوحى من رندرات محركات الألعاب):
// سماء فيزيائية + ACES tone mapping + خامات إجرائية بنقوش وbump + توهج Bloom
// + ضباب عمق + نجوم ليلاً + أسلاك كهرباء بالشارع + أوراق تتطاير + أشجار غنية.
// نفس الفكرة: فيلا بواجهة بيت المستخدم (أبيض/رمادي غامق/شريط خشبي) بشارع
// وجيران وحديقة عشب متمايل، الألواح فوق السطح، بيتونة بأجهزة هويمايلز بعدد
// العرض، درج داخلي، داخل مؤثث وسبلتات، شفافية عند الزوم، وشريط وقت اليوم:
// نهاراً توليد وشحن — ليلاً تنطفي الألواح وتشتعل الإنارة وتغذّي البطارية البيت.
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
  const timeRef = useRef(15.5); // الافتراضي 3:30 عصراً (المواصفة قسم 3)
  const [timeLabel, setTimeLabel] = useState(fmtTime(15.5));
  // تحميل الأصول الواقعية (HDRI/خامات/موديلات) — تقدم بالنسبة المئوية
  const [loadPct, setLoadPct] = useState(0);
  const [loadingAssets, setLoadingAssets] = useState(true);

  useEffect(() => {
    let disposed = false;
    let renderer, controls, ro, composer;
    const disp = [];

    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
      const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer.js');
      const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
      const { UnrealBloomPass } = await import('three/examples/jsm/postprocessing/UnrealBloomPass.js');
      const { ShaderPass } = await import('three/examples/jsm/postprocessing/ShaderPass.js');
      const mount = mountRef.current;
      if (disposed || !mount) return;
      const track = (o) => { disp.push(o); return o; };
      const W = () => mount.clientWidth || 900;
      const H = () => mount.clientHeight || 650;
      const windU = { value: 0 };
      const B = (w, h, d) => track(new THREE.BoxGeometry(w, h, d));
      const M = (opt) => track(new THREE.MeshStandardMaterial(opt));
      const lerpC = (a, b, t) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));

      // ================= نسيج إجرائي (لون + Bump) =================
      const mkCanvas = (s) => { const c = document.createElement('canvas'); c.width = c.height = s; return c; };
      const noiseTex = (base, amp = 10, s = 256, lines = null) => {
        const c = mkCanvas(s); const g = c.getContext('2d');
        g.fillStyle = base; g.fillRect(0, 0, s, s);
        const img = g.getImageData(0, 0, s, s); const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const n = (Math.random() - 0.5) * amp;
          d[i] += n; d[i + 1] += n; d[i + 2] += n;
        }
        g.putImageData(img, 0, 0);
        if (lines) lines(g, s);
        const t = track(new THREE.CanvasTexture(c));
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      const bumpTex = (amp = 26, s = 256, lines = null) => {
        const c = mkCanvas(s); const g = c.getContext('2d');
        g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
        const img = g.getImageData(0, 0, s, s); const d = img.data;
        for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        g.putImageData(img, 0, 0);
        if (lines) lines(g, s);
        const t = track(new THREE.CanvasTexture(c));
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
        return t;
      };
      const rep = (t, x, y) => { const c = t.clone(); track(c); c.repeat.set(x, y); c.needsUpdate = true; return c; };
      // خامات الموقع
      const plasterT = noiseTex('#f2f0ea', 8), plasterB = bumpTex(18);
      const charcoalT = noiseTex('#4a4f52', 6, 256, (g, s) => { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; for (let y = 0; y < s; y += 42) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); } });
      const charcoalB = bumpTex(14, 256, (g, s) => { g.strokeStyle = '#5c5c5c'; g.lineWidth = 3; for (let y = 0; y < s; y += 42) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); } });
      const asphaltT = noiseTex('#3b3f43', 16), asphaltB = bumpTex(34);
      const sideT = noiseTex('#cbc5b8', 10, 256, (g, s) => { g.strokeStyle = 'rgba(90,85,75,0.4)'; g.lineWidth = 2; for (let i = 0; i <= s; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); } });
      const sideB = bumpTex(12, 256, (g, s) => { g.strokeStyle = '#5e5e5e'; g.lineWidth = 3; for (let i = 0; i <= s; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); } });
      const dirtT = noiseTex('#d3cab8', 18), dirtB = bumpTex(30);
      const lawnT = noiseTex('#4e8c42', 26), lawnB = bumpTex(30);
      const roofT = noiseTex('#d6d1c8', 12), roofB = bumpTex(22);
      const woodT = noiseTex('#b5713d', 20, 128, (g, s) => { g.strokeStyle = 'rgba(90,45,15,0.35)'; g.lineWidth = 2; for (let x = 0; x < s; x += 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); } });

      const scene = new THREE.Scene();
      // ضباب جوي (القسم 9): بلون الأفق، يبدأ 80م ويكتمل 300م — يصنع طبقات العمق
      scene.fog = new THREE.Fog(0xc8d4dc, 80, 300);

      // ================= خامات البناء =================
      const fadeMats = [];
      // ميزة الدخول للبيت ملغاة حالياً — الجدران صلبة دائماً (الزوم يبقى سكرول عادي)
      const fadeMat = (opt) => { const m = M(opt); fadeMats.push(m); return m; };
      const whiteWall = fadeMat({ map: rep(plasterT, 4, 2), bumpMap: rep(plasterB, 4, 2), bumpScale: 0.6, roughness: 0.9 });
      // رمادي غامق صافٍ (النقشة المخططة كانت تسبب تشويش موارية على البرج)
      const charcoal = fadeMat({ color: 0x4a4f52, roughness: 0.85 });
      const charcoalDark = fadeMat({ color: 0x3d4245, roughness: 0.85 });
      const innerWall = fadeMat({ color: 0xefe9df, roughness: 0.95 });
      const slabMat = fadeMat({ map: rep(roofT, 4, 4), bumpMap: rep(roofB, 4, 4), bumpScale: 0.4, roughness: 0.95 });
      const glassMat = M({ color: 0x18242e, roughness: 0.08, metalness: 0.55, emissive: 0xffc97a, emissiveIntensity: 0.04, envMapIntensity: 1.2 });
      const frameMat = M({ color: 0x1f2327, roughness: 0.45, metalness: 0.5 });
      const woodSlat = M({ map: rep(woodT, 1, 2), roughness: 0.7 });
      const floorWood = M({ color: 0xc9a876, roughness: 0.8 });
      const floorTile = M({ color: 0xe3ded4, roughness: 0.85 });
      const metalGray = M({ color: 0x8a929c, roughness: 0.45, metalness: 0.75 });
      const concrete = M({ color: 0xdfe2e6, roughness: 0.9 });
      const windowsGlow = [], ceilGlow = [], acLeds = [], lampGlow = [];

      // ================= قبة سماء متدرجة (تحكم كامل بالألوان) + نجوم + شمس/قمر =================
      const skyCanvas = mkCanvas(2); skyCanvas.width = 2; skyCanvas.height = 256;
      const skyCtx = skyCanvas.getContext('2d');
      const skyTex = track(new THREE.CanvasTexture(skyCanvas));
      skyTex.colorSpace = THREE.SRGBColorSpace;
      const skyDome = new THREE.Mesh(
        track(new THREE.SphereGeometry(320, 24, 18)),
        track(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }))
      );
      scene.add(skyDome);
      // ===== لوحات أوقات اليوم الخمسة (bilad-auto-env-spec.md — القسمان 3 و9) =====
      // كل لوحة: [أعلى القبة، وسط، أفق] + لون شمس + شدة + تعريض ACES + لون ضباب
      const hex2 = (h) => new THREE.Color(h);
      const SKY_KEYS = [
        // t (ساعة), top, mid, horizon, sunColor, sunI, hemiI, exposure, fog
        [6.0,  '#4A6B8C', '#8FA8C0', '#D4A947', '#FFD9A0', 0.9, 0.45, 0.90, '#C8CCC4'], // فجر/صبح بارد ذهبي
        [9.0,  '#6FA8DC', '#A8CBE8', '#E0E0CC', '#FFEED8', 1.7, 0.60, 1.00, '#C8D4DC'], // ضحى
        [12.5, '#5E9CD8', '#A0C6E6', '#DCE4E0', '#FFF2E0', 2.1, 0.70, 1.10, '#C8D4DC'], // ظهر — أعلى سطوع
        [15.5, '#6FA8DC', '#A8CBE8', '#E8E4D0', '#FFE8C4', 1.8, 0.60, 1.00, '#C8D4DC'], // عصر — الافتراضي الذهبي
        [18.5, '#3A4A6B', '#C98A5C', '#D4A947', '#E8A85C', 0.8, 0.40, 0.95, '#B8A088'], // مغرب — ذهبي→فوشي بالأفق
        [19.6, '#1B2A4A', '#2A3A5C', '#C94F7C', '#8898B8', 0.2, 0.25, 0.90, '#3A4458'], // آخر الشفق
        [21.0, '#0E1830', '#16223E', '#1B2A4A', '#B8D4E8', 0.1, 0.18, 0.88, '#141C2E'], // ليل نيلي
        [30.0, '#0E1830', '#16223E', '#1B2A4A', '#B8D4E8', 0.1, 0.18, 0.88, '#141C2E'],
      ];
      const _skyTmp = { a: new THREE.Color(), b: new THREE.Color() };
      const skyAt = (t) => {
        const tt = t < 6 ? t + 24 : t; // 0-6 صباحاً = امتداد الليل
        let i = 0; while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1][0] < tt) i++;
        const A = SKY_KEYS[i], Bk = SKY_KEYS[i + 1];
        const u = Math.max(0, Math.min(1, (tt - A[0]) / (Bk[0] - A[0] || 1)));
        const mix = (ia) => _skyTmp.a.set(A[ia]).lerp(_skyTmp.b.set(Bk[ia]), u).clone();
        return {
          top: mix(1), mid: mix(2), bot: mix(3), sunC: mix(4),
          sunI: A[5] + (Bk[5] - A[5]) * u, hemiI: A[6] + (Bk[6] - A[6]) * u,
          expo: A[7] + (Bk[7] - A[7]) * u, fogC: mix(8),
        };
      };
      let lastSkyDraw = -99;
      const drawSkyGrad = (top, mid, bot) => {
        const g = skyCtx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, '#' + top.getHexString());
        g.addColorStop(0.6, '#' + mid.getHexString());
        g.addColorStop(1, '#' + bot.getHexString());
        skyCtx.fillStyle = g; skyCtx.fillRect(0, 0, 2, 256);
        skyTex.needsUpdate = true;
      };
      // قرص الشمس: يظهر فقط بالزوايا الجمالية الواطية (صبح/مغرب) — بالعصر تأثير بلا قرص
      const sunBall = new THREE.Mesh(track(new THREE.SphereGeometry(2.0, 24, 24)), track(new THREE.MeshBasicMaterial({ color: 0xffe8c4, fog: false })));
      const sunHalo = new THREE.Mesh(track(new THREE.SphereGeometry(3.6, 24, 24)), track(new THREE.MeshBasicMaterial({ color: 0xd4a947, transparent: true, opacity: 0.22, fog: false })));
      scene.add(sunBall, sunHalo);

      // ===== الغيوم: ركامية قرب الأفق + خيوط cirrus عالية (القسم 3 + جدول الحركة 16) =====
      const cloudTex = (soft) => {
        const c = mkCanvas(256); const g = c.getContext('2d');
        for (let i = 0; i < (soft ? 5 : 14); i++) {
          const cx = 40 + Math.random() * 176, cy = 90 + Math.random() * 76;
          const r = soft ? 55 + Math.random() * 45 : 22 + Math.random() * 34;
          const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
          grd.addColorStop(0, 'rgba(252,252,250,0.82)');
          grd.addColorStop(0.65, 'rgba(248,248,246,0.35)');
          grd.addColorStop(1, 'rgba(248,248,246,0)');
          g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, r, 0, 6.29); g.fill();
        }
        const t2 = track(new THREE.CanvasTexture(c)); t2.colorSpace = THREE.SRGBColorSpace; return t2;
      };
      const cloudGroup = new THREE.Group();
      const cumulusMats = [];
      for (let i = 0; i < 11; i++) {
        const m = track(new THREE.SpriteMaterial({ map: cloudTex(false), transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
        cumulusMats.push(m);
        const sp = new THREE.Sprite(m);
        const ang = (i / 11) * Math.PI * 2 + Math.random() * 0.3;
        const rr = 235 + Math.random() * 45;
        sp.position.set(Math.cos(ang) * rr, 26 + Math.random() * 26, Math.sin(ang) * rr);
        // عيب مقصود #10: غيمة وحدة أكبر من البقية بوضوح
        const s = i === 4 ? 150 : 65 + Math.random() * 45;
        sp.scale.set(s, s * 0.52, 1);
        cloudGroup.add(sp);
      }
      for (let i = 0; i < 5; i++) {
        const m = track(new THREE.SpriteMaterial({ map: cloudTex(true), transparent: true, opacity: 0.32, fog: false, depthWrite: false }));
        cumulusMats.push(m);
        const sp = new THREE.Sprite(m);
        const ang = Math.random() * Math.PI * 2;
        sp.position.set(Math.cos(ang) * 190, 125 + Math.random() * 35, Math.sin(ang) * 190);
        sp.scale.set(210 + Math.random() * 80, 26, 1); // خيوط رقيقة ممدودة
        cloudGroup.add(sp);
      }
      scene.add(cloudGroup);
      const CLOUD_ROT = (Math.PI * 2) / 1200; // دورة كاملة / 20 دقيقة
      const starGeo = track(new THREE.BufferGeometry());
      {
        const pos = new Float32Array(360 * 3);
        for (let i = 0; i < 360; i++) {
          const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45;
          const r = 160;
          pos[i * 3] = r * Math.cos(th) * Math.cos(ph);
          pos[i * 3 + 1] = r * Math.sin(ph) + 6;
          pos[i * 3 + 2] = r * Math.sin(th) * Math.cos(ph);
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      }
      const starMat = track(new THREE.PointsMaterial({ color: 0xdfe9ff, size: 0.5, transparent: true, opacity: 0, sizeAttenuation: true, fog: false }));
      const stars = new THREE.Points(starGeo, starMat); scene.add(stars);

      // شمس المواصفة: #FFE8C4 عصراً، ظلال PCF ناعمة 2048 مركزة على بيت البطل ومحيطه
      const sunLight = new THREE.DirectionalLight(0xffe8c4, 1.8);
      sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048); sunLight.shadow.bias = -0.0004;
      sunLight.shadow.radius = 4; // نعومة حواف الظل
      Object.assign(sunLight.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 0.5, far: 160 });
      scene.add(sunLight);
      // ضوء سماء: علوي #B8D4E8 / سفلي #D8C8A8 (ارتداد أرض) — الظلال ملونة مو سوداء
      const hemi = track(new THREE.HemisphereLight(0xb8d4e8, 0xd8c8a8, 0.6)); scene.add(hemi);
      const amb = track(new THREE.AmbientLight(0xd8c8a8, 0.15)); scene.add(amb);
      const fillL = track(new THREE.DirectionalLight(0xb8d4e8, 0.25)); fillL.position.set(8, 6, -10); scene.add(fillL);
      const moonBall = new THREE.Mesh(track(new THREE.SphereGeometry(0.9, 20, 20)), track(new THREE.MeshBasicMaterial({ color: 0xe8efff, fog: false })));
      scene.add(moonBall);
      const moonLight = track(new THREE.DirectionalLight(0xa8c0e8, 0.0)); scene.add(moonLight);

      // ================= الألواح =================
      const panelTexture = () => {
        const c = mkCanvas(256); const g = c.getContext('2d');
        const grd = g.createLinearGradient(0, 0, 128, 256);
        grd.addColorStop(0, '#5570c0'); grd.addColorStop(0.5, '#3a55a0'); grd.addColorStop(1, '#2c4180');
        g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
        g.strokeStyle = 'rgba(180,200,240,0.6)'; g.lineWidth = 2;
        for (let i = 1; i < 6; i++) { const x = (i / 6) * 256; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
        for (let j = 1; j < 12; j++) { const y = (j / 12) * 256; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
        g.strokeStyle = 'rgba(8,20,45,0.9)'; g.lineWidth = 8; g.strokeRect(0, 0, 256, 256);
        const t = track(new THREE.CanvasTexture(c)); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return t;
      };
      const PANEL_W = 1.05, TIER_L = 1.1, TILT = THREE.MathUtils.degToRad(22);
      const LEG = 0.38, LIFT = 0.75, GAPS = 1.0, POST = 0.055;
      const panelBase = M({ map: panelTexture(), roughness: 0.25, metalness: 0.2, emissive: 0x24406e, emissiveIntensity: 0, envMapIntensity: 1.1 });
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

      // ================= أبعاد الموقع =================
      const FLOOR = 3.0, HW = 10, HD = 12, HH = FLOOR * 2;
      const LOT_FRONT = 6;
      const WALL_Z = -HD / 2 - LOT_FRONT;
      const SIDEWALK = 2, ROAD_W = 9;

      // ================= الأرضيات والشارع =================
      const groundAll = new THREE.Mesh(track(new THREE.PlaneGeometry(200, 200)), M({ map: rep(dirtT, 40, 40), roughness: 1, envMapIntensity: 0.05 }));
      groundAll.rotation.x = -Math.PI / 2; groundAll.position.y = -0.02; groundAll.receiveShadow = true; scene.add(groundAll);
      const lot = new THREE.Mesh(track(new THREE.PlaneGeometry(HW + 8, HD + LOT_FRONT + 4)), M({ map: rep(sideT, 9, 11), roughness: 0.96, envMapIntensity: 0.05 }));
      lot.rotation.x = -Math.PI / 2; lot.position.set(0, 0, -LOT_FRONT / 2 + 1); lot.receiveShadow = true; scene.add(lot);
      const walk = new THREE.Mesh(track(new THREE.PlaneGeometry(70, SIDEWALK)), M({ map: rep(sideT, 22, 1), roughness: 0.96, envMapIntensity: 0.05 }));
      walk.rotation.x = -Math.PI / 2; walk.position.set(0, 0.02, WALL_Z - SIDEWALK / 2 - 0.1); walk.receiveShadow = true; scene.add(walk);
      // حجر كيربستون
      const curbM = M({ color: 0xb8b2a6, roughness: 0.8 });
      const curb = new THREE.Mesh(B(70, 0.14, 0.22), curbM); curb.position.set(0, 0.07, WALL_Z - SIDEWALK - 0.05); scene.add(curb);
      const road = new THREE.Mesh(track(new THREE.PlaneGeometry(70, ROAD_W)), M({ map: rep(asphaltT, 20, 3), roughness: 0.98, envMapIntensity: 0.04 }));
      road.rotation.x = -Math.PI / 2; road.position.set(0, 0.004, WALL_Z - SIDEWALK - ROAD_W / 2 - 0.1); road.receiveShadow = true; scene.add(road);
      const dashGeo = B(1.4, 0.012, 0.16); const dashMat = M({ color: 0xd8d8cf, roughness: 0.8 });
      for (let x = -32; x <= 32; x += 3.4) { const d = new THREE.Mesh(dashGeo, dashMat); d.position.set(x, 0.012, WALL_Z - SIDEWALK - ROAD_W / 2 - 0.1); scene.add(d); }
      const walk2 = walk.clone(); walk2.position.z = WALL_Z - SIDEWALK - ROAD_W - SIDEWALK / 2 - 0.1; scene.add(walk2);
      const curb2 = curb.clone(); curb2.position.z = WALL_Z - SIDEWALK - ROAD_W - 0.15; scene.add(curb2);

      // ================= السياج + اللوحة + البوابة =================
      const wallH = 1.7;
      const fenceFront1 = new THREE.Mesh(B(HW + 8 - 3.4, wallH, 0.22), whiteWall);
      fenceFront1.position.set(-1.7, wallH / 2, WALL_Z); fenceFront1.castShadow = true; fenceFront1.receiveShadow = true; scene.add(fenceFront1);
      const capF = new THREE.Mesh(B(HW + 8 - 3.3, 0.08, 0.3), curbM); capF.position.set(-1.7, wallH + 0.04, WALL_Z); scene.add(capF);
      const gateW = 3.2;
      const fenceSideL = new THREE.Mesh(B(0.22, wallH, HD + LOT_FRONT + 3), whiteWall);
      fenceSideL.position.set(-(HW + 8) / 2, wallH / 2, -LOT_FRONT / 2 + 0.6); fenceSideL.receiveShadow = true; scene.add(fenceSideL);
      const fenceSideR = fenceSideL.clone(); fenceSideR.position.x = (HW + 8) / 2; scene.add(fenceSideR);
      const board = new THREE.Mesh(B(3.6, 1.15, 0.06), charcoal); board.position.set(0.4, 0.95, WALL_Z - 0.15); scene.add(board);
      const plaqueGeo = B(0.62, 0.4, 0.02); const plaqueMat = M({ color: 0xf6f6f2, roughness: 0.55 });
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
        const p = new THREE.Mesh(plaqueGeo, plaqueMat);
        p.position.set(0.4 - 1.32 + c * 0.88, 0.95 + 0.28 - r * 0.55, WALL_Z - 0.19); scene.add(p);
      }
      const gateX = (HW + 8) / 2 - gateW / 2 - 0.3;
      const barGeo = B(0.05, wallH - 0.15, 0.05);
      for (let i = 0; i < 12; i++) { const bar = new THREE.Mesh(barGeo, metalGray); bar.position.set(gateX - gateW / 2 + 0.2 + i * (gateW - 0.4) / 11, wallH / 2, WALL_Z); scene.add(bar); }
      const gateTop = new THREE.Mesh(B(gateW, 0.07, 0.07), metalGray); gateTop.position.set(gateX, wallH - 0.15, WALL_Z); scene.add(gateTop);

      // ================= البيت (واجهة الصورة) =================
      const house = new THREE.Group();
      const mainMass = new THREE.Mesh(B(HW, HH, HD), whiteWall);
      mainMass.position.y = HH / 2; mainMass.castShadow = true; mainMass.receiveShadow = true; house.add(mainMass);
      const towerW = 2.4, towerH = HH + 1.6;
      const tower = new THREE.Mesh(B(towerW, towerH, 3), charcoalDark);
      tower.position.set(-HW / 2 + towerW / 2, towerH / 2, -HD / 2 + 1.5); tower.castShadow = true; house.add(tower);
      const ledgeGeo = B(towerW + 0.15, 0.18, 0.5);
      const plantMat = M({ color: 0x3f8b3a, roughness: 0.9 });
      const plantJit = (geo) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { p.setXYZ(i, p.getX(i) * (0.85 + Math.random() * 0.3), p.getY(i) * (0.85 + Math.random() * 0.3), p.getZ(i) * (0.85 + Math.random() * 0.3)); } geo.computeVertexNormals(); return geo; };
      [2.2, 4.4].forEach((ly) => {
        const ledge = new THREE.Mesh(ledgeGeo, whiteWall); ledge.position.set(-HW / 2 + towerW / 2, ly, -HD / 2 - 0.28); house.add(ledge);
        for (let i = 0; i < 4; i++) {
          const pl = new THREE.Mesh(plantJit(track(new THREE.IcosahedronGeometry(0.17, 1))), plantMat);
          pl.scale.set(1, 1.7, 1); pl.position.set(-HW / 2 + 0.5 + i * 0.5, ly - 0.3, -HD / 2 - 0.3); house.add(pl);
        }
      });
      const balcW = 5.4, balcH = FLOOR, balcX = HW / 2 - balcW / 2 - 0.6;
      const balcBack = new THREE.Mesh(B(balcW, balcH, 0.15), charcoal);
      balcBack.position.set(balcX, FLOOR + balcH / 2, -HD / 2 + 1.1); house.add(balcBack);
      const balcGlass = new THREE.Mesh(B(balcW - 0.5, balcH - 0.9, 0.05), glassMat.clone());
      track(balcGlass.material); windowsGlow.push(balcGlass.material);
      balcGlass.position.set(balcX, FLOOR + balcH / 2 + 0.2, -HD / 2 + 1.02); house.add(balcGlass);
      const balcRail = new THREE.Mesh(B(balcW, 1.0, 0.1), charcoalDark);
      balcRail.position.set(balcX, FLOOR + 0.55, -HD / 2 + 0.35); house.add(balcRail);
      const stripGeo = B(balcW + 1.2, 0.16, 0.06);
      [FLOOR + 1.15, FLOOR + 2.2].forEach((sy) => { const s = new THREE.Mesh(stripGeo, whiteWall); s.position.set(balcX - 0.2, sy, -HD / 2 - 0.02); house.add(s); });
      const slatGrp = new THREE.Group();
      for (let i = 0; i < 7; i++) { const sl = new THREE.Mesh(B(0.09, FLOOR - 0.3, 0.09), woodSlat); sl.position.set(i * 0.14, 0, 0); slatGrp.add(sl); }
      slatGrp.position.set(HW / 2 - 1.1, FLOOR + FLOOR / 2, -HD / 2 - 0.06); house.add(slatGrp);
      // شباك بإطار + عارضتين + عتبة
      const mkWin = (x, y, w2, h2, z, host = house) => {
        const fr = new THREE.Mesh(B(w2 + 0.14, h2 + 0.14, 0.08), frameMat); fr.position.set(x, y, z); host.add(fr);
        const gm = glassMat.clone(); track(gm); windowsGlow.push(gm);
        const gl = new THREE.Mesh(B(w2, h2, 0.05), gm); gl.position.set(x, y, z - 0.025); host.add(gl);
        const mull = new THREE.Mesh(B(0.05, h2, 0.06), frameMat); mull.position.set(x, y, z - 0.01); host.add(mull);
        const sill = new THREE.Mesh(B(w2 + 0.3, 0.08, 0.18), curbM); sill.position.set(x, y - h2 / 2 - 0.1, z); host.add(sill);
      };
      mkWin(HW / 2 - 2.2, 1.55, 2.6, 1.7, -HD / 2 - 0.03);
      mkWin(0.2, 1.55, 1.5, 1.5, -HD / 2 - 0.03);
      mkWin(-HW / 2 + towerW / 2, 3.4, 1.1, 2.2, -HD / 2 - 0.03);
      const door = new THREE.Mesh(B(1.1, 2.2, 0.08), M({ color: 0x2d2620, roughness: 0.5 }));
      door.position.set(-HW / 2 + towerW + 0.9, 1.1, -HD / 2 - 0.03); house.add(door);
      const doorStep = new THREE.Mesh(B(1.5, 0.12, 0.8), curbM); doorStep.position.set(-HW / 2 + towerW + 0.9, 0.06, -HD / 2 - 0.4); house.add(doorStep);
      [[-HW / 2 - 0.03, HD * 0.05, Math.PI / 2], [HW / 2 + 0.03, HD * 0.05, -Math.PI / 2]].forEach(([sx, sz, ry]) => {
        [1.55, FLOOR + 1.55].forEach((sy) => {
          const g2 = new THREE.Group();
          const fr = new THREE.Mesh(B(1.7, 1.44, 0.08), frameMat); g2.add(fr);
          const gm = glassMat.clone(); track(gm); windowsGlow.push(gm);
          const gl = new THREE.Mesh(B(1.56, 1.3, 0.05), gm); gl.position.z = -0.02; g2.add(gl);
          g2.position.set(sx, sy, sz); g2.rotation.y = ry; house.add(g2);
        });
      });
      const roofSlab = new THREE.Mesh(B(HW + 0.15, 0.15, HD + 0.15), slabMat);
      roofSlab.position.y = HH + 0.075; roofSlab.receiveShadow = true; house.add(roofSlab);
      const parH = 0.55;
      const parX = B(HW + 0.15, parH, 0.12), parZ = B(0.12, parH, HD + 0.15);
      [[0, HD / 2], [0, -HD / 2]].forEach(([px, pz]) => { const p = new THREE.Mesh(parX, whiteWall); p.position.set(px, HH + parH / 2 + 0.15, pz); house.add(p); });
      [[HW / 2, 0], [-HW / 2, 0]].forEach(([px, pz]) => { const p = new THREE.Mesh(parZ, whiteWall); p.position.set(px, HH + parH / 2 + 0.15, pz); house.add(p); });
      scene.add(house);

      // ================= الداخل المؤثث =================
      const interior = new THREE.Group();
      const f0 = new THREE.Mesh(B(HW - 0.4, 0.1, HD - 0.4), floorTile); f0.position.y = 0.05; interior.add(f0);
      const f1s = new THREE.Mesh(B(HW - 0.4, 0.12, HD - 0.4), slabMat); f1s.position.y = FLOOR; interior.add(f1s);
      const f1f = new THREE.Mesh(B(HW - 0.5, 0.04, HD - 0.5), floorWood); f1f.position.y = FLOOR + 0.08; interior.add(f1f);
      [FLOOR - 0.08, HH - 0.08].forEach((cy) => {
        const cm = M({ color: 0xfdf6e8, roughness: 0.9, emissive: 0xffd9a0, emissiveIntensity: 0.02 });
        ceilGlow.push(cm);
        const c = new THREE.Mesh(B(HW - 0.6, 0.04, HD - 0.6), cm); c.position.y = cy; interior.add(c);
      });
      // ثريات معلقة دافئة (تضوي ليلاً وتلمع بالبلوم)
      const pendGeo = track(new THREE.ConeGeometry(0.22, 0.16, 18, 1, true));
      [[-HW * 0.2, FLOOR - 0.5, -HD * 0.16], [HW * 0.28, FLOOR - 0.5, -HD * 0.05], [-HW * 0.24, HH - 0.5, HD * 0.26], [HW * 0.26, HH - 0.5, HD * 0.26]].forEach(([px, py, pz]) => {
        const shade = new THREE.Mesh(pendGeo, M({ color: 0xf3ead8, roughness: 0.7, side: THREE.DoubleSide })); shade.position.set(px, py, pz); interior.add(shade);
        const bulbM = M({ color: 0xfff2cf, emissive: 0xffd98e, emissiveIntensity: 0.05 }); ceilGlow.push(bulbM);
        const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.06, 10, 10)), bulbM); bulb.position.set(px, py - 0.06, pz); interior.add(bulb);
        const cord = new THREE.Mesh(B(0.02, 0.45, 0.02), frameMat); cord.position.set(px, py + 0.3, pz); interior.add(cord);
      });
      const part1 = new THREE.Mesh(B(0.1, FLOOR - 0.2, HD * 0.55), innerWall); part1.position.set(HW * 0.13, FLOOR / 2, HD * 0.18); interior.add(part1);
      const part2 = new THREE.Mesh(B(HW * 0.45, FLOOR - 0.2, 0.1), innerWall); part2.position.set(-HW * 0.24, FLOOR / 2, HD * 0.12); interior.add(part2);
      const part3 = new THREE.Mesh(B(0.1, FLOOR - 0.2, HD * 0.5), innerWall); part3.position.set(0, FLOOR + FLOOR / 2, HD * 0.2); interior.add(part3);
      const sofaMat = M({ color: 0xdcd2bf, roughness: 0.95 });
      const rug = new THREE.Mesh(B(3.4, 0.03, 2.4), M({ color: 0x9c4f43, roughness: 0.95 })); rug.position.set(-HW * 0.2, 0.12, -HD * 0.16); interior.add(rug);
      const rug2 = new THREE.Mesh(B(2.6, 0.02, 1.8), M({ color: 0xb9aa90, roughness: 0.95 })); rug2.position.set(-HW * 0.2, 0.14, -HD * 0.16); interior.add(rug2);
      const sofa1 = new THREE.Mesh(B(2.6, 0.65, 0.9), sofaMat); sofa1.position.set(-HW * 0.2, 0.45, -HD * 0.16 - 1.0); interior.add(sofa1);
      const sofaBack1 = new THREE.Mesh(B(2.6, 0.5, 0.2), sofaMat); sofaBack1.position.set(-HW * 0.2, 0.95, -HD * 0.16 - 1.35); interior.add(sofaBack1);
      const sofa2 = new THREE.Mesh(B(0.9, 0.65, 1.9), sofaMat); sofa2.position.set(-HW * 0.2 - 1.6, 0.45, -HD * 0.16); interior.add(sofa2);
      const cushG = B(0.55, 0.18, 0.5); const cushM = M({ color: 0xc9b696, roughness: 0.95 });
      [[-0.8, -0.95], [0, -0.95], [0.8, -0.95]].forEach(([cx, cz]) => { const cu = new THREE.Mesh(cushG, cushM); cu.position.set(-HW * 0.2 + cx, 0.85, -HD * 0.16 + cz - 0.2); interior.add(cu); });
      const coffee = new THREE.Mesh(B(1.0, 0.35, 0.6), M({ color: 0x7a5c3a, roughness: 0.65 })); coffee.position.set(-HW * 0.2, 0.3, -HD * 0.16); interior.add(coffee);
      const tvWall = new THREE.Mesh(B(2.8, 2.2, 0.08), M({ color: 0x584c3e, roughness: 0.8 })); tvWall.position.set(-HW * 0.2, 1.25, -HD * 0.16 + 1.7); interior.add(tvWall);
      const tv = new THREE.Mesh(B(1.6, 0.9, 0.05), M({ color: 0x0a0a0a, roughness: 0.25, emissive: 0x223344, emissiveIntensity: 0.15 })); tv.position.set(-HW * 0.2, 1.35, -HD * 0.16 + 1.62); interior.add(tv);
      const dinT = new THREE.Mesh(B(1.9, 0.08, 1.0), M({ color: 0x9c6f42, roughness: 0.55 })); dinT.position.set(HW * 0.28, 0.78, -HD * 0.05); interior.add(dinT);
      const dinLegG = B(0.07, 0.72, 0.07); const chairG = B(0.42, 0.5, 0.42); const chairM = M({ color: 0x6e5137, roughness: 0.8 });
      [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]].forEach(([dx, dz]) => { const l = new THREE.Mesh(dinLegG, chairM); l.position.set(HW * 0.28 + dx, 0.38, -HD * 0.05 + dz); interior.add(l); });
      [[-0.55, -0.85], [0.35, -0.85], [-0.55, 0.75], [0.35, 0.75], [-1.2, 0], [1.15, 0]].forEach(([dx, dz]) => { const c = new THREE.Mesh(chairG, chairM); c.position.set(HW * 0.28 + dx, 0.25, -HD * 0.05 + dz); interior.add(c); });
      const counter = new THREE.Mesh(B(HW * 0.42, 0.9, 0.65), M({ color: 0x8d9296, roughness: 0.45, metalness: 0.25 })); counter.position.set(HW * 0.24, 0.45, HD * 0.38); interior.add(counter);
      const cabinets = new THREE.Mesh(B(HW * 0.42, 0.7, 0.35), M({ color: 0x5a5f63, roughness: 0.55 })); cabinets.position.set(HW * 0.24, 1.9, HD * 0.44); interior.add(cabinets);
      const fridge = new THREE.Mesh(B(0.7, 1.8, 0.65), M({ color: 0xd9dcdf, roughness: 0.35, metalness: 0.3 })); fridge.position.set(-HW * 0.05, 0.95, HD * 0.4); interior.add(fridge);
      const bedM = M({ color: 0xcbb7a0, roughness: 0.95 }); const headM = M({ color: 0x6e5137, roughness: 0.8 });
      const mkBed = (x, z) => {
        const bed = new THREE.Mesh(B(1.6, 0.45, 2.1), bedM); bed.position.set(x, FLOOR + 0.35, z); interior.add(bed);
        const blanket = new THREE.Mesh(B(1.6, 0.1, 1.3), M({ color: 0x8a7d68, roughness: 0.95 })); blanket.position.set(x, FLOOR + 0.6, z - 0.35); interior.add(blanket);
        const head = new THREE.Mesh(B(1.7, 0.9, 0.12), headM); head.position.set(x, FLOOR + 0.65, z + 1.08); interior.add(head);
        const pil = new THREE.Mesh(B(1.3, 0.14, 0.4), M({ color: 0xf3ede2, roughness: 0.95 })); pil.position.set(x, FLOOR + 0.63, z + 0.72); interior.add(pil);
      };
      mkBed(-HW * 0.24, HD * 0.26); mkBed(HW * 0.26, HD * 0.26);
      const ward = new THREE.Mesh(B(2.0, 2.2, 0.6), M({ color: 0x7c623f, roughness: 0.7 }));
      ward.position.set(0.2, FLOOR + 1.2, HD * 0.42); interior.add(ward);
      // الغلاف الخارجي فقط حالياً — الداخل مخفي (ميزة الدخول للبيت مؤجلة)
      interior.visible = false;
      scene.add(interior);

      // سبلتات + كومبرسرات
      const acBodyM = M({ color: 0xf7f8f9, roughness: 0.35 });
      const mkAC = (x, y, z, ry = 0) => {
        const g = new THREE.Group();
        const bodyAC = new THREE.Mesh(B(1.0, 0.32, 0.24), acBodyM); g.add(bodyAC);
        const vent = new THREE.Mesh(B(0.9, 0.05, 0.02), M({ color: 0xb9bec2, roughness: 0.6 })); vent.position.set(0, -0.12, -0.12); g.add(vent);
        const ledm = M({ color: 0x27c96b, emissive: 0x27c96b, emissiveIntensity: 0.8 }); acLeds.push(ledm);
        const led = new THREE.Mesh(track(new THREE.SphereGeometry(0.02, 8, 8)), ledm); led.position.set(0.4, -0.08, -0.13); g.add(led);
        g.position.set(x, y, z); g.rotation.y = ry; interior.add(g);
      };
      mkAC(-HW * 0.2, 2.5, -HD * 0.16 + 1.55, Math.PI);
      mkAC(HW * 0.28, 2.5, HD * 0.3);
      mkAC(-HW * 0.24, FLOOR + 2.5, HD * 0.26 + 1.0, Math.PI);
      mkAC(HW * 0.26, FLOOR + 2.5, HD * 0.26 + 1.0, Math.PI);
      const condM = M({ color: 0xd9dcdf, roughness: 0.45, metalness: 0.2 });
      [[HW / 2 + 0.35, 1.0], [HW / 2 + 0.35, 2.2]].forEach(([cx, cy]) => {
        const cd = new THREE.Mesh(B(0.85, 0.6, 0.32), condM); cd.position.set(cx, cy, HD * 0.1); cd.rotation.y = Math.PI / 2; scene.add(cd);
        const fan = new THREE.Mesh(track(new THREE.CircleGeometry(0.2, 20)), M({ color: 0x4a4f52, roughness: 0.6 })); fan.position.set(cx + 0.17, cy, HD * 0.1); fan.rotation.y = Math.PI / 2; scene.add(fan);
      });

      // الدرج الداخلي
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

      // ================= البيتونة (غرفة السطح) =================
      const roomW = 3.6, roomD = 2.8, roomH = 2.4;
      const roomX = -HW / 2 + towerW / 2 + 0.4, roomZ = HD / 2 - roomD / 2 - 0.6;
      const room = new THREE.Group();
      const rWall = fadeMat({ map: rep(plasterT, 2, 1), bumpMap: rep(plasterB, 2, 1), bumpScale: 0.4, roughness: 0.95 });
      const rb = new THREE.Mesh(B(roomW, roomH, 0.1), rWall); rb.position.set(0, roomH / 2, roomD / 2); room.add(rb);
      const rl = new THREE.Mesh(B(0.1, roomH, roomD), rWall); rl.position.set(-roomW / 2, roomH / 2, 0); room.add(rl);
      const rr = new THREE.Mesh(B(0.1, roomH, roomD), rWall); rr.position.set(roomW / 2, roomH / 2, 0); room.add(rr);
      const rt = new THREE.Mesh(B(roomW + 0.2, 0.12, roomD + 0.2), slabMat); rt.position.set(0, roomH + 0.06, 0); rt.castShadow = true; room.add(rt);
      const rg = new THREE.Mesh(B(roomW - 0.2, roomH - 0.3, 0.04), track(new THREE.MeshStandardMaterial({ color: 0x1c2a38, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.28 })));
      rg.position.set(0, roomH / 2, -roomD / 2); room.add(rg);
      const rf = new THREE.Mesh(B(roomW, 0.06, roomD), M({ color: 0xb9b2a4, roughness: 1 })); rf.position.set(0, 0.03, 0); room.add(rf);
      const invLed = [];
      const invCount = Math.max(1, inverters);
      const invWhiteM = M({ color: 0xf7f8f9, roughness: 0.35, metalness: 0.08 });
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
      const chargeBars = [];
      let batAnchor = null;
      const batCount = Math.max(0, batteries);
      if (batCount > 0) {
        const bw = 0.36, bd2 = 0.2, bh = 1.15, bgap = 0.08;
        const cols = Math.min(batCount, Math.floor((roomW - 0.4) / (bw + bgap)) || 1);
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

      // ================= الألواح فوق السطح =================
      const structsGroup = new THREE.Group();
      const structs = splitStructures(panels);
      let pDepth = 0, panelFront = null;
      structs.forEach((s, i) => {
        const g = buildStructure(s.cols, LEG + i * LIFT);
        const off = i * (2 * TIER_L * Math.cos(TILT) + GAPS);
        g.position.set(-s.cols * PANEL_W / 2, 0, off); structsGroup.add(g);
        pDepth = off + g.userData.dz;
        if (i === 0) panelFront = new THREE.Vector3(0, LEG, off);
      });
      structsGroup.position.set(1.2, HH + 0.16, -HD / 2 + 0.9);
      scene.add(structsGroup);

      // ================= الحديقة والعشب والأشجار =================
      const lawn = new THREE.Mesh(track(new THREE.PlaneGeometry(HW + 4, LOT_FRONT - 0.8)), M({ map: rep(lawnT, 6, 3), roughness: 1, envMapIntensity: 0.05 }));
      lawn.rotation.x = -Math.PI / 2; lawn.position.set(-2, 0.01, -HD / 2 - LOT_FRONT / 2 + 0.3); lawn.receiveShadow = true; scene.add(lawn);
      // إطار حجري مشذب حول الثيل
      const borderM = M({ color: 0xb8b2a6, roughness: 0.85 });
      const lw = HW + 4, ld = LOT_FRONT - 0.8, lcx = -2, lcz = -HD / 2 - LOT_FRONT / 2 + 0.3;
      [[lcx, lcz - ld / 2, lw + 0.3, 0.18], [lcx, lcz + ld / 2, lw + 0.3, 0.18]].forEach(([bx, bz, bw2, bd3]) => {
        const bs = new THREE.Mesh(B(bw2, 0.09, bd3), borderM); bs.position.set(bx, 0.045, bz); scene.add(bs);
      });
      [[lcx - lw / 2, lcz, 0.18, ld + 0.3], [lcx + lw / 2, lcz, 0.18, ld + 0.3]].forEach(([bx, bz, bw2, bd3]) => {
        const bs = new THREE.Mesh(B(bw2, 0.09, bd3), borderM); bs.position.set(bx, 0.045, bz); scene.add(bs);
      });
      const path = new THREE.Mesh(track(new THREE.PlaneGeometry(1.4, LOT_FRONT)), M({ map: rep(sideT, 1, 4), roughness: 0.9 }));
      path.rotation.x = -Math.PI / 2; path.position.set(-HW / 2 + towerW + 0.9, 0.02, -HD / 2 - LOT_FRONT / 2); scene.add(path);
      const drive = new THREE.Mesh(track(new THREE.PlaneGeometry(3.2, LOT_FRONT)), M({ map: rep(asphaltT, 2, 3), color: 0x9a9a9a, roughness: 0.96, envMapIntensity: 0.04 }));
      drive.rotation.x = -Math.PI / 2; drive.position.set(gateX, 0.02, -HD / 2 - LOT_FRONT / 2); drive.receiveShadow = true; scene.add(drive);
      const bladeGeo = track(new THREE.ConeGeometry(0.028, 0.34, 4, 1)); bladeGeo.translate(0, 0.17, 0);
      const grassMat = M({ color: 0xffffff, roughness: 1 });
      grassMat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = windU;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float ph = instanceMatrix[3].x * 0.8 + instanceMatrix[3].z * 0.6;
           float sway = sin(uTime * 1.7 + ph) * 0.16 + sin(uTime * 3.3 + ph * 1.7) * 0.06;
           transformed.x += sway * position.y;`
        );
      };
      const grassN = 1800;
      const grass = new THREE.InstancedMesh(bladeGeo, grassMat, grassN);
      const dum = new THREE.Object3D(); const gcol = new THREE.Color(); let gi = 0;
      const grassSpots = []; // مواقع الحديقة — تُعاد للاستخدام مع خصلات العشب الحقيقية (GLB)
      for (let k = 0; k < grassN; k++) {
        const gx = -2 + (Math.random() - 0.5) * (HW + 3.6);
        const gz = -HD / 2 - LOT_FRONT / 2 + 0.3 + (Math.random() - 0.5) * (LOT_FRONT - 1.2);
        if (gx > gateX - 2 && gx < gateX + 2) continue;
        if (gx > -HW / 2 + towerW + 0.1 && gx < -HW / 2 + towerW + 1.7) continue;
        if (grassSpots.length < 160) grassSpots.push([gx, gz]);
        dum.position.set(gx, 0, gz); dum.rotation.y = Math.random() * Math.PI;
        const s = 0.75 + Math.random() * 0.7; dum.scale.set(s, 0.8 + Math.random() * 0.7, s);
        dum.updateMatrix(); grass.setMatrixAt(gi, dum.matrix);
        gcol.setHSL(0.29 + Math.random() * 0.05, 0.55, 0.3 + Math.random() * 0.14);
        grass.setColorAt(gi, gcol); gi++;
      }
      grass.count = gi; grass.instanceMatrix.needsUpdate = true;
      if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
      scene.add(grass);
      // أشجار غنية بأوراق مبعثرة وتدرجين أخضر
      const trunkM = M({ color: 0x6b4a2c, roughness: 0.9 });
      const leafM1 = M({ color: 0x3f8b3a, roughness: 0.95 });
      const leafM2 = M({ color: 0x5aa04a, roughness: 0.95 });
      const procTrees = [], procShrubs = []; // تُخفى عند تحميل الموديلات الحقيقية
      const mkTree = (x, z, sc = 1) => {
        const tg = new THREE.Group();
        const tr = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.15, 1.3, 8)), trunkM); tr.position.y = 0.65; tr.castShadow = true; tg.add(tr);
        const br = new THREE.Mesh(track(new THREE.CylinderGeometry(0.04, 0.06, 0.7, 6)), trunkM); br.position.set(0.22, 1.25, 0); br.rotation.z = -0.6; tg.add(br);
        [[0, 1.55, 0.55, leafM1], [0.35, 1.75, 0.45, leafM2], [-0.33, 1.8, 0.44, leafM1], [0, 2.15, 0.4, leafM2], [0.15, 1.4, 0.35, leafM2]].forEach(([dx, dy, r, lm]) => {
          const c = new THREE.Mesh(plantJit(track(new THREE.IcosahedronGeometry(r, 1))), lm); c.position.set(dx, dy, (Math.random() - 0.5) * 0.3); c.castShadow = true; tg.add(c);
        });
        tg.position.set(x, 0, z); tg.scale.setScalar(sc); scene.add(tg); procTrees.push(tg);
      };
      mkTree(-HW / 2 - 2.2, -HD / 2 - 2, 1.15);
      mkTree(-HW / 2 + 1.4, -HD / 2 - LOT_FRONT + 1.2, 0.9);
      mkTree(13, WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 2.5, 1.25);
      mkTree(-14, WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 2.2, 1.1);
      const shrubG = track(new THREE.IcosahedronGeometry(0.3, 1));
      for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(shrubG, leafM2); s.position.set(-HW / 2 + 1 + i * 1.4, 0.28, WALL_Z + 0.65); s.scale.y = 1.25; scene.add(s); procShrubs.push(s); }

      // ================= أوراق تتطاير بالرياح =================
      const leafGeo = track(new THREE.PlaneGeometry(0.09, 0.07));
      const leafMat = track(new THREE.MeshBasicMaterial({ color: 0x7aa84f, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
      const LEAVES = 22;
      const leaves = new THREE.InstancedMesh(leafGeo, leafMat, LEAVES);
      const leafState = [];
      for (let i = 0; i < LEAVES; i++) {
        leafState.push({
          x: (Math.random() - 0.5) * 30, y: Math.random() * 1.6 + 0.2, z: WALL_Z - 2 - Math.random() * 8,
          vx: 0.5 + Math.random() * 0.8, ph: Math.random() * 6.28, spin: Math.random() * 3,
        });
      }
      scene.add(leaves);

      // ================= أعمدة الكهرباء والأسلاك (مثل الفيديو) =================
      const poleM = M({ color: 0x4d4237, roughness: 0.9 });
      const polesX = [-22, -10, 18];
      const poleZ = WALL_Z - SIDEWALK - ROAD_W - 1.0;
      const wireM = M({ color: 0x1a1d20, roughness: 0.6 });
      polesX.forEach((px) => {
        const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.11, 7.2, 10)), poleM);
        pole.position.set(px, 3.6, poleZ); pole.castShadow = true; scene.add(pole);
        const arm = new THREE.Mesh(B(1.6, 0.09, 0.09), poleM); arm.position.set(px, 6.6, poleZ); scene.add(arm);
      });
      const mkCatenary = (x1, x2, y, z, sag) => {
        const pts = [];
        for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push(new THREE.Vector3(x1 + (x2 - x1) * u, y - Math.sin(u * Math.PI) * sag, z)); }
        const cur = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.Mesh(track(new THREE.TubeGeometry(cur, 24, 0.015, 6, false)), wireM); scene.add(tube);
      };
      for (let i = 0; i < polesX.length - 1; i++) {
        mkCatenary(polesX[i], polesX[i + 1], 6.62, poleZ - 0.55, 0.35);
        mkCatenary(polesX[i], polesX[i + 1], 6.62, poleZ + 0.55, 0.35);
      }
      // سلك خدمة من العمود للبيت
      {
        const a = new THREE.Vector3(-10, 6.5, poleZ), b2 = new THREE.Vector3(-HW / 2 + 0.5, HH - 0.4, -HD / 2);
        const mid = a.clone().lerp(b2, 0.5); mid.y -= 1.2;
        const cur = new THREE.CatmullRomCurve3([a, mid, b2]);
        const tube = new THREE.Mesh(track(new THREE.TubeGeometry(cur, 24, 0.014, 6, false)), wireM); scene.add(tube);
      }

      // ================= أعمدة إنارة فانوسية =================
      const mkLamp = (x, z) => {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 10)), M({ color: 0x24282c, roughness: 0.5, metalness: 0.6 }));
        pole.position.y = 2.1; pole.castShadow = true; g.add(pole);
        const cap = new THREE.Mesh(track(new THREE.ConeGeometry(0.28, 0.3, 12)), M({ color: 0x24282c, roughness: 0.5 })); cap.position.y = 4.35; g.add(cap);
        const bulbM = M({ color: 0xfff1c8, emissive: 0xffd57a, emissiveIntensity: 0.05, roughness: 0.3 }); lampGlow.push(bulbM);
        const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.17, 14, 14)), bulbM); bulb.position.y = 4.12; g.add(bulb);
        g.position.set(x, 0, z); scene.add(g);
      };
      mkLamp(3.4, WALL_Z - 0.9); mkLamp(-11, WALL_Z - 0.9); mkLamp(16, WALL_Z - 0.9);
      mkLamp(-2, WALL_Z - SIDEWALK - ROAD_W - 1.4);

      // ================= حي سكني كامل — فلل جيران بتفاصيل حقيقية =================
      // لوحة ألوان رملية هادئة (بلا أبيض محروق) + خزان ماي + دش + سبلتات + سياج
      const villaPal = [0xe8dfc9, 0xdcd2ba, 0xd9cfc0, 0xcfc6b2, 0xe2d5c0];
      const tankBlackM = M({ color: 0x23292f, roughness: 0.65 });
      const tankBlueM = M({ color: 0x2d5f8a, roughness: 0.6 });
      const dishM = M({ color: 0xe8eaec, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide });
      const condNM = M({ color: 0xd9dcdf, roughness: 0.5 });
      const doorNM = M({ color: 0x3a2c1e, roughness: 0.6 });
      const garageNM = M({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.3 });
      const mkVilla = (x, z, w, h, d, ti, ry = 0, opts = {}) => {
        const g = new THREE.Group();
        const tone = villaPal[ti % villaPal.length];
        const bodyM = M({ color: tone, roughness: 0.92 });
        const bd = new THREE.Mesh(B(w, h, d), bodyM); bd.position.y = h / 2; bd.castShadow = true; bd.receiveShadow = true; g.add(bd);
        // دروة سطح
        const par = new THREE.Mesh(B(w + 0.12, 0.45, d + 0.12), M({ color: 0xbfb5a0, roughness: 0.9 }));
        par.position.y = h + 0.12; g.add(par);
        const parIn = new THREE.Mesh(B(w - 0.35, 0.5, d - 0.35), bodyM); parIn.position.y = h + 0.1; g.add(parIn);
        // شريط معماري: رمادي غامق أو خشبي (تنويع)
        const accM = opts.wood ? woodSlat : charcoalDark;
        const acc = new THREE.Mesh(B(w * 0.24, h + 0.4, 0.18), accM);
        acc.position.set(-w * 0.28, (h + 0.4) / 2, d / 2 + 0.06); g.add(acc);
        // شبابيك بإطارات غامقة غاطسة
        const wg = B(1.15, 1.05, 0.06);
        const floors = Math.max(1, Math.floor(h / 3));
        for (let r = 0; r < floors; r++) for (let c = 0; c < 2; c++) {
          const wx = w * 0.1 + c * 1.75;
          const fr = new THREE.Mesh(B(1.32, 1.22, 0.06), frameMat); fr.position.set(wx, 1.65 + r * 3, d / 2 + 0.02); g.add(fr);
          const wm = glassMat.clone(); track(wm); windowsGlow.push(wm);
          const win = new THREE.Mesh(wg, wm); win.position.set(wx, 1.65 + r * 3, d / 2 + 0.04); g.add(win);
          const sill = new THREE.Mesh(B(1.45, 0.07, 0.14), M({ color: 0xb8b2a6, roughness: 0.8 })); sill.position.set(wx, 1.02 + r * 3, d / 2 + 0.06); g.add(sill);
        }
        // باب + كراج (للبيوت الأمامية)
        const dr = new THREE.Mesh(B(1.0, 2.1, 0.07), doorNM); dr.position.set(-w * 0.06, 1.05, d / 2 + 0.02); g.add(dr);
        if (opts.garage) { const ga = new THREE.Mesh(B(2.4, 2.0, 0.07), garageNM); ga.position.set(w * 0.32 - 0.4, 1.0, d / 2 + 0.02); g.add(ga); }
        // خزان ماي (أسود أو أزرق) + صحن دش على السطح
        const tk = new THREE.Mesh(track(new THREE.CylinderGeometry(0.42, 0.42, 0.8, 14)), ti % 2 ? tankBlueM : tankBlackM);
        tk.position.set(-w * 0.3, h + 0.55, -d * 0.25); tk.castShadow = true; g.add(tk);
        const dishPole = new THREE.Mesh(B(0.05, 0.9, 0.05), metalGray); dishPole.position.set(w * 0.32, h + 0.55, -d * 0.3); g.add(dishPole);
        const dish = new THREE.Mesh(track(new THREE.CircleGeometry(0.42, 18)), dishM);
        dish.position.set(w * 0.32, h + 0.85, -d * 0.3 + 0.1); dish.rotation.x = -0.7; g.add(dish);
        // كومبرسرات سبلت على الجدار الجانبي
        for (let k = 0; k < 2; k++) { const cd = new THREE.Mesh(B(0.8, 0.55, 0.3), condNM); cd.position.set(w / 2 + 0.18, 1.1 + k * 1.1, -d * 0.1); cd.rotation.y = Math.PI / 2; g.add(cd); }
        // سياج أمامي قصير أبيض
        const fw = new THREE.Mesh(B(w + 1.6, 1.3, 0.18), whiteWall); fw.position.set(0, 0.65, d / 2 + 2.6); fw.castShadow = true; g.add(fw);
        const fcap = new THREE.Mesh(B(w + 1.7, 0.07, 0.26), M({ color: 0xb8b2a6, roughness: 0.8 })); fcap.position.set(0, 1.33, d / 2 + 2.6); g.add(fcap);
        g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
      };
      // صفّنا (نفس الجهة) — واجهاتها للشارع مثلنا
      mkVilla(-17.5, -HD / 2 + 2.2, 9, 6.4, 11, 0, 0, { garage: true });
      mkVilla(17.5, -HD / 2 + 2.2, 9, 6.2, 11, 1, 0, { wood: true });
      mkVilla(-31, -HD / 2 + 2.2, 8.5, 6.2, 10.5, 2, 0);
      mkVilla(31, -HD / 2 + 2.2, 8.5, 6.6, 10.5, 3, 0, { garage: true });
      // كَبال الشارع — واجهاتها إلنا (السياج بينها وبين الرصيف المقابل)
      const ACROSS_Z = WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 8.6;
      mkVilla(-22, ACROSS_Z, 9, 6.0, 10, 2, Math.PI, { garage: true });
      mkVilla(-8, ACROSS_Z, 8, 5.8, 10, 3, Math.PI, { wood: true });
      mkVilla(6, ACROSS_Z, 8.5, 6.4, 10, 4, Math.PI);
      mkVilla(20, ACROSS_Z, 9, 6.2, 10, 0, Math.PI, { garage: true });
      // صف خلفي بعيد — كتل صامتة للعمق البصري
      const farM = M({ color: 0xc9bfa9, roughness: 0.95 });
      [[-16, 7.4], [1, 6.6], [17, 7.8]].forEach(([fx, fh]) => {
        const fb = new THREE.Mesh(B(11, fh, 10), farM); fb.position.set(fx, fh / 2, ACROSS_Z - 16); fb.castShadow = true; scene.add(fb);
        const fpar = new THREE.Mesh(B(11.15, 0.4, 10.15), M({ color: 0xb5ab95, roughness: 0.95 })); fpar.position.set(fx, fh + 0.1, ACROSS_Z - 16); scene.add(fpar);
      });

      // ================= سيارات (3 ألوان) =================
      const glassM2 = M({ color: 0x18242e, roughness: 0.12, metalness: 0.5 });
      const wheelG = track(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18)); const wheelM = M({ color: 0x121212, roughness: 0.7 });
      const mkCar = (hex, x, z, ry = 0) => {
        const car = new THREE.Group();
        const paint = M({ color: hex, roughness: 0.4, metalness: 0.55, envMapIntensity: 0.8 });
        const cb1 = new THREE.Mesh(B(1.75, 0.5, 4.0), paint); cb1.position.y = 0.55; cb1.castShadow = true; car.add(cb1);
        const cb2 = new THREE.Mesh(B(1.6, 0.48, 2.2), paint); cb2.position.set(0, 1.0, -0.2); cb2.castShadow = true; car.add(cb2);
        const cw1 = new THREE.Mesh(B(1.5, 0.36, 0.06), glassM2); cw1.position.set(0, 1.0, 0.95); car.add(cw1);
        const cw2 = new THREE.Mesh(B(1.5, 0.34, 0.06), glassM2); cw2.position.set(0, 1.0, -1.28); car.add(cw2);
        [[0.82, 1.35], [-0.82, 1.35], [0.82, -1.35], [-0.82, -1.35]].forEach(([wx, wz]) => { const w2 = new THREE.Mesh(wheelG, wheelM); w2.rotation.z = Math.PI / 2; w2.position.set(wx, 0.34, wz); car.add(w2); });
        car.position.set(x, 0, z); car.rotation.y = ry; scene.add(car);
      };
      mkCar(0x8e9aa5, gateX, -HD / 2 - 2.6);                                     // فضية على الدرايف
      mkCar(0xe8e6e0, -7, WALL_Z - SIDEWALK - 1.6, Math.PI / 2);                 // بيضاء واقفة على الرصيف
      mkCar(0x1f3a5c, 12.5, WALL_Z - SIDEWALK - ROAD_W + 1.4, Math.PI / 2);      // كحلية بالجهة الثانية

      // ================= نخلات عراقية 🌴 =================
      const palmTrunkM = M({ color: 0x8a6a45, roughness: 0.95 });
      const palmLeafM = M({ color: 0x3e7d35, roughness: 0.9 });
      const palmLeafM2 = M({ color: 0x4f9440, roughness: 0.9 });
      const dateM = M({ color: 0x9c5a22, roughness: 0.8 });
      const mkPalm = (x, z, hgt = 4.2, sc = 1) => {
        const pg = new THREE.Group();
        const tr = new THREE.Mesh(track(new THREE.CylinderGeometry(0.13, 0.22, hgt, 8, 3)), palmTrunkM);
        tr.position.y = hgt / 2; tr.castShadow = true; pg.add(tr);
        // حلقات الجذع
        for (let r = 0.5; r < hgt - 0.4; r += 0.55) {
          const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.16 + 0.05 * (1 - r / hgt), 0.03, 6, 10)), palmTrunkM);
          ring.position.y = r; ring.rotation.x = Math.PI / 2; pg.add(ring);
        }
        // سعفات متدلية بتاجين لونين
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2;
          const leaf = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.5, 1)), i % 2 ? palmLeafM : palmLeafM2);
          leaf.scale.set(0.16, 0.055, 1.25);
          leaf.position.set(Math.cos(ang) * 0.75, hgt + 0.18 - 0.16 * Math.abs(Math.sin(ang * 2)), Math.sin(ang) * 0.75);
          leaf.rotation.y = -ang; leaf.rotation.x = -0.55 - Math.random() * 0.25;
          leaf.castShadow = true; pg.add(leaf);
        }
        // عذوق تمر
        for (let i = 0; i < 3; i++) { const dt = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.12, 0)), dateM); dt.position.set(Math.cos(i * 2.1) * 0.3, hgt - 0.15, Math.sin(i * 2.1) * 0.3); pg.add(dt); }
        pg.position.set(x, 0, z); pg.scale.setScalar(sc); scene.add(pg);
      };
      mkPalm(-14, WALL_Z - 1.1, 4.4);
      mkPalm(-5, WALL_Z - 1.1, 3.9, 0.92);
      mkPalm(10.5, WALL_Z - 1.1, 4.6);
      mkPalm(-19, WALL_Z - SIDEWALK - ROAD_W - 1.2, 4.2, 0.95);
      mkPalm(12, WALL_Z - SIDEWALK - ROAD_W - 1.2, 4.8);
      mkPalm(26, WALL_Z - SIDEWALK - ROAD_W - 1.2, 4.0, 0.9);
      mkPalm(-HW / 2 + 1.2, -HD / 2 - 1.4, 3.6, 0.85); // نخلة بحديقتنا

      // ================= ممر مشاة (زيبرا) + شارع متقاطع + تفاصيل =================
      const zebraM = M({ color: 0xe6e6de, roughness: 0.85 });
      for (let i = 0; i < 6; i++) {
        const zb = new THREE.Mesh(B(0.55, 0.014, ROAD_W - 1), zebraM);
        zb.position.set(gateX - 1.4 + i * 0.95, 0.014, WALL_Z - SIDEWALK - ROAD_W / 2 - 0.1);
        scene.add(zb);
      }
      // شارع متقاطع يسار يكسر الرتابة
      const crossRoad = new THREE.Mesh(track(new THREE.PlaneGeometry(ROAD_W - 1, 40)), road.material);
      crossRoad.rotation.x = -Math.PI / 2; crossRoad.position.set(-27.5, 0.003, WALL_Z - SIDEWALK - ROAD_W - 18);
      crossRoad.receiveShadow = true; scene.add(crossRoad);
      // حاوية نفايات خضراء يمّ البوابة + مصطبة
      const bin = new THREE.Mesh(B(0.7, 0.85, 0.55), M({ color: 0x2e6b34, roughness: 0.7 }));
      bin.position.set(gateX + 2.4, 0.45, WALL_Z - 0.8); bin.castShadow = true; scene.add(bin);
      const bench = new THREE.Mesh(B(1.6, 0.1, 0.45), M({ color: 0x8a6a45, roughness: 0.8 }));
      bench.position.set(-9.5, 0.45, WALL_Z - 0.9); scene.add(bench);
      [[-10.1, 0.2], [-8.9, 0.2]].forEach(([bx, bh2]) => { const bl2 = new THREE.Mesh(B(0.12, 0.42, 0.4), metalGray); bl2.position.set(bx, bh2, WALL_Z - 0.9); scene.add(bl2); });

      // ================= سطحنا: خزان ماي + دش =================
      const ourTank = new THREE.Mesh(track(new THREE.CylinderGeometry(0.45, 0.45, 0.85, 14)), tankBlackM);
      ourTank.position.set(HW / 2 - 1.2, HH + 0.65, HD / 2 - 1.2); ourTank.castShadow = true; scene.add(ourTank);
      const ourDishPole = new THREE.Mesh(B(0.05, 1.0, 0.05), metalGray); ourDishPole.position.set(-HW / 2 + 0.6, towerH + 0.5, -HD / 2 + 0.6); scene.add(ourDishPole);
      const ourDish = new THREE.Mesh(track(new THREE.CircleGeometry(0.45, 18)), dishM);
      ourDish.position.set(-HW / 2 + 0.6, towerH + 0.85, -HD / 2 + 0.72); ourDish.rotation.x = -0.7; scene.add(ourDish);

      // ================= أسلاك الطاقة والنبضات =================
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

      // ================= رندر + كاميرا + Bloom =================
      const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 600);
      camera.position.set(3.5, 6, WALL_Z - SIDEWALK - ROAD_W - 4.5);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(W(), H());
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.75;
      mount.appendChild(renderer.domElement);
      // بيئة انعكاسات PBR (للزجاج والمعادن — المواصفة: envMap انعكاس سماء يكفي)
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.5;
      disp.push({ dispose: () => { envRT.dispose(); pmrem.dispose(); } });

      // سلسلة المعالجة (القسم 9): ACES ← Bloom بعتبة عالية ← تشبع +6% ← Vignette
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.15, 0.55, 0.92);
      composer.addPass(bloom);
      const gradePass = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, uSat: { value: 1.06 }, uVig: { value: 0.18 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          uniform sampler2D tDiffuse; uniform float uSat; uniform float uVig; varying vec2 vUv;
          void main(){
            vec4 c = texture2D(tDiffuse, vUv);
            float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
            c.rgb = mix(vec3(l), c.rgb, uSat);                       // تشبع +5-8%
            float d = distance(vUv, vec2(0.5));
            c.rgb *= 1.0 - uVig * smoothstep(0.42, 0.85, d);          // Vignette خفيف
            gl_FragColor = c;
          }`,
      });
      composer.addPass(gradePass);
      disp.push(gradePass);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.dampingFactor = 0.08;
      controls.autoRotate = true; controls.autoRotateSpeed = 0.4;
      controls.minDistance = 2.5; controls.maxDistance = 70;
      controls.minPolarAngle = 0.15; controls.maxPolarAngle = Math.PI / 2 - 0.02;
      controls.target.set(0, 3.4, -1);
      controls.addEventListener('start', () => { controls.autoRotate = false; });
      controls.update();

      // ================= أصول واقعية (PBR + GLB) — تحميل كسول بتقدم =================
      // السماء صارت قبة المواصفة (بلا HDRI) — نحمّل الخامات والموديلات فقط.
      // تُخزَّن بجهاز المستخدم دائمياً (CacheFirst بالـService Worker) — تنزل مرة وحدة فقط.
      (async () => {
        try {
          const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
          const baseURL = new URL('showcase/', document.baseURI).href;
          const manager = new THREE.LoadingManager();
          manager.onProgress = (u, l, tot) => { if (!disposed) setLoadPct(Math.min(99, Math.round((l / Math.max(1, tot)) * 100))); };
          const texL = new THREE.TextureLoader(manager);
          const glbL = new GLTFLoader(manager);
          const loadTex = (f, srgb) => new Promise((res, rej) => texL.load(baseURL + 'tex/' + f, (t2) => {
            t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.anisotropy = 8;
            if (srgb) t2.colorSpace = THREE.SRGBColorSpace;
            res(track(t2));
          }, undefined, rej));
          const loadGlb = (p) => new Promise((res, rej) => glbL.load(baseURL + 'glb/' + p, res, undefined, rej));

          // خامات PBR حقيقية (diff+normal+arm) — الـarm: R=AO/G=خشونة/B=معدنية
          const applyPBR = async (mats, name, rx, ry2, extra = {}) => {
            const [d2, n2, a2] = await Promise.all([
              loadTex(name + '_diff.jpg', true), loadTex(name + '_nor.jpg'), loadTex(name + '_arm.jpg').catch(() => null),
            ]);
            (Array.isArray(mats) ? mats : [mats]).forEach((mm) => {
              const c = (t3) => { const cl = t3.clone(); track(cl); cl.repeat.set(rx, ry2); cl.needsUpdate = true; return cl; };
              mm.map = c(d2); mm.normalMap = c(n2);
              if (a2) { mm.roughnessMap = c(a2); mm.metalnessMap = mm.roughnessMap; mm.roughness = 1; mm.metalness = 1; }
              mm.color = new THREE.Color(0xffffff);
              Object.assign(mm, extra); mm.needsUpdate = true;
            });
          };
          await Promise.all([
            applyPBR(whiteWall, 'wall', 4, 2),
            applyPBR(rWall, 'wall', 2, 1),
            applyPBR(road.material, 'asphalt', 12, 2),
            applyPBR(drive.material, 'asphalt', 1.2, 2, { color: new THREE.Color(0xbbbbbb) }),
            applyPBR(walk.material, 'pavers', 18, 1),
            applyPBR(lot.material, 'pavers', 6, 7),
            applyPBR(slabMat, 'concrete', 4, 4),
            applyPBR(woodSlat, 'wood', 1, 2),
            applyPBR(poleM, 'wood', 1, 3),
          ]);

          // 3) نباتات حقيقية: خصلات عشب + شجيرات + شجرة فوتوغرامترية
          const [gGrass, gShrub1, gShrub2, gTree] = await Promise.all([
            loadGlb('grass_medium_01/grass_medium_01_1k.gltf'),
            loadGlb('shrub_02/shrub_02_2k.gltf'),
            loadGlb('shrub_04/shrub_04_2k.gltf'),
            loadGlb('island_tree_02/island_tree_02_1k.gltf'),
          ]);
          if (disposed) return;
          // عشب: InstancedMesh لكل ميش من الموديل على مواقع الحديقة
          const spots = grassSpots;
          gGrass.scene.updateMatrixWorld(true);
          gGrass.scene.traverse((o) => {
            if (!o.isMesh) return;
            const im = new THREE.InstancedMesh(o.geometry, o.material, spots.length);
            const d3 = new THREE.Object3D();
            spots.forEach(([gx, gz], i) => {
              d3.position.set(gx, 0, gz); d3.rotation.y = Math.random() * Math.PI * 2;
              const sc = 0.5 + Math.random() * 0.22; d3.scale.setScalar(sc); // خصلات صغيرة مشذبة
              d3.updateMatrix(); im.setMatrixAt(i, d3.matrix);
            });
            im.instanceMatrix.needsUpdate = true; im.receiveShadow = true;
            scene.add(im); disp.push({ dispose: () => { im.geometry.dispose?.(); } });
          });
          grass.visible = false;
          // شجيرات على السياج والحديقة
          const placeClone = (src, x, z, sc, ry = Math.random() * Math.PI * 2) => {
            const cl = src.scene.clone(true);
            cl.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
            cl.position.set(x, 0, z); cl.rotation.y = ry; cl.scale.setScalar(sc); scene.add(cl); return cl;
          };
          // صف شجيرات منتظم صغير على السياج من الداخل
          for (let i = 0; i < 6; i++) placeClone(i % 2 ? gShrub1 : gShrub2, -HW / 2 + 1.2 + i * 1.35, WALL_Z + 0.75, 1.0 + (i % 3) * 0.08);
          placeClone(gShrub1, HW / 2 + 1.6, -HD / 2 - 1.2, 1.2);
          procShrubs.forEach((s2) => { s2.visible = false; });
          // الشجرة الحقيقية: بالحديقة + كَبال الشارع
          gTree.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          placeClone(gTree, -HW / 2 - 2.6, -HD / 2 - 2.2, 0.85, 0.4);
          placeClone(gTree, 14, WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 3, 1.0, 2.1);
          procTrees.forEach((t3) => { t3.visible = false; });
        } catch {
          /* أوفلاين أو فشل تحميل — يبقى المظهر الإجرائي الحالي شغالاً */
        } finally {
          if (!disposed) { setLoadPct(100); setLoadingAssets(false); }
        }
      })();

      // ================= دورة اليوم (لوحات المواصفة الخمس) =================
      const R = 60, Rh = 46;
      const clock = new THREE.Clock();
      const sunDir = new THREE.Vector3();
      const smoothTime = { v: 15.5 }; // انتقال ناعم بين الأوقات خلال ~ثانية-ثانيتين
      const animate = () => {
        if (disposed) return;
        rafRef.current = requestAnimationFrame(animate);
        const dt = Math.min(0.25, clock.getDelta());
        const et = clock.getElapsedTime();
        windU.value = et;
        // الوقت المعروض يلاحق السلايدر بنعومة خلال ~ثانية-ثانيتين (مستقل عن معدل الفريمات)
        let target = timeRef.current;
        if (Math.abs(target - smoothTime.v) > 12) smoothTime.v = target;
        else smoothTime.v += (target - smoothTime.v) * Math.min(1, dt * 3.2);
        const t = ((smoothTime.v % 24) + 24) % 24;
        const dayAngle = ((t - 6) / 12) * Math.PI;
        const sinE = Math.sin(dayAngle);
        const isDay = sinE > 0.015; const inten = Math.max(0, sinE);

        // لوحة الوقت الحالية (سماء + شمس + ضباب + تعريض) من جدول المواصفة
        const P = skyAt(t);
        if (Math.abs(t - lastSkyDraw) > 0.02) { drawSkyGrad(P.top, P.mid, P.bot); lastSkyDraw = t; }
        scene.fog.color.copy(P.fogC);
        renderer.toneMappingExposure = P.expo;
        hemi.intensity = P.hemiI;
        amb.intensity = P.hemiI * 0.3;
        fillL.intensity = isDay ? 0.25 : 0.06;

        // الشمس: اتجاهها من قوس الوقت، لونها وشدتها من اللوحة
        sunDir.set(Math.cos(dayAngle), Math.max(sinE, -0.18), -0.55).normalize();
        sunBall.position.set(sunDir.x * R, Math.max(sunDir.y, -0.05) * Rh, sunDir.z * R);
        sunHalo.position.copy(sunBall.position);
        sunLight.position.copy(sunBall.position);
        sunLight.color.copy(P.sunC);
        sunLight.intensity = P.sunI;
        // قرص الشمس بالزوايا الجمالية الواطية فقط (صبح/مغرب)
        const lowSun = isDay && sinE < 0.42;
        sunBall.visible = lowSun; sunHalo.visible = lowSun;
        moonBall.position.set(-Math.cos(dayAngle) * R * 0.9, Math.max(0.25, -sinE) * Rh * 0.85, -HD / 2 - 26);
        moonBall.visible = !isDay;
        moonLight.position.copy(moonBall.position); moonLight.intensity = isDay ? 0 : 0.25;
        starMat.opacity = isDay ? 0 : Math.min(0.85, 0.3 + Math.max(0, -sinE) * 1.1);

        // الغيوم: دوران بطيء جداً (دورة/20 دقيقة) وخفوت ليلي
        cloudGroup.rotation.y = et * CLOUD_ROT;
        const cloudOp = isDay ? 1 : 0.14;
        cumulusMats.forEach((m, i) => { m.opacity = (i >= 11 ? 0.32 : 0.9) * cloudOp; });

        const winI = isDay ? 0.04 : 1.15;
        windowsGlow.forEach((m) => { m.emissiveIntensity = winI; });
        ceilGlow.forEach((m) => { m.emissiveIntensity = isDay ? 0.02 : 1.0; });
        lampGlow.forEach((m) => { m.emissiveIntensity = isDay ? 0.05 : 2.2; });
        acLeds.forEach((m) => { m.emissiveIntensity = isDay ? 0.35 : 0.9; });
        const pGlow = isDay ? 0.02 + inten * 0.07 : 0;
        panelSurfaces.forEach((m) => { m.emissiveIntensity = pGlow; });

        // (شفافية الجدران ملغاة — الغلاف الخارجي فقط)

        // أوراق تتطاير
        for (let i = 0; i < LEAVES; i++) {
          const L = leafState[i];
          L.x += L.vx * 0.016 * (1 + Math.sin(et + L.ph) * 0.4);
          const y = L.y + Math.sin(et * 2 + L.ph) * 0.4;
          const z = L.z + Math.sin(et * 0.7 + L.ph) * 0.5;
          if (L.x > 26) L.x = -26;
          dum.position.set(L.x, Math.max(0.1, y), z);
          dum.rotation.set(et * L.spin + L.ph, et * L.spin * 0.7, L.ph);
          dum.updateMatrix(); leaves.setMatrixAt(i, dum.matrix);
        }
        leaves.instanceMatrix.needsUpdate = true;

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
        let soc; if (isDay) soc = 0.35 + 0.6 * ((t - 6) / 12); else { const nf = t < 6 ? (t + 6) / 12 : (t - 18) / 12; soc = 0.92 - 0.5 * Math.min(1, nf); }
        soc = Math.max(0.1, Math.min(1, soc));
        chargeBars.forEach((bar, i) => {
          const v = Math.max(0.06, Math.min(1, soc + ((i % 3) - 1) * 0.04));
          bar.scale.y = v; bar.position.y = bar.userData.bottom + (bar.userData.fullH * v) / 2;
          bar.material.color.setHex(isDay ? 0x2fe06a : 0xffb14a);
          bar.material.emissive.setHex(isDay ? 0x2fe06a : 0xffb14a);
        });
        invLed.forEach((m2) => { m2.color.setHex(isDay ? 0x36e07a : 0xffb14a); });

        // Bloom بعتبة عالية (القسم 9): نهاراً شبه معدوم، ليلاً على الأضوية فقط
        bloom.strength = isDay ? 0.08 : 0.4;
        bloom.threshold = isDay ? 1.15 : 0.88;
        controls.update();
        composer.render();
      };
      animate();
      ro = new ResizeObserver(() => {
        if (!renderer) return;
        renderer.setSize(W(), H()); composer.setSize(W(), H());
        camera.aspect = W() / H(); camera.updateProjectionMatrix();
      });
      ro.observe(mount);
    })();

    return () => {
      disposed = true; cancelAnimationFrame(rafRef.current);
      try { ro && ro.disconnect(); } catch { /* noop */ }
      try { controls && controls.dispose(); } catch { /* noop */ }
      try { composer && composer.dispose && composer.dispose(); } catch { /* noop */ }
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
      {loadingAssets && (
        <div className="showcase-loading">
          <div className="ld-box">
            <div className="ld-spin" />
            <b>جارٍ تجهيز المشهد الواقعي…</b>
            <span className="ld-pct">{loadPct}%</span>
            <small>ينزل مرة وحدة فقط ويُخزَّن بجهازك — الفتحات الجاية فورية</small>
          </div>
        </div>
      )}
      <div className="showcase-hud">
        {chips.map((c, i) => (<div className="showcase-chip" key={i}><span className="ic">{c[0]}</span><span className="lb">{c[1]}</span><b className="vl">{c[2]}</b></div>))}
      </div>
      <div className="showcase-timebar">
        <span className="tclock">🕐 {timeLabel}</span>
        <span className="tend">🌅</span>
        <input type="range" min={6} max={30} step={0.25} defaultValue={15.5} onInput={onTime} onChange={onTime} />
        <span className="tend">🌙</span>
      </div>
      <div className="showcase-hint">🖱️ اسحب للتدوير • عجلة الماوس للتقريب • حرّك الشريط لوقت اليوم</div>
    </div>
  );
}
