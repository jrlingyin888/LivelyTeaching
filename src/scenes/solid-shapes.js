/**
 * 场景模板：认识立体图形
 * 学科：一年级数学（人教版一上《认识图形（一）》）
 * 知识点：长方体 · 正方体 · 圆柱 · 球
 *
 * 为什么这个知识点值得做成 3D：
 *   一年级最难的一点是「同一个物体，从不同角度看形状不一样」——
 *   圆柱正面看是长方形，从上面看是圆。实物教具讲这个要举半天，转一下就懂了。
 *
 * 真算的部分：
 *   斜坡滚动 a = g·sinθ / (1 + I/mr²)
 *   球 I/mr² = 2/5，圆柱 = 1/2，方块不滚。
 *   球和圆柱的快慢只差 3%（肉眼看不出），所以教学落点是「能滚 / 不能滚」，
 *   不是「谁更快」——不拿看不见的差别当结论。
 */
import * as THREE from 'three';
import { tween, ease, wait } from '../core/stage.js';

/* ===================== 参数 ===================== */
const G = 9.8;
const RAMP_TOP = [-3.4, 2.0];      // 斜坡顶 [x, y]
const RAMP_LEN = 6.2;              // 斜面长度
const RAMP_DROP = 2.0;             // 落差
const SIN_T = RAMP_DROP / Math.hypot(RAMP_LEN, RAMP_DROP);
const DIR = new THREE.Vector3(RAMP_LEN, -RAMP_DROP, 0).normalize();
const NRM = new THREE.Vector3(RAMP_DROP, RAMP_LEN, 0).normalize();

/** 转动惯量系数 k = I/(mr²)：决定滚多快，null 表示不会滚 */
const SHAPES = [
  {key: 'cuboid', name: '长方体', icon: '📦', color: 0xe8912f, k: null, r: 0.55},
  {key: 'cube',   name: '正方体', icon: '🧊', color: 0x4b8fd0, k: null, r: 0.55},
  {key: 'cyl',    name: '圆柱',   icon: '🥫', color: 0x5aab7a, k: 1 / 2,  r: 0.55},
  {key: 'ball',   name: '球',     icon: '⚽', color: 0xd8574d, k: 2 / 5,  r: 0.6},
];

const rollAccel = k => G * SIN_T / (1 + k);

/* ===================== 建模 ===================== */
function buildShape(s) {
  const mat = new THREE.MeshStandardMaterial({color: s.color, roughness: 0.55, metalness: 0.05});
  let geo;
  if (s.key === 'cuboid') geo = new THREE.BoxGeometry(1.7, 1.1, 1.1);
  else if (s.key === 'cube') geo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  else if (s.key === 'cyl') {
    geo = new THREE.CylinderGeometry(s.r, s.r, 1.5, 40);
  } else geo = new THREE.SphereGeometry(s.r, 32, 24);

  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  m.userData = {...s, baseY: s.key === 'ball' ? s.r : s.key === 'cyl' ? 0.75 : 0.55};
  return m;
}

/** 把圆柱放倒：几何轴转到 z 方向，之后绕 z 转就是「沿 x 滚」 */
function layDown(mesh) {
  if (mesh.userData.key !== 'cyl') return;
  mesh.geometry.rotateX(Math.PI / 2);
  mesh.userData.baseY = mesh.userData.r;
  mesh.userData.lying = true;
}
function standUp(mesh) {
  if (mesh.userData.key !== 'cyl' || !mesh.userData.lying) return;
  mesh.geometry.rotateX(-Math.PI / 2);
  mesh.userData.baseY = 0.75;
  mesh.userData.lying = false;
}

