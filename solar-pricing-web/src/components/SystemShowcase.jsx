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
  // تحميل الأصول الواقعية (خامات/موديلات) — تقدم بالنسبة المئوية
  const [loadPct, setLoadPct] = useState(0);
  const [loadingAssets, setLoadingAssets] = useState(true);
  // رحلة السكرول (القسم 17): refs مباشرة حتى ما نعيد الرسم كل فريم
  const clockRef = useRef(null);
  const sliderRef = useRef(null);
  const jBoxRef = useRef(null);
  const jTitleRef = useRef(null);
  const jSubRef = useRef(null);
  const replayRef = useRef(null);
  const skipRef = useRef(null);
  const journeyRef = useRef({ t: 0, target: 0 });

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
      const { RoundedBoxGeometry } = await import('three/examples/jsm/geometries/RoundedBoxGeometry.js');
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

      // موبايل/جهاز خفيف: ظلال أوطى + عشب أقل + دقة رسم أقل (قسم 11)
      const lowPerf = Math.min(window.innerWidth, window.innerHeight) < 640 || (navigator.hardwareConcurrency || 8) <= 4;
      // وضع العرض الهندسي (قرار المستخدم): بيت البطل ومنظومته فقط — المدينة كلها تنحجب
      // حتى تتركز ميزانية الجودة على البيت. رجّع false إذا رجعت فكرة المدينة.
      const ENG_MODE = true;
      const scene = new THREE.Scene();
      // ضباب جوي (القسم 9): بلون الأفق، يبدأ 80م ويكتمل 300م — يصنع طبقات العمق
      // ضباب جوي: بالعرض الهندسي يقرب حتى الأرض تذوب بالسماء قبل ما «تخلص» — بلا حافة أفق
      scene.fog = ENG_MODE ? new THREE.Fog(0xd4ccba, 55, 210) : new THREE.Fog(0xc8d4dc, 60, 220);

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
      // زجاج يعكس سماء الـHDRI فعلياً — هذا اللي يحوّل الشباك من «حفرة سودة» لزجاج حي
      // زجاج فاتح: معدنية جزئية = انعكاس سماء + قاعدة لونية فاتحة تمنع «الحفرة السودة»
      // (معدنية واطية عمداً: الانعكاس للأسفل يصطاد منطقة ما تحت أفق الـHDRI السودة —
      //  فنخلي القاعدة الفاتحة تهيمن ويظل لمعان سماء خفيف)
      const glassMat = M({ color: 0xaec3d2, roughness: 0.12, metalness: 0.45, emissive: 0xffc97a, emissiveIntensity: 0.04, envMapIntensity: 1.6 });
      const frameMat = M({ color: 0x1f2327, roughness: 0.45, metalness: 0.5 });
      const woodSlat = M({ map: rep(woodT, 1, 2), roughness: 0.7 });
      const floorWood = M({ color: 0xc9a876, roughness: 0.8 });
      const floorTile = M({ color: 0xe3ded4, roughness: 0.85 });
      const metalGray = M({ color: 0x8a929c, roughness: 0.45, metalness: 0.75 });
      const concrete = M({ color: 0xdfe2e6, roughness: 0.9 });
      const windowsGlow = [], ceilGlow = [], acLeds = [], lampGlow = [];

      // ================= سماء HDRI حقيقية (Poly Haven CC0) — سماء مصوَّرة مو مرسومة =================
      // خمسة أوقات، كل وقت HDRI: 4K خلفية + 1K إضاءة/انعكاسات PMREM. كروس-فيد بين
      // كرتي سماء، محاذاة تلقائية لاتجاه الشمس (نكشف أسطع بكسل بالصورة فيتطابق الظل
      // ويا شمس السماء)، ولون الضباب يُستخرج من أفق الـHDRI نفسه — بلا خط فاصل.
      // قرار المستخدم: سماء واحدة ثابتة (نهار غائم جزئياً) — صورة السماء ما تتغير أبداً.
      // السلايدر يحرك الشمس (اتجاه/دفء/طول الظل) من الصبح للعصر فقط، بلا ليل ولا مغرب.
      const SKY_SLOTS = [
        { id: 'asr', file: 'day', from: 0, to: 30.1, expo: 1.0, elevFallback: 40 }, // kloofendal_48d_partly_cloudy_puresky
      ];
      const slotAt = () => SKY_SLOTS[0];
      const SUN_MIN = 7.0, SUN_MAX = 16.5; // مدى سلايدر الشمس
      const skyGeoBig = track(new THREE.SphereGeometry(380, 40, 24));
      const mkSkySphere = () => {
        // toneMapped:false — خلفية الـJPG معالجة مسبقاً، ما تمر بـACES مرة ثانية
        const m2 = track(new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
        const mesh2 = new THREE.Mesh(skyGeoBig, m2); mesh2.renderOrder = -10; scene.add(mesh2); return mesh2;
      };
      const skyA = mkSkySphere(), skyB = mkSkySphere();
      const hdriSky = { ready: false, cur: null, fade: null, slots: {} };
      // ===== جدول الإضاءة لأوقات اليوم (لون/شدة الشمس، ضوء السماء، تعريض احتياطي) =====
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
      // نسيج غيوم كانفاس — يُستخدم فقط لدخان المولدة (الغيوم صارت من الـHDRI المصوَّر)
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

      // شمس المواصفة: #FFE8C4 عصراً، ظلال PCF ناعمة 2048 مركزة على بيت البطل ومحيطه
      const sunLight = new THREE.DirectionalLight(0xffe8c4, 1.8);
      // وضع الحاسوب الأقصى: ظلال 4096 (الموبايل يبقى 1024)
      sunLight.castShadow = true; sunLight.shadow.mapSize.set(lowPerf ? 1024 : 4096, lowPerf ? 1024 : 4096); sunLight.shadow.bias = -0.0004;
      sunLight.shadow.radius = 4; // نعومة حواف الظل
      Object.assign(sunLight.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 0.5, far: 160 });
      scene.add(sunLight);
      // ضوء سماء: علوي #B8D4E8 / سفلي #D8C8A8 (ارتداد أرض) — الظلال ملونة مو سوداء
      const hemi = track(new THREE.HemisphereLight(0xb8d4e8, 0xd8c8a8, 0.6)); scene.add(hemi);
      const amb = track(new THREE.AmbientLight(0xd8c8a8, 0.15)); scene.add(amb);
      const fillL = track(new THREE.DirectionalLight(0xb8d4e8, 0.25)); fillL.position.set(8, 6, -10); scene.add(fillL);
      // القمر ضوء فقط — سماء الليل HDRI (moonless_golf) بلا قرص قمر
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
      // الأرضية 560م: توصل ورة اكتمال الضباب — ماكو نقطة تشوف بيها «نهاية الأرض»
      const groundAll = new THREE.Mesh(track(new THREE.PlaneGeometry(560, 560)), M({ map: rep(dirtT, 112, 112), roughness: 1, envMapIntensity: 0.05 }));
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
      const dashGeo = B(1.4, 0.012, 0.16); const dashMat = M({ color: 0xc4bfb2, roughness: 0.9 }); // أبيض متآكل ~70%
      for (let x = -32; x <= 32; x += 3.4) { const d = new THREE.Mesh(dashGeo, dashMat); d.position.set(x, 0.012, WALL_Z - SIDEWALK - ROAD_W / 2 - 0.1); scene.add(d); }
      const walk2 = walk.clone(); walk2.position.z = WALL_Z - SIDEWALK - ROAD_W - SIDEWALK / 2 - 0.1; scene.add(walk2);
      const curb2 = curb.clone(); curb2.position.z = WALL_Z - SIDEWALK - ROAD_W - 0.15; scene.add(curb2);

      // ---- ظل تلامس (AO مزيف رخيص): بقعة مظللة ناعمة تحت كل جسم — يلحم الأجسام بالأرض ----
      const aoTex = (() => {
        const c = mkCanvas(128); const g = c.getContext('2d');
        const gr = g.createRadialGradient(64, 64, 6, 64, 64, 62);
        gr.addColorStop(0, 'rgba(20,16,10,0.55)'); gr.addColorStop(0.65, 'rgba(20,16,10,0.28)'); gr.addColorStop(1, 'rgba(20,16,10,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        const t2 = track(new THREE.CanvasTexture(c)); return t2;
      })();
      const aoGeo = track(new THREE.PlaneGeometry(1, 1));
      const aoM = track(new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false }));
      const mkAO = (x, z, rx, rz, op = 1, ry = 0) => {
        const p = new THREE.Mesh(aoGeo, op === 1 ? aoM : track(new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, opacity: op })));
        p.rotation.x = -Math.PI / 2; p.rotation.z = ry; p.scale.set(rx, rz, 1);
        p.position.set(x, 0.016, z); p.renderOrder = 1; scene.add(p); return p;
      };
      // ---- نسيج سواقي المطر (خطوط اتساخ نازلة) + حزام التراب بقاعدة الجدار ----
      const streakTex = (() => {
        const c = mkCanvas(128); const g = c.getContext('2d');
        for (let i = 0; i < 16; i++) {
          const x = 4 + Math.random() * 118, w2 = 1.5 + Math.random() * 3.5, h2 = 45 + Math.random() * 80;
          const gr = g.createLinearGradient(0, 0, 0, h2);
          gr.addColorStop(0, 'rgba(58,50,38,0.5)'); gr.addColorStop(1, 'rgba(58,50,38,0)');
          g.fillStyle = gr; g.fillRect(x, 0, w2, h2);
        }
        const t2 = track(new THREE.CanvasTexture(c)); t2.colorSpace = THREE.SRGBColorSpace; return t2;
      })();
      const baseDirtTex = (() => {
        const c = mkCanvas(64); const g = c.getContext('2d');
        const gr = g.createLinearGradient(0, 64, 0, 0);
        gr.addColorStop(0, 'rgba(74,64,48,0.45)'); gr.addColorStop(1, 'rgba(74,64,48,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        // بقع رشّ ترابي خفيفة
        for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(70,60,44,0.22)'; g.fillRect(Math.random() * 64, 44 + Math.random() * 18, 2, 2); }
        const t2 = track(new THREE.CanvasTexture(c)); t2.colorSpace = THREE.SRGBColorSpace; return t2;
      })();
      const streakM = track(new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, depthWrite: false }));
      const baseDirtM = track(new THREE.MeshBasicMaterial({ map: baseDirtTex, transparent: true, depthWrite: false }));
      // ---- فروقات الأرض: بقع ناعمة كبيرة بدرجات اللوحة تكسر رتابة الأرضية الموحدة ----
      const patchTex = (() => {
        const c = mkCanvas(128); const g = c.getContext('2d');
        const gr = g.createRadialGradient(64, 64, 10, 64, 64, 62);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        return track(new THREE.CanvasTexture(c));
      })();
      const mkPatch = (x, z, rx, rz, hex, op, ry = 0) => {
        const m2 = track(new THREE.MeshBasicMaterial({ map: patchTex, color: hex, transparent: true, depthWrite: false, opacity: op }));
        const p = new THREE.Mesh(aoGeo, m2);
        p.rotation.x = -Math.PI / 2; p.rotation.z = ry; p.scale.set(rx, rz, 1);
        p.position.set(x, 0.012, z); p.renderOrder = 1; scene.add(p); return p;
      };
      // تراب أفتح وأغمق حول البيت وبالساحات — عشوائية حتمية هادئة
      [[-18, 12, 14, 9, 0xd6c49c, 0.5], [22, 18, 18, 11, 0xcdbb96, 0.45], [0, 30, 22, 13, 0xd9c7a8, 0.4],
       [-32, -2, 12, 8, 0xcabb9c, 0.35], [30, -4, 10, 7, 0xd2c5a6, 0.3], [-10, 22, 9, 6, 0xc6b898, 0.3],
       [14, 9, 8, 5, 0xc9b691, 0.42], [-24, 28, 13, 9, 0xd2c09b, 0.38], [40, 12, 15, 10, 0xc4b28c, 0.4],
       [-42, 16, 14, 9, 0xcfbd98, 0.42]].forEach(([px, pz, rx, rz, hx, op], i) => mkPatch(px, pz, rx, rz, hx, op, i * 0.9));
      // بقع خدمة غامقة بالشارع قرب الحافة + خطوط إطارات باهتة على الدرايف
      mkPatch(-6, WALL_Z - SIDEWALK - 1.6, 3.4, 1.6, 0x2f3336, 0.35, 0.15);
      mkPatch(8, WALL_Z - SIDEWALK - 2.2, 2.6, 1.3, 0x33373a, 0.3, -0.2);

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
      const procGate = []; // تنخفي إذا تحمّلت بوابة الحديد الفوتوريالستك
      for (let i = 0; i < 12; i++) { const bar = new THREE.Mesh(barGeo, metalGray); bar.position.set(gateX - gateW / 2 + 0.2 + i * (gateW - 0.4) / 11, wallH / 2, WALL_Z); scene.add(bar); procGate.push(bar); }
      const gateTop = new THREE.Mesh(B(gateW, 0.07, 0.07), metalGray); gateTop.position.set(gateX, wallH - 0.15, WALL_Z); scene.add(gateTop); procGate.push(gateTop);

      // ================= البيت (واجهة الصورة) =================
      const house = new THREE.Group();
      // الجسم مزحوف 0.32م لورة — وجهه الأمامي يصير «قاع» فتحات الواجهة الغاطسة
      const FT = 0.32; // سماكة جدار الواجهة
      const mainMass = new THREE.Mesh(B(HW, HH, HD - FT), whiteWall);
      mainMass.position.set(0, HH / 2, FT / 2); mainMass.castShadow = true; mainMass.receiveShadow = true; house.add(mainMass);
      // بنّاء واجهة بفتحات حقيقية: يقسم الجدار شرائح أفقية عند حواف الفتحات ويملأ ما بينها
      // — الشباك صار ثقب فعلي بجدار له سماكة، بحوافه اللي تلتقط الظل (روح اللعبة الحديثة)
      const buildFacade = (wallW, wallH, thick, openings, mat) => {
        const fg = new THREE.Group();
        const ys = [...new Set([0, wallH, ...openings.flatMap((o) => [o.y - o.h / 2, o.y + o.h / 2])])].sort((a2, b2) => a2 - b2);
        for (let i = 0; i < ys.length - 1; i++) {
          const y0 = ys[i], y1 = ys[i + 1]; if (y1 - y0 < 0.015) continue;
          const midY = (y0 + y1) / 2;
          const act = openings.filter((o) => midY > o.y - o.h / 2 && midY < o.y + o.h / 2).sort((a2, b2) => a2.x - b2.x);
          let x0 = -wallW / 2;
          const put = (xa, xb) => {
            if (xb - xa < 0.015) return;
            const b2 = new THREE.Mesh(B(xb - xa, y1 - y0, thick), mat);
            b2.position.set((xa + xb) / 2, midY, 0); b2.castShadow = true; b2.receiveShadow = true; fg.add(b2);
          };
          for (const o of act) { put(x0, o.x - o.w / 2); x0 = Math.max(x0, o.x + o.w / 2); }
          put(x0, wallW / 2);
        }
        return fg;
      };
      const balcW = 5.4, balcH = FLOOR, balcX = HW / 2 - balcW / 2 - 0.6;
      const towerW0 = 2.4;
      const heroOpenings = [
        { x: HW / 2 - 2.2, y: 1.55, w: 2.3, h: 1.72 },                        // شباك الصالة
        { x: 0.2, y: 1.55, w: 1.42, h: 1.56 },                                // شباك المطبخ
        { x: -HW / 2 + towerW0 + 0.9, y: 1.16, w: 1.3, h: 2.32 },             // الباب
        { x: balcX, y: FLOOR + balcH / 2, w: balcW - 0.7, h: balcH - 0.4 },   // فتحة البلكونة الغاطسة
        { x: -HW / 2 + towerW0 / 2, y: HH / 2, w: towerW0 + 0.04, h: HH + 0.1 }, // منطقة البرج (يغطيها البرج)
      ];
      const heroFacade = buildFacade(HW, HH, FT, heroOpenings, whiteWall);
      heroFacade.position.z = -HD / 2 + FT / 2; house.add(heroFacade);
      // عتمة داخلية ورة كل الفتحات — من تباوع بالزجاج تشوف غرفة مظلمة مو لون جص
      // (الطابق الأرضي فقط — فتحة البلكونة فوگ لازم تبقى مفتوحة لعمقها الحقيقي)
      const innerDark = new THREE.Mesh(B(HW - 0.2, FLOOR - 0.08, 0.02), M({ color: 0x0e1114, roughness: 1 }));
      innerDark.position.set(0, FLOOR / 2, -HD / 2 + FT - 0.01); house.add(innerDark);
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
      // جدار البلكونة الداخلي فاتح دافئ — الفتحة تقرأ كبلكونة حقيقية مو حفرة سودة
      const balcBack = new THREE.Mesh(B(balcW, balcH, 0.15), M({ color: 0xd9cdb4, roughness: 0.9 }));
      balcBack.position.set(balcX, FLOOR + balcH / 2, -HD / 2 + 1.1); house.add(balcBack);
      const balcCeil = new THREE.Mesh(B(balcW, 0.12, 1.2), M({ color: 0xcfc4ab, roughness: 0.9 }));
      balcCeil.position.set(balcX, HH - 0.06, -HD / 2 + 0.75); house.add(balcCeil);
      const balcFloor = new THREE.Mesh(B(balcW, 0.1, 1.2), M({ color: 0xb8ad94, roughness: 0.85 }));
      balcFloor.position.set(balcX, FLOOR + 0.05, -HD / 2 + 0.75); house.add(balcFloor);
      const balcGlass = new THREE.Mesh(B(balcW - 0.5, balcH - 0.9, 0.05), glassMat.clone());
      track(balcGlass.material); windowsGlow.push(balcGlass.material);
      balcGlass.position.set(balcX, FLOOR + balcH / 2 + 0.2, -HD / 2 + 1.02); house.add(balcGlass);
      const balcRail = new THREE.Mesh(B(balcW - 0.6, 1.0, 0.08), M({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.7 }));
      balcRail.position.set(balcX, FLOOR + 0.55, -HD / 2 + 0.35); house.add(balcRail);
      // (شرائط الواجهة القديمة انحذفت — صارت فتحة البلكونة حقيقية بحوافها)
      const slatGrp = new THREE.Group();
      for (let i = 0; i < 7; i++) { const sl = new THREE.Mesh(B(0.09, FLOOR - 0.3, 0.09), woodSlat); sl.position.set(i * 0.14, 0, 0); slatGrp.add(sl); }
      slatGrp.position.set(HW / 2 - 1.1, FLOOR + FLOOR / 2, -HD / 2 - 0.06); house.add(slatGrp);
      // شباك غاطس جوة الفتحة: إطار بمنتصف السماكة + زجاج وراه + عتبة بارزة بره
      // (zFace = مستوى الواجهة الخارجي — الغطس نحو داخل البيت = +z)
      const mkWin = (x, y, w2, h2, zFace, host = house) => {
        // لوح الإطار خلفية بعمق الفتحة، والزجاج قدامه (لو انعكس الترتيب ينبلع الزجاج!)
        const fr = new THREE.Mesh(B(w2 + 0.14, h2 + 0.14, 0.05), frameMat); fr.position.set(x, y, zFace + 0.2); host.add(fr);
        // زجاج الفتحة الغاطسة: بظل الفتحة الانعكاس وحده يطلع أسود — نضيف سماوية ذاتية
        // خفيفة (خدعة العرض المعماري) حتى يقرأ كزجاج نهاري حي
        const gm = M({ color: 0xa8c0d4, roughness: 0.15, metalness: 0.3, emissive: 0x8fa8bc, emissiveIntensity: 0.4, envMapIntensity: 1.4 });
        const gl = new THREE.Mesh(B(w2, h2, 0.04), gm); gl.position.set(x, y, zFace + 0.15); host.add(gl);
        const mull = new THREE.Mesh(B(0.05, h2, 0.05), frameMat); mull.position.set(x, y, zFace + 0.12); host.add(mull);
        const sill = new THREE.Mesh(B(w2 + 0.34, 0.09, 0.22), curbM); sill.position.set(x, y - h2 / 2 - 0.1, zFace - 0.04); host.add(sill);
      };
      mkWin(HW / 2 - 2.2, 1.55, 2.14, 1.58, -HD / 2);
      mkWin(0.2, 1.55, 1.28, 1.44, -HD / 2);
      mkWin(-HW / 2 + towerW / 2, 3.4, 1.1, 2.2, -HD / 2 - 0.24); // شباك البرج (بارز على وجه البرج الصم)
      const door = new THREE.Mesh(B(1.14, 2.24, 0.08), M({ color: 0x2d2620, roughness: 0.5 }));
      door.position.set(-HW / 2 + towerW + 0.9, 1.12, -HD / 2 + 0.22); house.add(door); // غاطس بمحرابه
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
      // مواقع خصل العشب الحقيقية: إطار محيطي منتظم حول الثيل (مو نثر عشوائي مطشر)
      const tuftSpots = [];
      {
        const tlw = HW + 4, tld = LOT_FRONT - 0.8, tcx = -2, tcz = -HD / 2 - LOT_FRONT / 2 + 0.3;
        const skipX = (gx) => (gx > gateX - 2 && gx < gateX + 2) || (gx > -HW / 2 + towerW + 0.1 && gx < -HW / 2 + towerW + 1.7);
        for (let gx = tcx - tlw / 2 + 0.5; gx <= tcx + tlw / 2 - 0.5; gx += 0.65) {
          if (!skipX(gx)) { tuftSpots.push([gx, tcz - tld / 2 + 0.35]); tuftSpots.push([gx, tcz + tld / 2 - 0.35]); }
        }
        for (let gz = tcz - tld / 2 + 1.0; gz <= tcz + tld / 2 - 1.0; gz += 0.65) {
          tuftSpots.push([tcx - tlw / 2 + 0.35, gz]); tuftSpots.push([tcx + tlw / 2 - 0.35, gz]);
        }
      }
      // إطار حجري مشذب حول الثيل
      const borderM = M({ color: 0xb8b2a6, roughness: 0.85 });
      const lw = HW + 4, ld = LOT_FRONT - 0.8, lcx = -2, lcz = -HD / 2 - LOT_FRONT / 2 + 0.3;
      [[lcx, lcz - ld / 2, lw + 0.3, 0.18], [lcx, lcz + ld / 2, lw + 0.3, 0.18]].forEach(([bx, bz, bw2, bd3]) => {
        const bs = new THREE.Mesh(B(bw2, 0.09, bd3), borderM); bs.position.set(bx, 0.045, bz); scene.add(bs);
      });
      [[lcx - lw / 2, lcz, 0.18, ld + 0.3], [lcx + lw / 2, lcz, 0.18, ld + 0.3]].forEach(([bx, bz, bw2, bd3]) => {
        const bs = new THREE.Mesh(B(bw2, 0.09, bd3), borderM); bs.position.set(bx, 0.045, bz); scene.add(bs);
      });
      // ساحة مبلطة مرتبة حول الملكية (hardscape) — المحيط ما يبقى «صحراء قاحلة»
      const apronM = M({ map: rep(sideT, 9, 9), roughness: 0.95, envMapIntensity: 0.05 });
      [[-13, -2, 8, 24], [13, -2, 8, 24], [0, 13.5, 34, 9]].forEach(([ax, az, aw, ad]) => {
        const ap = new THREE.Mesh(track(new THREE.PlaneGeometry(aw, ad)), apronM);
        ap.rotation.x = -Math.PI / 2; ap.position.set(ax, 0.006, az); ap.receiveShadow = true; scene.add(ap);
      });
      // حوض ورد مرتب بمحاذاة السياج الداخلي: شريط تربة بحافة كونكريتية رفيعة
      const bedSoil = new THREE.Mesh(track(new THREE.PlaneGeometry(13, 0.85)), M({ color: 0x8a7358, roughness: 1 }));
      bedSoil.rotation.x = -Math.PI / 2; bedSoil.position.set(-2.5, 0.012, WALL_Z + 0.75); scene.add(bedSoil);
      const bedEdge = new THREE.Mesh(B(13.1, 0.08, 0.06), M({ color: 0xb8b2a6, roughness: 0.85 }));
      bedEdge.position.set(-2.5, 0.04, WALL_Z + 1.2); scene.add(bedEdge);
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
      const grassN = lowPerf ? 900 : 1800; // عشب −50% على الموبايل
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
      const procPoles = []; // تنخفي إذا تحمّل عمود الكهرباء الفوتوريالستك
      if (!ENG_MODE) polesX.forEach((px) => {
        const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.11, 7.2, 10)), poleM);
        pole.position.set(px, 3.6, poleZ); pole.castShadow = true; scene.add(pole);
        const arm = new THREE.Mesh(B(1.6, 0.09, 0.09), poleM); arm.position.set(px, 6.6, poleZ); scene.add(arm);
        procPoles.push(pole, arm);
      });
      const mkCatenary = (x1, x2, y, z, sag) => {
        const pts = [];
        for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push(new THREE.Vector3(x1 + (x2 - x1) * u, y - Math.sin(u * Math.PI) * sag, z)); }
        const cur = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.Mesh(track(new THREE.TubeGeometry(cur, 24, 0.015, 6, false)), wireM); scene.add(tube);
      };
      if (!ENG_MODE) for (let i = 0; i < polesX.length - 1; i++) {
        mkCatenary(polesX[i], polesX[i + 1], 6.62, poleZ - 0.55, 0.35);
        mkCatenary(polesX[i], polesX[i + 1], 6.62, poleZ + 0.55, 0.35);
      }
      // (الرسالة الذهبية — قسم 1: بيت البطل ما يوصله ولا سلك، لا مولدة ولا خدمة)

      // ================= أعمدة إنارة فانوسية =================
      const procLamps = []; const lampSpots = [];
      const mkLamp = (x, z) => {
        lampSpots.push([x, z]);
        const g = new THREE.Group();
        procLamps.push(g);
        const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 10)), M({ color: 0x24282c, roughness: 0.5, metalness: 0.6 }));
        pole.position.y = 2.1; pole.castShadow = true; g.add(pole);
        const cap = new THREE.Mesh(track(new THREE.ConeGeometry(0.28, 0.3, 12)), M({ color: 0x24282c, roughness: 0.5 })); cap.position.y = 4.35; g.add(cap);
        const bulbM = M({ color: 0xfff1c8, emissive: 0xffd57a, emissiveIntensity: 0.05, roughness: 0.3 }); lampGlow.push(bulbM);
        const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.17, 14, 14)), bulbM); bulb.position.y = 4.12; g.add(bulb);
        g.position.set(x, 0, z); scene.add(g);
      };
      mkLamp(3.4, WALL_Z - 0.9);
      if (!ENG_MODE) { mkLamp(-11, WALL_Z - 0.9); mkLamp(16, WALL_Z - 0.9); mkLamp(-2, WALL_Z - SIDEWALK - ROAD_W - 1.4); }

      // ================= الجيران: محرك النماذج الأربعة + التنويع (المواصفة قسم 6) =================
      // لوحة القسم 9: رملي دافئ #D9C7A8 وتدرجاته (بيج/رملي/عاجي/ترابي فاتح)
      const villaPal = [0xd9c7a8, 0xcfc0a0, 0xe0d4b8, 0xc4b294, 0xd4c8ae];
      const dirtCol = new THREE.Color(0x8a7f6e); // لون العمر/الاتساخ (قاعدة dirtAmount)
      const tankBlackM = M({ color: 0x23292f, roughness: 0.65 });
      const tankWhiteM = M({ color: 0xe4e0d2, roughness: 0.6 }); // أبيض مصفر متسخ 10% (جدول الخامات)
      const dishM = M({ color: 0xe8eaec, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide });
      const condNM = M({ color: 0xd9dcdf, roughness: 0.5 });
      const doorNM = M({ color: 0x3a2c1e, roughness: 0.6 });
      const oldIronM = M({ color: 0x4a3c30, roughness: 0.7, metalness: 0.3 });
      const garageNM = M({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.3 });
      const stoneDarkM = M({ color: 0x5c564e, roughness: 0.7 }); // حجر داكن دافئ (جدول الخامات)
      const ladderM = metalGray;
      const laundrySway = []; // غسيل يتموج بالنسيم (جدول الحركة 16)
      const laundryPal = [0xe8e4d0, 0xa8cbe8, 0xd9c7a8]; // ألوان فاتحة من اللوحة
      // مولد عشوائي حتمي (نفس الحي بكل تحميل)
      const mulberry = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let z2 = Math.imul(seed ^ (seed >>> 15), 1 | seed); z2 = (z2 + Math.imul(z2 ^ (z2 >>> 7), 61 | z2)) ^ z2; return ((z2 ^ (z2 >>> 14)) >>> 0) / 4294967296; };

      // قاعدة الأسطح (قسم 6): كل سطح 3+ عناصر — تانكي/ستلايت/غسيل/سلم/مبردة/قفص حمام
      const addRoofStuff = (g, w, h, d, rnd, opts = {}) => {
        let count = 0;
        const spots = [[-w * 0.3, -d * 0.25], [w * 0.28, -d * 0.3], [-w * 0.15, d * 0.2], [w * 0.2, d * 0.25]];
        let si = 0; const spot = () => spots[si++ % spots.length];
        // تانكي (1-2) — عيب مقصود #4: تانكي مايل على سطح واحد بالحي
        const nT = 1 + (rnd() < 0.4 ? 1 : 0);
        for (let i = 0; i < nT; i++) {
          const [sx, sz] = spot();
          const tk = new THREE.Mesh(track(new THREE.CylinderGeometry(0.42, 0.42, 0.8, 12)), rnd() < 0.5 ? tankWhiteM : tankBlackM);
          tk.position.set(sx, h + 0.55, sz); if (opts.tiltTank && i === 0) tk.rotation.z = 0.06;
          tk.castShadow = true; g.add(tk); count++;
        }
        if (rnd() < 0.8) { // ستلايت
          const [sx, sz] = spot();
          const p2 = new THREE.Mesh(B(0.05, 0.9, 0.05), metalGray); p2.position.set(sx, h + 0.55, sz); g.add(p2);
          const dh = new THREE.Mesh(track(new THREE.CircleGeometry(0.4, 16)), dishM);
          dh.position.set(sx, h + 0.85, sz + 0.1); dh.rotation.x = -0.7; g.add(dh); count++;
        }
        if (opts.laundry || (count < 3 && rnd() < 0.5)) { // حبل غسيل — وحدة بغسيل ملون (نقطة لونية)
          const y2 = h + 0.9;
          const lp1 = new THREE.Mesh(B(0.05, 1.0, 0.05), metalGray); lp1.position.set(-w * 0.32, h + 0.5, d * 0.1); g.add(lp1);
          const lp2 = lp1.clone(); lp2.position.x = w * 0.32; g.add(lp2);
          const line = new THREE.Mesh(B(w * 0.64, 0.015, 0.015), frameMat); line.position.set(0, y2, d * 0.1); g.add(line);
          if (opts.laundry) for (let i = 0; i < 3; i++) {
            const cloth = new THREE.Mesh(B(0.42, 0.55, 0.02), M({ color: laundryPal[i % 3], roughness: 0.95, side: THREE.DoubleSide }));
            cloth.position.set(-w * 0.2 + i * w * 0.2, y2 - 0.29, d * 0.1); g.add(cloth); laundrySway.push(cloth);
          }
          count++;
        }
        if (count < 3 || rnd() < 0.4) { // مبردة هواء قديمة
          const [sx, sz] = spot();
          const cool = new THREE.Mesh(B(0.7, 0.7, 0.7), M({ color: 0xb0a894, roughness: 0.8, metalness: 0.2 }));
          cool.position.set(sx, h + 0.5, sz); cool.castShadow = true; g.add(cool); count++;
        }
        if (rnd() < 0.5) { // سلم حديد على الدروة
          const lad = new THREE.Group();
          for (let i = 0; i < 2; i++) { const r2 = new THREE.Mesh(B(0.04, 1.6, 0.04), ladderM); r2.position.set(i * 0.36 - 0.18, 0, 0); lad.add(r2); }
          for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(B(0.36, 0.03, 0.03), ladderM); st.position.set(0, -0.6 + i * 0.4, 0); lad.add(st); }
          lad.position.set(w / 2 - 0.1, h - 0.3, d * 0.35); g.add(lad);
        }
        if (opts.pigeons) { // قفص حمام — التفصيلة البغدادية التوقيع (واحد بالحي)
          const coop = new THREE.Group();
          const box2 = new THREE.Mesh(B(1.1, 1.3, 0.9), M({ color: 0x8a6a45, roughness: 0.9 })); box2.position.y = 0.65; box2.castShadow = true; coop.add(box2);
          const roof2 = new THREE.Mesh(B(1.25, 0.06, 1.05), stoneDarkM); roof2.position.y = 1.33; coop.add(roof2);
          for (let i = 0; i < 3; i++) { const hole = new THREE.Mesh(B(0.16, 0.2, 0.02), M({ color: 0x1d1810 })); hole.position.set(-0.3 + i * 0.3, 0.85, 0.46); coop.add(hole); }
          for (let i = 0; i < 3; i++) { const bird = new THREE.Mesh(track(new THREE.SphereGeometry(0.07, 8, 8)), M({ color: i ? 0xcfd4d8 : 0x6a7076, roughness: 0.9 })); bird.position.set(-0.4 + i * 0.38, 1.42, 0.2); coop.add(bird); }
          coop.position.set(-w * 0.25, h, d * 0.28); g.add(coop);
        }
      };

      // لافتة عربية (كانفاس) — كحلي بلاد أوتو + نص أبيض
      const arSign = (text) => {
        const c = mkCanvas(2); c.width = 512; c.height = 128;
        const gx = c.getContext('2d');
        gx.fillStyle = '#1B2A4A'; gx.fillRect(0, 0, 512, 128);
        gx.strokeStyle = '#D4A947'; gx.lineWidth = 6; gx.strokeRect(6, 6, 500, 116);
        gx.fillStyle = '#F2EDE0'; gx.font = '700 58px Cairo, "Noto Naskh Arabic", sans-serif';
        gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.direction = 'rtl';
        gx.fillText(text, 256, 68);
        const t2 = track(new THREE.CanvasTexture(c)); t2.colorSpace = THREE.SRGBColorSpace; t2.anisotropy = 4; return t2;
      };

      // ---- النموذج المولّد: spawnVilla(النوع 1-4، الموقع، البذرة) ----
      const ACROSS_Z = WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 8.6;
      const villaBodyMats = []; // أجسام بيوت الجيران — تلبس خامة الجص PBR مع بقاء تينت اللوحة الرملية
      const villaGroups = []; // ميتاداتا كل بيت — تستخدمها الإكسسوارات الفوتوريالستك (سبلتات..)
      const mkVilla = (arch, x, z, ry, seed, opts = {}) => {
        const rnd = mulberry(seed);
        const g = new THREE.Group();
        // محرك التنويع: عرض ±1م، ارتفاع ±30سم، لون من اللوحة، عمر 0-30%، mirror
        const w = (opts.w || 9) + (rnd() - 0.5) * 2;
        const baseH = arch === 2 ? 3.6 : 6.2;
        const h = baseH + (rnd() - 0.5) * 0.6;
        const d = (opts.d || 10.5) + (rnd() - 0.5) * 1.5;
        const dirt = arch === 2 ? 0.2 + rnd() * 0.15 : rnd() * 0.2;
        const mir = rnd() < 0.5 ? -1 : 1;
        const tone = new THREE.Color(villaPal[Math.floor(rnd() * villaPal.length)]).lerp(dirtCol, dirt * 0.6);
        const bodyM = arch === 3 ? stoneDarkM : M({ color: tone, roughness: 0.92 });
        if (arch !== 3) villaBodyMats.push(bodyM);
        const bd = new THREE.Mesh(B(w, h, d), bodyM); bd.position.y = h / 2; bd.castShadow = true; bd.receiveShadow = true; g.add(bd);
        // دروة + غطاء (coping)
        const par = new THREE.Mesh(B(w + 0.12, 0.45, d + 0.12), M({ color: 0xbfb5a0, roughness: 0.9 })); par.position.y = h + 0.12; g.add(par);
        const cop = new THREE.Mesh(B(w + 0.24, 0.07, d + 0.24), M({ color: 0xa89d88, roughness: 0.85 })); cop.position.y = h + 0.38; g.add(cop);
        // واجهة حسب النموذج
        if (arch === 1 || arch === 4) { // حديث بيادر: شريط رمادي/خشبي
          const accM = rnd() < 0.5 ? woodSlat : charcoalDark;
          const acc = new THREE.Mesh(B(w * 0.22, h + 0.35, 0.18), accM);
          acc.position.set(mir * -w * 0.28, (h + 0.35) / 2, d / 2 + 0.06); g.add(acc);
        }
        if (arch === 3) { // حجر داكن بخطوط أفقية فاتحة
          for (let yy = 1.4; yy < h - 0.4; yy += 1.2) {
            const strip = new THREE.Mesh(B(w + 0.06, 0.1, 0.05), M({ color: 0xd9c7a8, roughness: 0.8 }));
            strip.position.set(0, yy, d / 2 + 0.03); g.add(strip);
          }
        }
        // شبابيك: حالات متنوعة (عادية/ستارة/مبردة بالشباك)
        const floors2 = arch === 2 ? 1 : 2;
        for (let r = 0; r < floors2; r++) for (let c = 0; c < 2; c++) {
          const wx = mir * (w * 0.1 + c * 1.75);
          const wy = 1.65 + r * 2.9;
          const fr = new THREE.Mesh(B(1.32, 1.22, 0.06), frameMat); fr.position.set(wx, wy, d / 2 + 0.02); g.add(fr);
          const state = rnd();
          if (state < 0.2) { // مبردة جوة الشباك (چيلر)
            const cool = new THREE.Mesh(B(0.75, 0.75, 0.5), M({ color: 0xb0a894, roughness: 0.8 })); cool.position.set(wx, wy - 0.1, d / 2 + 0.2); g.add(cool);
          } else {
            const wm = glassMat.clone(); track(wm); windowsGlow.push(wm);
            const win = new THREE.Mesh(B(1.15, 1.05, 0.06), wm); win.position.set(wx, wy, d / 2 + 0.04); g.add(win);
            if (state < 0.5) { // ستارة (وحدة منها نص مسحوبة — عيب #11 يجي طبيعياً من العشوائية)
              const cw = state < 0.32 ? 1.1 : 0.55;
              const cur = new THREE.Mesh(B(cw, 1.0, 0.03), M({ color: 0xe0d4b8, roughness: 0.95 }));
              cur.position.set(wx + (1.1 - cw) / 2, wy, d / 2 + 0.055); g.add(cur);
            }
          }
          const sill = new THREE.Mesh(B(1.45, 0.07, 0.14), M({ color: 0xb8b2a6, roughness: 0.8 })); sill.position.set(wx, wy - 0.63, d / 2 + 0.06); g.add(sill);
        }
        // باب + كراج
        const dr = new THREE.Mesh(B(1.0, 2.1, 0.07), arch === 2 ? oldIronM : doorNM); dr.position.set(mir * -w * 0.06, 1.05, d / 2 + 0.02); g.add(dr);
        if (arch !== 2 && rnd() < 0.6) {
          const halfOpen = opts.garageHalfOpen; // عيب #7: باب گراج نص مفتوح (واحد بالحي)
          const gh = halfOpen ? 1.0 : 2.0;
          const ga = new THREE.Mesh(B(2.4, gh, 0.07), garageNM); ga.position.set(mir * (w * 0.32 - 0.4), halfOpen ? 1.5 : 1.0, d / 2 + 0.02); g.add(ga);
        }
        // سياج: النموذج 2 بناء كامل، والبقية قصير أبيض
        if (arch === 2) {
          const fw = new THREE.Mesh(B(w + 1.6, 2.0, 0.2), M({ color: tone.clone().lerp(dirtCol, 0.25), roughness: 0.95 }));
          fw.position.set(0, 1.0, d / 2 + 2.6); fw.castShadow = true; g.add(fw);
        } else if (arch !== 4) {
          const fw = new THREE.Mesh(B(w + 1.6, 1.3, 0.18), whiteWall); fw.position.set(0, 0.65, d / 2 + 2.6); fw.castShadow = true; g.add(fw);
          const fcap = new THREE.Mesh(B(w + 1.7, 0.07, 0.26), M({ color: 0xb8b2a6, roughness: 0.8 })); fcap.position.set(0, 1.33, d / 2 + 2.6); g.add(fcap);
        }
        // النموذج 4: محل زاوية — بقالية بلافتة + ثلاجة پيبسي + كراسي بيض
        if (arch === 4) {
          const shopW = w * 0.6;
          const shop = new THREE.Mesh(B(shopW, 2.3, 0.35), stoneDarkM); shop.position.set(mir * w * 0.15, 1.15, d / 2 + 0.15); g.add(shop);
          const opening = new THREE.Mesh(B(shopW - 0.6, 1.8, 0.1), M({ color: 0x14100c, roughness: 0.9 })); opening.position.set(mir * w * 0.15, 1.05, d / 2 + 0.34); g.add(opening);
          const sign = new THREE.Mesh(B(shopW, 0.7, 0.08), M({ map: arSign('بقالة النور'), roughness: 0.6, emissive: 0xf2ede0, emissiveMap: arSign('بقالة النور'), emissiveIntensity: 0.05 }));
          sign.position.set(mir * w * 0.15, 2.75, d / 2 + 0.28); g.add(sign); windowsGlow.push(sign.material); track(sign.material);
          const awn = new THREE.Mesh(B(shopW + 0.3, 0.06, 1.1), M({ color: 0xd4a947, roughness: 0.9 })); awn.position.set(mir * w * 0.15, 2.3, d / 2 + 0.8); awn.rotation.x = 0.12; g.add(awn);
          const fridge = new THREE.Mesh(B(0.7, 1.7, 0.6), M({ color: 0x2d5f8a, roughness: 0.4 })); fridge.position.set(mir * (w * 0.15 + shopW / 2 + 0.5), 0.85, d / 2 + 0.6); g.add(fridge);
          const fridgeTop = new THREE.Mesh(B(0.7, 0.4, 0.6), M({ color: 0xe8eaec, roughness: 0.4 })); fridgeTop.position.set(mir * (w * 0.15 + shopW / 2 + 0.5), 1.95, d / 2 + 0.6); g.add(fridgeTop);
          for (let i = 0; i < 2; i++) { // كراسي بلاستيك بيض — أيقونة
            const ch = new THREE.Group();
            const seat = new THREE.Mesh(B(0.42, 0.05, 0.42), M({ color: 0xeceade, roughness: 0.7 })); seat.position.y = 0.45; ch.add(seat);
            const back = new THREE.Mesh(B(0.42, 0.5, 0.05), M({ color: 0xeceade, roughness: 0.7 })); back.position.set(0, 0.72, -0.2); ch.add(back);
            [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(([lx, lz]) => { const lg = new THREE.Mesh(B(0.04, 0.45, 0.04), M({ color: 0xdedcd0 })); lg.position.set(lx, 0.22, lz); ch.add(lg); });
            ch.position.set(mir * (w * 0.15 - shopW / 2 - 0.6), 0, d / 2 + 1.2 + i * 0.7); ch.rotation.y = rnd() * 0.6; g.add(ch);
          }
          const crate = new THREE.Mesh(B(0.5, 0.35, 0.4), M({ color: 0xc94f7c, roughness: 0.8 })); crate.position.set(mir * w * 0.02, 0.18, d / 2 + 0.9); g.add(crate);
        }
        // كومبرسرات جانبية + قاعدة الأسطح
        for (let k = 0; k < 2; k++) { const cd = new THREE.Mesh(B(0.8, 0.55, 0.3), condNM); cd.position.set(w / 2 + 0.18, 1.1 + k * 1.1, -d * 0.1); cd.rotation.y = Math.PI / 2; g.add(cd); }
        addRoofStuff(g, w, h, d, rnd, opts);
        // جار عنده منظومة شمسية صغيرة (8 ألواح) — الحي گاعد يتحول
        if (opts.solar) {
          const sg = buildStructure(4, 0.35);
          sg.position.set(-2.1, h + 0.42, -d * 0.15); g.add(sg);
        }
        g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
        villaGroups.push({ g, w, h, d, arch, mir, seed });
        return g;
      };
      // ---- توزيع الحي: 13 بيت، ولا اثنين متطابقين ----
      if (!ENG_MODE) { // وضع العرض الهندسي: بلا جيران نهائياً
      // صفّنا
      mkVilla(1, -17.5, -HD / 2 + 2.2, 0, 11, { laundry: true });
      mkVilla(3, 17.5, -HD / 2 + 2.2, 0, 22);
      mkVilla(2, -31, -HD / 2 + 2.2, 0, 33, { tiltTank: true });
      mkVilla(1, 31, -HD / 2 + 2.2, 0, 44, { garageHalfOpen: true });
      // كَبال الشارع
      mkVilla(1, -22, ACROSS_Z, Math.PI, 55, { solar: true });
      mkVilla(4, -8, ACROSS_Z, Math.PI, 66, { d: 10 });   // بقالة النور بالزاوية
      mkVilla(3, 6, ACROSS_Z, Math.PI, 77);
      mkVilla(2, 20, ACROSS_Z, Math.PI, 88, { laundry: true });
      mkVilla(2, 34, ACROSS_Z, Math.PI, 99);
      // صف خلفي (أسطحه باينة من فوق — مشغولة)
      mkVilla(1, -15, ACROSS_Z - 17, Math.PI, 111, { solar: true });
      mkVilla(2, 2, ACROSS_Z - 17, Math.PI, 122, { pigeons: true });
      mkVilla(1, 18, ACROSS_Z - 17, Math.PI, 133);
      mkVilla(3, 34, ACROSS_Z - 17, Math.PI, 144);
      // ---- صفوف العمق: نسيج عمراني متواصل يسد الفراغ حتى خط الضباب (روح الرفرنس) ----
      // خلف بيت البطل (الجهة المقابلة للشارع الرئيسي بعيونا) وعلى الجانبين
      // (الكاميرا بـ z سالب تباوع نحو +z — فالعمق المرئي خلف بيت البطل كله z موجب)
      const depthSeed = mulberry(500);
      [[-30, 16], [-14, 17], [2, 15.5], [18, 16.5], [34, 15],
       [-38, 34], [-20, 35], [-2, 33.5], [16, 34.5], [32, 33], [48, 35],
       [-30, 52], [-8, 51], [12, 53], [36, 51.5],
       [-46, 8], [50, 10], [-54, 28], [56, 30],
       [-40, ACROSS_Z - 34], [-20, ACROSS_Z - 33], [0, ACROSS_Z - 35], [20, ACROSS_Z - 33], [40, ACROSS_Z - 34]].forEach(([dx, dz], i) => {
        const arch = [1, 2, 3, 1, 2][Math.floor(depthSeed() * 5) % 5] || 1;
        mkVilla(arch, dx, dz, depthSeed() < 0.5 ? 0 : Math.PI, 200 + i * 7);
      });
      // ---- باس العمر (القسم 19): مزاريب + سواقي اتساخ تحت الدروة + حزام ترابي بالقاعدة ----
      const pipeM = M({ color: 0x8a8478, roughness: 0.7, metalness: 0.25 });
      villaGroups.forEach((v2) => {
        const wr = mulberry(v2.seed * 13 + 7);
        // مزراب نازل بزاوية الواجهة + ساقية اتساخ وراه
        if (wr() < 0.75) {
          const px = v2.mir * (v2.w / 2 - 0.3);
          const pipe = new THREE.Mesh(track(new THREE.CylinderGeometry(0.045, 0.045, v2.h, 6)), pipeM);
          pipe.position.set(px, v2.h / 2, v2.d / 2 + 0.09); v2.g.add(pipe);
          const elbow = new THREE.Mesh(track(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 6)), pipeM);
          elbow.rotation.x = Math.PI / 2 - 0.5; elbow.position.set(px, 0.1, v2.d / 2 + 0.18); v2.g.add(elbow);
          const st = new THREE.Mesh(track(new THREE.PlaneGeometry(0.5, v2.h * 0.6)), streakM);
          st.position.set(px + v2.mir * 0.12, v2.h * 0.62, v2.d / 2 + 0.035); v2.g.add(st);
        }
        // سواقي تحت حافة الدروة (1-2 مواضع عشوائية)
        const nStreak = 1 + Math.floor(wr() * 2);
        for (let s2 = 0; s2 < nStreak; s2++) {
          const sx = (wr() - 0.5) * v2.w * 0.8;
          const st = new THREE.Mesh(track(new THREE.PlaneGeometry(0.6 + wr() * 0.5, 1.0 + wr() * 0.8)), streakM);
          st.position.set(sx, v2.h - 0.7 - wr() * 0.3, v2.d / 2 + 0.032); v2.g.add(st);
        }
        // حزام التراب بقاعدة الواجهة
        const bb = new THREE.Mesh(track(new THREE.PlaneGeometry(v2.w + 0.1, 0.55)), baseDirtM);
        bb.position.set(0, 0.28, v2.d / 2 + 0.03); v2.g.add(bb);
      });
      } // نهاية !ENG_MODE (الجيران وصفوف العمق وباس العمر)

      // ================= طبقة الأفق (القسم 2): خط نخيل + سيلويتات #9FB4C7 =================
      const hazeC = 0x9fb4c7;
      const hazeM = track(new THREE.MeshBasicMaterial({ color: hazeC, fog: true }));
      // خط نخيل بعيد (billboards بنسيج كانفاس)
      const palmLineTex = () => {
        const c = mkCanvas(2); c.width = 1024; c.height = 128;
        const gx = c.getContext('2d');
        gx.fillStyle = 'rgba(159,180,199,0.92)';
        for (let x2 = 12; x2 < 1024; x2 += 26 + Math.random() * 34) {
          const ph = 52 + Math.random() * 44, tw = 3 + Math.random() * 2;
          gx.fillRect(x2 - tw / 2, 128 - ph, tw, ph);
          for (let f = 0; f < 7; f++) {
            const ang = (f / 6) * Math.PI - Math.PI / 2 + (Math.random() - 0.5) * 0.4;
            gx.save(); gx.translate(x2, 128 - ph); gx.rotate(ang);
            gx.fillRect(0, -2, 16 + Math.random() * 8, 3.5); gx.restore();
          }
        }
        const t2 = track(new THREE.CanvasTexture(c)); t2.colorSpace = THREE.SRGBColorSpace; return t2;
      };
      if (!ENG_MODE) { // طبقة الأفق المدنية كلها — بالعرض الهندسي الأفق يذوب بالضباب نظيفاً
      const plTex = palmLineTex();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + 0.35;
        const pl = new THREE.Mesh(
          track(new THREE.PlaneGeometry(150, 15)),
          track(new THREE.MeshBasicMaterial({ map: plTex, transparent: true, fog: true, side: THREE.DoubleSide, depthWrite: false }))
        );
        pl.position.set(Math.cos(ang) * 205, 6, Math.sin(ang) * 205);
        pl.lookAt(0, 6, 0); scene.add(pl);
      }
      // كتل بنايات ضبابية + معالم الأفق: منارة جامع، تانكي الحي المرتفع، برج اتصالات
      const bgSeed = mulberry(7);
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2 + 0.1;
        const rr = 175 + bgSeed() * 30;
        const bw2 = 10 + bgSeed() * 16, bh2 = 6 + bgSeed() * 12;
        const bm = new THREE.Mesh(B(bw2, bh2, 10), hazeM);
        bm.position.set(Math.cos(ang) * rr, bh2 / 2, Math.sin(ang) * rr);
        bm.rotation.y = bgSeed() * Math.PI; scene.add(bm);
      }
      { // منارة بعيدة (silhouette فقط — هوية)
        const mnr = new THREE.Group();
        const shaft = new THREE.Mesh(track(new THREE.CylinderGeometry(1.1, 1.5, 26, 10)), hazeM); shaft.position.y = 13; mnr.add(shaft);
        const balc = new THREE.Mesh(track(new THREE.CylinderGeometry(2.0, 2.0, 1.2, 10)), hazeM); balc.position.y = 21; mnr.add(balc);
        const tip = new THREE.Mesh(track(new THREE.ConeGeometry(1.3, 4.5, 10)), hazeM); tip.position.y = 28; mnr.add(tip);
        mnr.position.set(-120, 0, -155); scene.add(mnr);
      }
      { // تانكي ماء الحي المرتفع
        const wt = new THREE.Group();
        for (let i = 0; i < 4; i++) { const leg = new THREE.Mesh(B(0.7, 18, 0.7), hazeM); leg.position.set(Math.cos(i * 1.57) * 3, 9, Math.sin(i * 1.57) * 3); wt.add(leg); }
        const bowl = new THREE.Mesh(track(new THREE.SphereGeometry(5, 12, 10)), hazeM); bowl.position.y = 21; wt.add(bowl);
        wt.position.set(150, 0, -120); scene.add(wt);
      }
      { // برج اتصالات
        const tw2 = new THREE.Mesh(track(new THREE.CylinderGeometry(0.3, 1.6, 34, 6)), hazeM); tw2.position.set(95, 17, 165); scene.add(tw2);
        const ant = new THREE.Mesh(B(0.2, 6, 0.2), hazeM); ant.position.set(95, 37, 165); scene.add(ant);
      }
      } // نهاية !ENG_MODE (طبقة الأفق)

      // ================= تفاصيل الشارع (القسم 4) =================
      // منهولات معدنية
      const manholeM = M({ color: 0x3a3d40, roughness: 0.7, metalness: 0.5 });
      [-14, -3, 8, 19].forEach((mx) => {
        const mh = new THREE.Mesh(track(new THREE.CircleGeometry(0.36, 18)), manholeM);
        mh.rotation.x = -Math.PI / 2; mh.position.set(mx, 0.015, WALL_Z - SIDEWALK - ROAD_W / 2 + (mx % 2 ? 1.4 : -1.1)); scene.add(mh);
      });
      // رقع صيانة أغمق
      [[-9, 2.6, 1.8], [15, 2.2, 2.8]].forEach(([px2, pw2, pd2]) => {
        const patch = new THREE.Mesh(track(new THREE.PlaneGeometry(pw2, pd2)), M({ color: 0x33373a, roughness: 0.98 }));
        patch.rotation.x = -Math.PI / 2; patch.rotation.z = 0.1;
        patch.position.set(px2, 0.008, WALL_Z - SIDEWALK - ROAD_W / 2 - 0.5); scene.add(patch);
      });
      // مقاطع حجر الحافة أصفر/أسود متآكل (ستايل عراقي)
      const curbYellowM = M({ color: 0xc9a437, roughness: 0.85 });
      const curbBlackM = M({ color: 0x2e3134, roughness: 0.85 });
      for (let i = 0; i < 8; i++) {
        const cx2 = gateX - 5 + i * 1.3;
        const cs = new THREE.Mesh(B(1.2, 0.145, 0.23), i % 2 ? curbBlackM : curbYellowM);
        cs.position.set(cx2, 0.075, WALL_Z - SIDEWALK - 0.05); scene.add(cs);
      }
      // أحواض شجر بالرصيف (تحت النخلات)
      [-14, -5, 10.5].forEach((px2) => {
        const pit = new THREE.Mesh(track(new THREE.PlaneGeometry(1.3, 1.3)), M({ color: 0x6b5a44, roughness: 1 }));
        pit.rotation.x = -Math.PI / 2; pit.position.set(px2, 0.025, WALL_Z - 1.1); scene.add(pit);
      });
      // شارع فرعي ثاني يمين + إغلاق بصري لنهايات الشوارع (قاعدة الحافة)
      if (!ENG_MODE) {
        const crossRoad2 = new THREE.Mesh(track(new THREE.PlaneGeometry(ROAD_W - 1.5, 40)), road.material);
        crossRoad2.rotation.x = -Math.PI / 2; crossRoad2.position.set(27.5, 0.003, WALL_Z - SIDEWALK - ROAD_W - 18);
        crossRoad2.receiveShadow = true; scene.add(crossRoad2);
      }
      // (نخلات إغلاق نهايات الشوارع تُضاف بعد تعريف mkPalm أدناه)

      // ================= سيارات (3 ألوان) =================
      const glassM2 = M({ color: 0x18242e, roughness: 0.12, metalness: 0.5 });
      const wheelG = track(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18)); const wheelM = M({ color: 0x121212, roughness: 0.7 });
      const procCars = []; const carSpots = [];
      // سيدان معاصرة بحواف منحنية (RoundedBox) — مو صناديق: جسم + قمرة مدموجة + حزام
      // زجاج ملفوف + مصدات ومرايات وجنوط — طول ~4.5م (فحص السكيل)
      const mkCar = (hex, x, z, ry = 0) => {
        carSpots.push([x, z, ry]);
        const car = new THREE.Group();
        procCars.push(car);
        const paint = M({ color: hex, roughness: 0.22, metalness: 0.65, envMapIntensity: 1.3 });
        const darkTrim = M({ color: 0x1c1f22, roughness: 0.55, metalness: 0.3 });
        const rb = (w2, h2, d2, r2) => track(new RoundedBoxGeometry(w2, h2, d2, 4, r2));
        // الجسم السفلي: منحنٍ من كل الحواف
        const body2 = new THREE.Mesh(rb(1.78, 0.62, 4.45, 0.16), paint); body2.position.y = 0.62; body2.castShadow = true; car.add(body2);
        // القمرة: منزلقة للورة شوية بانحناء أكبر (fastback)
        const cabin = new THREE.Mesh(rb(1.58, 0.55, 2.35, 0.24), paint); cabin.position.set(0, 1.08, -0.25); cabin.castShadow = true; car.add(cabin);
        // حزام الزجاج الملفوف: صندوق منحنٍ غامق يبرز قليلاً من القمرة
        const glassBand = new THREE.Mesh(rb(1.6, 0.34, 2.1, 0.16), glassM2); glassBand.position.set(0, 1.13, -0.25); car.add(glassBand);
        // مصدات + عتبة سفلية
        const bumperF = new THREE.Mesh(rb(1.72, 0.24, 0.4, 0.1), darkTrim); bumperF.position.set(0, 0.4, 2.12); car.add(bumperF);
        const bumperR = bumperF.clone(); bumperR.position.z = -2.12; car.add(bumperR);
        const skirt = new THREE.Mesh(rb(1.7, 0.14, 3.6, 0.06), darkTrim); skirt.position.y = 0.3; car.add(skirt);
        // شبك أمامي + لوحة
        const grille = new THREE.Mesh(rb(0.9, 0.18, 0.06, 0.03), darkTrim); grille.position.set(0, 0.62, 2.23); car.add(grille);
        const plate = new THREE.Mesh(B(0.5, 0.12, 0.02), M({ color: 0xe8e6da, roughness: 0.6 })); plate.position.set(0, 0.42, 2.33); car.add(plate);
        // مصابيح أمامية/خلفية
        const hlM = M({ color: 0xd8dee6, roughness: 0.15, metalness: 0.6, emissive: 0x667080, emissiveIntensity: 0.12 });
        const tlM = M({ color: 0x7a1e22, roughness: 0.3, emissive: 0x5a1215, emissiveIntensity: 0.25 });
        [[-0.62, 2.2, hlM], [0.62, 2.2, hlM], [-0.62, -2.2, tlM], [0.62, -2.2, tlM]].forEach(([lx, lz, lm]) => {
          const lamp = new THREE.Mesh(rb(0.42, 0.14, 0.1, 0.05), lm); lamp.position.set(lx, 0.78, lz); car.add(lamp);
        });
        // مرايات جانبية
        [-1, 1].forEach((s2) => {
          const mir2 = new THREE.Mesh(rb(0.09, 0.12, 0.2, 0.03), paint); mir2.position.set(s2 * 0.93, 1.02, 0.85); car.add(mir2);
        });
        // عجلات بجنوط فضية
        const rimM = M({ color: 0xc4c8cc, roughness: 0.25, metalness: 0.9 });
        [[0.83, 1.42], [-0.83, 1.42], [0.83, -1.42], [-0.83, -1.42]].forEach(([wx, wz]) => {
          const w2 = new THREE.Mesh(wheelG, wheelM); w2.rotation.z = Math.PI / 2; w2.position.set(wx, 0.35, wz); car.add(w2);
          const rim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.19, 0.19, 0.26, 14)), rimM);
          rim.rotation.z = Math.PI / 2; rim.position.set(wx, 0.35, wz); car.add(rim);
        });
        car.position.set(x, 0, z); car.rotation.y = ry; scene.add(car);
        mkAO(x, z, 2.6, 5.2, 0.85, ry);
      };
      mkCar(0xe8e6e0, gateX, -HD / 2 - 2.6);                                     // بيضاء على الدرايف
      if (!ENG_MODE) {
        mkCar(0x8e9aa5, -7, WALL_Z - SIDEWALK - 1.6, Math.PI / 2);               // فضية واقفة على الرصيف
        mkCar(0x1f3a5c, 12.5, WALL_Z - SIDEWALK - ROAD_W + 1.4, Math.PI / 2);    // كحلية بالجهة الثانية
      }

      // ================= الخضرة (القسم 7): ثلاث درجات أخضر + نسيم موحّد =================
      // اللوحة: نخيلي مزرق #4A6B4D • سدر دافئ #7A9B5E • عشب مصفر (بالشيدر)
      const palmTrunkM = M({ color: 0x8a6a45, roughness: 0.95 });
      const palmLeafM = M({ color: 0x4a6b4d, roughness: 0.9 });
      const palmLeafM2 = M({ color: 0x5c7f55, roughness: 0.9 }); // درجة أفتح من النخيلي
      const sidrLeafM = M({ color: 0x7a9b5e, roughness: 0.92 });
      const sidrLeafM2 = M({ color: 0x6b8a52, roughness: 0.92 });
      const dateM = M({ color: 0x9c5a22, roughness: 0.8 });
      const windCrowns = []; // {grp, phase, speed, amp} — كل الحركات تقرأ ريحاً موحّدة (+x)
      // ---- سعف نخيل حقيقي الشكل: نسيج ألفا ريشي + جيومتري منحنٍ (بدل الكتل الخضر) ----
      // جذع النخلة: نسيج «كرب» حقيقي — معينات قواعد السعف المقصوصة بصفوف متعاكسة
      const palmBarkTex = (() => {
        const c = mkCanvas(2); c.width = 128; c.height = 256;
        const g = c.getContext('2d');
        g.fillStyle = '#7d6242'; g.fillRect(0, 0, 128, 256);
        for (let row = 0; row < 10; row++) {
          const off = (row % 2) * 16;
          for (let col = -1; col < 5; col++) {
            const x = col * 32 + off, y = row * 26;
            g.fillStyle = ['#8a6d4a', '#75593c', '#93764f'][(row + col + 30) % 3];
            g.beginPath();
            g.moveTo(x + 16, y); g.lineTo(x + 32, y + 13); g.lineTo(x + 16, y + 26); g.lineTo(x, y + 13);
            g.closePath(); g.fill();
            g.strokeStyle = 'rgba(52,38,24,0.55)'; g.lineWidth = 2; g.stroke();
            // ظل داخلي خفيف أسفل كل كربة — عمق
            g.fillStyle = 'rgba(40,28,16,0.25)';
            g.beginPath(); g.moveTo(x, y + 13); g.lineTo(x + 16, y + 26); g.lineTo(x + 16, y + 20); g.closePath(); g.fill();
          }
        }
        const t2 = track(new THREE.CanvasTexture(c));
        t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.colorSpace = THREE.SRGBColorSpace; t2.anisotropy = 8;
        return t2;
      })();
      const palmBarkM = M({ map: palmBarkTex, roughness: 0.95, bumpMap: palmBarkTex, bumpScale: 0.4 });
      const frondTexture = (base, tip) => {
        const c = mkCanvas(2); c.width = 128; c.height = 512;
        const g = c.getContext('2d');
        g.strokeStyle = '#6b5836'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(64, 508); g.lineTo(64, 10); g.stroke(); // الجريدة
        for (let t = 0.03; t < 1; t += 0.018) {
          const y = 500 - t * 482;
          const len = 60 * (1 - t * 0.38) + 10;
          const spread = 1.0 - t * 0.38; // الوريقات تنفرج بالگاع وتضمّ بالراس
          const cc = t < 0.75 ? base : tip;
          g.strokeStyle = cc; g.lineWidth = 5.5 - t * 2.0;
          [-1, 1].forEach((s2) => {
            g.beginPath(); g.moveTo(64, y);
            g.lineTo(64 + s2 * Math.sin(spread) * len, y - Math.cos(spread) * len * 0.7);
            g.stroke();
          });
        }
        const t2 = track(new THREE.CanvasTexture(c)); t2.colorSpace = THREE.SRGBColorSpace; t2.anisotropy = 8; return t2;
      };
      const mkFrondGeo = () => {
        const geo = track(new THREE.PlaneGeometry(0.95, 2.6, 1, 10));
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const u = (pos.getY(i) + 1.3) / 2.6; // 0 گاعدة → 1 راس
          pos.setZ(i, -(u * u) * 1.05); // راس السعفة يطيح بقوس طبيعي
          pos.setX(i, pos.getX(i) * (1 - u * 0.55)); // وتضيق نحو الراس
        }
        geo.translate(0, 1.3, 0); geo.computeVertexNormals(); return geo;
      };
      const frondGeo = mkFrondGeo();
      const frondM = M({ map: frondTexture('#4a6b4d', '#5c7f55'), alphaTest: 0.35, transparent: true, side: THREE.DoubleSide, roughness: 0.9 });
      const frondM2 = M({ map: frondTexture('#5c7f55', '#7a9b5e'), alphaTest: 0.35, transparent: true, side: THREE.DoubleSide, roughness: 0.9 });
      const frondDryM = M({ map: frondTexture('#a8935c', '#b8a570'), alphaTest: 0.35, transparent: true, side: THREE.DoubleSide, roughness: 0.95 });
      // نخلة: تاج منفصل يتنفس + ميلان جذع عشوائي 1-4 درجات (قسم 7)
      const mkPalm = (x, z, hgt = 4.2, sc = 1) => {
        const pg = new THREE.Group();
        // جذع بنسيج الكرب (بدل الحلقات البلاستيكية) — تكرار عمودي حسب الطول
        const trM = palmBarkM.clone(); track(trM);
        trM.map = palmBarkTex.clone(); track(trM.map); trM.map.repeat.set(2, hgt * 0.85); trM.map.needsUpdate = true;
        trM.bumpMap = trM.map;
        const tr = new THREE.Mesh(track(new THREE.CylinderGeometry(0.15, 0.24, hgt, 10, 4)), trM);
        tr.position.y = hgt / 2; tr.castShadow = true; pg.add(tr);
        const crown = new THREE.Group(); crown.position.y = hgt;
        let dryDone = false;
        // صفان من السعف: خارجي متدلٍ + داخلي منتصب — تاج مليان مثل نخل الشوارع
        for (let i = 0; i < 19; i++) {
          const outer = i < 11;
          const ang = outer ? (i / 11) * Math.PI * 2 : ((i - 11) / 8) * Math.PI * 2 + 0.4;
          // عيب مقصود #12: سعفة يابسة وحدة متدلية (بنخلة الحديقة فقط — تُفعّل بالنداء)
          const dry = !dryDone && sc < 0.9 && i === 7; if (dry) dryDone = true;
          const fg = new THREE.Group(); fg.rotation.y = -ang;
          const leaf = new THREE.Mesh(frondGeo, dry ? frondDryM : (i % 2 ? frondM : frondM2));
          // السعفة تطلع مائلة للخارج وترتفع شوية ثم يطيح راسها (الانحناء مخبوز بالجيومتري)
          leaf.rotation.x = dry ? -2.2 : (outer ? -(Math.PI / 2 - 0.32) - (i % 3) * 0.14 : -(Math.PI / 2 - 0.85) - (i % 2) * 0.12);
          leaf.scale.setScalar((outer ? 1.15 : 0.85) + ((i * 0.29) % 1) * 0.3);
          leaf.castShadow = true; fg.add(leaf);
          fg.position.y = dry ? -0.1 : 0.06;
          crown.add(fg);
        }
        // عذوق تمر متدلية (عنقودان برتقاليان بساق قصيرة) — توقيع النخلة العراقية
        for (let cl = 0; cl < 2; cl++) {
          const ang2 = cl * 2.6 + 0.7;
          const cx3 = Math.cos(ang2) * 0.42, cz3 = Math.sin(ang2) * 0.42;
          const stalk = new THREE.Mesh(B(0.03, 0.35, 0.03), palmTrunkM);
          stalk.position.set(cx3, -0.18, cz3); stalk.rotation.z = 0.3; crown.add(stalk);
          for (let i = 0; i < 7; i++) {
            const dt2 = new THREE.Mesh(track(new THREE.SphereGeometry(0.055, 8, 8)), dateM);
            dt2.position.set(cx3 + ((i * 0.37) % 1 - 0.5) * 0.22, -0.34 - (i % 3) * 0.09, cz3 + ((i * 0.61) % 1 - 0.5) * 0.22);
            crown.add(dt2);
          }
        }
        pg.add(crown);
        windCrowns.push({ grp: crown, phase: Math.random() * 6.28, speed: 2 * Math.PI / (4 + Math.random() * 2), amp: 0.035 + Math.random() * 0.02 }); // 2-4° / 4-6ث
        pg.position.set(x, 0, z); pg.scale.setScalar(sc);
        pg.rotation.y = Math.random() * Math.PI * 2;
        pg.rotation.z = (0.017 + Math.random() * 0.05) * (Math.random() < 0.5 ? -1 : 1); // ميلان 1-4°
        scene.add(pg);
        mkAO(x, z, 1.7 * sc, 1.7 * sc, 0.8);
      };
      // سدرة (نبگ): تاج كثيف مدوّر بدرجتي السدر الدافئ
      const mkSidr = (x, z, sc = 1) => {
        const sg = new THREE.Group();
        const tr = new THREE.Mesh(track(new THREE.CylinderGeometry(0.14, 0.2, 1.5, 8)), trunkM);
        tr.position.y = 0.75; tr.castShadow = true; sg.add(tr);
        const crown = new THREE.Group(); crown.position.y = 1.9;
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const rr = i < 6 ? 0.75 : 0.3;
          const blob = new THREE.Mesh(plantJit(track(new THREE.IcosahedronGeometry(0.62 + Math.random() * 0.25, 1))), i % 2 ? sidrLeafM : sidrLeafM2);
          blob.position.set(Math.cos(ang) * rr, (i < 6 ? 0.15 : 0.75) + Math.random() * 0.2, Math.sin(ang) * rr);
          blob.castShadow = true; crown.add(blob);
        }
        sg.add(crown);
        windCrowns.push({ grp: crown, phase: Math.random() * 6.28, speed: 2 * Math.PI / (5 + Math.random() * 3), amp: 0.02 }); // 1-2° / 5-8ث
        sg.position.set(x, 0, z); sg.scale.setScalar(sc);
        sg.rotation.y = Math.random() * Math.PI * 2;
        sg.rotation.z = (0.017 + Math.random() * 0.04) * (Math.random() < 0.5 ? -1 : 1);
        scene.add(sg);
        mkAO(x, z, 2.6 * sc, 2.6 * sc, 0.65);
      };
      mkPalm(-14, WALL_Z - 1.1, 4.4);
      mkPalm(10.5, WALL_Z - 1.1, 4.6);
      if (!ENG_MODE) mkSidr(-21.5, 2.5, 1.1); // بالعرض الهندسي: محلها شجرة حقيقية من المحمّل
      if (!ENG_MODE) {
        mkPalm(-5, WALL_Z - 1.1, 3.9, 0.92);
        mkPalm(-19, WALL_Z - SIDEWALK - ROAD_W - 1.2, 4.2, 0.95);
        mkPalm(12, WALL_Z - SIDEWALK - ROAD_W - 1.2, 4.8);
        mkPalm(26, WALL_Z - SIDEWALK - ROAD_W - 1.2, 4.0, 0.9);
        // سدر بحدائق الجيران (4-5 حسب القسم 7)
        mkSidr(22, 2.8, 0.95);
        mkSidr(-16, ACROSS_Z + 7.2, 1.2);
        mkSidr(12.5, ACROSS_Z + 7.5, 1.0);
        mkSidr(-30, WALL_Z - SIDEWALK - ROAD_W - 3, 1.15);
      }

      // ===== جهنمية (Bougainvillea) — أقوى نقطة لون، موضعان فقط (القسم 7 + حد القسم 20) =====
      const bougM = M({ color: 0xc94f7c, roughness: 0.9 });
      const bougGreenM = M({ color: 0x6b8a52, roughness: 0.9 });
      const mkBoug = (x, z, wSpan, hTop, ry = 0) => {
        const bg = new THREE.Group();
        for (let i = 0; i < 14; i++) {
          const fx = (Math.random() - 0.5) * wSpan;
          const fy = hTop * (0.45 + Math.random() * 0.6);
          const blob = new THREE.Mesh(plantJit(track(new THREE.IcosahedronGeometry(0.16 + Math.random() * 0.14, 1))), Math.random() < 0.7 ? bougM : bougGreenM);
          blob.position.set(fx, fy, (Math.random() - 0.5) * 0.24);
          blob.castShadow = true; bg.add(blob);
        }
        bg.position.set(x, 0, z); bg.rotation.y = ry; scene.add(bg);
      };
      mkBoug(-5.5, WALL_Z + 0.28, 4.5, 1.9);            // على سياجنا من الداخل
      mkBoug(20, ACROSS_Z + 7.8, 3.5, 2.2, Math.PI);    // على جدار بيت الجار القديم

      // ===== أصص فخارية (8) — واحد مگلوب فارغ (عيب مقصود #8) =====
      const potM = M({ color: 0xc4a97d, roughness: 0.9 });
      const potPlantM = sidrLeafM;
      const mkPot = (x, z, sc = 1, tipped = false) => {
        const pot = new THREE.Group();
        const body2 = new THREE.Mesh(track(new THREE.CylinderGeometry(0.16, 0.11, 0.26, 10)), potM);
        body2.position.y = 0.13; pot.add(body2);
        if (!tipped) {
          const pl = new THREE.Mesh(plantJit(track(new THREE.IcosahedronGeometry(0.16, 1))), potPlantM);
          pl.scale.y = 1.5; pl.position.y = 0.4; pot.add(pl);
        } else { pot.rotation.z = Math.PI / 2 - 0.15; pot.position.y = 0.1; }
        pot.position.x = x; pot.position.z = pot.position.z || 0; pot.position.set(x, tipped ? 0.12 : 0, z);
        pot.scale.setScalar(sc); scene.add(pot);
      };
      mkPot(-HW / 2 + towerW + 1.8, -HD / 2 - 0.6);        // يمّ باب بيتنا
      mkPot(-HW / 2 + towerW + 0.1, -HD / 2 - 0.6, 0.85);
      mkPot(-16.5, 3.6, 1.1); mkPot(-18.5, 3.6, 0.9);
      mkPot(16.8, 3.6, 1.0);
      mkPot(-8.5, ACROSS_Z + 8.2, 1.1); mkPot(-6, ACROSS_Z + 8.2, 0.9);
      mkPot(18.4, 3.6, 0.9, true);                          // المگلوب الفارغ

      // ===== عشب بري بحواف الأرصفة والجدران (12 كتلة — «التفصيلة اللي تفرق») =====
      const wildGrass = new THREE.InstancedMesh(bladeGeo, grassMat, 70);
      {
        const wgSpots = [];
        for (let i = 0; i < 12; i++) {
          const along = Math.random();
          if (i < 7) wgSpots.push([-15 + along * 30 + (Math.random() - 0.5) * 3, WALL_Z - SIDEWALK + 0.15 + Math.random() * 0.2]);
          else wgSpots.push([-(HW + 8) / 2 + 0.35, -8 + along * 14]);
        }
        const d4 = new THREE.Object3D(); const gc2 = new THREE.Color(); let wi = 0;
        wgSpots.forEach(([gx, gz]) => {
          for (let k = 0; k < 5; k++) {
            d4.position.set(gx + (Math.random() - 0.5) * 0.3, 0, gz + (Math.random() - 0.5) * 0.3);
            d4.rotation.y = Math.random() * Math.PI;
            const s2 = 0.5 + Math.random() * 0.5; d4.scale.set(s2, 0.6 + Math.random() * 0.6, s2);
            d4.updateMatrix(); wildGrass.setMatrixAt(wi, d4.matrix);
            gc2.setHSL(0.21 + Math.random() * 0.04, 0.45, 0.34 + Math.random() * 0.1); // مصفر بري
            wildGrass.setColorAt(wi, gc2); wi++;
          }
        });
        wildGrass.count = wi; wildGrass.instanceMatrix.needsUpdate = true;
        if (wildGrass.instanceColor) wildGrass.instanceColor.needsUpdate = true;
        scene.add(wildGrass);
      }

      // ===== سرب حمام يدور بالسماء (جدول الحركة: دورة 25-35ث، ارتفاع يتنفس ±3م) =====
      const pigeons = [];
      const pigeonBodyM = M({ color: 0x8a8f96, roughness: 0.9 });
      const pigeonWingM = M({ color: 0xb8bcc2, roughness: 0.9, side: THREE.DoubleSide });
      for (let i = 0; i < 6; i++) {
        const bird = new THREE.Group();
        const body3 = new THREE.Mesh(B(0.1, 0.08, 0.3), pigeonBodyM); bird.add(body3);
        const wL = new THREE.Mesh(track(new THREE.PlaneGeometry(0.34, 0.16)), pigeonWingM);
        wL.position.x = -0.2; wL.rotation.y = 0.1; bird.add(wL);
        const wR = new THREE.Mesh(track(new THREE.PlaneGeometry(0.34, 0.16)), pigeonWingM);
        wR.position.x = 0.2; wR.rotation.y = -0.1; bird.add(wR);
        scene.add(bird);
        pigeons.push({ g: bird, wL, wR, off: i * 1.05, flap: 2 + Math.random() });
      }
      const PIG_CYC = 2 * Math.PI / 30; // دورة/30 ثانية
      // عصفوران واگفان على سلك الكهرباء
      [[-12, 6.35], [-11.4, 6.35]].forEach(([sx, sy]) => {
        const sp = new THREE.Mesh(track(new THREE.ConeGeometry(0.06, 0.16, 6)), M({ color: 0x5a5248, roughness: 0.9 }));
        sp.position.set(sx, sy, WALL_Z - SIDEWALK - ROAD_W - 1.55); sp.rotation.x = 0.2; scene.add(sp);
      });

      // ===== بقعة ماي تعكس السماء («مراية الرفرنس» — جدول الخامات) =====
      const puddleM = M({ color: 0xa8cbe8, roughness: 0.06, metalness: 0.35, envMapIntensity: 1.3 });
      const puddle = new THREE.Mesh(track(new THREE.CircleGeometry(1.15, 26)), puddleM);
      puddle.rotation.x = -Math.PI / 2; puddle.scale.set(1.7, 1, 1);
      puddle.position.set(gateX - 6.5, 0.018, WALL_Z - SIDEWALK - 1.2);
      scene.add(puddle);

      // ===== قطة على السياج (ستاتيك — موضعها يخلي الناس تبتسم) + طابة بالحديقة =====
      {
        const cat = new THREE.Group();
        const catM = M({ color: 0x2e3134, roughness: 0.9 });
        const cb = new THREE.Mesh(B(0.34, 0.15, 0.13), catM); cb.position.y = 0.1; cat.add(cb);
        const ch2 = new THREE.Mesh(B(0.12, 0.12, 0.12), catM); ch2.position.set(0.2, 0.2, 0); cat.add(ch2);
        [[-0.035], [0.035]].forEach(([ex]) => { const ear = new THREE.Mesh(track(new THREE.ConeGeometry(0.03, 0.06, 4)), catM); ear.position.set(0.2 + ex, 0.29, 0); cat.add(ear); });
        const tail = new THREE.Mesh(B(0.26, 0.035, 0.035), catM); tail.position.set(-0.26, 0.16, 0); tail.rotation.z = 0.5; cat.add(tail);
        cat.position.set(14.5, 1.37, WALL_Z + 0.02); cat.rotation.y = 0.3; scene.add(cat);
      }
      const ball = new THREE.Mesh(track(new THREE.SphereGeometry(0.13, 12, 12)), M({ color: 0xe8e4d0, roughness: 0.6 }));
      ball.position.set(-4.2, 0.13, -HD / 2 - 3.4); scene.add(ball);

      // ================= المرحلة 4: منطقة المولدة — السرد البصري (القسمان 1 و8) =================
      // مولدة الحي بزاوية الشارع: فوضى منظمة بأسلاك catenary حقيقية للجيران —
      // وبيت البطل ما يوصله ولا سلك. هاي أهم رسالة تسويقية بالمشهد.
      const GEN_X = -25.5, GEN_Z = WALL_Z - SIDEWALK - 0.9;
      const genSteelM = M({ color: 0x3a4148, roughness: 0.7, metalness: 0.45 });
      const genRustM = M({ color: 0x6b4a2c, roughness: 0.95 });
      const smoke = [];
      if (!ENG_MODE) {
      {
        const gen = new THREE.Group();
        const body4 = new THREE.Mesh(B(2.3, 1.5, 1.25), genSteelM); body4.position.y = 0.95; body4.castShadow = true; gen.add(body4);
        const skid1 = new THREE.Mesh(B(2.5, 0.16, 0.2), genRustM); skid1.position.set(0, 0.08, 0.45); gen.add(skid1);
        const skid2 = skid1.clone(); skid2.position.z = -0.45; gen.add(skid2);
        const roofG = new THREE.Mesh(B(2.5, 0.07, 1.45), charcoalDark); roofG.position.y = 1.75; gen.add(roofG);
        // شبك تهوية + بقع صدأ
        for (let i = 0; i < 4; i++) { const vent = new THREE.Mesh(B(0.34, 0.5, 0.02), M({ color: 0x272c31, roughness: 0.8 })); vent.position.set(-0.8 + i * 0.55, 1.0, 0.64); gen.add(vent); }
        [[0.9, 0.5, 0.65], [-1.05, 1.3, 0.64]].forEach(([rx2, ry3, rz2]) => { const rust = new THREE.Mesh(B(0.3, 0.22, 0.015), genRustM); rust.position.set(rx2, ry3, rz2); gen.add(rust); });
        // عادم الدخان
        const exh = new THREE.Mesh(track(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 8)), genRustM);
        exh.position.set(0.85, 2.1, -0.3); gen.add(exh);
        // عمود التوزيع العالي بجنبها + كتلة فوضى قصيرة حوله
        const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.1, 5.6, 8)), poleM);
        post.position.set(1.7, 2.8, 0); post.castShadow = true; gen.add(post);
        const cross1 = new THREE.Mesh(B(1.3, 0.08, 0.08), poleM); cross1.position.set(1.7, 5.1, 0); gen.add(cross1);
        const cross2 = new THREE.Mesh(B(0.08, 0.08, 1.1), poleM); cross2.position.set(1.7, 4.7, 0); gen.add(cross2);
        gen.position.set(GEN_X, 0, GEN_Z); gen.rotation.y = 0.35; scene.add(gen);
      }
      // شيلمانات خشب ترفع الأسلاك عند عبور الشارع (القسم 8)
      const shilmanTops = [];
      [[-21, WALL_Z - SIDEWALK - ROAD_W + 0.4], [-11, WALL_Z - SIDEWALK - ROAD_W + 0.4]].forEach(([sx2, sz2]) => {
        const sh2 = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.07, 4.6, 7)), palmTrunkM);
        sh2.position.set(sx2, 2.3, sz2); sh2.rotation.z = (Math.random() - 0.5) * 0.06; sh2.castShadow = true; scene.add(sh2);
        shilmanTops.push(new THREE.Vector3(sx2, 4.55, sz2));
      });
      // حزمة أسلاك المولدة: لكل جار منحنى catenary خاص بترهله — كل سلك بمنحناه
      const genTop = new THREE.Vector3(GEN_X + 1.6, 5.3, GEN_Z);
      const genWire = (pts, sag = 0.8) => {
        const full = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const a2 = pts[i], b3 = pts[i + 1];
          for (let k = 0; k <= 10; k++) {
            const u = k / 10;
            const p3 = a2.clone().lerp(b3, u);
            p3.y -= Math.sin(u * Math.PI) * (sag * (0.7 + Math.random() * 0.15));
            full.push(p3);
          }
        }
        const cur = new THREE.CatmullRomCurve3(full);
        const tube = new THREE.Mesh(track(new THREE.TubeGeometry(cur, 40, 0.014, 6, false)), wireM);
        scene.add(tube);
      };
      // جيران صفّنا (بلا عبور شارع)
      genWire([genTop, new THREE.Vector3(-19.5, 5.6, 1.0)], 1.1);
      genWire([genTop, new THREE.Vector3(-16, 5.4, 0.8)], 1.4);
      genWire([genTop, new THREE.Vector3(-30.5, 3.6, 0.6)], 0.9);
      // جيران كَبال الشارع (عبر الشيلمانات)
      genWire([genTop, shilmanTops[0], new THREE.Vector3(-22.5, 5.2, ACROSS_Z + 5.2)], 0.7);
      genWire([genTop, shilmanTops[0], new THREE.Vector3(-20, 5.0, ACROSS_Z + 5.0)], 0.85);
      genWire([genTop, shilmanTops[1], new THREE.Vector3(-8.5, 5.0, ACROSS_Z + 5.2)], 0.75);
      genWire([genTop, shilmanTops[1], new THREE.Vector3(5.5, 5.6, ACROSS_Z + 5.2)], 0.9);
      genWire([genTop, shilmanTops[1], new THREE.Vector3(19, 5.2, ACROSS_Z + 5.2)], 1.0);
      // فوضى قصيرة حول العمود (لفّات متدلية)
      for (let i = 0; i < 3; i++) {
        const a2 = genTop.clone().add(new THREE.Vector3(-0.3 + i * 0.3, -0.2 - i * 0.25, 0.1));
        const b3 = a2.clone().add(new THREE.Vector3(0.7, -0.9 - Math.random() * 0.5, 0.3));
        genWire([a2, b3], 0.5);
      }
      // دخان المولدة: particles شفافة 15% تصعد وتنحرف ويا الريح (+x) — جدول الحركة
      const smokeTexS = cloudTex(true);
      for (let i = 0; i < 9; i++) {
        const m2 = track(new THREE.SpriteMaterial({ map: smokeTexS, transparent: true, opacity: 0, color: 0x8a8f94, fog: true, depthWrite: false }));
        const sp2 = new THREE.Sprite(m2);
        sp2.position.set(GEN_X + 0.85, 2.6, GEN_Z - 0.3); scene.add(sp2);
        smoke.push({ sp: sp2, m: m2, age: (i / 9) * 4 });
      }
      // إغلاق نهايات الشوارع بصرياً (قاعدة الحافة — قسم 2)
      mkPalm(-36.5, WALL_Z - SIDEWALK - 1, 4.5, 1.05);
      mkPalm(37, WALL_Z - SIDEWALK - ROAD_W - 1.2, 4.3, 0.95);
      } // نهاية !ENG_MODE (المولدة والشيلمانات وأسلاكها ودخانها)
      mkPalm(-HW / 2 + 1.2, -HD / 2 - 1.4, 3.6, 0.85); // نخلة بحديقتنا

      // ================= ممر مشاة (زيبرا) + شارع متقاطع + تفاصيل =================
      const zebraM = M({ color: 0xe6e6de, roughness: 0.85 });
      for (let i = 0; i < 6; i++) {
        const worn = i === 2; // شريط ممسوح ثلثه من الاستخدام (عيب مقصود #9)
        const zb = new THREE.Mesh(B(0.55, 0.014, worn ? (ROAD_W - 1) * 0.62 : ROAD_W - 1), worn ? M({ color: 0xd0cfc4, roughness: 0.9 }) : zebraM);
        zb.position.set(gateX - 1.4 + i * 0.95, 0.014, WALL_Z - SIDEWALK - ROAD_W / 2 - 0.1 + (worn ? 1.2 : 0));
        scene.add(zb);
      }
      // شارع متقاطع يسار يكسر الرتابة
      if (!ENG_MODE) {
        const crossRoad = new THREE.Mesh(track(new THREE.PlaneGeometry(ROAD_W - 1, 40)), road.material);
        crossRoad.rotation.x = -Math.PI / 2; crossRoad.position.set(-27.5, 0.003, WALL_Z - SIDEWALK - ROAD_W - 18);
        crossRoad.receiveShadow = true; scene.add(crossRoad);
      }
      // حاوية نفايات خضراء يمّ البوابة + مصطبة (بالعرض الهندسي: بلا حاويات — نظافة عرض)
      if (!ENG_MODE) {
        const bin = new THREE.Mesh(B(0.7, 0.85, 0.55), M({ color: 0x2e6b34, roughness: 0.7 }));
        bin.position.set(gateX + 2.4, 0.45, WALL_Z - 0.8); bin.castShadow = true; scene.add(bin);
      }
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPerf ? 1.25 : 2));
      renderer.setSize(W(), H());
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.75;
      mount.appendChild(renderer.domElement);
      // بيئة انعكاسات مؤقتة (حتى تتحمّل سماء الـHDRI فتستلم هي الإضاءة البيئية)
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.5;
      disp.push({ dispose: () => { envRT.dispose(); pmrem.dispose(); } });

      // ===== تحميل سماوات HDRI: العصر أولاً (يظهر فوراً) والبقية تدريجياً بالخلفية =====
      (async () => {
        try {
          const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
          const rgbe = new RGBELoader().setDataType(THREE.FloatType);
          const hdrBase = new URL('showcase/hdr/', document.baseURI).href;
          const loadHdrTex = (f) => new Promise((res, rej) => rgbe.load(hdrBase + f, (t2) => { t2.mapping = THREE.EquirectangularReflectionMapping; res(track(t2)); }, undefined, rej));
          const loadSlot = async (slot) => {
            // الخلفية JPG عادي (33MB GPU بدل 134MB float — آيفون كان يكرش من الـ4K HDR)
            // والإضاءة/كشف الشمس/لون الأفق من نسخة 1K HDR الصغيرة فقط
            const bgUrl = hdrBase + (lowPerf ? 'sky_2k.jpg' : 'sky_4k.jpg');
            const jpgL = new THREE.TextureLoader();
            const [bg, env1k] = await Promise.all([
              new Promise((res, rej) => jpgL.load(bgUrl, (t2) => {
                t2.mapping = THREE.EquirectangularReflectionMapping;
                t2.colorSpace = THREE.SRGBColorSpace; t2.anisotropy = 4;
                res(track(t2));
              }, undefined, rej)),
              loadHdrTex(slot.file + '_1k.hdr'),
            ]);
            // كشف الشمس: أسطع بكسل بنسخة 1K → أزيموثها وارتفاعها + لون الأفق للضباب
            const img = env1k.image, data = img.data, W2 = img.width, H2 = img.height;
            let best = -1, bu = 0.5, bv = 0.3;
            for (let y2 = 0; y2 < Math.floor(H2 * 0.55); y2 += 2) for (let x2 = 0; x2 < W2; x2 += 2) {
              const k2 = (y2 * W2 + x2) * 4;
              const L2 = data[k2] + data[k2 + 1] + data[k2 + 2];
              if (L2 > best) { best = L2; bu = x2 / W2; bv = y2 / H2; }
            }
            const azTex = (bu - 0.5) * Math.PI * 2;      // أزيموث الشمس داخل الصورة
            const elevTex = (0.5 - bv) * Math.PI;          // ارتفاعها
            // لون الأفق (متوسط صف فوق خط الأفق بقليل) → لون الضباب بالضبط
            const rowY = Math.floor(H2 * 0.47); let cr = 0, cg = 0, cb = 0, n2 = 0;
            for (let x2 = 0; x2 < W2; x2 += 6) { const k2 = (rowY * W2 + x2) * 4; cr += data[k2]; cg += data[k2 + 1]; cb += data[k2 + 2]; n2++; }
            const tone = (v2) => Math.min(1, Math.pow((v2 / n2) / (1 + v2 / n2), 1 / 2.2));
            const fogC2 = new THREE.Color(tone(cr), tone(cg), tone(cb));
            // ليلاً: توهج أفق الصورة يطلع فاتح بعد الرفع الغامي — نسحبه صوب النيلي (لوحة الليل)
            if (slot.noSun) fogC2.lerp(new THREE.Color(0x1b2a4a), 0.65);
            // بالعرض الهندسي: نسحب الضباب صوب رملي دافئ — يلطف حدة الحزام الأبيض بالأفق
            if (ENG_MODE) fogC2.lerp(new THREE.Color(0xd9cdb4), 0.45);
            // المحاذاة: نثبّت أزيموث شمس المشهد على قوس الوقت بمنتصف الفترة، وندوّر الـHDRI ليطابق
            const midT = (slot.from + Math.min(slot.to, 24)) / 2;
            const dA = ((midT - 6) / 12) * Math.PI;
            const targetAz = Math.atan2(-0.55, Math.cos(dA));
            const rotY2 = targetAz - azTex;
            const sunElev = slot.noSun ? THREE.MathUtils.degToRad(slot.elevFallback) : Math.max(THREE.MathUtils.degToRad(4), Math.min(elevTex, THREE.MathUtils.degToRad(80)));
            const sd = new THREE.Vector3(Math.cos(targetAz) * Math.cos(sunElev), Math.sin(sunElev), Math.sin(targetAz) * Math.cos(sunElev));
            // قص ذروة الشمس تحت سقف HalfFloat (65504) — وإلا PMREM يمتلئ Inf ويبيّض المشهد كله
            // (شمس qwantani_noon ذروتها ~107k ففاضت؛ أي HDRI مستقبلي صار محمياً)
            for (let k2 = 0; k2 < data.length; k2++) if (data[k2] > 30000) data[k2] = 30000;
            const envRT2 = pmrem.fromEquirectangular(env1k); disp.push(envRT2);
            env1k.dispose(); // نسخة CPU العائمة تنحذف — خلصنا من قراءة بياناتها
            hdriSky.slots[slot.id] = { bg, envRT: envRT2, fogC: fogC2, sunDir: sd, rotY: rotY2, expo: slot.expo };
          };
          await loadSlot(SKY_SLOTS[0]); // السماء الثابتة الوحيدة
          hdriSky.ready = true;
        } catch { /* أوفلاين قبل أول تخزين — تبقى سماء لونية من اللوحة */ }
      })();

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
      // drift سكون بطيء جداً 2-3°/دقيقة (جدول الحركة) — يتوقف عند التفاعل ويرجع بعد 5 ثوان خمول
      controls.autoRotate = true; controls.autoRotateSpeed = 0.006;
      controls.enableZoom = true; // العجلة = زوم مثل قبل (الجولة صارت زر تشغيل تلقائي)
      controls.minDistance = 6; controls.maxDistance = 55;
      controls.minDistance = 2.5; controls.maxDistance = 70;
      controls.minPolarAngle = 0.15; controls.maxPolarAngle = Math.PI / 2 - 0.02;
      controls.target.set(0, 3.4, -1);
      let lastUserAct = 0;
      controls.addEventListener('start', () => { controls.autoRotate = false; lastUserAct = performance.now(); });
      controls.update();

      // ================= رحلة السكرول السينمائية (القسم 17) =================
      // السكرول = تقدم الرحلة 0..1 بكيفريمات الجدول، ويا damping ~0.08 وeasing
      const journey = journeyRef.current;
      const JKEYS = [
        { p: 0.00, pos: [9, 25, -38], look: [-3, 4, 0] },        // establishing مرتفعة 25م
        { p: 0.12, pos: [6, 8, -30], look: [0, 4, -2] },          // نزول قوسي
        { p: 0.18, pos: [-17, 1.7, -16.5], look: [-10, 3.2, -8] }, // مستوى النظر (المسار الأصلي — أنعم)
        { p: 0.25, pos: [-4, 1.7, -15.5], look: [0, 3.5, -4] },   // نمشي بالشارع نحو البيت
        { p: 0.32, pos: [-12, 3, -6], look: [0, 3.5, 0] },        // بداية الدوران النصفي
        { p: 0.40, pos: [-9, 5.5, 8], look: [0, 3.5, 0] },        // نص دورة حول البيت
        { p: 0.48, pos: [-3, 10, 9], look: [0, 5.8, 0] },         // صعود حلزوني
        { p: 0.58, pos: [3, 15, -8], look: [1, 6.4, -2] },        // top-down مائل — الألواح تملأ الكادر
        { p: 0.78, pos: [5, 16.5, -11], look: [1, 6.4, -2] },     // مسح الشمس صبح→عصر
        { p: 0.92, pos: [9, 25, -38], look: [-3, 4, 0] },         // رجوع للقطة الافتتاح
        { p: 1.00, pos: [9, 25, -38], look: [-3, 4, 0] },
      ];
      const JSTAGES = [
        { a: 0.00, b: 0.10, t: 'منظومتك الشمسية على بيتك', s: 'عرض هندسي لبيت مستقل بالطاقة من بلاد أوتو' },
        { a: 0.13, b: 0.24, t: 'بيتك بلا أسلاك ولا مولدة', s: 'لا اشتراك أمبيرات ولا فاتورة كل شهر' },
        { a: 0.27, b: 0.40, t: 'الحل: استقلال كهربائي', s: 'منظومة متكاملة مصممة على بيتك بالضبط' },
        { a: 0.43, b: 0.57, t: 'المنظومة على السطح', s: 'الألواح والانفرترات والبطاريات — كل شي مرئي وقابل للعد' },
        { a: 0.60, b: 0.77, t: 'إمسك الشمس بإيدك', s: 'استمر بالسكرول… الشمس تمشي من الصبح للعصر والظلال وياها' },
        { a: 0.80, b: 1.00, t: 'بلاد أوتو — استقلالك الكهربائي', s: 'طاقة نظيفة تشتغل طول النهار وتخزن لليل' },
      ];
      let jStageIdx = -1;
      const easeC = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
      // السكرول رجع زوم طبيعي (طلب المستخدم) — الجولة صارت زر تشغيل تلقائي،
      // وأي ضغطة على المشهد توقف الجولة وترجّع التحكم الحر
      const onPD = () => { if (journey.auto) { journey.auto = false; journey.target = 0; } lastUserAct = performance.now(); };
      renderer.domElement.addEventListener('pointerdown', onPD);
      disp.push({ dispose: () => { renderer.domElement.removeEventListener('pointerdown', onPD); } });
      const jv = new THREE.Vector3(), jl = new THREE.Vector3();

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
          // الموبايل (lowPerf) ياخذ نسخ 1K من كل الخامات — يوفر ~330MB رام GPU (سبب كراش آيفون)
          const loadTex = (f, srgb) => new Promise((res, rej) => texL.load(baseURL + 'tex/' + (lowPerf ? f.replace('.jpg', '_1k.jpg') : f), (t2) => {
            t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.anisotropy = lowPerf ? 4 : 16;
            if (srgb) t2.colorSpace = THREE.SRGBColorSpace;
            res(track(t2));
          }, undefined, rej));
          const loadGlb = (p) => new Promise((res, rej) => glbL.load(baseURL + 'glb/' + p, res, undefined, rej));

          // خامات PBR حقيقية (diff+normal+arm) — الـarm: R=AO/G=خشونة/B=معدنية
          const applyPBR = async (mats, name, rx, ry2, extra = {}) => {
            const { keepColor, ...rest } = extra;
            const [d2, n2, a2] = await Promise.all([
              loadTex(name + '_diff.jpg', true), loadTex(name + '_nor.jpg'), loadTex(name + '_arm.jpg').catch(() => null),
            ]);
            (Array.isArray(mats) ? mats : [mats]).forEach((mm) => {
              const c = (t3) => { const cl = t3.clone(); track(cl); cl.repeat.set(rx, ry2); cl.needsUpdate = true; return cl; };
              mm.map = c(d2); mm.normalMap = c(n2);
              if (a2) { mm.roughnessMap = c(a2); mm.metalnessMap = mm.roughnessMap; mm.roughness = 1; mm.metalness = 1; }
              // keepColor: تينت اللوحة الرملية يبقى يضرب بخامة الجص (بيوت الجيران)
              if (!keepColor) mm.color = new THREE.Color(0xffffff);
              else mm.color.lerp(new THREE.Color(0xffffff), 0.10); // تفتيح أقل — تباين الجص يبقى حي
              Object.assign(mm, rest); mm.needsUpdate = true;
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
            // أرضية حصى رملي ناعم مرتب (sandy_gravel_02) — مو صحراء متشققة
            applyPBR(groundAll.material, 'ground', 46, 46, { color: new THREE.Color(0xd8d2c2) }),
            // ثيل الحديقة بخامة العشب الحقيقية بتينت هادئ (بدل الأخضر الفاقع)
            applyPBR(lawn.material, 'grass', 5, 3, { color: new THREE.Color(0x9db06a) }),
            applyPBR(apronM, 'pavers', 9, 9),
            // بيوت الجيران: خامة جص حقيقية مع الاحتفاظ بتينت اللوحة الرملية لكل بيت
            applyPBR(villaBodyMats, 'wall', 3, 2, { keepColor: true }),
            applyPBR(stoneDarkM, 'wall', 2.5, 1.5, { keepColor: true }),
          ]);
          // فتح فوري: المشهد الأساسي (بيت + سماء + أرض بخاماتها) جاهز — نرفع شاشة
          // التحميل هسه والموديلات (شجرة/نباتات/بوابة) تكتمل بالخلفية بصمت وتنخزن بالكاش
          if (!disposed) { setLoadPct(100); setLoadingAssets(false); }

          // 3) نباتات حقيقية: خصلات عشب + شجيرات + شجرة فوتوغرامترية
          const [gGrass, gShrub1, gShrub2, gTree] = await Promise.all([
            loadGlb('grass_medium_01/grass_medium_01_1k.gltf'),
            loadGlb('shrub_02/shrub_02_2k.gltf'),
            loadGlb('shrub_04/shrub_04_2k.gltf'),
            loadGlb('island_tree_02/island_tree_02_1k.gltf'),
          ]);
          if (disposed) return;
          // عشب: InstancedMesh لكل ميش من الموديل على مواقع الحديقة
          // صفوف حواف منتظمة (tuftSpots) بدل النثر العشوائي + تفتيح المادة (كانت تطلع سودة)
          const spots = lowPerf ? tuftSpots.filter((_, i2) => i2 % 2 === 0) : tuftSpots;
          gGrass.scene.updateMatrixWorld(true);
          gGrass.scene.traverse((o) => {
            if (!o.isMesh) return;
            o.material = o.material.clone(); track(o.material); o.material.color.multiplyScalar(1.35);
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
          // تفتيح النباتات الفوتوغرامترية كلها — تطلع سوداء كئيبة تحت إضاءتنا
          [gShrub1, gShrub2].forEach((gm2) => gm2?.scene.traverse((o) => {
            if (o.isMesh && !o.userData.brightened) { o.userData.brightened = 1; o.material.color.multiplyScalar(1.25); o.material.envMapIntensity = 0.8; }
          }));
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
          // الشجرة الحقيقية: بالحديقة + كَبال الشارع — بتفتيح موادها (كانت سوداء كئيبة)
          gTree.scene.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true; o.receiveShadow = true;
              if (!o.userData.brightened) { o.userData.brightened = 1; o.material.color.multiplyScalar(1.28); o.material.envMapIntensity = 0.8; }
            }
          });
          placeClone(gTree, -HW / 2 - 2.6, -HD / 2 - 2.2, 0.85, 0.4);
          placeClone(gTree, 14, WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 3, 1.0, 2.1);
          // شجرة حقيقية محل السدرة الإجرائية (الكرة الكرتونية اللي أشّر عليها المستخدم)
          placeClone(gTree, -21.5, 2.5, 1.05, 1.9);
          mkAO(-21.5, 2.5, 4.4, 4.4, 0.5);
          procTrees.forEach((t3) => { t3.visible = false; });

          // ================= 4) موديلات فوتوريالستك (Poly Haven CC0) =================
          // كل موديل يفشل تحميله ينسكت عنه — يبقى بديله الإجرائي شغالاً (النقطة 13)
          const loadOpt = (p) => loadGlb(p).then((g2) => {
            g2.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
            return g2;
          }).catch(() => null);
          const bboxOf = (obj) => new THREE.Box3().setFromObject(obj);
          // بالعرض الهندسي: الموديلات المدنية غير المعروضة لا تُنزَّل ولا تُفك أصلاً (رام + باندويث)
          const loadCity = (p) => (ENG_MODE ? Promise.resolve(null) : loadOpt(p));
          const [gPole, gLampGlb, gCarGlb, gAC, gTrash, gTyre, gShutter, gGateGlb,
            gPlanter, gPot, gShrubA, gShrubC, gNettle, gWeed, gBermuda, gBarrier, gFenceCl] = await Promise.all([
            loadCity('modular_electricity_poles/modular_electricity_poles_1k.gltf'),
            loadOpt('street_lamp_01/street_lamp_01_1k.gltf'),
            loadCity('covered_car/covered_car_1k.gltf'),
            loadCity('exterior_aircon_unit/exterior_aircon_unit_1k.gltf'),
            loadCity('metal_trash_can/metal_trash_can_1k.gltf'),
            loadCity('old_tyre/old_tyre_1k.gltf'),
            loadCity('rollershutter_door/rollershutter_door_1k.gltf'),
            loadOpt('large_iron_gate/large_iron_gate_1k.gltf'),
            loadOpt('planter_box_01/planter_box_01_1k.gltf'),
            (lowPerf ? Promise.resolve(null) : loadOpt('potted_plant_01/potted_plant_01_1k.gltf')),
            loadOpt('shrub_01/shrub_01_1k.gltf'),
            loadOpt('shrub_03/shrub_03_1k.gltf'),
            loadOpt('nettle_plant/nettle_plant_1k.gltf'),
            loadOpt('weed_plant_02/weed_plant_02_1k.gltf'),
            loadOpt('grass_bermuda_01/grass_bermuda_01_1k.gltf'),
            loadCity('concrete_road_barrier/concrete_road_barrier_1k.gltf'),
            loadCity('modular_chainlink_fence/modular_chainlink_fence_1k.gltf'),
          ]);
          if (disposed) return;
          const world = (src, x, z, sc = 1, ry = 0) => {
            const cl = src.scene.clone(true);
            cl.position.set(x, 0, z); cl.rotation.y = ry; cl.scale.setScalar(sc);
            scene.add(cl); return cl;
          };
          // أعمدة كهرباء حقيقية (محولات وعوازل) مكان الأسطوانات — الأسلاك بارتفاعها تبقى
          if (gPole && !ENG_MODE) {
            procPoles.forEach((p2) => { p2.visible = false; });
            polesX.forEach((px, i) => { const c2 = world(gPole, px, poleZ, 0.72, (i % 2 ? 0.06 : -0.04)); c2.rotation.z = (i % 2 ? 0.012 : -0.015); });
          }
          // أعمدة إنارة حديد حقيقية + گلوب متوهج ليلاً بنفس نظام الإضاءة
          if (gLampGlb) {
            procLamps.forEach((l2) => { l2.visible = false; });
            const lh = bboxOf(gLampGlb.scene).max.y;
            lampSpots.forEach(([lx, lz], i) => {
              const c2 = world(gLampGlb, lx, lz, 1.12, i * 1.7);
              const bm = M({ color: 0xfff1c8, emissive: 0xffd57a, emissiveIntensity: 0.05, roughness: 0.3 }); lampGlow.push(bm);
              const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.09, 10, 10)), bm);
              bulb.position.set(lx, lh * 1.12 - 0.28, lz); scene.add(bulb);
            });
          }
          // سيارة مغطاة بتربال (فوتوغرامتري) مكان سيارات المكعبات — بتنويع لون ودوران
          // بالعرض الهندسي: سيارة السيدان المبنية بالكود هي البطلة، بلا تربال
          if (gCarGlb && !ENG_MODE) {
            procCars.forEach((c2) => { c2.visible = false; });
            const tints = [0xd9d4c8, 0xc9cdd4, 0xcfc4ae];
            carSpots.forEach(([cx2, cz2, cry], i) => {
              const c2 = world(gCarGlb, cx2, cz2, 0.98 + i * 0.02, cry + (i === 2 ? Math.PI : 0));
              c2.traverse((o) => {
                if (o.isMesh) { o.material = o.material.clone(); track(o.material); o.material.color.multiply(new THREE.Color(tints[i % 3])); }
              });
              mkAO(cx2, cz2, 2.7, 5.3, 0.85, cry);
            });
          }
          // سبلتات خارجية حقيقية على واجهات الجيران (أيقونة عراقية) + بيت البطل
          if (gAC) {
            villaGroups.forEach((v2, i) => {
              if (v2.arch === 2 || i % 3 === 2) return;
              const c2 = gAC.scene.clone(true);
              c2.position.set(v2.mir * (v2.w * 0.34), 2.35 + (i % 2) * 1.6, v2.d / 2 + 0.2);
              c2.scale.setScalar(0.9); v2.g.add(c2);
            });
            // (سبلت بيت البطل انحذف — جدران البيت تتشفف بالاقتراب فكان يبين «طايراً» بالهوا)
          }
          // ستارة معدنية (رول شتر) حقيقية على فتحة بقالة النور
          if (gShutter) {
            const v4 = villaGroups.find((v2) => v2.arch === 4);
            if (v4) {
              const sw = v4.w * 0.6 - 0.6;
              const c2 = gShutter.scene.clone(true);
              c2.scale.set(sw / 1.08, 1.85 / 2.4, 1);
              c2.position.set(v4.mir * v4.w * 0.15, 0, v4.d / 2 + 0.3); v4.g.add(c2);
            }
          }
          // بوابة حديد مشغول حقيقية لبيت البطل مكان القضبان
          if (gGateGlb) {
            procGate.forEach((p2) => { p2.visible = false; });
            const c2 = gGateGlb.scene.clone(true);
            c2.scale.set(gateW / 2.95, (wallH + 0.35) / 2.93, 1);
            c2.position.set(gateX, 0, WALL_Z); scene.add(c2);
          }
          // فوضى الشارع الحية: حاويات، تاير مسنود، حواجز كونكريت بنهاية الفرعي
          if (gTrash && !ENG_MODE) {
            const v4 = villaGroups.find((v2) => v2.arch === 4);
            if (v4) { const c2 = gTrash.scene.clone(true); c2.position.set(v4.mir * (v4.w * 0.15 + v4.w * 0.3 + 1.3), 0, v4.d / 2 + 1.1); c2.rotation.y = 0.7; v4.g.add(c2); }
            const t2 = world(gTrash, gateX + 3.1, WALL_Z - 0.75, 1, 2.3);
            const t3 = world(gTrash, gateX + 3.75, WALL_Z - 0.9, 1, -0.4); t3.rotation.z = 0.06;
            mkAO(gateX + 3.4, WALL_Z - 0.82, 2.1, 1.4, 0.8);
          }
          if (gTyre && !ENG_MODE) { const c2 = world(gTyre, -HW / 2 - 1.1, WALL_Z - 0.42, 1, 0.5); c2.position.y = 0.05; c2.rotation.x = -0.28; }
          if (gBarrier && !ENG_MODE) {
            world(gBarrier, 26.4, WALL_Z - SIDEWALK - ROAD_W - 33, 1, 0.12);
            world(gBarrier, 28.3, WALL_Z - SIDEWALK - ROAD_W - 33.4, 1, -0.2);
          }
          // سياج شبك حول المولدة (محوطة مثل الواقع) — بميلان خفيف مقصود
          if (gFenceCl && !ENG_MODE) {
            const f1 = world(gFenceCl, GEN_X - 0.4, GEN_Z - 1.6, 0.62, 0); f1.rotation.z = 0.02;
            const f2 = world(gFenceCl, GEN_X - 2.15, GEN_Z - 0.3, 0.62, Math.PI / 2); f2.rotation.z = -0.015;
          }
          // أحواض ومزروعات قنائن عند مدخل البيت وأمام البقالة
          if (gPlanter) { world(gPlanter, gateX - 2.2, WALL_Z - 0.55, 1.1, 0.1); world(gPlanter, gateX + 2.2, WALL_Z - 0.55, 1.1, -0.08); }
          if (gPot) {
            world(gPot, gateX - 1.55, WALL_Z - 0.5, 1.0, 0.6);
            const v4 = villaGroups.find((v2) => v2.arch === 4);
            if (v4) { const c2 = gPot.scene.clone(true); c2.position.set(v4.mir * (v4.w * 0.15 - v4.w * 0.3 - 1.4), 0, v4.d / 2 + 0.7); v4.g.add(c2); }
          }
          // ================= 5) تكثيف الخضرة (روح الرفرنس) =================
          // أشجار إضافية على رصيف الجهة المقابلة وزوايا الحي — نفس الشجرة الفوتوغرامترية بمقاسات أكبر
          // مظلة خضراء وسطية بين بيوت العمق (z موجب = خلف بيت البطل بالكادر) — نغل الرفرنس
          // الجيومتري مشترك بين الاستنساخات فكلفتها رسمات إضافية فقط — تبقى حتى على الموبايل
          // تنويع الأشجار: نفس الموديل الفوتوغرامتري بثلاث درجات خضرة + مقاسات مختلفة
          // (تينت مادة الأوراق فقط — الجيومتري يظل مشتركاً)
          const treeTints = [null, 0xdfe8b8, 0xa8d49a, null, 0xcbe0a0, 0x9cc890, null, 0xd4dea8];
          const tintLeaves = (cl, tint) => {
            if (!tint) return;
            cl.traverse((o) => {
              if (o.isMesh && /leaf|leaves|branch/i.test(o.material?.name || '')) {
                o.material = o.material.clone(); track(o.material);
                o.material.color.multiply(new THREE.Color(tint));
              }
            });
          };
          [[-28, 14, 2.0, 0.8], [16, 19, 1.6, 2.9], [-6, 30, 2.25, 4.4], [30, 33, 1.35, 1.7],
           [46, 16, 1.85, 3.3], [-44, 28, 2.1, 5.6], [8, 24, 1.1, 0.4], [-27, -10.5, 1.45, 2.4]]
            .slice(0, lowPerf ? 4 : 8).forEach(([tx, tz, ts, tr], ti) => {
            const cl = placeClone(gTree, tx, tz, ts, tr);
            tintLeaves(cl, treeTints[ti % treeTints.length]);
            mkAO(tx, tz, 4.2 * ts, 4.2 * ts, 0.45);
          });
          if (!lowPerf) {
            placeClone(gTree, -20, WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 2.6, 1.55, 1.2);
            placeClone(gTree, 0.5, WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 3.2, 1.85, 3.6);
            placeClone(gTree, 27, WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 2.4, 1.4, 5.1);
          }
          // شجيرات منتشرة + قنّب حواف الجدران (عيب مقصود: نمو برّي عند الأساسات)
          const scatter = (src, spots, sMin, sMax) => {
            if (!src) return;
            spots.forEach(([sx2, sz2], i) => {
              const c2 = src.scene.clone(true);
              c2.position.set(sx2, 0, sz2); c2.rotation.y = i * 1.31;
              c2.scale.setScalar(sMin + ((i * 0.37) % 1) * (sMax - sMin)); scene.add(c2);
            });
          };
          if (gShrubA) gShrubA.scene.traverse((o) => { if (o.isMesh && !o.userData.brightened) { o.userData.brightened = 1; o.material.color.multiplyScalar(1.25); } });
          // شجيرات منسقة على حافة الساحة المبلطة (مو داخل الثيل)
          scatter(gShrubA, [[-14.5, -6], [14.2, -8], [24, WALL_Z - SIDEWALK - ROAD_W - SIDEWALK - 1.8]], 0.9, 1.3);
          scatter(gShrubC, [[gateX - 3.1, WALL_Z - 0.5], [-HW / 2 + 0.8, WALL_Z - 0.6], [12, WALL_Z - 0.7], [-16.5, WALL_Z - 0.6]], 1.6, 2.4);
          scatter(gNettle, [[gateX + 4.3, WALL_Z - 0.28], [-9.5, WALL_Z - 0.3], [6.2, WALL_Z - 0.32], [-19, WALL_Z - 0.3], [20.5, WALL_Z - 0.34], [GEN_X + 2.6, GEN_Z - 0.4]], 2.2, 3.4);
          scatter(gWeed, [[gateX - 4.6, WALL_Z - 0.3], [2.4, WALL_Z - 0.33], [-13.5, WALL_Z - 0.3], [16.8, WALL_Z - 0.3], [27.2, WALL_Z - SIDEWALK - 0.4]], 1.8, 2.8);
          // ثيل برمودا: خصل كثيفة داخل حديقة البيت وأحواض الشجر (InstancedMesh)
          if (gBermuda && !lowPerf) {
            // خصل برمودا مرتبة: حواف الحوض وأحواض النخل فقط — بلا نثر عشوائي
            const tufts = [];
            for (let bx = -8; bx <= 3; bx += 0.8) tufts.push([bx, WALL_Z + 0.45]);
            [[-14, WALL_Z - 1.1], [-5, WALL_Z - 1.1], [10.5, WALL_Z - 1.1]].forEach(([bx, bz]) => {
              for (let k = 0; k < 8; k++) tufts.push([bx - 0.5 + (k % 3) * 0.45, bz - 0.4 + Math.floor(k / 3) * 0.42]);
            });
            gBermuda.scene.updateMatrixWorld(true);
            gBermuda.scene.traverse((o) => {
              if (!o.isMesh) return;
              const im = new THREE.InstancedMesh(o.geometry, o.material, tufts.length);
              const d3 = new THREE.Object3D();
              tufts.forEach(([tx, tz], i) => {
                d3.position.set(tx, 0, tz); d3.rotation.y = i * 2.399;
                d3.scale.setScalar(2.2 + ((i * 0.71) % 1) * 1.6);
                d3.updateMatrix(); im.setMatrixAt(i, d3.matrix);
              });
              im.instanceMatrix.needsUpdate = true; im.receiveShadow = true;
              scene.add(im); disp.push({ dispose: () => { im.dispose?.(); } });
            });
          }
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
        hemi.intensity = P.hemiI;
        amb.intensity = P.hemiI * 0.3;
        fillL.intensity = isDay ? 0.25 : 0.06;
        sunLight.color.copy(P.sunC);
        sunLight.intensity = P.sunI;
        moonLight.position.set(-30, 32, -34); moonLight.intensity = isDay ? 0 : 0.25;

        // ===== سماء HDRI: اختيار فترة الوقت + كروس-فيد + محاذاة الشمس والضباب =====
        const slot = slotAt(t);
        const S2 = hdriSky.ready ? (hdriSky.slots[slot.id] || hdriSky.slots.asr) : null;
        if (S2) {
          if (hdriSky.cur !== S2) {
            // الجديد يدخل على الكرة B ويتصاعد فوق القديمة (كروس-فيد 1.2 ثانية)
            skyB.material.map = S2.bg; skyB.material.needsUpdate = true; skyB.rotation.y = S2.rotY;
            hdriSky.fade = { u: 0 };
            hdriSky.cur = S2;
            scene.environment = S2.envRT.texture;
            if (scene.environmentRotation) scene.environmentRotation.set(0, S2.rotY, 0);
            scene.environmentIntensity = 1.0;
          }
          if (hdriSky.fade) {
            hdriSky.fade.u = Math.min(1, hdriSky.fade.u + dt / 1.2);
            skyB.material.opacity = hdriSky.fade.u;
            if (hdriSky.fade.u >= 1) {
              skyA.material.map = skyB.material.map; skyA.rotation.y = skyB.rotation.y;
              skyA.material.opacity = 1; skyA.material.needsUpdate = true;
              skyB.material.opacity = 0; hdriSky.fade = null;
            }
          } else skyA.material.opacity = 1;
          scene.background = null;
          // الشمس تتبع قوس السلايدر (صبح→عصر) — السماء ثابتة والإضاءة هي اللي تتحرك
          sunDir.set(Math.cos(dayAngle), Math.max(sinE, 0.08), -0.55).normalize();
          sunLight.position.copy(sunDir).multiplyScalar(R);
          // الضباب بلون أفق الـHDRI بالضبط — الأرض تذوب بالسماء بلا خط فاصل
          scene.fog.color.lerp(S2.fogC, Math.min(1, dt * 2.5));
          renderer.toneMappingExposure += (S2.expo - renderer.toneMappingExposure) * Math.min(1, dt * 2.5);
        } else {
          // احتياط ما قبل التحميل/الأوفلاين: لون مسطح من لوحة الوقت
          if (!scene.background || !scene.background.isColor) scene.background = new THREE.Color();
          scene.background.copy(P.mid);
          scene.fog.color.copy(P.fogC);
          renderer.toneMappingExposure = P.expo;
          sunDir.set(Math.cos(dayAngle), Math.max(sinE, -0.18), -0.55).normalize();
          sunLight.position.copy(sunDir).multiplyScalar(R);
        }

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

        // غسيل يتموج بالنسيم — دورة/3 ثوان، 5-10 درجات (جدول الحركة 16)
        laundrySway.forEach((cl, i) => { cl.rotation.x = Math.sin(et * 2.1 + i * 1.7) * 0.13; });

        // تيجان النخيل والسدر تتنفس بالنسيم الموحّد (+x) — جدول الحركة 16
        for (const wc of windCrowns) { wc.grp.rotation.z = Math.sin(et * wc.speed + wc.phase) * wc.amp; }

        // سرب الحمام: مسار إهليلجي دورة/30ث، ارتفاع يتنفس ±3م، رفة جناح
        for (const pg2 of pigeons) {
          const a2 = et * PIG_CYC + pg2.off;
          const px3 = Math.cos(a2) * 26, pz3 = -14 + Math.sin(a2) * 16;
          const py3 = 26 + Math.sin(et * 0.5 + pg2.off) * 3;
          pg2.g.position.set(px3, py3, pz3);
          pg2.g.rotation.y = -a2 - Math.PI / 2;
          const fl = Math.sin(et * 8 + pg2.off * 3) * 0.55;
          pg2.wL.rotation.z = fl; pg2.wR.rotation.z = -fl;
        }
        // بقعة الماي تعكس لون سماء الوقت الحالي
        puddleM.color.copy(P.mid);

        // دخان المولدة: يصعد ببطء، ينحرف ويا الريح (+x)، يتلاشى خلال 4 ثوان (شفافية قصوى 15%)
        for (const sm of smoke) {
          sm.age += dt; if (sm.age > 4) sm.age = 0;
          const u = sm.age / 4;
          sm.sp.position.set(GEN_X + 0.85 + u * 2.2 + Math.sin(et + sm.age) * 0.2, 2.6 + u * 3.2, GEN_Z - 0.3);
          const s3 = 0.5 + u * 2.2; sm.sp.scale.set(s3, s3 * 0.8, 1);
          sm.m.opacity = 0.15 * Math.sin(u * Math.PI);
        }

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
        // المغرب سماؤه ساطعة — البلوم القوي للّيل الحقيقي فقط وإلا تحترق سماء الغروب
        const nightGlow = !isDay && slot.id === 'night';
        bloom.strength = nightGlow ? 0.4 : 0.08;
        bloom.threshold = nightGlow ? 0.88 : 1.15;

        // ===== رحلة السكرول: damping + كاميرا الكيفريمات + ربط الوقت (58-78%) =====
        // الجولة التلقائية: تتقدم بريتم ثابت (~40 ثانية للجولة كاملة) وتنتهي برجوع ناعم
        if (journey.auto) {
          journey.target = Math.min(1, journey.target + dt / 40);
          if (journey.target >= 1 && journey.t > 0.985) { journey.auto = false; journey.target = 0; }
        }
        journey.t += (journey.target - journey.t) * Math.min(1, dt * 5);
        const jActive = journey.t > 0.004 || journey.target > 0.004;
        if (jActive) {
          controls.enabled = false; controls.autoRotate = false;
          let ki = 0; while (ki < JKEYS.length - 2 && JKEYS[ki + 1].p < journey.t) ki++;
          const KA = JKEYS[ki], KB = JKEYS[ki + 1];
          const ku = easeC(Math.max(0, Math.min(1, (journey.t - KA.p) / (KB.p - KA.p || 1))));
          jv.set(KA.pos[0], KA.pos[1], KA.pos[2]).lerp(jl.set(KB.pos[0], KB.pos[1], KB.pos[2]), ku);
          camera.position.copy(jv);
          jv.set(KA.look[0], KA.look[1], KA.look[2]).lerp(jl.set(KB.look[0], KB.look[1], KB.look[2]), ku);
          camera.lookAt(jv);
          // الوقت مربوط خطياً بمقطع 58-78% (المستخدم «يدير الشمس» بالسكرول)
          if (journey.t >= 0.58) {
            const tu = Math.min(1, (journey.t - 0.58) / 0.20);
            timeRef.current = 9.0 + tu * 7.5; // مسح الشمس: 9 صبحاً ← 4:30 عصراً (السماء ثابتة والظل يمشي)
            if (clockRef.current) clockRef.current.textContent = '🕐 ' + fmtTime(timeRef.current);
            if (sliderRef.current) sliderRef.current.value = String(timeRef.current);
          }
          // نصوص المراحل + زر إعادة الجولة
          let si2 = -1, sOp = 0;
          for (let i = 0; i < JSTAGES.length; i++) {
            const st2 = JSTAGES[i];
            if (journey.t >= st2.a - 0.03 && journey.t <= st2.b + 0.03) {
              si2 = i;
              const fadeIn = Math.min(1, (journey.t - (st2.a - 0.03)) / 0.05);
              const fadeOut = Math.min(1, ((st2.b + 0.03) - journey.t) / 0.05);
              sOp = Math.max(0, Math.min(fadeIn, fadeOut));
              break;
            }
          }
          if (si2 !== jStageIdx && si2 >= 0) {
            jStageIdx = si2;
            if (jTitleRef.current) jTitleRef.current.textContent = JSTAGES[si2].t;
            if (jSubRef.current) jSubRef.current.textContent = JSTAGES[si2].s;
          }
          if (jBoxRef.current) jBoxRef.current.style.opacity = String(sOp);
          if (replayRef.current) replayRef.current.style.display = 'none';
          if (skipRef.current) skipRef.current.style.display = 'block';
        } else {
          controls.enabled = true;
          if (jBoxRef.current) jBoxRef.current.style.opacity = '0';
          if (replayRef.current) replayRef.current.style.display = 'block'; // زر «شغّل الجولة» يبين بالوضع الحر
          if (skipRef.current) skipRef.current.style.display = 'none';
          // drift السكون يرجع بعد 5 ثوان خمول
          if (!controls.autoRotate && performance.now() - lastUserAct > 5000) controls.autoRotate = true;
          controls.update();
        }
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
      {/* نصوص مراحل رحلة السكرول (القسم 17) — تُدار مباشرة من حلقة الرسم */}
      <div className="showcase-journey" ref={jBoxRef} style={{ opacity: 0 }}>
        <h2 ref={jTitleRef}>منظومتك الشمسية على بيتك</h2>
        <p ref={jSubRef}>جولة بحي بغدادي — بيت مستقل بالطاقة من بلاد أوتو</p>
      </div>
      <div className="showcase-hud">
        {chips.map((c, i) => (<div className="showcase-chip" key={i}><span className="ic">{c[0]}</span><span className="lb">{c[1]}</span><b className="vl">{c[2]}</b></div>))}
      </div>
      <div className="showcase-timebar">
        <span className="tclock" ref={clockRef}>🕐 {timeLabel}</span>
        <span className="tend">🌅</span>
        <input ref={sliderRef} type="range" min={7} max={16.5} step={0.25} defaultValue={15.5} onInput={onTime} onChange={onTime} />
        <span className="tend">☀️</span>
      </div>
      <div className="showcase-hint">🖱️ سكرول = زوم • سحب = دوران حر • زر الجولة = عرض تلقائي</div>
      <button className="showcase-skip" ref={skipRef} style={{ display: 'none' }} onClick={() => { journeyRef.current.auto = false; journeyRef.current.target = 0; }} title="إنهاء الجولة">⏭ إنهاء الجولة</button>
      <button className="showcase-replay" ref={replayRef} style={{ display: 'none' }}
        onClick={() => {
          journeyRef.current.auto = true; journeyRef.current.target = 0.01;
          timeRef.current = 15.5; setTimeLabel(fmtTime(15.5)); if (sliderRef.current) sliderRef.current.value = '15.5';
        }}>
        ▶ شغّل الجولة التعريفية
      </button>
    </div>
  );
}
