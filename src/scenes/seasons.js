/**
 * 场景模板：四季是怎么来的
 * 学科：小学科学（表层给一年级）· 深层到高年级 / 初中
 *
 * 这一课的引爆点：绝大多数人（包括很多大人）以为「夏天热是因为地球离太阳近」。
 * 事实正好相反 —— 北半球夏天时地球在远日点附近，比冬天还远 500 万公里。
 *
 * 全部真算，没有一个数是编的：
 *   太阳赤纬   δ = 23.44° · sin(2π(N−81)/365)
 *   正午太阳高度 h = 90° − |φ − δ|
 *   昼长        cos H₀ = −tanφ·tanδ,  昼长 = 2H₀/15 小时
 *   日地距离    r = 1.496 · (1 − 0.0167·cos(2π(N−3)/365)) 亿 km
 *   单位面积能量 ∝ sin(h)
 * 自洽校验：夏至昼长 + 冬至昼长 = 24.00 小时（check.mjs 里有一条在盯）
 *
 * 一个刻意的建模决定：轨道按真实偏心率画（e=0.0167），所以看上去几乎是正圆。
 * 教科书上那种夸张的大椭圆，本身就是「夏天离太阳近」这个错误概念的来源之一。
 */
import * as THREE from 'three';
import { tween, ease, wait } from '../core/stage.js';

/* ===================== 天文常数与公式 ===================== */
const TILT = 23.44;                 // 地轴倾角
const LAT = 40;                     // 观察点：北纬 40°
const ECC = 0.0167;                 // 轨道偏心率 —— 小到画出来就是个圆
const AU = 1.496;                   // 亿 km
const D2R = Math.PI / 180;

const dayOf = m => 30.4 * (m - 1) + 15;                        // 每月取中旬
const decl  = N => TILT * Math.sin(2 * Math.PI * (N - 81) / 365);   // 太阳赤纬
const noonH = (m, lat = LAT) => 90 - Math.abs(lat - decl(dayOf(m)));
const dayLen = (m, lat = LAT) => {
  const d = decl(dayOf(m));
  const c = Math.max(-1, Math.min(1, -Math.tan(lat * D2R) * Math.tan(d * D2R)));
  return 2 * Math.acos(c) / D2R / 15;
};
const distOf = m => AU * (1 - ECC * Math.cos(2 * Math.PI * (dayOf(m) - 3) / 365));
const fluxOf = m => Math.sin(noonH(m) * D2R);                  // 单位面积得到的能量

/** 导出给 check.mjs：这几个公式是这一课的全部内容，错了就是在教错东西 */
export const PHYS = {TILT, LAT, ECC, decl, dayOf, noonH, dayLen, distOf, fluxOf};

/** 地球在轨道上的角度：夏至（N=172）在 180°，冬至在 0° */
const theta = m => (180 + 360 * (dayOf(m) - 172) / 365) * D2R;

const SEASON = {3: 'spring', 6: 'summer', 9: 'autumn', 12: 'winter'};
const CN = {spring: '春天', summer: '夏天', autumn: '秋天', winter: '冬天'};
const EMOJI = {spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️'};

/* ===================== 小工具：3D 文字标签 ===================== */
function makeLabel(text, {size = 46, color = '#14263f', bg = 'rgba(255,255,255,.92)'} = {}) {
  const pad = 18, c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `700 ${size}px -apple-system,"PingFang SC",sans-serif`;
  c.width = Math.ceil(g.measureText(text).width) + pad * 2;
  c.height = size + pad * 2;
  const g2 = c.getContext('2d');
  g2.font = `700 ${size}px -apple-system,"PingFang SC",sans-serif`;
  g2.fillStyle = bg;
  g2.roundRect(0, 0, c.width, c.height, 16);
  g2.fill();
  g2.fillStyle = color;
  g2.textBaseline = 'middle';
  g2.fillText(text, pad, c.height / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthTest: false}));
  sp.scale.set(c.width / c.height * 0.62, 0.62, 1);
  sp.renderOrder = 10;
  sp.visible = !!text.trim();
  sp.userData.setText = t => {   // 复用同一个精灵改文字
    if (!t || !t.trim()) {sp.visible = false; return;}
    sp.visible = true;
    const cc = document.createElement('canvas'), gg = cc.getContext('2d');
    gg.font = `700 ${size}px -apple-system,"PingFang SC",sans-serif`;
    cc.width = Math.ceil(gg.measureText(t).width) + pad * 2;
    cc.height = size + pad * 2;
    const g3 = cc.getContext('2d');
    g3.font = `700 ${size}px -apple-system,"PingFang SC",sans-serif`;
    g3.fillStyle = bg; g3.roundRect(0, 0, cc.width, cc.height, 16); g3.fill();
    g3.fillStyle = color; g3.textBaseline = 'middle'; g3.fillText(t, pad, cc.height / 2);
    sp.material.map.dispose();
    const t2 = new THREE.CanvasTexture(cc);
    t2.colorSpace = THREE.SRGBColorSpace;
    sp.material.map = t2;
    sp.scale.set(cc.width / cc.height * 0.62, 0.62, 1);
  };
  return sp;
}

