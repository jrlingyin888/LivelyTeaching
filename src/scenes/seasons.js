/**
 * 场景：四季是怎么来的（玩具模式 · 两根轴）
 * 学科：小学科学 · 地球与宇宙
 *
 * 两根滑块 = 一个可以自由逛的二维世界：
 *   第几天（1-365）  地球走到轨道哪儿、太阳能爬多高、白天多长
 *   几点（0-24）     太阳在天上的走位、影子转到哪个方向、天什么颜色
 *
 * 拖「几点」看日夜更替，拖「第几天」换季节，两根一起拖就明白了：
 * 夏天太阳从东北方升起、爬得很高、很晚才落；冬天从东南方勉强露头、
 * 一天都是斜着照、下午四点就擦黑。
 *
 * 全真算。太阳在天上的位置用地平坐标系三分量给全（e 东 / n 北 / u 天顶）：
 *   e = −cos δ · sin H
 *   n =  sin δ · cos φ − cos δ · sin φ · cos H
 *   u =  sin δ · sin φ + cos δ · cos φ · cos H
 *   其中 δ 是太阳赤纬，φ 是纬度，H = (时刻 − 12) × 15° 是时角
 * 影子不是画的，是真的 —— 一盏平行光摆在太阳的方向上，Three.js 投出来的。
 *
 * 一个刻意的建模决定：轨道按真实偏心率画（e=0.0167），看上去几乎是正圆。
 * 教科书那种夸张的大椭圆，本身就是「夏天离太阳近」这个误解的来源之一。
 */
import * as THREE from 'three';

/* ===================== 天文 ===================== */
const TILT = 23.44, LAT = 40, ECC = 0.0167, AU = 1.496, D2R = Math.PI / 180;
const PERSON_H = 1.75;

const decl = N => TILT * Math.sin(2 * Math.PI * (N - 81) / 365);

/** 太阳在地平坐标系里的单位向量。e 东、n 北、u 天顶 */
function sunVec(N, hour, lat = LAT) {
  const d = decl(N) * D2R, p = lat * D2R, H = (hour - 12) * 15 * D2R;
  return {
    e: -Math.cos(d) * Math.sin(H),
    n: Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H),
    u: Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(H),
  };
}
const altOf = v => Math.asin(Math.max(-1, Math.min(1, v.u))) / D2R;
/** 影子长 = 身高 / tan(太阳高度)。太阳越低影子越长，落到地平线就没有影子了 */
const shadowRatio = v => v.u <= 0.02 ? Infinity : Math.hypot(v.e, v.n) / v.u;

const noonH = (N, lat = LAT) => 90 - Math.abs(lat - decl(N));
const dayLen = (N, lat = LAT) => {
  const d = decl(N);
  const c = Math.max(-1, Math.min(1, -Math.tan(lat * D2R) * Math.tan(d * D2R)));
  return 2 * Math.acos(c) / D2R / 15;
};
const distOf = N => AU * (1 - ECC * Math.cos(2 * Math.PI * (N - 3) / 365));
const theta = N => (180 + 360 * (N - 172) / 365) * D2R;

const monthOf = N => Math.min(12, Math.floor((N - 1) / 30.4) + 1);
const dayInMonth = N => Math.max(1, Math.round(N - (monthOf(N) - 1) * 30.4));
const SEASON_CN = ['冬天', '春天', '夏天', '秋天'];
const SEASON_EMOJI = ['❄️', '🌸', '☀️', '🍂'];
const seasonIdx = N => {const m = monthOf(N); return m <= 2 || m === 12 ? 0 : m <= 5 ? 1 : m <= 8 ? 2 : 3;};
const clock = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/**
 * 北极方向 · 指向太阳方向，两个单位向量的点积。
 * 这一条锁的是「地轴不在轨道平面里」这个几何事实：
 *   两分点必须是 0（垂直），两至点是 ±sin(23.44°)=±0.398
 * 我曾经把轨道画成 XY 平面上的扁椭圆、地轴也塞在同一平面里，
 * 两至点碰巧看着对，两分点却算出 156° 和 30°（都该是 90°）——
 * 肉眼在那张十几像素的小图上根本看不出来。
 */
const poleDotSun = N => {
  const th = theta(N);
  const ax = [Math.sin(TILT * D2R), Math.cos(TILT * D2R), 0];   // 北极，空间中固定
  const toSun = [-Math.cos(th), 0, -Math.sin(th)];              // 轨道在水平面上
  return ax[0] * toSun[0] + ax[1] * toSun[1] + ax[2] * toSun[2];
};

