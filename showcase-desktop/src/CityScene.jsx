import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ============================================================================
// مشهد المدينة الفوتوغرامترية — نسخة سطح المكتب (جودة قصوى RTX)
// 6 مسوحات حقيقية مركبة كمدينة + بيت بطل بمنظومة شمسية حسب أرقام العرض
// المرجع: bilad-auto-env-spec.md
// ============================================================================

const A = 'assets'; // جذر الأصول (نسبي — يشتغل بالتطبيق وبالفحص)

// إزاحة كل مسح حتى مستوى شارعه يصير صفر (موضة الارتفاعات — محسوبة بالجرد)
const GROUND = { '002': -6, '003': -1, '004': -9, '006': -2, '009': -5, '010': -4 };

// تركيبة المدينة: [مسح, x, z, دوران°, إزاحة y إضافية] — من مرحلة 1 المعتمدة
const LAYOUT = [
  ['010', 0, 0, 0, 0],
  ['002', 0, -225, 0, 0],
  ['006', 10, 235, 90, 0],
  ['003', -280, -15, 0, 0],
  ['009', 240, 5, 180, 0],
  ['009', -235, -245, 270, -0.5],
  ['006', 245, -240, 180, -0.5],
  ['003', 250, 250, 90, -0.5],
  ['009', -245, 250, 90, -0.5],
  ['010', 330, -100, 90, -0.5],
  ['010', -330, 130, 270, -0.5],
  ['010', 120, 330, 180, -0.5],
  ['004', 60, -500, 0, -1],
  ['004', -500, 260, 135, -1],
  ['004', 480, 420, 225, -1],
  ['003', -30, -500, 180, -2],
  ['009', -500, -260, 60, -2],
  ['006', 520, -120, 270, -2],
  ['002', -520, 20, 90, -2],
  ['003', 40, 510, 270, -2],
  ['009', 520, 170, 300, -2],
  ['006', -350, -450, 30, -2],
  ['002', 350, -480, 150, -2],
];

// بيت البطل: بيت L بمسح 002 (محلي x 7..29, z -37..-28, سطح 11.65)
// عالمياً بعد إزاحة البلاطة (0,-6,-225):
const HERO = {
  cx: 18, cz: -257.5,               // مركز البيت عالمياً
  slab: { x0: 8.2, x1: 27.8, z0: -261.6, z1: -254.4, y: 5.95 }, // صبّة التسوية فوق السطح
  equip: { x: 26.2, z: -252.2, y: 5.75 },  // رجل الـL الشرقية — زاوية المعدات
};

// اتجاه شمس qwantani_afternoon (محسوب من أسطع بكسل): elev 41° az 36°
const SUN_DIR = new THREE.Vector3(0.4435, 0.6561, -0.6106);
// دوران السماء حتى الشمس تجي من جنوب-غرب المشهد (وظلالنا تتوافق مع المخبوزة بالمسوحات)
const SKY_ROT = THREE.MathUtils.degToRad(150);