/* ===================== 场景模板导出 ===================== */
export default {
  id: 'seasons',
  name: '四季是怎么来的',
  icon: '🌍',
  keywords: ['四季', '季节', '公转', '地球绕太阳', '为什么夏天热', '冬天冷', '地轴'],
  subject: '小学科学',
  grade: '小学科学 · 地球与宇宙',
  topic: '公转 · 地轴倾角 · 太阳高度角',
  objects: '太阳、地球、地轴、影子',
  stage: {cameraPos: [0, 9.5, 16.5], target: [0, 0, 0], withWater: false,
          withGround: false, sky: 0x0a1428},

  /* ---------- 教学编排（第 3 步会用生成的版本替换掉这一份）---------- */
  flow: {
    "steps": [
      {
        "name": "地球在转",
        "do": [
          {
            "act": "showSpace"
          },
          {
            "say": "中间这个大火球，是太阳。旁边这个小球，就是我们住的地球",
            "hold": 4000
          },
          {
            "act": "orbitRun",
            "args": {
              "turns": 1
            }
          },
          {
            "say": "地球绕着太阳跑了一整圈。跑完一圈，就是一年",
            "hold": 3800
          },
          {
            "wait": 800
          }
        ]
      },
      {
        "name": "一年四季",
        "do": [
          {
            "say": "这一圈里，我们过了春天、夏天、秋天、冬天",
            "hold": 3600
          },
          {
            "act": "seasonTour"
          },
          {
            "wait": 800
          }
        ]
      },
      {
        "name": "猜一猜",
        "do": [
          {
            "say": "夏天热得要吃冰棍，冬天冷得要穿棉袄。这是为什么呢",
            "hold": 4000
          },
          {
            "ask": "你猜，哪个季节地球离太阳更近？",
            "as": "gNear",
            "options": [
              {
                "label": "夏天",
                "icon": "☀️",
                "value": "summer"
              },
              {
                "label": "冬天",
                "icon": "❄️",
                "value": "winter"
              }
            ]
          },
          {
            "act": "compareDistance",
            "args": {
              "a": 6,
              "b": 12
            },
            "as": "nearer"
          },
          {
            "judge": {
              "expect": "nearer",
              "against": "gNear"
            },
            "hint": "没关系，好多大人也这么猜。量一量才知道，冬天反而离得近一点点"
          },
          {
            "say": "离得近的是冬天，可冬天最冷。看来热不热，不是看远近",
            "hold": 4200
          },
          {
            "wait": 1000
          }
        ]
      },
      {
        "name": "太阳多高",
        "do": [
          {
            "act": "showGround"
          },
          {
            "say": "我们回到地面上。这里立着一根杆子，太阳一照，地上就有影子",
            "hold": 4000
          },
          {
            "ask": "哪个季节的中午，太阳在天上站得更高？",
            "as": "gHigh",
            "options": [
              {
                "label": "夏天",
                "icon": "🌞",
                "value": "summer"
              },
              {
                "label": "冬天",
                "icon": "🌥️",
                "value": "winter"
              }
            ]
          },
          {
            "act": "compareSun",
            "args": {
              "a": 6,
              "b": 12
            },
            "as": "higher"
          },
          {
            "judge": {
              "expect": "higher",
              "against": "gHigh"
            },
            "hint": "再看看影子——影子短的那天，太阳就站得高"
          },
          {
            "say": "夏天的太阳高高的，影子短短的。冬天的太阳低低的，影子拖得好长",
            "hold": 4400
          },
          {
            "tally": [
              {
                "label": "夏天中午的影子",
                "count": 1,
                "icon": "⬛"
              },
              {
                "label": "冬天中午的影子",
                "count": 7,
                "icon": "⬛"
              }
            ]
          },
          {
            "wait": 1200
          }
        ]
      },
      {
        "name": "光摊开了",
        "do": [
          {
            "say": "太阳低低的时候，光是斜着照下来的",
            "hold": 3400
          },
          {
            "act": "energyRatio",
            "args": {
              "a": 6,
              "b": 12
            },
            "as": "spread"
          },
          {
            "say": "一样多的光，斜着照就摊得更开，每一块地分到的就变少了",
            "hold": 4400
          },
          {
            "say": "太阳站得高，地就晒得暖；站得低，地就晒不热",
            "hold": 4200
          },
          {
            "wait": 1000
          }
        ]
      }
    ],
    "result": {
      "icon": "☀️",
      "title": "太阳站得高，天气才会热",
      "note": "{{spread}}<br><br>冬天其实<b>离太阳更近</b>，可还是最冷——<br>因为冬天中午的太阳<b>站得低</b>，光斜着照，摊得开，晒不热。",
      "grown": "真正的原因是地轴倾斜 23.44°：太阳直射点在南北回归线之间往返，正午太阳高度 h = 90° − |纬度 − 赤纬|，单位面积获得的能量正比于 sin(h)，斜射时同一束光摊开的面积是 1/sin(h)。日地距离的影响方向相反且量级很小——北半球冬季（1 月初）恰好处在近日点。可以追问：① 如果地轴不歪，还会有四季吗？② 六月太阳最高，为什么最热的却是七八月？"
    },
    "deeperLabel": "太阳为什么会变高变低？",
    "deeper": [
      {
        "name": "地球歪着",
        "do": [
          {
            "act": "showTilt"
          },
          {
            "say": "把地球拉近看看。它不是直着站的，它是歪着的",
            "hold": 4000
          },
          {
            "say": "歪着转一圈，有半年我们这边朝着太阳，有半年偏开",
            "hold": 4200
          },
          {
            "act": "orbitTo",
            "args": {
              "month": 6
            }
          },
          {
            "say": "六月，我们这边正朝着太阳。太阳就高，天就热",
            "hold": 3800
          },
          {
            "act": "orbitTo",
            "args": {
              "month": 12
            }
          },
          {
            "say": "十二月，我们这边偏开了。太阳就低，天就冷",
            "hold": 3800
          },
          {
            "wait": 800
          }
        ]
      },
      {
        "name": "另一边",
        "do": [
          {
            "say": "地球那么大，另一边也住着小朋友",
            "hold": 3200
          },
          {
            "ask": "在地球另一边，哪个月的中午太阳更高？",
            "as": "gSouth",
            "options": [
              {
                "label": "六月",
                "icon": "🏖️",
                "value": "summer"
              },
              {
                "label": "十二月",
                "icon": "🎄",
                "value": "winter"
              }
            ]
          },
          {
            "act": "compareSun",
            "args": {
              "a": 6,
              "b": 12,
              "lat": -35
            },
            "as": "higherSouth"
          },
          {
            "judge": {
              "expect": "higherSouth",
              "against": "gSouth"
            },
            "hint": "再看看——在那边，十二月的太阳才是高高的"
          },
          {
            "say": "正好和我们反过来。我们过冬天的时候，他们在过夏天",
            "hold": 4000
          },
          {
            "wait": 1000
          }
        ]
      }
    ],
    "deeperResult": {
      "icon": "🌍",
      "title": "地球歪着转，才有了四季",
      "note": "地球一直歪着<b>同一个方向</b>绕太阳转。<br>朝着太阳的那半年，太阳高，是夏天；<br>偏开的那半年，太阳低，是冬天。<br><br>地球两边的季节，正好是反的。",
      "grown": "地轴与公转轨道面的法线成 23.44° 夹角，且在一年中指向基本不变（指向北极星附近）——方向恒定加上公转，才是四季的根本原因。南北半球季节相反，是同一机制的直接推论，不需要额外解释。可以追问：① 赤道上有明显的四季吗？② 北极为什么会有一天太阳整天不落？"
    }
  },

  /* ---------- 内核 ---------- */
  build(ctx) {
    const {scene, ui, flyTo, camera, controls} = ctx;

    /* ============ 布景一：太空（太阳 + 轨道 + 地球）============ */
    const space = new THREE.Group();
    scene.add(space);

    const R = 9;                                  // 轨道半长轴（场景单位）
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 40, 28),
      new THREE.MeshBasicMaterial({color: 0xffd34d}));
    space.add(sun);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(2.1, 32, 24),
      new THREE.MeshBasicMaterial({color: 0xffb23d, transparent: true, opacity: 0.3,
                                   blending: THREE.AdditiveBlending, depthWrite: false}));
    space.add(glow);
    const sunLight = new THREE.PointLight(0xfff2d0, 260, 60, 2);
    space.add(sunLight);

    // 轨道：按真实偏心率画 —— 看上去就是个圆，这本身就是一个知识点
    const pts = [];
    for (let i = 0; i <= 240; i++) {
      const N = i / 240 * 365;
      const r = R * (1 - ECC * Math.cos(2 * Math.PI * (N - 3) / 365));
      const th = (180 + 360 * (N - 172) / 365) * D2R;
      pts.push(new THREE.Vector3(r * Math.cos(th), 0, r * Math.sin(th)));
    }
    space.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({color: 0x4e6f96})));

    // 地球：故意画成示意图 —— 蓝球 + 极冠 + 赤道 + 地轴，不放假地图
    const earth = new THREE.Group();
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 40, 28),
      new THREE.MeshStandardMaterial({color: 0x3f86c4, roughness: 0.75}));
    earth.add(globe);
    for (const sgn of [1, -1]) {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.855, 28, 10, 0, Math.PI * 2, sgn > 0 ? 0 : Math.PI * 0.86, Math.PI * 0.14),
        new THREE.MeshStandardMaterial({color: 0xf2f7fb, roughness: 0.9}));
      earth.add(cap);
    }
    const equator = new THREE.Mesh(
      new THREE.TorusGeometry(0.86, 0.016, 8, 64),
      new THREE.MeshBasicMaterial({color: 0xffe08a}));
    equator.rotation.x = Math.PI / 2;
    earth.add(equator);
    const axis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 2.7, 10),
      new THREE.MeshBasicMaterial({color: 0xff6b5b}));
    earth.add(axis);
    // 观察点：北纬 40° 的小旗
    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 10),
      new THREE.MeshBasicMaterial({color: 0xff3b30}));
    pin.position.set(0, 0.85 * Math.sin(LAT * D2R), 0.85 * Math.cos(LAT * D2R));
    earth.add(pin);

    // 地轴朝向在空间里是固定的：北极永远偏向 +X。这是四季的全部原因。
    earth.rotation.z = -TILT * D2R;
    space.add(earth);

    const seasonTag = makeLabel('　　　　', {size: 40});
    seasonTag.position.set(0, 2.0, 0);
    earth.add(seasonTag);

    const infoTag = makeLabel('　　　　', {size: 38, bg: 'rgba(255,255,255,.95)'});
    infoTag.position.set(0, 3.4, 0);
    infoTag.visible = false;
    space.add(infoTag);

    const posAt = m => {
      const N = dayOf(m);
      const r = R * (1 - ECC * Math.cos(2 * Math.PI * (N - 3) / 365));
      const th = theta(m);
      return new THREE.Vector3(r * Math.cos(th), 0, r * Math.sin(th));
    };
    let curMonth = 12;
    earth.position.copy(posAt(curMonth));

    /* ============ 布景二：地面（杆 + 影子 + 光斑）============ */
    const ground = new THREE.Group();
    ground.visible = false;
    scene.add(ground);
    ground.add(new THREE.AmbientLight(0xffffff, 0.85));

    const GW = 24;   // 冬天影子长达 4.4 个单位，地面要放得下
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(GW, 0.3, 8),
      new THREE.MeshStandardMaterial({color: 0x8fae6b, roughness: 1}));
    floor.position.y = -0.15;
    ground.add(floor);

    /** 一根杆 + 它的影子 + 一束固定宽度的阳光 + 地上的光斑 */
    function makeRig(x, tint) {
      const g = new THREE.Group();
      g.position.x = x;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 2.2, 12),
        new THREE.MeshStandardMaterial({color: 0xbf6a3a, roughness: 0.8}));
      pole.position.y = 1.1;
      g.add(pole);
      const shadow = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.02, 0.3),
        new THREE.MeshBasicMaterial({color: 0x1d2b1a, transparent: true, opacity: 0.78}));
      shadow.position.y = 0.012;
      g.add(shadow);
      const disc = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 20, 14),
        new THREE.MeshBasicMaterial({color: 0xffd34d}));
      g.add(disc);
      // 阳光束：宽度固定，斜着照下来落在地上的光斑就会摊得更大
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.04, 1.1),
        new THREE.MeshBasicMaterial({color: 0xffe9a8, transparent: true, opacity: 0.34}));
      g.add(beam);
      const patch = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.03, 1.1),
        new THREE.MeshBasicMaterial({color: tint, transparent: true, opacity: 0.72}));
      patch.position.y = 0.02;
      g.add(patch);
      const tag = makeLabel('　', {size: 38});
      tag.position.set(0, 2.9, 0);
      g.add(tag);
      g.userData = {pole, shadow, disc, beam, patch, tag};
      ground.add(g);
      return g;
    }
    const rigA = makeRig(-5.2, 0xffb03a);   // 夏
    const rigB = makeRig(5.2, 0x6fa8dc);    // 冬
    // 只出一根杆的时候要摆到画面中间，两根并排时才分开
    const soloRig = solo => {rigA.position.x = solo ? 0 : -5.2;};
    rigB.visible = false;

    /** 按太阳高度角摆好：影子长度 = 杆高 / tan(h)，光斑宽度 = 束宽 / sin(h) */
    function setRig(rig, m, {showBeam = false, lat = LAT} = {}) {
      const h = noonH(m, lat);
      const rad = h * D2R;
      const POLE = 2.2, BEAM_W = 0.9;
      const shLen = POLE / Math.tan(rad);
      const {shadow, disc, beam, patch} = rig.userData;

      shadow.scale.x = shLen;
      shadow.position.x = shLen / 2;                 // 影子朝 +x（北半球正午朝北）

      const D = 5.2;
      disc.position.set(-D * Math.cos(rad), D * Math.sin(rad), 0);

      beam.visible = showBeam;
      patch.visible = showBeam;
      if (showBeam) {
        const patchW = BEAM_W / Math.sin(rad);
        patch.scale.x = patchW;
        patch.position.x = 0;
        beam.position.set(-1.5 * Math.cos(rad), 1.5 * Math.sin(rad), 0);
        beam.rotation.z = -(90 * D2R - rad);
      }
      return h;
    }

    /* ============ 镜头预设 ============ */
    const CAM = {
      space:  {pos: [0, 9.5, 16.5], tgt: [0, 0, 0]},
      close:  {pos: [-6.5, 3.4, 7.5], tgt: [-8.4, 0.3, 0]},
      ground: {pos: [0, 4.2, 15.5], tgt: [0, 1.5, 0]},
    };
    const goCam = (k, ms = 1200) => flyTo(CAM[k].pos, CAM[k].tgt, ms);

    /* ===================== 编排能调的动作 ===================== */

    /** 切到太空布景：太阳 + 轨道 + 地球，镜头拉到全景 */
    async function showSpace() {
      space.visible = true;
      ground.visible = false;
      infoTag.visible = false;
      rigB.visible = false;
      await goCam('space', 900);
    }

    /** 地球绕太阳跑 n 圈 */
    async function orbitRun({turns = 1} = {}) {
      const from = curMonth;
      await tween(3600 * turns, k => {
        const m = from + k * 12 * turns;
        earth.position.copy(posAt(m));
      });
      curMonth = from;
      earth.position.copy(posAt(curMonth));
      return 'year';
    }

    /** 转到某个月，把季节标出来 */
    async function orbitTo({month}) {
      const from = curMonth;
      let d = month - from;
      while (d <= 0) d += 12;                       // 永远顺着转，不倒车
      await tween(1500, k => earth.position.copy(posAt(from + d * ease(k))));
      curMonth = month;
      earth.position.copy(posAt(month));
      const s = SEASON[month];
      if (s) seasonTag.userData.setText(`${EMOJI[s]} ${CN[s]}`);
      return s;
    }

    /** 春→夏→秋→冬走一遍，每站停一下 */
    async function seasonTour() {
      for (const m of [3, 6, 9, 12]) {
        await orbitTo({month: m});
        await ui.say(`跑到这里，我们这里是${CN[SEASON[m]]}`, {hold: 2200});
        await wait(500);
      }
      return 'done';
    }

    /** 切到地面布景：一根杆和它的影子，镜头压到地面高度。lat 是观察点纬度 */
    async function showGround({lat = LAT} = {}) {
      space.visible = false;
      ground.visible = true;
      rigA.visible = true; rigB.visible = false;
      soloRig(true);
      setRig(rigA, 6, {lat});
      rigA.userData.tag.userData.setText('？');
      await goCam('ground', 1000);
      return lat;
    }

    /**
     * 并排比两个月的正午太阳高度：真算 h = 90° − |φ − δ|，
     * 影子长度按 杆高/tan(h) 摆出来。lat 可以传负数看南半球。
     * 返回太阳更高的那个月的键（6→'summer'、12→'winter'，按月份定，与半球无关）。
     */
    async function compareSun({a = 6, b = 12, lat = LAT} = {}) {
      ground.visible = true;
      rigA.visible = rigB.visible = true;
      soloRig(false);
      const ha = setRig(rigA, a, {lat}), hb = setRig(rigB, b, {lat});
      // 南半球不能叫「夏天/冬天」—— 那是北半球的说法，只报月份
      const name = m => lat >= 0 ? CN[SEASON[m]] : `${m}月`;
      rigA.userData.tag.userData.setText(`${name(a)} ${ha.toFixed(0)}°`);
      rigB.userData.tag.userData.setText(`${name(b)} ${hb.toFixed(0)}°`);
      await wait(1400);
      return ha >= hb ? SEASON[a] : SEASON[b];
    }

    /** 比两个月的日地距离，返回**更近**的那个月对应的季节 */
    async function compareDistance({a = 6, b = 12} = {}) {
      await showSpace();
      const da = distOf(a), db = distOf(b);
      infoTag.visible = true;
      for (const [m, d] of [[a, da], [b, db]]) {
        await orbitTo({month: m});
        infoTag.userData.setText(`${CN[SEASON[m]]}：离太阳 ${(d * 10000).toFixed(0)} 万公里`);
        await wait(2200);
      }
      infoTag.userData.setText(
        `${CN[SEASON[a]]} ${(da * 10000).toFixed(0)} 万  ·  ${CN[SEASON[b]]} ${(db * 10000).toFixed(0)} 万公里`);
      await wait(1200);
      return da <= db ? SEASON[a] : SEASON[b];
    }

    /** 亮出地轴：镜头拉近到地球，让 23.44° 的倾斜看得清楚 */
    async function showTilt() {
      await showSpace();
      await orbitTo({month: 6});
      await goCam('close', 1200);
      infoTag.visible = true;
      infoTag.userData.setText(`地轴一直斜着 ${TILT}°，方向从不改变`);
      await wait(2600);
      return TILT;
    }

    /**
     * 光斑对比：同一束宽度的阳光，斜着照摊开的面积 = 束宽 / sin(h)。
     * 返回一句给结论卡用的话 —— 数字全是算的。
     */
    async function energyRatio({a = 6, b = 12, lat = LAT} = {}) {
      space.visible = false;
      ground.visible = true;
      rigA.visible = rigB.visible = true;
      soloRig(false);
      const ha = setRig(rigA, a, {showBeam: true, lat});
      const hb = setRig(rigB, b, {showBeam: true, lat});
      await goCam('ground', 1000);

      const angle = Math.sin(noonH(a, lat) * D2R) / Math.sin(noonH(b, lat) * D2R);  // 角度带来的差
      const far = (distOf(a) / distOf(b)) ** 2;                  // 距离带来的差（反向）
      rigA.userData.tag.userData.setText(`${CN[SEASON[a]]} 太阳高 ${ha.toFixed(0)}°`);
      rigB.userData.tag.userData.setText(`${CN[SEASON[b]]} 太阳高 ${hb.toFixed(0)}°`);
      await wait(2600);

      return `同一块地方，${CN[SEASON[a]]}拿到的阳光是${CN[SEASON[b]]}的 <b>${angle.toFixed(1)} 倍</b>；<br>` +
             `而离得远近，只让它少了 <b>${((1 - 1 / far) * 100).toFixed(0)}%</b>。<br>` +
             `<b>角度赢得太多了</b>，远近根本不够看。`;
    }

    /* ---------- 重置 ---------- */
    function reset() {
      space.visible = true;
      ground.visible = false;
      rigA.visible = true; rigB.visible = false;
      soloRig(true);
      infoTag.visible = false;
      curMonth = 12;
      earth.position.copy(posAt(curMonth));
      seasonTag.userData.setText('　　　　');
      camera.position.set(...CAM.space.pos);
      controls.target.set(...CAM.space.tgt);
      ui.setActions([]); ui.tally([]); ui.hideResult();
    }

    // 这几个是长动画（绕一圈 20 秒、四季巡游 20 秒），不是卡住
    orbitRun.patient = true;
    seasonTour.patient = true;
    compareDistance.patient = true;

    return {
      actions: {showSpace, orbitRun, orbitTo, seasonTour, showGround,
                compareSun, compareDistance, showTilt, energyRatio},
      reset,
    };
  },
};
