/**
 * 场景模板：曹冲称象
 * 学科：小学语文 / 科学   知识点：浮力 · 等量代换
 *
 * 物理口径（真算，不是播动画）：
 *   吃水深度 d = 载重总质量 m / (水密度 ρ × 船底面积 A)
 * 12 块石头的重量之和精确等于大象体重，所以最后一定严丝合缝对上目标吃水线。
 *
 * 场景模板的写法见 docs/场景模板规范.md
 */
import * as THREE from 'three';
import { tween, ease, wait, loadGLB } from '../core/stage.js';

/* ===================== 参数 ===================== */
const RHO = 1000;                  // 水密度 kg/m³
const BOAT_L = 5.0, BOAT_W = 2.2;  // 船底有效尺寸
const AREA = BOAT_L * BOAT_W;      // 11 m²
const BOAT_MASS = 1100;            // 船自重 → 空载吃水 0.10 m
const ELEPHANT_MASS = 4400;        // 大象体重 → 载象吃水 0.50 m
const HULL_H = 0.18;               // 船底板厚
const WALL_H = 0.90;               // 船舷高
const BANK_Y = 0.22;               // 岸面高度
const STONE_N = 12;

const draftOf = m => m / (RHO * AREA);
const EMPTY_DRAFT = draftOf(BOAT_MASS);
const TARGET_DRAFT = draftOf(BOAT_MASS + ELEPHANT_MASS);

// 确定性伪随机：保证每次打开画面完全一致，演示不会翻车
let _s = 20260826;
const rnd = () => ((_s = (_s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const resetRnd = () => {_s = 20260826;};

const stoneWeights = (() => {
  const raw = Array.from({length: STONE_N}, () => 300 + rnd() * 180);
  const k = ELEPHANT_MASS / raw.reduce((a, b) => a + b, 0);
  const w = raw.map(v => Math.round(v * k));
  w[STONE_N - 1] += ELEPHANT_MASS - w.reduce((a, b) => a + b, 0);
  return w;
})();

/* ===================== 建模：船 ===================== */
const HULL_OUT = [[-3.0, 0], [-2.4, -1.1], [2.1, -1.1], [2.9, 0], [2.1, 1.1], [-2.4, 1.1]];
const shrink = (pts, d) => pts.map(([x, z]) => {
  const L = Math.hypot(x, z) || 1;
  return [x - x / L * d * 1.15, z - z / L * d * 2.2];
});
function shapeOf(pts) {
  const sh = new THREE.Shape();
  pts.forEach(([x, z], i) => i ? sh.lineTo(x, z) : sh.moveTo(x, z));
  sh.closePath();
  return sh;
}
function ringGeo(outPts, thick, depth) {
  const sh = shapeOf(outPts);
  const hole = new THREE.Path();
  shrink(outPts, thick).forEach(([x, z], i) => i ? hole.lineTo(x, z) : hole.moveTo(x, z));
  hole.closePath();
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, {depth, bevelEnabled: false});
  g.rotateX(-Math.PI / 2);
  return g;
}
function buildBoat() {
  const woodDark = new THREE.MeshStandardMaterial({color: 0x8a5a33, roughness: 0.82});
  const woodLight = new THREE.MeshStandardMaterial({color: 0xa97345, roughness: 0.8});
  const g = new THREE.Group();

  const slab = new THREE.ExtrudeGeometry(shapeOf(HULL_OUT), {depth: HULL_H, bevelEnabled: false});
  slab.rotateX(-Math.PI / 2);
  g.add(new THREE.Mesh(slab, woodDark));

  const wall = new THREE.Mesh(ringGeo(HULL_OUT, 0.14, WALL_H), woodLight);
  wall.position.y = HULL_H;
  g.add(wall);

  for (let i = -1; i <= 1; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 2.0), woodDark);
    b.position.set(i * 1.5, HULL_H + WALL_H - 0.045, 0);
    g.add(b);
  }
  const plank = new THREE.MeshStandardMaterial({color: 0x6f4425, roughness: 1});
  for (const zz of [1.0, -1.0]) for (const yy of [0.32, 0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.02, 0.03), plank);
    l.position.set(-0.15, HULL_H + yy, zz * 1.055);
    g.add(l);
  }
  g.traverse(o => {if (o.isMesh) o.castShadow = o.receiveShadow = true;});
  return g;
}

