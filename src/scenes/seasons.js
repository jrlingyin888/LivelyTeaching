/**
 * 场景：四季是怎么来的（玩具模式）
 * 学科：小学科学 · 地球与宇宙
 *
 * 这一课做成玩具而不是课件，是想清楚之后的一次推倒重来：
 *
 *   脚本模式  时间归脚本 —— 念旁白、播动画、弹窗提问，孩子平均 40 秒才轮到点一下，
 *             而且没法回退，因为压根没有「状态」可回，只有一条跑到哪算哪的协程。
 *   玩具模式  时间归孩子 —— 整个世界是**一天**这个参数的函数，滑块就是那个参数。
 *             拖到哪，世界就长成哪一天的样子。想回去，拖回去。
 *
 * 好在物理本来就是参数化的：太阳高度、昼长、日地距离、地球位置，
 * 全都是 f(第几天)。之前是把一个能自由转的地球仪，做成了一段录像。
 *
 * 公式（全真算，没有一个数是写死的）：
 *   太阳赤纬     δ = 23.44° · sin(2π(N−81)/365)
 *   正午太阳高度  h = 90° − |φ − δ|
 *   影子长度     L = 杆高 / tan(h)
 *   昼长         cos H₀ = −tanφ·tanδ,  昼长 = 2H₀/15 小时
 *   日地距离     r = 1.496 · (1 − 0.0167·cos(2π(N−3)/365)) 亿 km
 *
 * 一个刻意的建模决定：轨道按真实偏心率画（e=0.0167），所以看上去几乎是正圆。
 * 教科书上那种夸张的大椭圆，本身就是「夏天离太阳近」这个误解的来源之一。
 */
import * as THREE from 'three';

/* ===================== 天文常数与公式 ===================== */
const TILT = 23.44;                 // 地轴倾角
const LAT = 40;                     // 观察点：北纬 40°
const ECC = 0.0167;                 // 轨道偏心率 —— 小到画出来就是个圆
const AU = 1.496;                   // 亿 km
const D2R = Math.PI / 180;
const POLE_H = 3.0;                 // 杆高（场景单位）

const decl   = N => TILT * Math.sin(2 * Math.PI * (N - 81) / 365);
const noonH  = (N, lat = LAT) => 90 - Math.abs(lat - decl(N));
const shadow = (N, lat = LAT) => POLE_H / Math.tan(Math.max(2, noonH(N, lat)) * D2R);
const dayLen = (N, lat = LAT) => {
  const d = decl(N);
  const c = Math.max(-1, Math.min(1, -Math.tan(lat * D2R) * Math.tan(d * D2R)));
  return 2 * Math.acos(c) / D2R / 15;
};
const distOf = N => AU * (1 - ECC * Math.cos(2 * Math.PI * (N - 3) / 365));
/** 地球在轨道上的角度：夏至（N=172）在 180°，冬至在 0° */
const theta  = N => (180 + 360 * (N - 172) / 365) * D2R;

const monthOf = N => Math.min(12, Math.floor((N - 1) / 30.4) + 1);
const dayInMonth = N => Math.max(1, Math.round(N - (monthOf(N) - 1) * 30.4));
const SEASON_CN = ['冬天', '春天', '夏天', '秋天'];
const SEASON_EMOJI = ['❄️', '🌸', '☀️', '🍂'];
const seasonIdx = N => {
  const m = monthOf(N);
  return m <= 2 || m === 12 ? 0 : m <= 5 ? 1 : m <= 8 ? 2 : 3;
};

/** 给 check.mjs：这几个公式就是这一课的全部内容，错了就是在教错东西 */
export const PHYS = {TILT, LAT, ECC, decl, noonH, dayLen, distOf, shadow,
                     fluxOf: (N, lat = LAT) => Math.sin(noonH(N, lat) * D2R),
                     dayOf: m => 30.4 * (m - 1) + 15};

