// محرك 3D حقيقي لهيكل الألواح (three.js) — يرسم مشهداً واقعياً بكاميرا آيزومترية
// وإضاءة وظلال، ويتقسّم تلقائياً: كل ستركجر 2×8 حد أقصى، والإضافي يرفع أقدامه.
import * as THREE from 'three';
import { structuresForRender } from './structureDiagram.js';

// أبعاد فيزيائية (متر)
const PANEL_W = 1.05; // عرض اللوح (على الصف)
const TIER_L = 1.35; // طول اللوح على الميل (طابق واحد) — لاندسكيب حتى ما يطول الهيكل
const TILT = THREE.MathUtils.degToRad(26);
const FRONT_H = 0.5; // ارتفاع الحافة الأمامية للستركجر الأول
const LIFT = 0.9; // زيادة ارتفاع كل ستركجر خلفي
const GAP = 1.3; // ممر بين الستركجرات
const POST = 0.06; // سماكة العمود الحديدي
const FOOT = 0.34; // ضلع الصبّة الكونكريتية

// نسيج اللوح: خلايا زرقاء بشبكة رفيعة
function panelTexture() {
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
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

// ستركجر واحد: مجموعة three.js (ألواح + أرجل + دعامات + صبّات)
function buildStructure(cols, baseH, panelMat, metalMat, concreteMat) {
  const grp = new THREE.Group();
  const W = cols * PANEL_W;
  const slope = 2 * TIER_L;
  const dz = slope * Math.cos(TILT); // العمق الأفقي للميل
  const dy = slope * Math.sin(TILT); // الارتفاع
  const backH = baseH + dy;

  // سطح الألواح: مستطيل مائل مقسوم 2×cols (نسيج مكرر على كامل السطح)
  const surfGeo = new THREE.BoxGeometry(W, 0.05, slope);
  const mat = panelMat.clone();
  mat.map = panelMat.map.clone();
  mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
  mat.map.repeat.set(cols, 2);
  mat.map.needsUpdate = true;
  const surf = new THREE.Mesh(surfGeo, mat);
  surf.castShadow = true; surf.receiveShadow = true;
  // مركز السطح: منتصف العرض، متوسط الارتفاع، منتصف العمق
  surf.position.set(W / 2, (baseH + backH) / 2, dz / 2);
  surf.rotation.x = -TILT; // الحافة الأمامية أوطى والخلفية أعلى (الوجه للكاميرا)
  grp.add(surf);

  // أرجل + دعامات + صبّات عند كل عمود
  for (let c = 0; c <= cols; c++) {
    const x = c * PANEL_W;
    // رجل أمامية
    const fLeg = new THREE.Mesh(new THREE.BoxGeometry(POST, baseH, POST), metalMat);
    fLeg.position.set(x, baseH / 2, 0); fLeg.castShadow = true; grp.add(fLeg);
    // رجل خلفية
    const bLeg = new THREE.Mesh(new THREE.BoxGeometry(POST, backH, POST), metalMat);
    bLeg.position.set(x, backH / 2, dz); bLeg.castShadow = true; grp.add(bLeg);
    // دعامة قطرية (من قاعدة الأمامية لأعلى الخلفية)
    const braceLen = Math.hypot(dz, backH);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(POST * 0.7, braceLen, POST * 0.7), metalMat);
    brace.position.set(x, backH / 2, dz / 2);
    brace.rotation.x = Math.atan2(dz, backH);
    grp.add(brace);
    // صبّة تحت الرجل الأمامية والخلفية
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(FOOT, 0.3, FOOT), concreteMat);
    f1.position.set(x, 0.15, 0); f1.castShadow = true; f1.receiveShadow = true; grp.add(f1);
    const f2 = new THREE.Mesh(new THREE.BoxGeometry(FOOT, 0.3, FOOT), concreteMat);
    f2.position.set(x, 0.15, dz); f2.castShadow = true; f2.receiveShadow = true; grp.add(f2);
  }
  // عارضة أفقية علوية أمامية وخلفية (تربط الأرجل)
  const railF = new THREE.Mesh(new THREE.BoxGeometry(W, POST, POST), metalMat);
  railF.position.set(W / 2, baseH, 0); grp.add(railF);
  const railB = new THREE.Mesh(new THREE.BoxGeometry(W, POST, POST), metalMat);
  railB.position.set(W / 2, backH, dz); grp.add(railB);

  grp.userData = { W, dz };
  return grp;
}