export const PHYS = {
  poleDotSun,
  TILT, LAT, ECC, decl, noonH, dayLen, distOf, sunVec, altOf,
  shadow: N => 1 / Math.tan(noonH(N) * D2R),
  fluxOf: (N, lat = LAT) => Math.sin(noonH(N, lat) * D2R),
  dayOf: m => 30.4 * (m - 1) + 15,
  /**
   * 明确告诉 check.mjs 该扫哪几个：这些必须是 f(第几天) → 数，
   * 而且拖一整年都得明显变化，否则滑块就是个装饰。
   * 显式列出来，比让检查去猜每个导出函数的签名靠谱。
   */
  driven: ['decl', 'noonH', 'dayLen', 'distOf', 'shadow', 'fluxOf'],
};

/* ===================== 贴图小工具 ===================== */
/** 一块地上的字（东/南/西/北）。没标注的白杠会被当成不明痕迹 */
function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '700 84px -apple-system,"PingFang SC",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,.72)';
  g.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: t, transparent: true, depthWrite: false, opacity: 0.85}));
  sp.scale.setScalar(1.5);
  return sp;
}


/** 一张径向渐变，用来做太阳的光晕。比上一整套后期便宜太多，效果也够 */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0.00, 'rgba(255,255,240,1)');
  grd.addColorStop(0.12, 'rgba(255,238,170,.95)');
  grd.addColorStop(0.30, 'rgba(255,190,90,.45)');
  grd.addColorStop(0.60, 'rgba(255,150,60,.13)');
  grd.addColorStop(1.00, 'rgba(255,140,50,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ===================== 场景 ===================== */
export default {
  id: 'seasons',
  name: '四季是怎么来的',
  icon: '🌍',
  keywords: ['四季', '季节', '公转', '地球绕太阳', '为什么夏天热', '冬天冷', '地轴', '日夜', '昼夜'],
  subject: '小学科学',
  grade: '小学科学 · 地球与宇宙',
  topic: '公转 · 地轴倾角 · 太阳高度角 · 昼夜',
  objects: '太阳、地球、地轴、影子、小人',
  toy: true,

  // 面朝正南：太阳从左边（东）升起，正前方（南）最高，右边（西）落下
  stage: {cameraPos: [0, 3.8, -15.5], target: [0, 5.3, 1.6], withWater: false,
          withGround: false, withLights: false, sky: 0x0a1428},

  build(ctx) {
    const {scene, ui, camera, controls} = ctx;
    scene.background = null;
    scene.fog = null;

    /* ---------- 天空穹顶：颜色由太阳高度驱动 ---------- */
    const skyUni = {
      top: {value: new THREE.Color(0x2b6cb0)},
      bottom: {value: new THREE.Color(0xbcdcf2)},
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(120, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, uniforms: skyUni,
        vertexShader: `varying vec3 vP; void main(){ vP = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
          void main(){ float h = normalize(vP).y;
            gl_FragColor = vec4(mix(bottom, top, clamp(h*1.15+0.16, 0.0, 1.0)), 1.0); }`,
      }));
    scene.add(sky);

    /* ---------- 星空 ---------- */
    const STAR_N = 2200, sp = new Float32Array(STAR_N * 3), ss = new Float32Array(STAR_N);
    for (let i = 0; i < STAR_N; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 108;
      const s = Math.sqrt(1 - u * u);
      sp.set([r * s * Math.cos(a), r * Math.abs(u) * 0.9 + 2, r * s * Math.sin(a)], i * 3);
      ss[i] = 0.28 + Math.random() * Math.random() * 1.5;   // 少数几颗特别亮，像真的
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(ss, 1));
    const starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {alpha: {value: 0}},
      vertexShader: `attribute float size; varying float vS;
        void main(){ vS = size; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * 260.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float alpha; varying float vS;
        void main(){ float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(1.0, 0.97, 0.9, alpha * smoothstep(0.5, 0.0, d) * min(1.0, vS)); }`,
    });
    scene.add(new THREE.Points(starGeo, starMat));

    /* ---------- 太阳 ---------- */
    const SKY_R = 9.5;   // 天球半径。压得小，是为了让「人 + 影子 + 一整条太阳轨迹」同框
    const sunBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 26, 18),
      new THREE.MeshBasicMaterial({color: 0xfff3c4}));
    scene.add(sunBall);
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending}));
    sunGlow.scale.setScalar(7);
    scene.add(sunGlow);

    // 这一天太阳走过的整条路线
    const pathMat = new THREE.LineBasicMaterial({color: 0xfff0c0, transparent: true, opacity: 0.75});
    let sunPath = new THREE.Line(new THREE.BufferGeometry(), pathMat);
    scene.add(sunPath);

    /* ---------- 光 ---------- */
    const sunLight = new THREE.DirectionalLight(0xfff0d4, 2.5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    Object.assign(sunLight.shadow.camera,
      {left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 70});
    sunLight.shadow.bias = -0.0012;
    scene.add(sunLight, sunLight.target);
    const ambient = new THREE.HemisphereLight(0xcfe6ff, 0x4a5d3a, 0.8);
    scene.add(ambient);

    /* ---------- 地面 ---------- */
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(10.5, 64),
      new THREE.MeshStandardMaterial({color: 0x76965a, roughness: 1}));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 只标东和西 —— 这两个才是要紧的（太阳从东边升、西边落）。
    // 南北标了会正好糊在小人脑袋边上，反而添乱。
    // 面朝正南，所以东在画面左边、西在右边。
    for (const [cn, x] of [['东', 9.4], ['西', -9.4]]) {
      const sp = labelSprite(cn);
      sp.position.set(x, 0.55, 0);
      scene.add(sp);
    }

    /* ---------- 一根杆 + 一个小人（都投真影子）---------- */
    const POLE_H = 3.0;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, POLE_H, 14),
      new THREE.MeshStandardMaterial({color: 0xd08a4a, roughness: 0.7}));
    pole.position.set(2.1, POLE_H / 2, 2.2);
    pole.castShadow = true;
    scene.add(pole);

    /** 小人：比一根杆好懂得多 —— 影子多长，一眼能跟自己比 */
    function buildPerson() {
      const g = new THREE.Group();
      const skin = new THREE.MeshStandardMaterial({color: 0xf0c9a0, roughness: 0.85});
      const shirt = new THREE.MeshStandardMaterial({color: 0xe4573f, roughness: 0.8});
      const pants = new THREE.MeshStandardMaterial({color: 0x35548c, roughness: 0.85});
      const hair = new THREE.MeshStandardMaterial({color: 0x2b2118, roughness: 0.95});

      const add = (mesh, x, y, z) => {mesh.position.set(x, y, z); g.add(mesh); return mesh;};
      for (const s of [-1, 1]) {
        add(new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.62, 6, 12), pants), s * 0.14, 0.42, 0);
        add(new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 6, 12), skin), s * 0.31, 1.05, 0);
      }
      add(new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.44, 6, 14), shirt), 0, 1.06, 0);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 16), skin), 0, 1.55, 0);
      const h = add(new THREE.Mesh(new THREE.SphereGeometry(0.225, 20, 16, 0, Math.PI * 2, 0, 1.5), hair), 0, 1.57, 0);
      h.scale.set(1, 0.85, 1);
      g.traverse(o => {if (o.isMesh) o.castShadow = true;});
      return g;
    }
    const person = buildPerson();
    person.position.set(-0.7, 0, 2.2);
    scene.add(person);

    /* ---------- 左上角的轨道小图 ---------- */
    /*
     * 这张图必须建成**真 3D**，不能拿二维椭圆凑：
     * 轨道是水平面上的一个圆，地轴从这个面里竖出来、偏 23.44°。
     *
     * 之前偷懒把轨道画成 XY 平面上的扁椭圆、地轴也放在同一个平面里 ——
     * 几何上根本不可能（地轴躺在了轨道面内）。两至点碰巧看着对，
     * 但地球走到椭圆上下两端（春分秋分）时，地轴会荒唐地指向太阳：
     * 实测春分 156°、秋分 30°，而正确答案两个都该是 90°。
     */
    const orbitHUD = new THREE.Group();     // 不参与倾斜，只负责底衬和贴边
    orbitHUD.position.set(0, 8.7, -1);
    scene.add(orbitHUD);


    const orbit = new THREE.Group();
    // 绕 X 轴压一下，就是「从斜上方看这个水平轨道面」，椭圆是这么来的，不是画扁的
    orbit.rotation.x = -24.8 * D2R;
    orbitHUD.add(orbit);

    orbit.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 24, 16),
      new THREE.MeshBasicMaterial({color: 0xffd34d})));

    const R = 9, ring = [];
    for (let i = 0; i <= 200; i++) {
      const N = i / 200 * 365;
      const r = R * (1 - ECC * Math.cos(2 * Math.PI * (N - 3) / 365));
      ring.push(new THREE.Vector3(r * Math.cos(theta(N)), 0, r * Math.sin(theta(N))));
    }
    orbit.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring),
      new THREE.LineBasicMaterial({color: 0x7ba4d0, transparent: true, opacity: 0.85})));

    /*
     * 小地球分三件，各管各的：
     *   oEarth  在轨道上的位置，不带旋转
     *   oNight  背着太阳的那半个球壳，绕自己的 Y 轴转到背光方向
     *   oTilt   地轴倾角，**定死**。这是四季的全部原因，任何地方都不许动它
     */
    const oEarth = new THREE.Group();
    oEarth.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 26, 20),
      new THREE.MeshBasicMaterial({color: 0x5aa3dd})));

    /*
     * 一条竖直参照线（轨道面的法线方向）。
     * 光给一根斜杆，看不出「斜了多少」—— 透视还会把屏幕上的视角
     * 放大到 28°~33°（模型里是精确的 23.44°）。
     * 有了这条参照，倾斜就变成了可以直接对比的东西，不用去量角度。
     */
    const oUp = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        [new THREE.Vector3(0, -1.8, 0), new THREE.Vector3(0, 1.8, 0)]),
      new THREE.LineDashedMaterial({color: 0xffffff, transparent: true, opacity: 0.4,
                                    dashSize: 0.22, gapSize: 0.18}));
    oUp.computeLineDistances();
    oEarth.add(oUp);

    const oTilt = new THREE.Group();
    oTilt.rotation.z = -TILT * D2R;
    oTilt.add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8),
      new THREE.MeshBasicMaterial({color: 0xff6b5b})));
    oEarth.add(oTilt);
    orbit.add(oEarth);

    /*
     * 小图贴着画面左边缘放（面朝正南，+x 是东，也就是屏幕左边）。
     * 位置得按视口现算 —— 写死的话竖屏会被切掉一半，宽屏又离边太远。
     * 注意视锥半宽要按**沿视线的深度**算：用相机到物体的直线距离会偏大，
     * 偏离画面中心越远越离谱，结果是把它推出画面外。
     */
    const ORBIT_W = 21;   // 轨道本身的宽度（本地单位），用来算贴边
    const _dir = new THREE.Vector3(), _rel = new THREE.Vector3();
    function placeOrbit() {
      camera.getWorldDirection(_dir);
      _rel.subVectors(orbitHUD.position, camera.position);
      const depth = Math.max(1, _rel.dot(_dir));
      const halfW = Math.tan(camera.fov / 2 * D2R) * depth * camera.aspect;
      const sc = Math.min(0.235, (halfW - 0.5) * 1.8 / ORBIT_W);
      orbitHUD.scale.setScalar(sc);
      orbitHUD.position.x = halfW - ORBIT_W * sc / 2 - 0.45;
    }
    placeOrbit();

    /* ============ 世界 = f(第几天, 几点) ============ */
    const C = {
      dayTop: new THREE.Color(0x2b6cb0), dayBot: new THREE.Color(0xbcdcf2),
      duskTop: new THREE.Color(0x24365f), duskBot: new THREE.Color(0xe4823f),
      nightTop: new THREE.Color(0x040812), nightBot: new THREE.Color(0x0e1830),
    };
    const tmpA = new THREE.Color(), tmpB = new THREE.Color();
    let curDay = -1;      // 故意设成不可能的值，保证第一帧就把轨迹线建出来

    function rebuildPath(N) {
      const pts = [];
      for (let i = 0; i <= 240; i++) {
        const v = sunVec(N, i / 240 * 24);
        if (v.u > -0.01) pts.push(new THREE.Vector3(v.e * SKY_R, v.u * SKY_R, -v.n * SKY_R));
      }
      sunPath.geometry.dispose();
      sunPath.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    }

    function render({day, hour}) {
      if (day !== curDay) {curDay = day; rebuildPath(day);}

      const v = sunVec(day, hour);
      const alt = altOf(v);
      const up = v.u > 0;

      // 太阳的位置（地平坐标系 → 世界：x 东、y 天顶、z 南）
      sunBall.position.set(v.e * SKY_R, v.u * SKY_R, -v.n * SKY_R);
      sunGlow.position.copy(sunBall.position);
      sunBall.visible = sunGlow.visible = v.u > -0.06;
      // 快落山时又大又红，跟真的一样
      const low = Math.max(0, 1 - Math.max(0, alt) / 12);
      sunGlow.scale.setScalar(7 + low * 5.5);
      sunBall.material.color.setHex(low > 0.5 ? 0xff9a4d : 0xfff3c4);

      // 平行光摆到太阳方向上 —— 影子是 Three.js 真投出来的，不是画的
      sunLight.position.set(v.e * 42, Math.max(0.02, v.u) * 42, -v.n * 42);
      sunLight.intensity = up ? 0.5 + 2.3 * Math.min(1, v.u * 2.2) : 0;
      sunLight.castShadow = up && v.u > 0.05;

      // 天色：白天蓝、擦黑橙、夜里深蓝。这一段是「真实感」里最值钱的
      const k = Math.max(0, Math.min(1, (alt + 6) / 14));        // −6°→0，8°→1
      const night = Math.max(0, Math.min(1, -alt / 10));
      tmpA.copy(C.nightTop).lerp(C.duskTop, 1 - night).lerp(C.dayTop, Math.max(0, k * 2 - 1));
      tmpB.copy(C.nightBot).lerp(C.duskBot, 1 - night).lerp(C.dayBot, Math.max(0, k * 2 - 1));
      skyUni.top.value.copy(tmpA);
      skyUni.bottom.value.copy(tmpB);
      starMat.uniforms.alpha.value = night;
      ambient.intensity = 0.16 + 0.75 * k;
      floor.material.color.setHex(0x76965a).multiplyScalar(0.24 + 0.76 * k);

      // 轨道小图里的地球
      const r = R * (1 - ECC * Math.cos(2 * Math.PI * (day - 3) / 365));
      const th = theta(day);
      oEarth.position.set(r * Math.cos(th), 0, r * Math.sin(th));
      // 昼夜分界不画在这张图上：它只有十几像素宽，从侧面看过去
      // 夏天那颗会显得几乎全黑，孩子只会读成「夏天=黑的」。
      // 昼夜的事交给下面的地面场景（太阳高度、影子、白天多长）去讲。

      // 读数
      const si = seasonIdx(day);
      // 前面这个表情说的是「现在天亮还是天黑」，季节看后面的字
      const sky = alt > 6 ? '☀️' : alt > -1 ? '🌇' : '🌙';
      ui.headline(`${sky} ${monthOf(day)}月${dayInMonth(day)}日 ${clock(hour)} · ${SEASON_CN[si]}${SEASON_EMOJI[si]}`);
      const sr = shadowRatio(v);
      ui.facts([
        {label: '太阳高', value: up ? alt.toFixed(0) + '°' : '在地平线下', dim: !up},
        {label: '影子长', value: up ? (sr > 12 ? '长得看不到头' : sr.toFixed(1) + ' 个人') : '天黑了', dim: !up},
        {label: '今天白天', value: dayLen(day).toFixed(1) + ' 小时'},
        {label: '离太阳', value: (distOf(day) * 10000).toFixed(0) + ' 万公里'},
      ]);
    }

    ctx.onFrame(() => placeOrbit());

    const SEASON_TRACK =
      'linear-gradient(90deg,#5b86b8 0%,#7fb069 22%,#e8a33d 47%,#c9743a 72%,#5b86b8 100%)';
    const DAY_TRACK =
      'linear-gradient(90deg,#0d1424 0%,#22304e 16%,#e08a45 26%,#8ec9ea 50%,#e08a45 74%,#22304e 84%,#0d1424 100%)';

    const mount = () => ui.mountToy({
      sliders: [
        {key: 'day', icon: '📅', min: 1, max: 365, step: 1, value: 172, track: SEASON_TRACK,
         fmt: N => `${monthOf(N)}月${dayInMonth(N)}日`},
        {key: 'hour', icon: '🕛', min: 0, max: 24, step: 0.05, value: 12, track: DAY_TRACK,
         fmt: clock},
      ],
      onInput: render,
    });
    mount();

    function reset() {
      camera.position.set(0, 3.8, -15.5);
      controls.target.set(0, 5.3, 1.6);
      mount();
    }

    return {reset};
  },
};