export default function CityScene({ panels = 24, batteries = 2, inverters = 2, nightHours = 8, ampDay = 20, onClose }) {
  const mountRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [hour, setHour] = useState(15.5);
  const hourRef = useRef(15.5);
  hourRef.current = hour;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    const q = new URLSearchParams(location.search);
    const PREVIEW = q.get('q') === 'preview'; // وضع الفحص: خامات 2K وظلال أخف

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.3, 4000);
    camera.position.set(HERO.cx + 26, 20, HERO.cz - 42);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(HERO.cx, 5, HERO.cz);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 5;
    controls.maxDistance = 420;
    controls.maxPolarAngle = Math.PI * 0.495;

    // ---- الضباب الجوي (طبقات العمق + سد الأفق) ----
    const FOG_DAY = new THREE.Color(0xc8d4dc), FOG_NIGHT = new THREE.Color(0x10141f);
    scene.fog = new THREE.Fog(FOG_DAY.clone(), 300, 950);

    // ---- الإنارة: HDRI + شمس مطابقة ----
    const sun = new THREE.DirectionalLight(0xffe8c4, 3.2);
    sun.position.copy(SUN_DIR).applyAxisAngle(new THREE.Vector3(0, 1, 0), SKY_ROT).multiplyScalar(300)
      .add(new THREE.Vector3(HERO.cx, 0, HERO.cz));
    sun.target.position.set(HERO.cx, 0, HERO.cz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(PREVIEW ? 2048 : 4096, PREVIEW ? 2048 : 4096);
    // كاميرا الظل مركزة على بيت البطل ومحيطه (الجيران ياخذون ظل حقيقي هم)
    const SC = 70;
    sun.shadow.camera.left = -SC; sun.shadow.camera.right = SC;
    sun.shadow.camera.top = SC; sun.shadow.camera.bottom = -SC;
    sun.shadow.camera.near = 50; sun.shadow.camera.far = 600;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target);

    const hemi = new THREE.HemisphereLight(0xb8d4e8, 0xd8c8a8, 0.55);
    scene.add(hemi);

    // ---- أرضية تلگط الفجوات ----
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x94a071, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1500, 48).rotateX(-Math.PI / 2), groundMat);
    ground.position.y = -0.8;
    ground.receiveShadow = true;
    scene.add(ground);

    // ==================== تحميل المسوحات ====================
    const texLoader = new THREE.TextureLoader();
    async function loadScan(id) {
      const buf = await (await fetch(`${A}/models/photoscans/${id}/scan.bin`)).arrayBuffer();
      const metaLen = new DataView(buf).getUint32(0, true);
      const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, metaLen)));
      let off = (4 + metaLen + 3) & ~3;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, off, meta.verts * 3), 3)); off += meta.verts * 12;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf, off, meta.verts * 2), 2)); off += meta.verts * 8;
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf, off, meta.verts * 3), 3)); off += meta.verts * 12;
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, off, meta.tris * 3), 1));
      const tex = await texLoader.loadAsync(
        PREVIEW ? `${A}/models/photoscans/${id}/preview_2k.jpg` : `${A}/models/photoscans/${id}/diffuse_8k.png`
      );
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      // خامة المسح: باينة بضوءها المخبوز + تتظلل من شمسنا (Lambert يكفي — الفوتوغرامتري بلا لمعان)
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      return { geometry: g, material: mat };
    }

    const scanCache = {};
    const cityGroup = new THREE.Group();
    scene.add(cityGroup);
    async function placeTiles(specs) {
      for (const [id, x, z, rot, dy] of specs) {
        if (disposed) return;
        if (!scanCache[id]) scanCache[id] = await loadScan(id);
        const { geometry, material } = scanCache[id];
        const m = new THREE.Mesh(geometry, material);
        m.position.set(x, GROUND[id] + (dy || 0), z);
        m.rotation.y = (rot * Math.PI) / 180;
        // البلاطات القريبة من البطل تستقبل وترمي ظل حقيقي
        const nearHero = Math.hypot(x - HERO.cx, z - HERO.cz) < 300;
        m.receiveShadow = nearHero;
        m.castShadow = nearHero && !PREVIEW;
        cityGroup.add(m);
      }
    }

    // ==================== السماء (HDRI) ====================
    const pmrem = new THREE.PMREMGenerator(renderer);
    async function loadSky() {
      const hdr = await new RGBELoader().setDataType(THREE.HalfFloatType)
        .loadAsync(`${A}/hdri/qwantani_afternoon_4k.hdr`);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const env = pmrem.fromEquirectangular(hdr).texture;
      scene.environment = env;
      scene.background = hdr;
      scene.backgroundRotation = new THREE.Euler(0, SKY_ROT, 0);
      scene.environmentRotation = new THREE.Euler(0, SKY_ROT, 0);
    }

    // ==================== المنظومة الشمسية (مرحلة 2) ====================
    const sysGroup = new THREE.Group();
    scene.add(sysGroup);
    const shadowMesh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
    function buildSystem() {
      const { slab, equip } = HERO;
      const M = (o) => new THREE.MeshStandardMaterial(o);
      const concrete = M({ color: 0xcfcabd, roughness: 0.92 });
      const alu = M({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.85 });
      const dark = M({ color: 0x2a2e33, roughness: 0.6, metalness: 0.3 });

      // صبّة التسوية النظيفة فوق سطح المسح
      const sw = slab.x1 - slab.x0, sd = slab.z1 - slab.z0;
      const slabMesh = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(sw, 0.35, sd), concrete));
      slabMesh.position.set((slab.x0 + slab.x1) / 2, slab.y - 0.175, (slab.z0 + slab.z1) / 2);
      sysGroup.add(slabMesh);
      // حافة بارابيت خفيفة حول الصبّة
      const lip = M({ color: 0xbdb7a8, roughness: 0.95 });
      for (const [lx, lz, lw, ld] of [
        [(slab.x0 + slab.x1) / 2, slab.z0 - 0.08, sw + 0.4, 0.18],
        [(slab.x0 + slab.x1) / 2, slab.z1 + 0.08, sw + 0.4, 0.18],
        [slab.x0 - 0.08, (slab.z0 + slab.z1) / 2, 0.18, sd + 0.4],
        [slab.x1 + 0.08, (slab.z0 + slab.z1) / 2, 0.18, sd + 0.4],
      ]) {
        const e = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(lw, 0.5, ld), lip));
        e.position.set(lx, slab.y + 0.1, lz);
        sysGroup.add(e);
      }

      // خامة اللوح: زجاج يعكس السماء (اللقطة الإعلانية)
      const cell = M({ color: 0x152238, roughness: 0.12, metalness: 0.3, envMapIntensity: 1.5 });
      const PW = 1.15, PH = 2.05, TILT = THREE.MathUtils.degToRad(30);
      const rows = [];
      let left = panels;
      while (left > 0) { const take = Math.min(12, left); rows.push(take); left -= take; }
      const rowDepth = PH * Math.cos(TILT);
      const gap = 1.7;
      const totalD = rows.length * rowDepth + (rows.length - 1) * gap;
      let z0 = (slab.z0 + slab.z1) / 2 - totalD / 2 + rowDepth / 2;
      const wires = [];
      rows.forEach((count, ri) => {
        const rowW = count * (PW + 0.04);
        const x0 = (slab.x0 + slab.x1) / 2 - rowW / 2 + PW / 2;
        const rz = z0 + ri * (rowDepth + gap);
        const backTopY = slab.y + 0.55 + PH * Math.sin(TILT);
        for (let i = 0; i < count; i++) {
          const px = x0 + i * (PW + 0.04);
          const panel = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(PW, 0.045, PH), cell));
          // إطار ألمنيوم رفيع
          const frame = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.06, 0.03, PH + 0.06), alu);
          frame.position.y = -0.012;
          panel.add(frame);
          panel.position.set(px, slab.y + 0.55 + (PH / 2) * Math.sin(TILT), rz);
          panel.rotation.x = -TILT + Math.PI / 2 - Math.PI / 2; // ميلان 30° نحو الجنوب (-z)
          panel.rotation.x = TILT - Math.PI / 2 + Math.PI / 2;
          panel.rotation.x = -(Math.PI / 2 - (Math.PI / 2 - TILT));
          panel.rotation.x = -TILT;
          sysGroup.add(panel);
          // رجلين هيكل ألمنيوم + صبّة صغيرة لكل رجل خلفية
          for (const dz of [-PH * 0.38, PH * 0.38]) {
            const h = 0.55 + (dz > 0 ? PH * Math.sin(TILT) * 0.76 : 0.1);
            const leg = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), alu));
            leg.position.set(px, slab.y + h / 2, rz + dz * Math.cos(TILT));
            sysGroup.add(leg);
            const pad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), concrete);
            pad.position.set(px, slab.y + 0.06, rz + dz * Math.cos(TILT));
            sysGroup.add(pad);
          }
        }
        // كيبل السترنك: يمشي على ظهر الصف العلوي ويتجمع بأعلى شرق الصف (جهة المعدات)
        const y = slab.y + 0.5 + PH * Math.sin(TILT) - 0.12;
        const zc = rz + (PH / 2) * Math.cos(TILT) - 0.1;
        wires.push([new THREE.Vector3(x0 - PW / 2 + 0.2, y, zc), new THREE.Vector3(x0 + rowW - PW / 2, y, zc)]);
      });
      // مسار كيبل تري من الصفوف لزاوية المعدات
      const trayMat = M({ color: 0x8f959c, roughness: 0.5, metalness: 0.7 });
      const wireMat = M({ color: 0x1a1c1f, roughness: 0.6 });
      const collect = new THREE.Vector3(equip.x - 1.2, slab.y + 0.35, equip.z - 2.2);
      for (const [a, b] of wires) {
        const curve = new THREE.CatmullRomCurve3([a, b, new THREE.Vector3(b.x + 0.6, (b.y + collect.y) / 2, (b.z + collect.z) / 2), collect]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.022, 6), wireMat);
        sysGroup.add(tube);
      }
      const tray = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 5.2), trayMat));
      tray.position.set(equip.x - 1.2, slab.y + 0.3, equip.z - 0.2);
      sysGroup.add(tray);

      // جدار تقني صغير نظيف بزاوية الـL: عليه الانفرترات، وجنبه قاعدة البطاريات
      const wall = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 0.22), M({ color: 0xd8d2c4, roughness: 0.9 })));
      wall.position.set(equip.x, equip.y + 0.85, equip.z + 0.6);
      sysGroup.add(wall);
      const screenMat = M({ color: 0x0a0f14, roughness: 0.3, emissive: 0x2c9fe8, emissiveIntensity: 0.9 });
      for (let i = 0; i < inverters; i++) {
        const inv = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.24), M({ color: 0xe8e5de, roughness: 0.45, metalness: 0.2 })));
        inv.position.set(equip.x - 0.7 + i * 1.35, equip.y + 1.0, equip.z + 0.47);
        sysGroup.add(inv);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), screenMat);
        scr.position.set(inv.position.x, inv.position.y + 0.14, inv.position.z - 0.125);
        scr.rotation.y = Math.PI;
        sysGroup.add(scr);
        // واير نازل من الكيبل تري للانفرتر
        const c = new THREE.CatmullRomCurve3([
          new THREE.Vector3(equip.x - 1.2, slab.y + 0.3, equip.z - 0.2),
          new THREE.Vector3(inv.position.x, equip.y + 1.55, equip.z + 0.42),
          new THREE.Vector3(inv.position.x, inv.position.y + 0.38, inv.position.z),
        ]);
        sysGroup.add(new THREE.Mesh(new THREE.TubeGeometry(c, 24, 0.02, 6), wireMat));
      }
      // البطاريات على قاعدة كونكريت — كحلي بلاد أوتو
      const base = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.9 * batteries + 0.4, 0.18, 0.75), concrete));
      base.position.set(equip.x - 0.2, equip.y + 0.09, equip.z + 1.9);
      sysGroup.add(base);
      for (let i = 0; i < batteries; i++) {
        const bat = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.95, 0.55), M({ color: 0x1b2a4a, roughness: 0.4, metalness: 0.35 })));
        bat.position.set(equip.x - 0.2 - ((batteries - 1) * 0.9) / 2 + i * 0.9, equip.y + 0.65, equip.z + 1.9);
        sysGroup.add(bat);
        const led = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), M({ color: 0x061018, emissive: 0x27c46a, emissiveIntensity: 1.2 }));
        led.position.set(bat.position.x, bat.position.y + 0.28, bat.position.z - 0.28);
        led.rotation.y = Math.PI;
        sysGroup.add(led);
        // واير انفرتر ← بطارية
        const c = new THREE.CatmullRomCurve3([
          new THREE.Vector3(equip.x - 0.7 + Math.min(i, inverters - 1) * 1.35, equip.y + 0.62, equip.z + 0.5),
          new THREE.Vector3(bat.position.x, equip.y + 0.35, equip.z + 1.2),
          new THREE.Vector3(bat.position.x, bat.position.y, bat.position.z - 0.29),
        ]);
        sysGroup.add(new THREE.Mesh(new THREE.TubeGeometry(c, 24, 0.024, 6), wireMat));
      }
    }

    // ==================== الحياة والحركة (مرحلة 4) ====================
    const lifeGroup = new THREE.Group();
    scene.add(lifeGroup);
    const sway = []; // عناصر تتمايل بريح موحدة { obj, amp, phase, speed }

    async function buildLife() {
      // أشجار حقيقية حول بيت البطل وعلى حواف اللحام
      try {
        const gltf = await new GLTFLoader().loadAsync(`${A}/../showcase/glb/island_tree_02/island_tree_02_1k.gltf`);
        const tree = gltf.scene;
        tree.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const spots = [
          [HERO.cx - 14, 0, HERO.cz + 9, 1.25],   // جنب حديقة البطل
          [HERO.cx + 16, 0, HERO.cz + 14, 1.05],  // تأطير يمين
          [112, 0, -115, 1.5],                     // حافة لحام 010/002 شرق
          [-112, 0, -118, 1.4],                    // حافة لحام غرب
          [118, 0, 112, 1.45],                     // حافة 010/009
        ];
        for (const [x, y, z, s] of spots) {
          const t = tree.clone(true);
          t.position.set(x, y, z);
          t.scale.setScalar(s);
          t.rotation.y = Math.random() * Math.PI * 2;
          lifeGroup.add(t);
          sway.push({ obj: t, amp: 0.012, phase: Math.random() * 6.28, speed: 1.1 });
        }
      } catch (e) { /* الشجرة اختيارية — ما توقف المشهد */ }

      // غيوم: السماء نفسها تدور ببطء (بالأنيميشن) — دورة 20 دقيقة (قسم 16)

      // سرب طيور يدور فوق الحي
      const birdCanvas = document.createElement('canvas');
      birdCanvas.width = 64; birdCanvas.height = 32;
      const bc = birdCanvas.getContext('2d');
      bc.strokeStyle = '#222'; bc.lineWidth = 4; bc.lineCap = 'round';
      bc.beginPath(); bc.moveTo(6, 22); bc.quadraticCurveTo(20, 6, 32, 18); bc.quadraticCurveTo(44, 6, 58, 22); bc.stroke();
      const birdTex = new THREE.CanvasTexture(birdCanvas);
      const birdMat = new THREE.MeshBasicMaterial({ map: birdTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), birdMat);
        b.userData.bird = { phase: (i / 6) * Math.PI * 2, r: 42 + (i % 3) * 6 };
        lifeGroup.add(b);
      }

      // غسيل يتحرك على سطحين قريبين
      const clothColors = [0xe8e2d4, 0xc94f7c, 0x7a9bd4, 0xf0f0f0];
      for (const [lx, ly, lz] of [[HERO.cx - 11, 6.1, HERO.cz + 2.5], [HERO.cx + 21, 4.6, HERO.cz - 12]]) {
        const lineMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 3.6).rotateZ(Math.PI / 2), lineMat);
        line.position.set(lx, ly + 1.15, lz);
        lifeGroup.add(line);
        for (let i = 0; i < 3; i++) {
          const cloth = new THREE.Mesh(
            new THREE.PlaneGeometry(0.75, 0.9),
            new THREE.MeshLambertMaterial({ color: clothColors[(i + (lx > HERO.cx ? 1 : 0)) % 4], side: THREE.DoubleSide })
          );
          cloth.position.set(lx - 1.2 + i * 1.15, ly + 0.68, lz);
          cloth.castShadow = true;
          lifeGroup.add(cloth);
          sway.push({ obj: cloth, amp: 0.14, phase: i * 1.3, speed: 2.1, cloth: true });
        }
      }

      // دخان خفيف من مدخنة بعيدة (شفافية ≤ 15%)
      const smokeTexC = document.createElement('canvas');
      smokeTexC.width = smokeTexC.height = 64;
      const sc2 = smokeTexC.getContext('2d');
      const grad = sc2.createRadialGradient(32, 32, 4, 32, 32, 30);
      grad.addColorStop(0, 'rgba(200,200,200,0.5)');
      grad.addColorStop(1, 'rgba(200,200,200,0)');
      sc2.fillStyle = grad; sc2.fillRect(0, 0, 64, 64);
      const smokeMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(smokeTexC), transparent: true, opacity: 0.13, depthWrite: false });
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Sprite(smokeMat.clone());
        s.userData.smoke = { t: i / 10 };
        lifeGroup.add(s);
      }
    }
    const SMOKE_SRC = new THREE.Vector3(-62, 16, -85);

    // ==================== الليل (مرحلة 5) ====================
    const nightGroup = new THREE.Group();
    nightGroup.visible = false;
    scene.add(nightGroup);
    function buildNight() {
      // شبابيك بيت البطل تضوي دافئ (الواجهة الجنوبية والشرقية)
      const winMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
      const winSpots = [
        [11.5, 3.2, -261.7, 0], [15.5, 3.2, -261.7, 0], [20, 3.2, -261.7, 0], [24, 3.2, -261.7, 0],
        [11.5, 1.1, -261.7, 0], [20, 1.1, -261.7, 0],
        [28.0, 3.0, -257.5, 1], [28.0, 3.0, -253.5, 1],
      ];
      for (const [x, y, z, rot] of winSpots) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.5), winMat);
        w.position.set(x, y, z - (rot ? 0 : 0.05));
        if (rot) { w.rotation.y = -Math.PI / 2; w.position.x += 0.05; }
        nightGroup.add(w);
      }
      // ضوء حديقة دافئ + إنارة المنظومة
      const gl = new THREE.PointLight(0xffc37a, 25, 30, 2);
      gl.position.set(HERO.cx - 6, 4, HERO.cz - 8);
      nightGroup.add(gl);
      const rl = new THREE.PointLight(0xfff0d0, 14, 22, 2);
      rl.position.set(HERO.cx + 4, HERO.slab.y + 2.5, HERO.cz);
      nightGroup.add(rl);
      // شبابيك خافتة متفرقة بالجيران (أخف بكثير من البطل)
      const dimMat = new THREE.MeshBasicMaterial({ color: 0x8a7c58, toneMapped: false });
      const neighbors = [
        [-2, 3.5, -246, 0], [36, 2.8, -251, 0], [4, 6.5, -270, 0], [40, 3.4, -238, 1],
        [-14, 3.0, -240, 0], [26, 2.6, -274, 0],
      ];
      for (const [x, y, z, rot] of neighbors) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.2), dimMat);
        w.position.set(x, y, z);
        if (rot) w.rotation.y = Math.PI / 2;
        nightGroup.add(w);
      }
    }

    // ==================== التجميع ====================
    (async () => {
      await loadSky();
      // البلاطات القريبة أول (البطل + القلب) ← فتح المشهد ← البقية بالخلفية
      await placeTiles(LAYOUT.slice(0, 2));
      buildSystem();
      buildNight();
      if (!disposed) setLoading(false);
      await placeTiles(LAYOUT.slice(2));
      await buildLife();
      if (q.get('shot')) document.title = 'READY';
    })().catch((e) => { console.error(e); if (!disposed) setLoading(false); });

    // كاميرا خارجية للفحص الآلي: ?shot=1&cam=x,y,z&t=x,y,z&h=ساعة
    if (q.get('cam')) {
      const [cx, cy, cz] = q.get('cam').split(',').map(Number);
      camera.position.set(cx, cy, cz);
      const [tx, ty, tz] = (q.get('t') || `${HERO.cx},5,${HERO.cz}`).split(',').map(Number);
      controls.target.set(tx, ty, tz);
    }
    if (q.get('h')) { hourRef.current = Number(q.get('h')); setHour(Number(q.get('h'))); }

    // ==================== حلقة الرسم ====================
    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.1);
      const t = clock.elapsedTime;
      controls.update();

      // الوقت: نهار كامل ← مغرب ← ليل (f = عامل النهار)
      const h = hourRef.current;
      const f = THREE.MathUtils.smoothstep(19.6 - h, 0, 2.2); // 1 نهار ← 0 ليل
      // الشمس تنزل وتدفأ بالعصر المتأخر
      const elev = Math.max(0.06, Math.sin(((h - 6) / 13.5) * Math.PI) * 0.75);
      const az = SKY_ROT + ((h - 13) / 9) * 0.9;
      sun.position.set(Math.cos(az) * 0.8, elev, -Math.sin(az) * 0.8).normalize().multiplyScalar(300)
        .add(new THREE.Vector3(HERO.cx, 0, HERO.cz));
      sun.intensity = 3.2 * f * Math.min(1, elev * 3);
      sun.color.setHSL(0.09, 0.55, THREE.MathUtils.lerp(0.62, 0.75, elev));
      hemi.intensity = THREE.MathUtils.lerp(0.06, 0.55, f);
      if (scene.backgroundIntensity !== undefined) scene.backgroundIntensity = THREE.MathUtils.lerp(0.035, 1, f);
      if (scene.environmentIntensity !== undefined) scene.environmentIntensity = THREE.MathUtils.lerp(0.05, 1, f);
      scene.fog.color.copy(FOG_NIGHT).lerp(FOG_DAY, f);
      groundMat.color.setHex(0x94a071).multiplyScalar(THREE.MathUtils.lerp(0.25, 1, f));
      nightGroup.visible = f < 0.55;

      // الغيوم: دوران السماء دورة كاملة / 20 دقيقة
      if (scene.backgroundRotation) scene.backgroundRotation.y = SKY_ROT + (t / 1200) * Math.PI * 2;

      // ريح موحدة: كل التمايل بنفس الإيقاع باختلاف الطور
      for (const s of sway) {
        const w = Math.sin(t * s.speed + s.phase) * s.amp;
        if (s.cloth) s.obj.rotation.x = w;
        else s.obj.rotation.z = w;
      }
      // الطيور: مسار إهليلجي دورة ~30 ثانية فوق الحي
      lifeGroup.children.forEach((c) => {
        if (c.userData.bird) {
          const b = c.userData.bird;
          const a = (t / 30) * Math.PI * 2 + b.phase;
          c.position.set(HERO.cx + 25 + Math.cos(a) * b.r, 42 + Math.sin(t * 0.35 + b.phase) * 3, HERO.cz + 35 + Math.sin(a) * b.r * 0.7);
          c.rotation.y = -a;
          const flap = Math.sin(t * 9 + b.phase) * 0.4;
          c.scale.set(1, 0.65 + Math.abs(flap), 1);
        }
        if (c.userData.smoke) {
          const s = c.userData.smoke;
          s.t += dt / 4.5;
          if (s.t > 1) s.t = 0;
          c.position.set(SMOKE_SRC.x + s.t * 4 + Math.sin(s.t * 8) * 0.4, SMOKE_SRC.y + s.t * 7, SMOKE_SRC.z + s.t * 2);
          c.material.opacity = 0.13 * (1 - s.t) * (f * 0.8 + 0.2);
          c.scale.setScalar(1.5 + s.t * 4);
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      pmrem.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [panels, batteries, inverters]);

  return (
    <div className="city-scene" style={{ position: 'fixed', inset: 0, background: '#0e2238' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      {loading && (
        <div className="showcase-loading" style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0e2238', color: '#d4a947', fontSize: '1.3rem', fontWeight: 800, zIndex: 5,
        }}>⚡ يتم تجهيز المدينة…</div>
      )}
      {/* بادجات الأفر */}
      <div style={{
        position: 'absolute', top: 14, right: 14, display: 'flex', gap: 8, flexWrap: 'wrap',
        direction: 'rtl', zIndex: 4, maxWidth: '60vw',
      }}>
        {[[`${panels} لوح`, '⚡'], [`${inverters} انفرتر`, '🔌'], [`${batteries} بطارية`, '🔋'],
          [`~${ampDay} أمبير نهاري`, '☀️'], [`~${nightHours} ساعة ليلي`, '🌙']].map(([txt, ic]) => (
          <div key={txt} style={{
            background: 'rgba(14,34,56,0.82)', border: '1px solid #d4a947', color: '#fff',
            borderRadius: 10, padding: '6px 12px', fontWeight: 700, fontSize: '0.85rem', backdropFilter: 'blur(6px)',
          }}>{ic} {txt}</div>
        ))}
      </div>
      {/* سلايدر الوقت: نهار ← مغرب ← ليل */}
      <div style={{
        position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 4,
        background: 'rgba(14,34,56,0.82)', borderRadius: 14, padding: '10px 18px', direction: 'rtl',
        display: 'flex', alignItems: 'center', gap: 12, color: '#fff', backdropFilter: 'blur(6px)',
      }}>
        <span style={{ fontSize: '1.1rem' }}>{hour >= 19 ? '🌙' : hour >= 17.5 ? '🌆' : '☀️'}</span>
        <input type="range" min="10" max="21.5" step="0.1" value={hour}
          onChange={(e) => setHour(Number(e.target.value))} style={{ width: 220, accentColor: '#d4a947' }} />
        <span style={{ fontWeight: 700, minWidth: 52, textAlign: 'center' }}>
          {String(Math.floor(hour)).padStart(2, '0')}:{String(Math.round((hour % 1) * 60)).padStart(2, '0')}
        </span>
      </div>
      {onClose && (
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, left: 14, zIndex: 4, background: 'rgba(14,34,56,0.82)',
          color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10,
          padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer',
        }}>✕ رجوع</button>
      )}
    </div>
  );
}