// يرسم المشهد كاملاً ويرجع dataURL PNG (أو null عند فشل WebGL)
export async function renderStructurePng(panelCount, { width = 1000, height = 620 } = {}) {
  // عيّنة توضيحية محدودة — المشاريع الكبيرة ما ترسم عشرات الستركجرات
  const structs = structuresForRender(panelCount);
  if (!structs.length) return null;

  let renderer;
  const canvas = document.createElement('canvas');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(2);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } catch {
    return null;
  }

  const scene = new THREE.Scene();
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.35, metalness: 0.1 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x8a929c, roughness: 0.5, metalness: 0.7 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0xdfe2e6, roughness: 0.9 });
  // أرضية شفافة تلتقط الظلال فقط — تندمج مع خلفية الصفحة بدل مربع رمادي
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.22 });

  // بناء الستركجرات متدرّجة
  const group = new THREE.Group();
  let maxW = 0, totalDepth = 0;
  structs.forEach((s, i) => {
    const g = buildStructure(s.cols, FRONT_H + i * LIFT, panelMat, metalMat, concreteMat);
    const depthOffset = i * (2 * TIER_L * Math.cos(TILT) + GAP);
    g.position.set(-s.cols * PANEL_W / 2, 0, depthOffset); // توسيط أفقي
    group.add(g);
    maxW = Math.max(maxW, s.cols * PANEL_W);
    totalDepth = depthOffset + g.userData.dz;
  });
  // توسيط المجموعة على العمق
  group.position.z = -totalDepth / 2;
  scene.add(group);

  // أرضية/منصّة كونكريت
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(maxW + totalDepth + 12, maxW + totalDepth + 12), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  // إضاءة: شمس + سماء + محيط
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(-8, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sz = maxW + totalDepth;
  Object.assign(sun.shadow.camera, { left: -sz, right: sz, top: sz, bottom: -sz, near: 0.5, far: 60 });
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0xbcc3ad, 0.9));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  // كاميرا آيزومترية أمامية بزاوية الرفرنس، مع ملاءمة تلقائية لحدود المشهد
  // حتى ما ينكصّ أي ستركجر مرفوع (مهما زاد عدد الطوابق).
  const aspect = width / height;
  const dir = new THREE.Vector3(0.85, 0.6, -0.85).normalize(); // اتجاه من المركز للكاميرا (z سالب = الوجه)
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);

  // حدود المشهد الفعلية بعد البناء
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  cam.position.copy(center).addScaledVector(dir, 100);
  cam.up.set(0, 1, 0);
  cam.lookAt(center);
  cam.updateMatrixWorld(true);
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();

  // إسقاط زوايا الصندوق لفضاء الكاميرا لإيجاد الإطار الذي يلمّ كل شيء
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    const v = new THREE.Vector3(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    ).applyMatrix4(cam.matrixWorldInverse);
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  const pad = 1.1; // هامش بسيط حول التصميم
  let halfW = (maxX - minX) / 2 * pad;
  let halfH = (maxY - minY) / 2 * pad;
  if (halfW / halfH < aspect) halfW = halfH * aspect; else halfH = halfW / aspect;
  const ccx = (minX + maxX) / 2, ccy = (minY + maxY) / 2;
  cam.left = ccx - halfW; cam.right = ccx + halfW;
  cam.top = ccy + halfH; cam.bottom = ccy - halfH;
  cam.zoom = 1;
  cam.updateProjectionMatrix();

  renderer.render(scene, cam);
  const url = canvas ? renderer.domElement.toDataURL('image/png') : null;

  // تنظيف
  renderer.dispose();
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); }
  });
  return url;
}