function buildRamp() {
  const g = new THREE.Group();
  const len = Math.hypot(RAMP_LEN, RAMP_DROP);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(len, 0.18, 3.2),
    new THREE.MeshStandardMaterial({color: 0xb98b55, roughness: 0.9}));
  board.position.set(RAMP_TOP[0] + RAMP_LEN / 2, RAMP_TOP[1] - RAMP_DROP / 2, 0);
  board.rotation.z = -Math.atan2(RAMP_DROP, RAMP_LEN);
  board.castShadow = board.receiveShadow = true;
  g.add(board);

  const prop = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, RAMP_TOP[1], 3.0),
    new THREE.MeshStandardMaterial({color: 0x9a7444, roughness: 1}));
  prop.position.set(RAMP_TOP[0] + 0.1, RAMP_TOP[1] / 2, 0);
  prop.castShadow = prop.receiveShadow = true;
  g.add(prop);

  g.visible = false;
  return g;
}

/* ===================== 场景模板导出 ===================== */
export default {
  id: 'solid-shapes',
  name: '认识立体图形',
  icon: '🧊',
  keywords: ['立体图形', '正方体', '长方体', '圆柱', '球', '认识图形'],
  subject: '一年级数学',
  grade: '一年级 · 认识图形',
  topic: '立体图形 · 特征与分类',
  objects: '长方体、正方体、圆柱、球',
  stage: {cameraPos: [0.5, 5.0, 10.5], target: [0, 0.7, 0], withWater: false,
          withGround: true, groundColor: 0xbcd6a8, sky: 0xdcecf5},

  steps: ['认一认', '看一看', '滚一滚', '堆一堆', '分一分'],

  build(ctx) {
    const {scene, ui, flyTo, camera, controls} = ctx;

    const HOME_CAM = [0.5, 5.0, 10.5], HOME_TGT = [0, 0.7, 0];

    /* ---- 四个形状排一排 ---- */
    const shapes = SHAPES.map((s, i) => {
      const m = buildShape(s);
      m.userData.home = new THREE.Vector3(-3.9 + i * 2.6, m.userData.baseY, 0);
      m.position.copy(m.userData.home);
      scene.add(m);
      return m;
    });
    const byKey = k => shapes.find(m => m.userData.key === k);

    const ramp = buildRamp();
    scene.add(ramp);

    const S = {step: 0, named: new Set(), busy: false, rolling: null};

    /* ---- 点形状：说出名字 + 蹦一下 ---- */
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let pickHandler = null;

    ctx.renderer.domElement.addEventListener('pointerdown', e => {
      if (!pickHandler) return;
      const r = ctx.renderer.domElement.getBoundingClientRect();
      ptr.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const hit = ray.intersectObjects(shapes, false)[0];
      if (hit) pickHandler(hit.object);
    });

    async function hop(m) {
      const y0 = m.position.y;
      await tween(420, k => {m.position.y = y0 + Math.sin(ease(k) * Math.PI) * 0.7;});
      m.position.y = y0;
    }

    /* ================= 第 1 步：认一认 ================= */
    const HINT_NAME = '点一点每个图形，听听它们叫什么名字';
    async function stepName() {
      S.step = 0; ui.setStep(0);
      ui.tally([]);
      // 指令不 await：孩子在念完之前就该能点
      ui.say(HINT_NAME);
      pickHandler = async m => {
        if (S.busy) return;
        S.busy = true;
        hop(m);
        await ui.say(`这是${m.userData.name}`);
        S.named.add(m.userData.key);
        ui.tally([{label: '认过', count: S.named.size, icon: '★'}]);
        S.busy = false;
        // 念完名字把常驻指令放回去，屏幕上不能空着没话说
        if (S.named.size < shapes.length) ui.say(HINT_NAME, {mute: true});
        if (S.named.size === shapes.length) {
          pickHandler = null;
          await wait(400);
          ui.tally([]);
          stepLook();
        }
      };
      ui.setActions([
        {label: '我都认识了', primary: true, run: () => {pickHandler = null; ui.tally([]); stepLook();}},
      ]);
    }

    /* ================= 第 2 步：从上面看（3D 的核心价值）========= */
    async function stepLook() {
      S.step = 1; ui.setStep(1);
      ui.setActions([]);
      const cyl = byKey('cyl');
      standUp(cyl);
      cyl.position.copy(cyl.userData.home);
      cyl.position.y = cyl.userData.baseY;

      await ui.say('我们来看看圆柱', {hold: 1600});
      const a = await ui.ask('圆柱从上面往下看，是什么形状？', [
        {label: '圆形', icon: '⚪'},
        {label: '正方形', icon: '🟦'},
        {label: '三角形', icon: '🔺'},
      ]);
      // 飞到圆柱正上方
      await flyTo([cyl.position.x, 7.4, 0.01], [cyl.position.x, 0.7, 0], 1400);
      await wait(500);
      await ui.judge(a.index === 0, '从上面看，圆柱是一个圆');
      await wait(600);
      await flyTo(HOME_CAM, HOME_TGT, 1200);
      stepRoll();
    }

    /* ================= 第 3 步：滚一滚（真物理）================= */
    async function stepRoll() {
      S.step = 2; ui.setStep(2);
      const a = await ui.ask('哪一个能滚下斜坡？', [
        {label: '正方体', icon: '🧊'},
        {label: '球', icon: '⚽'},
        {label: '长方体', icon: '📦'},
      ]);
      await ui.judge(a.index === 1, '圆圆的才能滚');

      ramp.visible = true;
      await ui.say('把它们都放到坡上，一起放手看看', {hold: 2600});

      // 圆柱放倒才能滚——这本身就是个知识点
      const cyl = byKey('cyl');
      layDown(cyl);

      const lanes = [-1.2, -0.4, 0.4, 1.2];
      await Promise.all(shapes.map(async (m, i) => {
        const start = new THREE.Vector3(RAMP_TOP[0], RAMP_TOP[1], lanes[i])
          .addScaledVector(NRM, m.userData.baseY);
        const from = m.position.clone();
        await tween(700, k => m.position.lerpVectors(from, start, ease(k)));
        m.userData.s = 0;
      }));

      await wait(500);
      await ui.say('准备——放！', {hold: 1400});
      S.rolling = {t: 0, done: 0};

      // 等所有会滚的都到底
      const rollers = shapes.filter(m => m.userData.k !== null);
      await new Promise(res => {
        const t0 = Date.now();
        const check = setInterval(() => {
          // 上限兜底：场景被换掉时 onFrame 已经清了，s 永远到不了终点
          if (rollers.every(m => m.userData.s >= RAMP_LEN) || Date.now() - t0 > 8000) {
            clearInterval(check); res();
          }
        }, 100);
      });
      S.rolling = null;
      await wait(400);
      await ui.say('球和圆柱滚下去了，方方的两个一动不动', {hold: 3200});
      await wait(600);
      await ui.judge(true, '圆柱要躺着才能滚，立起来就滚不动了');
      await wait(1400);
      stepStack();
    }

    /* ================= 第 4 步：堆一堆 ================= */
    async function stepStack() {
      S.step = 3; ui.setStep(3);
      ramp.visible = false;
      shapes.forEach(m => {
        standUp(m);
        m.position.copy(m.userData.home);
        m.position.y = m.userData.baseY;
        m.rotation.set(0, 0, 0);
        m.userData.s = 0;
      });
      await wait(300);

      const a = await ui.ask('把它们叠起来，哪一个会滚下来？', [
        {label: '正方体', icon: '🧊'},
        {label: '长方体', icon: '📦'},
        {label: '球', icon: '⚽'},
      ]);
      await ui.judge(a.index === 2, '球只有一个点碰到下面，站不住');

      const cuboid = byKey('cuboid'), cube = byKey('cube'), ball = byKey('ball');
      const moveTo = async (m, p, ms = 700) => {
        const from = m.position.clone();
        await tween(ms, k => {
          const e = ease(k);
          m.position.lerpVectors(from, p, e);
          m.position.y += Math.sin(e * Math.PI) * 0.8;
        });
        m.position.copy(p);
      };

      await moveTo(cuboid, new THREE.Vector3(0, 0.55, 0));
      await moveTo(cube, new THREE.Vector3(0, 1.65, 0));
      await moveTo(ball, new THREE.Vector3(0, 2.8, 0));
      await wait(500);

      // 掉落是真算的：v = g·t，抛物线
      await ui.say('看——球站不住！', {hold: 2000});
      const p0 = ball.position.clone();
      await tween(900, k => {
        const t = k * 0.9;
        ball.position.x = p0.x + 1.9 * t;
        ball.position.y = Math.max(ball.userData.r, p0.y - 0.5 * G * t * t);
        ball.rotation.z -= 0.13;
      });
      ball.position.y = ball.userData.r;
      await wait(700);
      stepSort();
    }

    /* ================= 第 5 步：分一分（结论）================= */
    async function stepSort() {
      S.step = 4; ui.setStep(4);
      const rollers = shapes.filter(m => m.userData.k !== null);
      const blocks = shapes.filter(m => m.userData.k === null);

      const place = (list, x0) => Promise.all(list.map(async (m, i) => {
        const to = new THREE.Vector3(x0 + i * 1.7, m.userData.baseY, 1.2);
        const from = m.position.clone();
        await tween(760, k => {
          const e = ease(k);
          m.position.lerpVectors(from, to, e);
          m.position.y += Math.sin(e * Math.PI) * 0.7;
        });
        m.position.copy(to);
      }));

      await ui.say('我们把它们分成两堆', {hold: 2000});
      await Promise.all([place(rollers, -4.2), place(blocks, 1.5)]);
      ui.tally([
        {label: '能滚', count: rollers.length, icon: '⚪'},
        {label: '不能滚', count: blocks.length, icon: '⬛'},
      ]);
      await wait(700);

      const again = ui.showResult({
        icon: '🎉',
        title: '圆圆的能滚，方方的站得稳',
        note: '球和圆柱有圆圆的面，所以能滚；<br>正方体和长方体每一面都是平的，所以叠得稳。',
        grown: '这一课的落点是"按特征分类"。可以追问：家里还有什么东西是圆柱？（杯子、电池、卷纸）',
      });
      again.onclick = () => {ui.hideResult(); reset();};
    }

    /* ================= 每帧：斜坡滚动 ================= */
    ctx.onFrame(dt => {
      if (!S.rolling) return;
      const sec = dt / 1000;
      for (const m of shapes) {
        const {k, r} = m.userData;
        if (k === null || m.userData.s >= RAMP_LEN) continue;
        const a = rollAccel(k);
        m.userData.v = (m.userData.v || 0) + a * sec;
        const ds = m.userData.v * sec;
        m.userData.s = Math.min(RAMP_LEN, m.userData.s + ds);
        m.position.addScaledVector(DIR, ds);
        m.rotation.z -= ds / r;                 // 无滑滚动：转过的弧长 = 走过的距离
      }
    });

    /* ================= 重置 ================= */
    function reset() {
      S.step = 0; S.named.clear(); S.busy = false; S.rolling = null;
      pickHandler = null;
      ramp.visible = false;
      shapes.forEach(m => {
        standUp(m);
        m.position.copy(m.userData.home);
        m.position.y = m.userData.baseY;
        m.rotation.set(0, 0, 0);
        m.userData.s = 0; m.userData.v = 0;
      });
      camera.position.set(...HOME_CAM);
      controls.target.set(...HOME_TGT);
      ui.tally([]);
      ui.hideResult();
      stepName();
    }

    stepName();

    return {
      actions: [],
      reset,
      /** 给 check 脚本用：不点屏幕也能整条走完 */
      async autoRun() {
        await stepLook();
      },
    };
  },
};
