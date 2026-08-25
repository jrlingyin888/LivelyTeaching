/**
 * 场景模板：谁轻谁重
 * 学科：一年级科学（教科版一下《我们周围的物体》）
 * 知识点：比较轻重 · 用同一个标准量出数量
 *
 * 教学落点有两个，第二个才是关键：
 *   1. 天平往下沉的那边重
 *   2. **大的不一定重** —— 这是一年级最顽固的一个前概念，
 *      所以第 2 步专门放了一个「大而轻的塑料球 vs 小而重的石头」去撞它
 *
 * 真算的部分：天平横梁的倾角
 *   (mL - mR)·g·L·cosθ = M·d·g·sinθ  →  tanθ = (mL - mR)·L / (M·d)
 *   这是真实等臂天平的平衡方程（重心略低于支点，所以不会一有偏差就撞到底），
 *   不是按结果反推的动画。
 *
 * 关于「方块数刚好整除」：物体质量都设成 30 g 的整数倍，
 * 因为一年级还没学「5 块多一点」。但块数要孩子自己一块块试出来，
 * 加多了天平会往另一边倒 —— 试错过程是保留的，只是结果落在整数上。
 */
import * as THREE from 'three';
import { tween, ease, wait } from '../core/stage.js';

/* ===================== 参数 ===================== */
const ARM = 1.6;            // 半臂长 m
const BEAM_MD = 0.342;      // 横梁 M·d（kg·m），决定同样偏差倾多少
const MAX_TILT = 0.38;      // 物理限位 ≈ 22°
const UNIT = 50;            // 小方块 50 g
const PIVOT = new THREE.Vector3(0, 2.45, 0);

const tiltOf = (mL, mR) =>
  Math.max(-MAX_TILT, Math.min(MAX_TILT, Math.atan((mL - mR) / 1000 * ARM / BEAM_MD)));

/**
 * 体积和质量故意反着来：气球最大最轻，石头最小最重。
 * 最后排序的三个就是 气球 / 苹果 / 石头 —— 视觉大小顺序和轻重顺序完全相反，
 * 孩子只能靠量出来的方块数排，靠眼睛一定排错。这是这一课的落点。
 *
 * 块数（÷50g）：气球 2 · 苹果 3 · 石头 5 —— 量三个共 10 下，给排序留出注意力。
 */
const ITEMS = [
  {key: 'apple',  name: '苹果',   g: 150, icon: '🍎', color: 0xd8453d, r: 0.42},
  {key: 'block',  name: '小积木', g: 50,  icon: '🧱', color: 0xe8912f, r: 0.30},
  {key: 'bigball',name: '大气球', g: 100, icon: '🎈', color: 0x59b0d8, r: 0.6},
  {key: 'stone',  name: '小石头', g: 250, icon: '🪨', color: 0x6b6f76, r: 0.34},
];

/* ===================== 建模 ===================== */
function buildItem(it) {
  const mat = new THREE.MeshStandardMaterial({
    color: it.color,
    roughness: it.key === 'bigball' ? 0.3 : it.key === 'stone' ? 0.98 : 0.6,
    metalness: 0.04,
  });
  let geo;
  if (it.key === 'block') geo = new THREE.BoxGeometry(it.r * 1.7, it.r * 1.7, it.r * 1.7);
  else if (it.key === 'stone') geo = new THREE.IcosahedronGeometry(it.r, 1);
  else geo = new THREE.SphereGeometry(it.r, 28, 20);

  const m = new THREE.Mesh(geo, mat);
  if (it.key === 'apple') m.scale.set(1, 0.92, 1);
  m.castShadow = m.receiveShadow = true;
  m.userData = {...it};
  return m;
}

function buildCube() {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshStandardMaterial({color: 0xf0c14b, roughness: 0.6}));
  m.castShadow = m.receiveShadow = true;
  m.userData = {g: UNIT, isCube: true};
  return m;
}

