/**
 * stage.js — 通用 3D 舞台
 * 负责：渲染器、相机、光照、水面/地面、动画循环、镜头飞行、GLB 加载
 * 与具体学科无关，任何场景模板都复用这一层。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function createStage(container, opts = {}) {
  const {
    sky = 0xcfe3f0,
    cameraPos = [11, 6.4, 13],
    target = [-1.5, 0.45, 0],
    withWater = true,
    withGround = false,
    groundColor = 0x9fbf7a,
  } = opts;

  const renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 34, 82);

  // 竖屏/窄窗口下要自动拉远，否则手机上画面被裁掉大半
  const BASE_FOV = 40, BASE_ASPECT = 1.6;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, BASE_ASPECT, 0.1, 300);
  camera.position.set(...cameraPos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 3;
  controls.maxDistance = 34;
  controls.maxPolarAngle = Math.PI * 0.495;

  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6d7f66, 1.05));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.9);
  sun.position.set(9, 13, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 48;
  Object.assign(sun.shadow.camera, {left: -16, right: 16, top: 14, bottom: -12});
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // ---- 水面（y = 0 为水平面）----
  let waterGeo = null, waterBase = null;
  if (withWater) {
    waterGeo = new THREE.PlaneGeometry(160, 160, 90, 90);
    waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
      color: 0x2f7fb0, roughness: 0.18, metalness: 0.22,
      transparent: true, opacity: 0.78,
    }));
    water.receiveShadow = true;
    scene.add(water);
    waterBase = Float32Array.from(waterGeo.attributes.position.array);

    const bed = new THREE.Mesh(new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({color: 0x3d5566, roughness: 1}));
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = -2.6;
    scene.add(bed);
  }

  // ---- 地面（y = 0 为地面，给不涉水的场景用）----
  if (withGround) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({color: groundColor, roughness: 0.98}));
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    scene.add(g);
  }

  // ---- 镜头飞行（立体图形要从正视切到俯视）----
  let fly = null;
  function flyTo(pos, look, ms = 1100) {
    controls.enabled = false;
    return new Promise(res => {
      fly = {
        t: 0, ms, res,
        p0: camera.position.clone(), p1: new THREE.Vector3(...pos),
        t0: controls.target.clone(), t1: new THREE.Vector3(...look),
      };
    });
  }

  /**
   * 飞到「刚好装得下以 center 为心、radius 为半径的那个球」的位置。
   * 固定写死镜头距离在横屏和竖屏之间必然顾此失彼：手机上物体太小点不准，
   * 电脑上又会把上下裁掉。这里按当前视口的 fov / aspect 现算距离。
   * @param dir 观察方向的偏移（会被归一化），默认略微俯视
   */
  function flyToFit(center, radius, dir = [0, 0.55, 1], ms = 1100) {
    const fovY = THREE.MathUtils.degToRad(camera.fov);
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * camera.aspect);
    const d = radius / Math.sin(Math.min(fovY, fovX) / 2);
    const off = new THREE.Vector3(...dir).normalize().multiplyScalar(d);
    return flyTo(new THREE.Vector3(...center).add(off).toArray(), center, ms);
  }

  // ---- 动画循环 ----
  const frameHooks = [];
  const onFrame = fn => frameHooks.push(fn);
  let last = performance.now();
  let raf = 0;
  let alive = true;

  function loop(now) {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(48, now - last);
    last = now;
    const t = now * 0.001;

    if (waterGeo) {
      const p = waterGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = waterBase[i * 3], z = waterBase[i * 3 + 2];
        p.setY(i, Math.sin(x * 0.42 + t * 1.05) * 0.045 + Math.cos(z * 0.55 + t * 0.8) * 0.035);
      }
      p.needsUpdate = true;
    }

    if (fly) {
      fly.t += dt;
      const k = Math.min(1, fly.t / fly.ms), e = ease(k);
      camera.position.lerpVectors(fly.p0, fly.p1, e);
      controls.target.lerpVectors(fly.t0, fly.t1, e);
      if (k >= 1) {const done = fly.res; fly = null; controls.enabled = true; done();}
    }

    for (const fn of frameHooks) fn(dt, t);
    controls.update();
    renderer.render(scene, camera);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 保持"横向看得见多少"不变：窗口越窄，纵向 FOV 越大，等于自动退后
    camera.fov = camera.aspect < BASE_ASPECT
      ? THREE.MathUtils.radToDeg(2 * Math.atan(
          Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2) * BASE_ASPECT / camera.aspect))
      : BASE_FOV;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(loop);

  /** 切场景时必须调用，否则渲染循环和显存都会泄漏 */
  function dispose() {
    alive = false;
    cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    frameHooks.length = 0;
    clearTweens();
    controls.dispose();
    scene.traverse(o => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        if (!m) return;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap']) m[k]?.dispose?.();
        m.dispose();
      });
    });
    scene.clear();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {THREE, scene, camera, renderer, controls, onFrame, resize, flyTo, flyToFit, dispose};
}

/* ---------- 补间动画 ---------- */
const tweens = [];
export const ease = t => t < 0.5 ? 4 * t ** 3 : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const wait = ms => new Promise(r => setTimeout(r, ms));
export function tween(ms, fn) {
  return new Promise(res => tweens.push({t: 0, ms, fn, res}));
}
export function stepTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.ms);
    tw.fn(k);
    if (k >= 1) {tweens.splice(i, 1); tw.res();}
  }
}
export function clearTweens() {
  // resolve 掉在途的 tween，否则 await 它的场景逻辑会永远挂住
  while (tweens.length) tweens.pop().res();
}

/* ---------- GLB 加载：自动归一化尺寸与落地高度 ---------- */
export function loadGLB(url, {length = 3, THREE: T} = {}) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, gltf => {
      const m = gltf.scene;
      const size = new T.Box3().setFromObject(m).getSize(new T.Vector3());
      m.scale.setScalar(length / Math.max(size.x, size.z));
      const b = new T.Box3().setFromObject(m);
      m.position.y -= b.min.y;                       // 底面贴地
      m.position.x -= (b.max.x + b.min.x) / 2;       // 水平居中
      m.traverse(o => {if (o.isMesh) o.castShadow = o.receiveShadow = true;});
      resolve(m);
    }, undefined, reject);
  });
}
