/**
 * stage.js — 通用 3D 舞台
 * 负责：渲染器、相机、光照、水面/地面、动画循环、GLB 加载
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

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  camera.position.set(...cameraPos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 5;
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
  let water = null, waterBase = null, waterGeo = null;
  if (withWater) {
    waterGeo = new THREE.PlaneGeometry(160, 160, 90, 90);
    waterGeo.rotateX(-Math.PI / 2);
    water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
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

  // ---- 动画循环 ----
  const frameHooks = [];
  const onFrame = fn => frameHooks.push(fn);
  let last = performance.now();

  function loop(now) {
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

    for (const fn of frameHooks) fn(dt, t);
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();
  requestAnimationFrame(loop);

  return {THREE, scene, camera, renderer, controls, water, onFrame, resize};
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
export function clearTweens() {tweens.length = 0;}

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