function buildPan() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({color: 0xc9d2da, roughness: 0.34, metalness: 0.55});
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.78, 0.11, 32), metal);
  dish.castShadow = dish.receiveShadow = true;
  g.add(dish);
  for (const a of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.92, 8), metal);
    rod.position.set(Math.cos(a) * 0.7, 0.5, Math.sin(a) * 0.7);
    rod.rotation.z = Math.cos(a) * 0.36;
    rod.rotation.x = -Math.sin(a) * 0.36;
    g.add(rod);
  }
  return g;
}

function buildStand(scene) {
  const wood = new THREE.MeshStandardMaterial({color: 0xa97345, roughness: 0.85});
  const metal = new THREE.MeshStandardMaterial({color: 0xb8c2cc, roughness: 0.3, metalness: 0.6});

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 0.26, 28), wood);
  base.position.y = 0.13;
  base.castShadow = base.receiveShadow = true;
  scene.add(base);

  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, PIVOT.y - 0.3, 20), metal);
  col.position.y = 0.3 + (PIVOT.y - 0.3) / 2;
  col.castShadow = col.receiveShadow = true;
  scene.add(col);

  const beam = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(ARM * 2 + 0.3, 0.12, 0.16), metal);
  bar.castShadow = true;
  beam.add(bar);
  const needle = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 4), metal);
  needle.position.y = -0.3;
  needle.rotation.x = Math.PI;
  beam.add(needle);
  beam.position.copy(PIVOT);
  scene.add(beam);

  return {beam};
}