/* ===================== 建模：大象（内置占位模型）===================== */
function buildElephant() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({color: 0x8e8e99, roughness: 0.92});
  const skin2 = new THREE.MeshStandardMaterial({color: 0x9a9aa6, roughness: 0.92});
  const ivory = new THREE.MeshStandardMaterial({color: 0xefe7d2, roughness: 0.5});

  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), skin);
  body.scale.set(1.45, 1.05, 1.02);
  body.position.set(0, 1.55, 0);
  g.add(body);

  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.86, 18, 14), skin);
  rump.position.set(-1.15, 1.55, 0);
  g.add(rump);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.66, 20, 16), skin2);
  head.scale.set(0.95, 1.02, 0.9);
  head.position.set(1.45, 1.72, 0);
  g.add(head);

  let px = 1.98, py = 1.55, r = 0.24;          // 鼻子
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), skin2);
    seg.position.set(px, py, 0);
    g.add(seg);
    px += 0.16 + i * 0.012; py -= 0.20; r *= 0.87;
  }
  for (const z of [0.62, -0.62]) {             // 耳朵
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.52, 16, 12), skin2);
    ear.scale.set(0.62, 0.95, 0.14);
    ear.position.set(1.16, 1.82, z);
    ear.rotation.y = z > 0 ? -0.35 : 0.35;
    g.add(ear);
  }
  for (const z of [0.26, -0.26]) {             // 象牙
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.72, 10), ivory);
    t.position.set(1.92, 1.42, z);
    t.rotation.z = Math.PI / 2 + 0.5;
    t.rotation.y = z > 0 ? 0.2 : -0.2;
    g.add(t);
  }
  const hoof = new THREE.MeshStandardMaterial({color: 0x76767f, roughness: 1});
  for (const [x, z] of [[0.72, 0.5], [0.72, -0.5], [-0.92, 0.52], [-0.92, -0.52]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.27, 1.05, 12), skin);
    leg.position.set(x, 0.52, z);
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.16, 12), hoof);
    foot.position.set(x, 0.08, z);
    g.add(foot);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.85, 8), skin);
  tail.position.set(-1.95, 1.45, 0);
  tail.rotation.z = 0.35;
  g.add(tail);

  g.traverse(o => {if (o.isMesh) o.castShadow = o.receiveShadow = true;});
  return g;
}

function buildStone(w) {
  const r = Math.cbrt(w / 2600 * 3 / (4 * Math.PI)) * 1.9;
  const geo = new THREE.IcosahedronGeometry(r, 1);
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const f = 0.82 + rnd() * 0.36;
    pos.setXYZ(k, pos.getX(k) * f, pos.getY(k) * f * 0.9, pos.getZ(k) * f);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.07 + rnd() * 0.03, 0.16, 0.19 + rnd() * 0.08),
    roughness: 0.96, flatShading: true,
  }));
  m.castShadow = m.receiveShadow = true;
  m.userData = {weight: w, radius: r};
  return m;
}