/* ===================== 场景 ===================== */
export default {
  id: 'seasons',
  name: '四季是怎么来的',
  icon: '🌍',
  keywords: ['四季', '季节', '公转', '地球绕太阳', '为什么夏天热', '冬天冷', '地轴'],
  subject: '小学科学',
  grade: '小学科学 · 地球与宇宙',
  topic: '公转 · 地轴倾角 · 太阳高度角',
  objects: '太阳、地球、地轴、影子',

  /** 玩具模式：不跑脚本，孩子拖滑块，世界跟着变 */
  toy: true,

  stage: {cameraPos: [0, 6.8, 20], target: [0, 5.2, 0], withWater: false,
          withGround: false, sky: 0x0a1428},

  build(ctx) {
    const {scene, ui, camera, controls} = ctx;

    /* ============ 地面：一根杆和它的影子（主角）============ */
    const ground = new THREE.Group();
    ground.position.y = 1.2;
    scene.add(ground);
    ground.add(new THREE.AmbientLight(0xffffff, 0.9));

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(19, 0.4, 7.6),
      new THREE.MeshStandardMaterial({color: 0x7f9c5f, roughness: 1}));
    floor.position.y = -0.2;
    ground.add(floor);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.15, POLE_H, 14),
      new THREE.MeshStandardMaterial({color: 0xc9773f, roughness: 0.75}));
    pole.position.set(0.5, POLE_H / 2, 0);
    ground.add(pole);

    const shade = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.03, 0.62),
      new THREE.MeshBasicMaterial({color: 0x121d0c, transparent: true, opacity: 0.88}));
    shade.position.y = 0.02;
    shade.position.z = 0;
    ground.add(shade);

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 26, 18),
      new THREE.MeshBasicMaterial({color: 0xffd34d}));
    ground.add(sun);

    // 太阳在右、影子朝左 —— 左上角留给轨道小图。
    // 这道淡弧是太阳一年里能走到的高度范围，一眼看出「能高到哪、低到哪」。
    const SUN_D = 7.4;
    const arcPts = [];
    for (let i = 0; i <= 60; i++) {
      const h = (noonH(355) + (noonH(172) - noonH(355)) * i / 60) * D2R;
      arcPts.push(new THREE.Vector3(SUN_D * Math.cos(h), SUN_D * Math.sin(h), 0));
    }
    ground.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(arcPts),
      new THREE.LineBasicMaterial({color: 0x4d6c8f, transparent: true, opacity: 0.4})));

    // 白天有多长：地面前沿一条昼夜条
    const BAR_W = 10;
    const barDay = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.08, 0.75),
      new THREE.MeshBasicMaterial({color: 0xffcf3d}));
    const barNight = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.08, 0.75),
      new THREE.MeshBasicMaterial({color: 0x1d2f4d}));
    for (const b of [barDay, barNight]) {b.position.set(0, 0.06, -2.6); ground.add(b);}
    // 「白天多长」这条给不识字的孩子看：黄的那截就是白天

    /* ============ 轨道图：地球在哪（配角，上方远处）============ */
    const orbit = new THREE.Group();
    orbit.position.set(-7.2, 9.4, -5);
    orbit.scale.setScalar(0.27);
    scene.add(orbit);

    const oSun = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 30, 20),
      new THREE.MeshBasicMaterial({color: 0xffd34d}));
    orbit.add(oSun);
    orbit.add(new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 24, 16),
      new THREE.MeshBasicMaterial({color: 0xffb23d, transparent: true, opacity: 0.28,
                                   blending: THREE.AdditiveBlending, depthWrite: false})));
    const oLight = new THREE.PointLight(0xfff2d0, 300, 80, 2);
    orbit.add(oLight);

    const R = 9;
    const ring = [];
    for (let i = 0; i <= 240; i++) {
      const N = i / 240 * 365;
      const r = R * (1 - ECC * Math.cos(2 * Math.PI * (N - 3) / 365));
      ring.push(new THREE.Vector3(r * Math.cos(theta(N)), 0, r * Math.sin(theta(N))));
    }
    orbit.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ring),
      new THREE.LineBasicMaterial({color: 0x5c81ad})));

    const earth = new THREE.Group();
    earth.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 34, 24),
      new THREE.MeshStandardMaterial({color: 0x3f86c4, roughness: 0.75})));
    for (const sgn of [1, -1]) {
      earth.add(new THREE.Mesh(
        new THREE.SphereGeometry(1.16, 26, 10, 0, Math.PI * 2,
          sgn > 0 ? 0 : Math.PI * 0.86, Math.PI * 0.14),
        new THREE.MeshStandardMaterial({color: 0xf2f7fb, roughness: 0.9})));
    }
    const eq = new THREE.Mesh(
      new THREE.TorusGeometry(1.17, 0.022, 8, 56),
      new THREE.MeshBasicMaterial({color: 0xffe08a}));
    eq.rotation.x = Math.PI / 2;
    earth.add(eq);
    earth.add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 3.6, 10),
      new THREE.MeshBasicMaterial({color: 0xff6b5b})));
    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 10),
      new THREE.MeshBasicMaterial({color: 0xff3b30}));
    pin.position.set(0, 1.15 * Math.sin(LAT * D2R), 1.15 * Math.cos(LAT * D2R));
    earth.add(pin);
    // 地轴朝向在空间里是固定的（永远指着北极星）—— 这是四季的全部原因
    earth.rotation.z = -TILT * D2R;
    orbit.add(earth);

    /* ============ 世界 = f(第几天) ============ */
    let day = 172;

    function render(N) {
      day = N;
      const h = noonH(N);
      const L = shadow(N);
      const hours = dayLen(N);

      // 影子：长度 = 杆高 / tan(太阳高度)，朝太阳的反方向
      shade.scale.x = L;
      shade.position.x = 0.5 - L / 2;

      // 正午太阳的位置
      const rad = h * D2R;
      sun.position.set(SUN_D * Math.cos(rad), SUN_D * Math.sin(rad), 0);

      // 昼夜条：黄的那截就是白天占一天的比例
      const dw = BAR_W * hours / 24;
      barDay.scale.x = dw;
      barDay.position.set(-BAR_W / 2 + dw / 2, 0.06, -2.6);
      barNight.scale.x = BAR_W - dw;
      barNight.position.set(BAR_W / 2 - (BAR_W - dw) / 2, 0.06, -2.6);

      // 地球在轨道上的位置（含真实偏心率）
      const r = R * (1 - ECC * Math.cos(2 * Math.PI * (N - 3) / 365));
      earth.position.set(r * Math.cos(theta(N)), 0, r * Math.sin(theta(N)));

      // 顶上的字
      const si = seasonIdx(N);
      ui.headline(`${SEASON_EMOJI[si]} ${monthOf(N)}月${dayInMonth(N)}日 · ${SEASON_CN[si]}`);
      ui.facts([
        {label: '中午太阳高', value: h.toFixed(0) + '°'},
        {label: '影子长', value: (L / POLE_H).toFixed(1) + ' 个杆'},
        {label: '白天', value: hours.toFixed(1) + ' 小时'},
        {label: '离太阳', value: (distOf(N) * 10000).toFixed(0) + ' 万公里'},
      ]);
    }

    // 地球自转一点点，画面不至于死板；不影响任何读数
    ctx.onFrame((dt, t) => {earth.rotation.y = t * 0.35;});

    ui.mountToy({min: 1, max: 365, value: day, onInput: render});

    function reset() {
      camera.position.set(...this.stage.cameraPos);
      controls.target.set(...this.stage.target);
      ui.mountToy({min: 1, max: 365, value: 172, onInput: render});
    }

    return {reset: reset.bind(this)};
  },
};