/* ===================== 场景模板导出 ===================== */
export default {
  id: 'balance-scale',
  name: '谁轻谁重',
  icon: '⚖️',
  keywords: ['轻重', '天平', '谁轻谁重', '比较轻重', '称一称'],
  subject: '一年级科学',
  grade: '一年级 · 比较轻重',
  topic: '轻重比较 · 用统一标准测量',
  objects: '天平、苹果、积木、气球、石头、小方块',
  stage: {cameraPos: [0.2, 4.0, 10.2], target: [0, 1.6, 0], withWater: false,
          withGround: true, groundColor: 0xd6cdb8, sky: 0xe4eef5},

  steps: ['猜一猜', '大的一定重吗', '用方块量', '排一排'],

  build(ctx) {
    const {scene, ui, flyTo, flyToFit, camera, controls} = ctx;
    const {beam} = buildStand(scene);

    const HOME_CAM = [0.2, 4.0, 10.2], HOME_TGT = [0, 1.6, 0];

    /* ---- 两个托盘 ---- */
    const panL = buildPan(), panR = buildPan();
    scene.add(panL, panR);

    /* ---- 待称物体摆在台面上 ---- */
    const items = ITEMS.map((it, i) => {
      const m = buildItem(it);
      m.userData.home = new THREE.Vector3(-3.0 + i * 1.1, 0.35 + it.r, 3.6);
      m.position.copy(m.userData.home);
      scene.add(m);
      return m;
    });
    const byKey = k => items.find(m => m.userData.key === k);

    /* ---- 小方块堆 ---- */
    const cubes = Array.from({length: 10}, (_, i) => {
      const c = buildCube();
      c.userData.home = new THREE.Vector3(1.9 + (i % 5) * 0.42, 0.52 + ((i / 5) | 0) * 0.38, 3.6);
      c.position.copy(c.userData.home);
      scene.add(c);
      return c;
    });

    /* ---- 排一排用的三个位子：最左边最重 ---- */
    const SLOT_Z = 3.9;
    const slotPos = i => new THREE.Vector3(-1.6 + i * 1.6, 0, SLOT_Z);
    const mats = [0, 1, 2].map(i => {
      const r = 0.5 - i * 0.03;
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.04, 28),
        new THREE.MeshStandardMaterial({color: [0x8a6034, 0xa07a4c, 0xb69468][i], roughness: 0.95}));
      m.position.copy(slotPos(i));
      m.position.y = 0.025;
      m.receiveShadow = true;
      m.visible = false;
      scene.add(m);
      return m;
    });

    /* ---- 状态 ---- */
    const S = {left: [], right: [], tilt: 0, busy: false, step: 0};
    const massOf = list => list.reduce((a, m) => a + m.userData.g, 0);
    const targetTilt = () => tiltOf(massOf(S.left), massOf(S.right));

    /** 托盘随横梁升降，但自己保持水平（真天平的托盘是吊着的）*/
    function layout() {
      const c = Math.cos(S.tilt), s = Math.sin(S.tilt);
      const put = (pan, side, list) => {
        pan.position.set(side * ARM * c, PIVOT.y + side * ARM * s - 0.92, 0);
        list.forEach((m, i) => {
          const col = i % 3, row = (i / 3) | 0;
          m.position.set(
            pan.position.x - 0.34 + col * 0.34,
            pan.position.y + 0.06 + (m.userData.r || 0.17) + row * 0.36,
            -0.3 + col * 0.02 + row * 0.34);
        });
      };
      put(panL, -1, S.left);
      put(panR, 1, S.right);
    }

    ctx.onFrame(dt => {
      const want = targetTilt();
      S.tilt += (want - S.tilt) * Math.min(1, dt * 0.006);   // 阻尼摆动，像真天平
      beam.rotation.z = S.tilt;
      layout();
    });

    /* ---- 放上 / 拿下 ---- */
    async function place(m, side) {
      const list = side === 'L' ? S.left : S.right;
      const from = m.position.clone();
      const c = Math.cos(S.tilt), s = Math.sin(S.tilt);
      const sg = side === 'L' ? -1 : 1;
      const to = new THREE.Vector3(sg * ARM * c, PIVOT.y + sg * ARM * s - 0.72, 0);
      await tween(620, k => {
        const e = ease(k);
        m.position.lerpVectors(from, to, e);
        m.position.y += Math.sin(e * Math.PI) * 1.1;
      });
      list.push(m);
    }
    async function clearPans() {
      const all = [...S.left, ...S.right];
      S.left = []; S.right = [];
      await Promise.all(all.map(async m => {
        const from = m.position.clone();
        await tween(520, k => {
          const e = ease(k);
          m.position.lerpVectors(from, m.userData.home, e);
          m.position.y += Math.sin(e * Math.PI) * 0.9;
        });
        m.position.copy(m.userData.home);
      }));
    }

    /** 把一个物体挪到指定位置，带一个小抛物线，看起来像被拿过去 */
    async function moveTo(m, to, ms = 640) {
      const from = m.position.clone();
      await tween(ms, k => {
        const e = ease(k);
        m.position.lerpVectors(from, to, e);
        m.position.y += Math.sin(e * Math.PI) * 0.9;
      });
      m.position.copy(to);
    }

    /* ---- 点 3D 物体（排一排要用）---- */
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let pickHandler = null;
    ctx.renderer.domElement.addEventListener('pointerdown', e => {
      if (!pickHandler) return;
      const r = ctx.renderer.domElement.getBoundingClientRect();
      ptr.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const targets = items.flatMap(m => m.userData.hitProxy ? [m, m.userData.hitProxy] : [m]);
      const hit = ray.intersectObjects(targets, false)[0];
      if (hit) pickHandler(hit.object.userData.proxyFor || hit.object);
    });

    const settle = () => new Promise(res => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (Math.abs(targetTilt() - S.tilt) < 0.006 || Date.now() - t0 > 3000) {
          clearInterval(iv); res();
        }
      }, 80);
    });

    /* ================= 第 1 步：猜一猜 ================= */
    async function stepGuess() {
      S.step = 0; ui.setStep(0);
      ui.setActions([]); ui.tally([]);
      await clearPans();
      const apple = byKey('apple'), block = byKey('block');

      await ui.say('这是一台天平。哪边沉下去，哪边就更重', {hold: 3400});
      const a = await ui.ask('苹果和小积木，你猜哪个重？', [
        {label: '苹果', icon: '🍎'},
        {label: '小积木', icon: '🧱'},
      ]);
      await Promise.all([place(apple, 'L'), place(block, 'R')]);
      await settle();
      await wait(500);
      await ui.judge(a.index === 0, '苹果那边沉下去了，苹果更重');
      await wait(1200);
      stepBig();
    }

    /* ============ 第 2 步：大的一定重吗（撞前概念）============ */
    async function stepBig() {
      S.step = 1; ui.setStep(1);
      await clearPans();
      const ball = byKey('bigball'), stone = byKey('stone');

      await ui.say('再看这两个：一个大气球，一个小石头', {hold: 3200});
      const a = await ui.ask('这次呢？哪个重？', [
        {label: '大气球', icon: '🎈'},
        {label: '小石头', icon: '🪨'},
      ]);
      await Promise.all([place(ball, 'L'), place(stone, 'R')]);
      await settle();
      await wait(600);
      await ui.judge(a.index === 1, '小石头沉下去了');
      await wait(700);
      await ui.say('原来大的不一定重，小的不一定轻', {hold: 3600});
      await wait(1600);
      stepMeasure();
    }

    /* ================= 第 3 步：用方块量 ================= */
    const MEASURE = ['apple', 'bigball', 'stone'];
    let mi = 0;
    // 常驻指令：孩子一块块加的时候，屏幕上得一直有话说
    const measureHint = () => `${byKey(MEASURE[mi]).userData.name}要几块才平呢？一块一块加加看`;

    async function stepMeasure() {
      S.step = 2; ui.setStep(2);
      await clearPans();
      mi = 0;
      await ui.say('现在我们用一样的小方块，量一量每个东西有多重', {hold: 4000});
      measureOne();
    }

    async function measureOne() {
      await clearPans();
      const it = byKey(MEASURE[mi]);
      await place(it, 'L');
      await settle();
      ui.tally([{label: it.userData.name, count: 0, icon: '🟨'}]);
      await ui.say(measureHint());
      ui.setActions([
        {label: '加一块', primary: true, run: addCube},
        {label: '拿掉一块', ghost: true, run: popCube},
      ]);
    }

    async function addCube() {
      if (S.busy) return;
      const c = cubes.find(x => !S.right.includes(x));
      if (!c) {ui.say('方块用完啦', {hold: 1800}); return;}
      S.busy = true;
      await place(c, 'R');
      await settle();
      afterChange();
      S.busy = false;
    }

    async function popCube() {
      if (S.busy || !S.right.length) return;
      S.busy = true;
      const c = S.right.pop();
      const from = c.position.clone();
      await tween(480, k => {
        const e = ease(k);
        c.position.lerpVectors(from, c.userData.home, e);
        c.position.y += Math.sin(e * Math.PI) * 0.9;
      });
      c.position.copy(c.userData.home);
      await settle();
      afterChange();
      S.busy = false;
    }

    async function afterChange() {
      const it = byKey(MEASURE[mi]);
      const n = S.right.length;
      const dm = massOf(S.left) - massOf(S.right);
      it.userData.blocks = n;
      ui.tally([{label: it.userData.name, count: n, icon: '🟨'}]);

      if (dm === 0) {
        ui.setActions([]);
        await ui.judge(true, `${it.userData.name}正好等于 ${n} 块`);
        await wait(1500);
        mi++;
        if (mi < MEASURE.length) measureOne();
        else stepSort();
      } else if (dm < 0) {
        await ui.say('加多啦，天平往方块那边倒了');
        await wait(600);
        ui.say(measureHint(), {mute: true});
      }
    }

    /* ================= 第 4 步：排一排（真的让孩子排）================= */
    /*
     * 这三个的视觉大小顺序（气球 > 苹果 > 石头）和轻重顺序（石头 > 苹果 > 气球）
     * 完全相反。孩子只能照着刚量出来的方块数排，靠眼睛一定排错 ——
     * 这就是「用一样的东西去量」这件事的价值所在。
     */
    const RANK = ['①', '②', '③'];

    async function stepSort() {
      S.step = 3; ui.setStep(3);
      ui.setActions([]);
      await clearPans();

      const cards = MEASURE.map(byKey);
      const placed = [];

      const refresh = () => ui.tally(cards.map(m => {
        const at = placed.indexOf(m);
        return {
          label: (at >= 0 ? RANK[at] : '') + m.userData.name,
          count: m.userData.blocks,
          icon: '🟨',
        };
      }));

      // 把不参与排序的东西收走，桌面上只留要排的三个
      const aside = [...items.filter(m => !cards.includes(m)), ...cubes];
      aside.forEach(m => m.visible = false);

      // 判定球：比物体本身大一圈的透明球，专门用来接小手指的偏差
      cards.forEach(m => {
        if (m.userData.hitProxy) return;
        const p = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(m.userData.r * 2.1, 0.62), 12, 8),
          new THREE.MeshBasicMaterial({visible: false}));
        p.userData.proxyFor = m;
        m.add(p);
        m.userData.hitProxy = p;
      });

      // 候选摆成一排，镜头拉近到桌面
      await Promise.all(cards.map((m, i) =>
        moveTo(m, new THREE.Vector3(-1.3 + i * 1.3, m.userData.r + 0.35, 1.2))));
      mats.forEach(m => m.visible = true);
      // 排序时镜头压到桌面上，距离按视口现算：
      // 手机上物体要够大（点得准），电脑上又不能把垫子裁掉
      await flyToFit([0, 0.7, 2.5], 2.75, [0, 0.62, 1], 1100);
      refresh();

      // 指令不 await：孩子在念完之前就该能点，否则会以为坏了
      ui.say('最重的放最左边。看方块的数量，从最重的开始点');

      let moving = false;
      await new Promise(done => {
        pickHandler = async m => {
          // 只在物体飞行的那几百毫秒里锁；旁白不挡操作
          if (moving || !cards.includes(m) || placed.includes(m)) return;
          const rest = cards.filter(x => !placed.includes(x));
          const heaviest = rest.reduce((a, b) => b.userData.g > a.userData.g ? b : a);

          if (m !== heaviest) {
            ui.judge(false, '方块多的那个更重');
            return;
          }

          moving = true;
          const i = placed.length;
          placed.push(m);
          const to = slotPos(i);
          to.y = m.userData.r + 0.05;
          await moveTo(m, to);
          refresh();
          moving = false;

          if (placed.length < cards.length) {
            ui.judge(true, `${m.userData.name} ${m.userData.blocks} 块，是剩下里最重的`);
          } else {
            pickHandler = null;
            await ui.judge(true, '全部排好啦');
            done();
          }
        };
      });

      await wait(700);
      finishSort(placed);
    }

    function finishSort(placed) {
      const line = placed
        .map((m, i) => `${RANK[i]} ${m.userData.name} <b>${m.userData.blocks}</b> 块`)
        .join('　→　');

      const again = ui.showResult({
        icon: '⚖️',
        title: '用一样的东西去量，就能排出轻重',
        note: `${line}<br><br>` +
              `最大的<b>气球</b>反而最轻，最小的<b>石头</b>反而最重——<br>` +
              `看大小猜不准，数方块才准。`,
        grown: '这一步是「统一单位」的雏形，也是测量的起点。可以追问两个问题：' +
               '① 如果一个人用积木量、另一个人用石头量，还能比吗？（不能——必须用同一样东西）' +
               '② 石头明明最小，为什么最重？（引出"重不重要看里面塞得紧不紧"，就是密度的种子）' +
               '往后这就是曹冲称象里「等量代换」的底子。',
      });
      again.onclick = () => {ui.hideResult(); reset();};
    }

    /* ================= 重置 ================= */
    async function reset() {
      S.busy = false;
      pickHandler = null;
      mats.forEach(m => m.visible = false);
      items.forEach(m => m.visible = true);
      cubes.forEach(c => c.visible = true);
      camera.position.set(...HOME_CAM);
      controls.target.set(...HOME_TGT);
      await clearPans();
      items.forEach(m => {m.position.copy(m.userData.home); m.userData.blocks = 0;});
      cubes.forEach(c => c.position.copy(c.userData.home));
      ui.tally([]); ui.hideResult();
      stepGuess();
    }

    stepGuess();

    return {actions: [], reset};
  },
};