/* ===================== 场景模板导出 ===================== */
export default {
  id: 'caochong-chengxiang',
  name: '曹冲称象',
  icon: '🐘',
  grade: '演示 · 浮力与等量代换',
  keywords: ['曹冲称象', '称象', '曹冲', '大象'],
  subject: '小学语文 / 科学',
  topic: '浮力 · 等量代换',
  objects: '大象、木船、石块',
  stage: {cameraPos: [11, 6.4, 13], target: [-1.5, 0.45, 0], withWater: true},

  // 接入真实模型：填入 Tripo 生成的 GLB 地址即可自动替换内置占位模型
  assets: {
    elephant: null,   // 例：'./assets/models/elephant.glb'
    boat: null,
    stone: null,
  },

  steps: ['大象上船', '刻下吃水线', '大象下船', '装载石块', '得出结论'],
  stats: [
    {key: 'mark', label: '目标吃水线'},
    {key: 'draft', label: '当前吃水深度'},
    {key: 'count', label: '已装石块'},
    {key: 'kg', label: '石块总重'},
  ],

  build(ctx) {
    const {scene, ui, onFrame} = ctx;
    resetRnd();

    /* ---- 河岸 ---- */
    const bankTop = new THREE.Mesh(new THREE.BoxGeometry(20, 2.6, 26),
      new THREE.MeshStandardMaterial({color: 0x7d9a5c, roughness: 0.95}));
    bankTop.position.set(-13.2, -1.08, 0);
    bankTop.castShadow = bankTop.receiveShadow = true;
    scene.add(bankTop);

    const bankEdge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 26),
      new THREE.MeshStandardMaterial({color: 0x9a8a68, roughness: 1}));
    bankEdge.position.set(-3.3, -1.12, 0);
    bankEdge.castShadow = bankEdge.receiveShadow = true;
    scene.add(bankEdge);

    /* ---- 船 + 吃水线标记 ---- */
    const boat = buildBoat();
    boat.position.set(0.3, -EMPTY_DRAFT, 0);
    scene.add(boat);

    const mark = new THREE.Mesh(
      ringGeo(HULL_OUT.map(([x, z]) => [x * 1.012, z * 1.02]), 0.055, 0.06),
      new THREE.MeshBasicMaterial({color: 0xe0413a}));
    mark.visible = false;
    boat.add(mark);

    /* ---- 大象 ---- */
    const elephant = buildElephant();
    elephant.scale.setScalar(0.78);
    const HOME = new THREE.Vector3(-6.4, BANK_Y, 0.9);
    elephant.position.copy(HOME);
    elephant.rotation.y = -0.22;
    scene.add(elephant);

    /* ---- 石块 ---- */
    const stones = stoneWeights.map((w, i) => {
      const s = buildStone(w);
      const col = i % 4, row = (i / 4) | 0;
      s.position.set(-6.2 + col * 0.9, BANK_Y + s.userData.radius * 0.85, -3.6 + row * 0.9);
      s.userData.home = s.position.clone();
      scene.add(s);
      return s;
    });

    /* ---- 状态 ---- */
    const S = {phase: 0, aboard: false, loaded: 0, cargo: 0, marked: false, busy: false};
    let targetY = -EMPTY_DRAFT;
    const total = () => BOAT_MASS + S.cargo;

    function refresh() {
      const d = draftOf(total());
      targetY = -d;
      const aligned = S.marked && Math.abs(d - TARGET_DRAFT) < 0.004;
      ui.setStat('mark', S.marked ? TARGET_DRAFT.toFixed(3) + ' m' : '—');
      ui.setStat('draft', d.toFixed(3) + ' m', aligned);
      ui.setStat('count', `${S.loaded} / ${STONE_N}`);
      ui.setStat('kg', (S.aboard ? 0 : S.cargo).toLocaleString() + ' kg');
      ui.setProgress((d - EMPTY_DRAFT) / (TARGET_DRAFT - EMPTY_DRAFT) * 100, aligned && S.phase >= 3);
      ui.setHint(!S.marked ? '—'
        : aligned ? '✓ 与吃水线齐平'
        : d < TARGET_DRAFT ? `还差 ${((TARGET_DRAFT - d) * 100).toFixed(1)} cm`
        : '已超过吃水线', aligned);
    }

    /* ---- 交互动作 ---- */
    async function elephantOn() {
      if (S.busy || S.aboard) return;
      S.busy = true;
      const from = elephant.position.clone();
      const toX = boat.position.x - 0.25;
      await tween(1800, k => {
        const e = ease(k);
        elephant.position.x = from.x + (toX - from.x) * e;
        elephant.position.z = from.z * (1 - e);
        elephant.position.y = BANK_Y + Math.sin(e * Math.PI) * 0.55 + (targetY + HULL_H - BANK_Y) * e;
        elephant.rotation.y = -0.22 * (1 - e);
        if (k > 0.55 && !S.aboard) {S.aboard = true; S.cargo = ELEPHANT_MASS; refresh();}
      });
      S.phase = 1;
      ui.setStep(1);            // 「刻下吃水线」这一步要亮起来，不能从第 1 步直接跳到第 3 步
      await wait(900);
      mark.position.y = draftOf(total());
      mark.visible = true;
      S.marked = true;
      ui.toast('已在船舷刻下吃水线');
      ui.setStep(2);
      refresh();
      S.busy = false;
    }

    async function elephantOff() {
      if (S.busy || !S.aboard) return;
      S.busy = true;
      const from = elephant.position.clone();
      await tween(1700, k => {
        const e = ease(k);
        elephant.position.lerpVectors(from, HOME, e);
        elephant.position.y += Math.sin(e * Math.PI) * 0.55;
        elephant.rotation.y = -0.22 * e;
        if (k > 0.3 && S.aboard) {S.aboard = false; S.cargo = 0; refresh();}
      });
      S.phase = 2;
      ui.setStep(3);
      ui.toast('船身浮起，吃水线留在船舷上');
      refresh();
      S.busy = false;
    }

    async function loadStone(s) {
      if (s.userData.loaded) return;
      let guard = 0;
      while ((S.busy || S.phase < 2) && guard++ < 300) await wait(50);   // 连点不丢
      if (s.userData.loaded || S.phase > 3) return;
      S.busy = true;
      S.phase = 3;
      ui.setStep(3);
      s.userData.loaded = true;
      const i = S.loaded++;
      const col = i % 4, row = (i / 4) | 0;
      const dest = new THREE.Vector3(boat.position.x - 1.55 + col * 0.92, 0, -0.55 + row * 0.55);
      const from = s.position.clone();
      const deckY = HULL_H + s.userData.radius * 0.8;
      await tween(760, k => {
        const e = ease(k);
        s.position.x = from.x + (dest.x - from.x) * e;
        s.position.z = from.z + (dest.z - from.z) * e;
        s.position.y = from.y + (targetY + deckY - from.y) * e + Math.sin(e * Math.PI) * 1.5;
        s.rotation.x += 0.06;
        s.rotation.z += 0.04;
        if (k > 0.85 && !s.userData.counted) {
          s.userData.counted = true;
          S.cargo += s.userData.weight;
          refresh();
        }
      });
      s.userData.onBoat = true;
      s.userData.deckY = deckY;
      S.busy = false;
      if (Math.abs(draftOf(total()) - TARGET_DRAFT) < 0.004) finish();
    }

    function finish() {
      S.phase = 4;
      ui.setStep(4);
      const again = ui.showResult({
        title: '石头的重量，就是大象的重量',
        big: S.cargo.toLocaleString(),
        unit: 'kg',
        equation: [
          {label: '船装大象时', value: '吃水线 A'},
          {label: '船装石头时', value: '吃水线 A'},
        ],
        note: `吃水深度相同，说明船受到的浮力相同；<br>浮力相同，则两次的载重相同。<br>` +
              `大象实际体重 <b>${ELEPHANT_MASS.toLocaleString()} kg</b>，与石头总重完全一致。`,
      });
      again.onclick = () => {ui.hideResult(); reset();};
      refresh();
    }

    // 连点排队：老师快速点击不会丢动作
    let queue = Promise.resolve();
    const enqueue = s => {
      if (!s || s.userData.queued) return;
      s.userData.queued = true;
      queue = queue.then(() => loadStone(s)).catch(() => {});
    };
    const nextStone = () => {
      const s = stones.find(x => !x.userData.queued);
      s ? enqueue(s) : ui.toast('石块已全部装载');
    };

    async function autoRun() {
      if (S.busy) return;
      if (S.phase === 0) {await elephantOn(); await wait(700);}
      if (S.phase === 1) {await elephantOff(); await wait(600);}
      for (const s of stones) {
        if (S.phase >= 4) break;
        if (!s.userData.queued) {s.userData.queued = true; await loadStone(s); await wait(190);}
      }
    }

    function reset() {
      Object.assign(S, {phase: 0, aboard: false, loaded: 0, cargo: 0, marked: false, busy: false});
      queue = Promise.resolve();
      elephant.position.copy(HOME);
      elephant.rotation.y = -0.22;
      mark.visible = false;
      stones.forEach(s => {
        s.userData.loaded = s.userData.counted = s.userData.onBoat = s.userData.queued = false;
        s.position.copy(s.userData.home);
      });
      ui.hideResult();
      ui.setStep(0);
      refresh();
    }

    /* ---- 点击 3D 石块装船 ---- */
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    ctx.renderer.domElement.addEventListener('pointerdown', e => {
      const r = ctx.renderer.domElement.getBoundingClientRect();
      ptr.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, ctx.camera);
      const hit = ray.intersectObjects(stones.filter(s => !s.userData.queued), false)[0];
      if (hit) enqueue(hit.object);
    });

    /* ---- 每帧：船体升降 + 货物跟随 ---- */
    onFrame((dt, t) => {
      boat.position.y += (targetY - boat.position.y) * Math.min(1, dt * 0.004);
      boat.rotation.z = Math.sin(t * 0.9) * 0.012;
      boat.rotation.x = Math.sin(t * 0.63 + 1) * 0.008;
      if (S.aboard && !S.busy) elephant.position.y = boat.position.y + HULL_H;
      stones.forEach(s => {
        if (s.userData.onBoat && !S.busy) s.position.y = boat.position.y + s.userData.deckY;
      });
    });

    /* ---- 可选：接入 Tripo 真实模型 ---- */
    if (this.assets.elephant) {
      loadGLB(this.assets.elephant, {length: 3.4, THREE})
        .then(m => {
          elephant.clear();
          elephant.add(m);
          ui.toast('已接入 AI 生成的大象模型');
        })
        .catch(() => ui.toast('大象模型加载失败，已回退到内置模型'));
    }

    refresh();
    ui.setStep(0);

    return {
      actions: [
        {label: '① 大象上船', primary: true, run: elephantOn},
        {label: '② 大象下船', run: elephantOff},
        {label: '③ 装一块石头', run: nextStone},
        {label: '自动演示', ghost: true, run: autoRun},
        {label: '重置', ghost: true, run: reset},
      ],
      reset,
    };
  },
};
